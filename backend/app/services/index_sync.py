"""指数(基准) / ETF 数据同步服务。

TickFlow 没有美股指数 universe, 基准改为静态种子:
  - 美股大盘用 ETF 代理(SPY/QQQ/DIA/IWM, markets.CORE_INDEX_SYMBOLS)
  - 加密基准 BTCUSDT/ETHUSDT(markets.CORE_CRYPTO_SYMBOLS)
日 K 双源同步: ETF 代理走 TickFlow klines.batch, 加密走 Binance klines,
统一写入 kline_index_daily / kline_index_enriched。
ETF 全量同步链路保留(exchanges.get_instruments("US", type="etf")),
但美股 ETF 已在主 universe 中, pipeline_pull_etf 默认关闭。
"""
from __future__ import annotations

import gc
import logging
from collections.abc import Callable
from datetime import datetime, timedelta

import polars as pl

from app import markets
from app.indicators.pipeline import compute_enriched
from app.services import kline_sync, preferences
from app.tickflow.capabilities import Cap, CapabilitySet
from app.tickflow.client import get_client
from app.tickflow.repository import KlineRepository

logger = logging.getLogger(__name__)

# exchanges.get_instruments 查询的交易所(仅 ETF 列表用)
_EXCHANGES = ["US"]


def _static_index_instruments() -> pl.DataFrame:
    """静态基准种子: ETF 代理 + 加密基准, 统一 asset_type='index'。"""
    symbols = [*markets.CORE_INDEX_SYMBOLS, *markets.CORE_CRYPTO_SYMBOLS]
    rows = [
        {
            "symbol": s,
            "name": markets.CORE_INDEX_NAMES.get(s, s),
            "code": s.split(".")[0],
            "asset_type": "index",
        }
        for s in symbols
    ]
    return pl.DataFrame(rows)


def _fetch_instruments_by_type(instrument_type: str, asset_type_label: str) -> pl.DataFrame:
    """用免费的 exchanges.get_instruments 拉取指定类型的标的列表。

    None/Free 档均可使用(标的信息查询免费开放)。
    instrument_type: 'etf' 等
    asset_type_label: 写入 instruments 表的 asset_type 标记
    """
    tf = get_client()
    rows: list[dict] = []
    for ex in _EXCHANGES:
        try:
            items = tf.exchanges.get_instruments(ex, instrument_type=instrument_type)
            for it in items or []:
                item = it if isinstance(it, dict) else {}
                symbol = item.get("symbol")
                if not symbol:
                    continue
                rows.append({
                    "symbol": str(symbol),
                    "name": item.get("name") or str(symbol),
                })
        except Exception as e:
            logger.warning("get_instruments(%s, type=%s) failed: %s", ex, instrument_type, e)

    if not rows:
        return pl.DataFrame()

    return (
        pl.DataFrame(rows)
        .with_columns([
            pl.col("symbol").str.split(".").list.first().alias("code"),
            pl.lit(asset_type_label).alias("asset_type"),
        ])
        .unique(subset=["symbol"], keep="last")
        .sort("symbol")
    )


def sync_index_instruments(
    repo: KlineRepository,
    pull_index: bool = True,
    pull_etf: bool = True,
) -> int:
    """同步指数(静态基准种子) / ETF 标的维表,返回标的总数。

    新版物理分开保存: 指数写 instruments_index, ETF 写 instruments_etf。
    读取层仍兼容旧版 instruments_index 中 asset_type='etf' 的历史数据。
    """
    index_parts: list[pl.DataFrame] = []
    etf_parts: list[pl.DataFrame] = []

    # 1) 指数: 静态基准种子(TickFlow 无美股指数 universe, 用 ETF 代理 + 加密基准)
    if pull_index:
        index_parts.append(_static_index_instruments())

    # 2) ETF: 免费通道按开关拉取
    if pull_etf:
        etf_df = _fetch_instruments_by_type("etf", "etf")
        if not etf_df.is_empty():
            etf_parts.append(etf_df)

    total = 0
    if index_parts:
        index_inst = pl.concat(index_parts, how="diagonal_relaxed").unique(subset=["symbol"], keep="last").sort("symbol")
        if not index_inst.is_empty():
            repo.save_index_instruments(index_inst)
            total += index_inst.height
    if etf_parts:
        etf_inst = pl.concat(etf_parts, how="diagonal_relaxed").unique(subset=["symbol"], keep="last").sort("symbol")
        if not etf_inst.is_empty():
            repo.save_etf_instruments(etf_inst)
            total += etf_inst.height

    if total == 0:
        logger.warning("指数/ETF 标的列表为空(pull_index=%s, pull_etf=%s)", pull_index, pull_etf)
        return 0
    repo.refresh_index_views()
    logger.info("指数/ETF 标的同步完成: %d 只", total)
    return total


def sync_etf_instruments(repo: KlineRepository) -> int:
    """单独同步 ETF 标的维表(返回 ETF 数量)。"""
    etf_df = _fetch_instruments_by_type("etf", "etf")
    if etf_df.is_empty():
        return 0
    repo.save_etf_instruments(etf_df)
    repo.refresh_index_views()
    return etf_df.height


def sync_and_persist_index_daily(
    repo: KlineRepository,
    capset: CapabilitySet,
    count: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    symbols_override: list[str] | None = None,
    on_chunk_done: Callable[[int, int], None] | None = None,
) -> int:
    """双源同步基准日K到独立 parquet,并计算 enriched。

    美股 ETF 代理(SPY/QQQ/DIA/IWM)走 TickFlow klines.batch(受 capset 门槛约束);
    加密基准(BTCUSDT/ETHUSDT)走 Binance(免 key, 无门槛)。
    symbols_override 非空时,只拉这些代码(跳过 instruments 表),用于自定义范围。
    on_chunk_done(current, total) 每个批次完成后回调。
    """
    if symbols_override:
        symbols = sorted(set(s for s in symbols_override if s))
    else:
        instruments = repo.get_index_instruments()
        if instruments.is_empty():
            sync_index_instruments(repo, pull_index=True, pull_etf=False)
            instruments = repo.get_index_instruments()
        if not instruments.is_empty() and "asset_type" in instruments.columns:
            instruments = instruments.filter(pl.col("asset_type") != "etf")
        if instruments.is_empty() or "symbol" not in instruments.columns:
            return 0
        symbols = sorted(set(instruments["symbol"].to_list()))
    if not symbols:
        return 0

    stock_symbols = [s for s in symbols if not markets.is_crypto(s)]
    crypto_symbols = [s for s in symbols if markets.is_crypto(s)]

    end_time = end_date or datetime.now()
    start_time = start_date or (end_time - timedelta(days=365))

    lim = capset.limits(Cap.KLINE_DAILY_BATCH)
    batch_size = preferences.get_index_daily_batch_size()
    if lim and lim.batch:
        batch_size = min(batch_size, lim.batch)
    rpm = lim.rpm if lim else None

    # 进度按 (TickFlow 批次数 + 加密 1 个批次) 统计
    stock_chunks = (
        [stock_symbols[i:i + batch_size] for i in range(0, len(stock_symbols), batch_size)]
        if stock_symbols and capset.has(Cap.KLINE_DAILY_BATCH)
        else []
    )
    total_chunks = len(stock_chunks) + (1 if crypto_symbols else 0)
    done_chunks = 0
    total_rows = 0

    interval = (60.0 / rpm) if rpm else 0
    for i, chunk in enumerate(stock_chunks):
        if i > 0 and interval > 0 and len(stock_chunks) > rpm:
            import time
            time.sleep(interval)
        raw = kline_sync.sync_daily_batch(
            chunk,
            count=count,
            batch_size=None,
            start_time=start_time,
            end_time=end_time,
        )
        done_chunks += 1
        if raw.is_empty():
            if on_chunk_done:
                on_chunk_done(done_chunks, total_chunks)
            continue

        repo.append_index_daily(raw)
        enriched = compute_enriched(raw, factors=None, instruments=None)
        repo.append_index_enriched(enriched)
        total_rows += raw.height
        logger.info("index daily synced: %d/%d chunks, +%d rows", done_chunks, total_chunks, raw.height)
        if on_chunk_done:
            on_chunk_done(done_chunks, total_chunks)
        del raw, enriched
        gc.collect()

    if crypto_symbols:
        try:
            from app.data_providers import binance_provider
            raw = binance_provider.fetch_crypto_daily(
                crypto_symbols, start=start_time, end=end_time,
            )
        except Exception as e:
            logger.warning("crypto index daily sync failed: %s", e)
            raw = pl.DataFrame()
        done_chunks += 1
        if not raw.is_empty():
            repo.append_index_daily(raw)
            enriched = compute_enriched(raw, factors=None, instruments=None)
            repo.append_index_enriched(enriched)
            total_rows += raw.height
            logger.info("crypto index daily synced: +%d rows", raw.height)
            del raw, enriched
            gc.collect()
        if on_chunk_done:
            on_chunk_done(done_chunks, total_chunks)

    repo.refresh_index_views()
    return total_rows


def _load_etf_factors(repo: KlineRepository) -> pl.DataFrame:
    factor_path = repo.store.data_dir / "adj_factor_etf" / "all.parquet"
    if not factor_path.exists():
        return pl.DataFrame()
    try:
        return pl.read_parquet(factor_path)
    except Exception as e:
        logger.warning("ETF 复权因子读取失败: %s", e)
        return pl.DataFrame()


def sync_etf_adj_factor(
    symbols: list[str],
    repo: KlineRepository,
    capset: CapabilitySet,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    on_chunk_done=None,
) -> tuple[int, list[str]]:
    """同步 ETF 复权因子;失败由调用方降级为 warning。"""
    return kline_sync.sync_adj_factor(
        symbols,
        repo,
        capset,
        start_time=start_time,
        end_time=end_time,
        on_chunk_done=on_chunk_done,
        asset_type="etf",
    )


def sync_and_persist_etf_daily(
    repo: KlineRepository,
    capset: CapabilitySet,
    count: int | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    symbols_override: list[str] | None = None,
    on_chunk_done: Callable[[int, int], None] | None = None,
) -> int:
    """同步 ETF 日K到独立 kline_etf_* parquet,并计算 ETF enriched。
    on_chunk_done(current, total) 每个批次完成后回调。
    """
    if not capset.has(Cap.KLINE_DAILY_BATCH):
        return 0

    if symbols_override:
        symbols = sorted(set(s for s in symbols_override if s))
    else:
        instruments = repo.get_etf_instruments()
        if instruments.is_empty():
            sync_etf_instruments(repo)
            instruments = repo.get_etf_instruments()
        if instruments.is_empty() or "symbol" not in instruments.columns:
            return 0
        symbols = sorted(set(instruments["symbol"].to_list()))
    if not symbols:
        return 0

    lim = capset.limits(Cap.KLINE_DAILY_BATCH)
    batch_size = preferences.get_index_daily_batch_size()
    if lim and lim.batch:
        batch_size = min(batch_size, lim.batch)
    rpm = lim.rpm if lim else None

    end_time = end_date or datetime.now()
    start_time = start_date or (end_time - timedelta(days=365))

    total_rows = 0
    interval = (60.0 / rpm) if rpm else 0
    chunks = [symbols[i:i + batch_size] for i in range(0, len(symbols), batch_size)]
    factors = _load_etf_factors(repo)
    for i, chunk in enumerate(chunks):
        if i > 0 and interval > 0 and len(chunks) > rpm:
            import time
            time.sleep(interval)
        raw = kline_sync.sync_daily_batch(
            chunk,
            count=count,
            batch_size=None,
            start_time=start_time,
            end_time=end_time,
        )
        if raw.is_empty():
            continue

        repo.append_etf_daily(raw)
        batch_factors = factors.filter(pl.col("symbol").is_in(chunk)) if not factors.is_empty() else factors
        # ETF 使用复权和通用技术指标;不传 instruments,避免套用个股股本/换手逻辑。
        enriched = compute_enriched(raw, factors=batch_factors, instruments=None)
        repo.append_etf_enriched(enriched)
        total_rows += raw.height
        logger.info("etf daily synced: %d/%d chunks, +%d rows", i + 1, len(chunks), raw.height)
        if on_chunk_done:
            on_chunk_done(i + 1, len(chunks))
        del raw, enriched
        gc.collect()
    repo.refresh_index_views()
    return total_rows
