"""标的维表同步服务。

美股: 盘前调用 tf.exchanges.get_instruments("US", type="stock") 获取全量标的元数据,
flatten ext 字段; 加密: binance_provider.fetch_crypto_instruments() 拉 USDT 现货交易对
(exchange="BINANCE" region="CRYPTO" type="crypto")。两类合并写入同一 instruments.parquet。

Starter+ 盘后可用 quotes.get(universes) 顺便补充 name。
"""
from __future__ import annotations

import logging
from datetime import date
from pathlib import Path

import polars as pl

from app.tickflow.client import get_client

logger = logging.getLogger(__name__)

_EXCHANGES = ["US"]


def _flatten_instruments(items: list[dict]) -> list[dict]:
    """把 SDK 返回的 Instrument 列表 flatten 成扁平行。"""
    rows = []
    for item in items:
        row = {
            "symbol": item.get("symbol"),
            "name": item.get("name"),
            "code": item.get("code"),
            "exchange": item.get("exchange"),
            "region": item.get("region"),
            "type": item.get("type"),
        }
        ext = item.get("ext") or {}
        row["listing_date"] = ext.get("listing_date")
        row["total_shares"] = ext.get("total_shares")
        row["float_shares"] = ext.get("float_shares")
        row["tick_size"] = ext.get("tick_size")
        rows.append(row)
    return rows


def _fetch_crypto_rows() -> list[dict]:
    """从 Binance 拉加密 instruments, 对齐美股行结构(缺失字段置 None)。"""
    from app.data_providers import binance_provider

    try:
        inst = binance_provider.fetch_crypto_instruments()
    except Exception as e:
        logger.warning("crypto instruments fetch failed: %s", e)
        return []
    if inst.is_empty():
        return []

    # CoinGecko 市值/流通量补充(免 key): 用流通量填 total_shares/float_shares,
    # 让加密的市值(close×流通量)与换手率(成交量/流通量)走通现有机制。失败则留 None。
    from app.config import settings
    from app.data_providers import coingecko_provider
    try:
        cg = coingecko_provider.fetch_crypto_market_data(limit=settings.crypto_universe_size)
    except Exception as e:  # noqa: BLE001
        logger.warning("CoinGecko 市值补充失败, 加密流通量留空: %s", e)
        cg = {}

    rows: list[dict] = []
    for r in inst.iter_rows(named=True):
        sym = r.get("symbol")
        info = cg.get(sym) or {}
        circ = info.get("circulating_supply")
        rows.append({
            "symbol": sym,
            "name": r.get("name"),
            "code": r.get("code") or sym,
            "exchange": "BINANCE",
            "region": "CRYPTO",
            "type": "crypto",
            "listing_date": None,
            # total_shares/float_shares 均用流通量: market_cap=close×total_shares=市值,
            # turnover_rate=volume/float_shares=换手率(成交量/流通量)。
            "total_shares": circ,
            "float_shares": circ,
            "tick_size": None,
        })
    return rows


def sync_instruments(data_dir: Path) -> int:
    """全量同步标的维表(美股 + 加密) → data/instruments/instruments.parquet。

    返回写入的行数。任一数据源失败不阻断另一侧(至少有一侧成功才写盘)。
    """
    tf = get_client()
    all_rows: list[dict] = []

    for ex in _EXCHANGES:
        try:
            items = tf.exchanges.get_instruments(ex, instrument_type="stock")
            if items:
                all_rows.extend(_flatten_instruments(items))
                logger.info("instruments %s: %d stocks", ex, len(items))
        except Exception as e:
            logger.warning("get_instruments(%s) failed: %s", ex, e)

    crypto_rows = _fetch_crypto_rows()
    if crypto_rows:
        all_rows.extend(crypto_rows)
        logger.info("instruments BINANCE: %d crypto pairs", len(crypto_rows))

    if not all_rows:
        return 0

    df = pl.DataFrame(all_rows, infer_schema_length=None)
    df = df.with_columns(pl.lit(date.today()).alias("as_of"))

    out = data_dir / "instruments" / "instruments.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(out)

    logger.info("instruments synced: %d rows → %s", df.height, out)
    return df.height


def enrich_names_from_quotes(
    data_dir: Path,
    quotes_data: list[dict],
) -> int:
    """从 quotes 响应中提取 name,更新 instruments 维表(兜底补充)。

    盘后 quotes.get(universes) 返回的数据中包含 ext.name,
    用来补充 instruments 中可能缺失的 name。
    """
    if not quotes_data:
        return 0

    # 构建 symbol → name 映射
    name_map: dict[str, str] = {}
    for q in quotes_data:
        symbol = q.get("symbol", "")
        ext = q.get("ext") or {}
        name = ext.get("name") or q.get("name", "")
        if symbol and name:
            name_map[symbol] = name

    if not name_map:
        return 0

    inst_path = data_dir / "instruments" / "instruments.parquet"
    if not inst_path.exists():
        return 0

    df = pl.read_parquet(inst_path)

    # 只更新空 name 的行
    updates = pl.DataFrame({
        "symbol": list(name_map.keys()),
        "_new_name": list(name_map.values()),
    })
    df = df.join(updates, on="symbol", how="left")
    df = df.with_columns(
        pl.when(pl.col("name").is_null() | (pl.col("name") == ""))
        .then(pl.col("_new_name"))
        .otherwise(pl.col("name"))
        .alias("name"),
    ).drop("_new_name")

    df.write_parquet(inst_path)
    logger.info("instruments name enriched from quotes: %d names", len(name_map))
    return len(name_map)
