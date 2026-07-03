"""Binance 公共行情 Provider(加密货币现货, 免 API key)。

默认走 data-api.binance.vision(api.binance.com 部分地区被 451 屏蔽),
可通过 settings.crypto_api_base 覆盖。

端点:
  - GET /api/v3/exchangeInfo          → 成分(USDT 现货交易对)
  - GET /api/v3/klines                → 日 K / 分钟 K(epoch-ms, 最多 1000 根/次)
  - GET /api/v3/ticker/24hr           → 全市场 24h 实时(一次调用返回所有交易对)

节流: 全局最小请求间隔 + 失败重试一次(Binance 公共限额 ~6000 request-weight/min/IP,
本模块调用频度远低于限额, 无需接 Cap 令牌桶)。
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import UTC, date, datetime, timedelta

import httpx
import polars as pl

from app.config import settings
from app.data_providers.base import AssetType, ProviderCapabilities

logger = logging.getLogger(__name__)

_TIMEOUT = 15.0
_MIN_INTERVAL = 0.25          # 全局最小请求间隔(秒)
_KLINE_LIMIT = 1000           # Binance 单次 klines 上限

_throttle_lock = threading.Lock()
_last_request_ts = 0.0

# 杠杆代币(base 以这些结尾)与稳定币 base — 从 universe 中剔除
_LEVERAGED_SUFFIXES = ("UP", "DOWN", "BULL", "BEAR")
_STABLE_BASES = {"USDC", "TUSD", "FDUSD", "DAI", "USDP", "EUR"}


def _base_url() -> str:
    return (settings.crypto_api_base or "https://data-api.binance.vision").rstrip("/")


def _get(path: str, params: dict | None = None):
    """带节流 + 一次重试的 GET, 返回解析后的 JSON。"""
    global _last_request_ts
    url = f"{_base_url()}{path}"
    last_exc: Exception | None = None
    for attempt in range(2):
        with _throttle_lock:
            wait = _MIN_INTERVAL - (time.monotonic() - _last_request_ts)
            if wait > 0:
                time.sleep(wait)
            _last_request_ts = time.monotonic()
        try:
            resp = httpx.get(url, params=params or {}, timeout=_TIMEOUT)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            last_exc = e
            if attempt == 0:
                logger.debug("binance GET %s 失败, 重试一次: %s", path, e)
                time.sleep(0.5)
    raise RuntimeError(f"binance GET {path} failed: {last_exc}") from last_exc


def _to_ms(dt: datetime | date | None) -> int | None:
    """datetime/date → UTC epoch-ms。naive datetime 视为 UTC; date 视为 UTC 零点。"""
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return int(dt.timestamp() * 1000)
    return int(datetime(dt.year, dt.month, dt.day, tzinfo=UTC).timestamp() * 1000)


def _is_leveraged(base: str) -> bool:
    return any(base.endswith(suf) for suf in _LEVERAGED_SUFFIXES)


def fetch_crypto_instruments() -> pl.DataFrame:
    """拉取 Binance USDT 现货交易对成分, 按 24h 成交额取前 settings.crypto_universe_size。

    过滤: status==TRADING, quoteAsset==USDT, isSpotTradingAllowed;
    剔除杠杆代币(base 以 UP/DOWN/BULL/BEAR 结尾)与稳定币 base(USDC/TUSD/FDUSD/DAI/USDP/EUR)。
    返回列: symbol, name(BASE/QUOTE), code, exchange="BINANCE", region="CRYPTO", type="crypto"。
    """
    info = _get("/api/v3/exchangeInfo")
    items = info.get("symbols") if isinstance(info, dict) else None
    if not items:
        return pl.DataFrame()

    candidates: dict[str, dict] = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        base = str(it.get("baseAsset") or "")
        quote = str(it.get("quoteAsset") or "")
        if (
            it.get("status") != "TRADING"
            or quote != "USDT"
            or not it.get("isSpotTradingAllowed")
            or not base
            or _is_leveraged(base)
            or base in _STABLE_BASES
        ):
            continue
        sym = str(it.get("symbol") or f"{base}{quote}")
        candidates[sym] = {
            "symbol": sym,
            "name": f"{base}/{quote}",
            "code": sym,
            "exchange": "BINANCE",
            "region": "CRYPTO",
            "type": "crypto",
        }

    if not candidates:
        return pl.DataFrame()

    # 按 24h quoteVolume 排序取前 N(拉不到 ticker 时按 symbol 排序兜底)
    volume_rank: dict[str, float] = {}
    try:
        for t in fetch_crypto_ticker24():
            sym = t.get("symbol")
            if sym in candidates:
                volume_rank[sym] = float(t.get("amount") or 0.0)
    except Exception as e:
        logger.warning("binance ticker24 排序失败, 按 symbol 排序兜底: %s", e)

    limit = max(int(settings.crypto_universe_size or 300), 1)
    ordered = sorted(
        candidates.keys(),
        key=lambda s: (-volume_rank.get(s, 0.0), s),
    )[:limit]
    rows = [candidates[s] for s in sorted(ordered)]
    return pl.DataFrame(rows)


def _klines_rows(symbol: str, raw: list, interval: str) -> list[dict]:
    """Binance kline 数组 → 行 dict。

    数组字段: [openTime, open, high, low, close, volume, closeTime, quoteVolume, trades, ...]
    amount 取 quoteVolume(计价币成交额); 时间为 UTC epoch-ms。
    """
    rows: list[dict] = []
    for k in raw or []:
        if not isinstance(k, (list, tuple)) or len(k) < 8:
            continue
        open_dt = datetime.fromtimestamp(int(k[0]) / 1000, tz=UTC)
        row = {
            "symbol": symbol,
            "open": float(k[1]),
            "high": float(k[2]),
            "low": float(k[3]),
            "close": float(k[4]),
            "volume": float(k[5]),
            "amount": float(k[7]),
        }
        if interval == "1d":
            row["date"] = open_dt.date()
        else:
            row["datetime"] = open_dt.replace(tzinfo=None)  # naive UTC, 与现有分钟 K 口径一致
        rows.append(row)
    return rows


def _fetch_klines_paged(
    symbol: str,
    interval: str,
    start_ms: int | None,
    end_ms: int | None,
) -> list[dict]:
    """分页拉取单 symbol K 线(1000 根/次)。"""
    rows: list[dict] = []
    cursor = start_ms
    while True:
        params: dict = {"symbol": symbol, "interval": interval, "limit": _KLINE_LIMIT}
        if cursor is not None:
            params["startTime"] = cursor
        if end_ms is not None:
            params["endTime"] = end_ms
        raw = _get("/api/v3/klines", params)
        if not raw:
            break
        rows.extend(_klines_rows(symbol, raw, interval))
        if len(raw) < _KLINE_LIMIT or cursor is None:
            break
        cursor = int(raw[-1][0]) + 1
        if end_ms is not None and cursor > end_ms:
            break
    return rows


def fetch_crypto_daily(
    symbols: list[str],
    start: datetime | date | None = None,
    end: datetime | date | None = None,
) -> pl.DataFrame:
    """批量拉取加密日 K。

    输出列: symbol, date, open, high, low, close, volume, amount
    (amount=quoteVolume; date=openTime 的 UTC 日期), 与 CANONICAL_DAILY_COLS 对齐。
    """
    if not symbols:
        return pl.DataFrame()
    start_ms = _to_ms(start)
    end_ms = _to_ms(end)
    frames: list[pl.DataFrame] = []
    for sym in symbols:
        try:
            rows = _fetch_klines_paged(sym, "1d", start_ms, end_ms)
        except Exception as e:
            logger.warning("binance 日K拉取失败 %s: %s", sym, e)
            continue
        if rows:
            frames.append(pl.DataFrame(rows))
    if not frames:
        return pl.DataFrame()
    df = pl.concat(frames, how="diagonal_relaxed")
    return df.select(["symbol", "date", "open", "high", "low", "close", "volume", "amount"]).sort(
        ["symbol", "date"]
    )


def fetch_crypto_minute(symbol: str, trade_date: date) -> pl.DataFrame:
    """拉取单交易对单日(UTC)1 分钟 K, 输出列与 CANONICAL_MINUTE_COLS 对齐。"""
    start = datetime(trade_date.year, trade_date.month, trade_date.day, tzinfo=UTC)
    end = start + timedelta(days=1)
    try:
        rows = _fetch_klines_paged(symbol, "1m", _to_ms(start), _to_ms(end) - 1)
    except Exception as e:
        logger.warning("binance 分钟K拉取失败 %s %s: %s", symbol, trade_date, e)
        return pl.DataFrame()
    if not rows:
        return pl.DataFrame()
    df = pl.DataFrame(rows)
    return df.select(
        ["symbol", "datetime", "open", "high", "low", "close", "volume", "amount"]
    ).with_columns(pl.col("datetime").cast(pl.Datetime("us"))).sort("datetime")


def fetch_crypto_ticker24() -> list[dict]:
    """全市场 24h 实时行情(一次调用)。

    字段映射(口径与现有 quote 记录对齐, change_pct 为百分数):
      lastPrice→last_price, prevClosePrice→prev_close, openPrice→open,
      highPrice→high, lowPrice→low, volume→volume, quoteVolume→amount,
      priceChangePercent→change_pct, priceChange→change_amount。
    """
    raw = _get("/api/v3/ticker/24hr")
    if not isinstance(raw, list):
        return []

    def _f(v) -> float | None:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    out: list[dict] = []
    for t in raw:
        if not isinstance(t, dict) or not t.get("symbol"):
            continue
        out.append({
            "symbol": str(t["symbol"]),
            "last_price": _f(t.get("lastPrice")),
            "prev_close": _f(t.get("prevClosePrice")),
            "open": _f(t.get("openPrice")),
            "high": _f(t.get("highPrice")),
            "low": _f(t.get("lowPrice")),
            "volume": _f(t.get("volume")),
            "amount": _f(t.get("quoteVolume")),
            "change_pct": _f(t.get("priceChangePercent")),   # Binance 返回百分数
            "change_amount": _f(t.get("priceChange")),
        })
    return out


class BinanceProvider:
    """MarketDataProvider 实现 — 供 registry 注册; sync 服务可直接调模块级函数。"""

    name = "binance"
    capabilities = ProviderCapabilities(
        instruments=True,
        daily=True,
        adj_factor=False,   # 加密无除权除息
        minute=True,
        realtime=True,
        financial=False,    # 加密无财务报表
    )

    def get_instruments(self, asset_type: AssetType) -> pl.DataFrame:
        if asset_type != "crypto":
            return pl.DataFrame()
        df = fetch_crypto_instruments()
        if df.is_empty():
            return df
        return df.select([
            pl.col("symbol"),
            pl.col("name"),
            pl.col("code"),
            pl.col("exchange"),
            pl.lit("crypto").alias("asset_type"),
            pl.lit(self.name).alias("source"),
        ])

    def get_daily(
        self,
        symbols: list[str],
        start_time: datetime | None,
        end_time: datetime | None,
        asset_type: AssetType,
    ) -> pl.DataFrame:
        return fetch_crypto_daily(symbols, start=start_time, end=end_time)

    def get_adj_factors(
        self,
        symbols: list[str],
        start_time: datetime | None,
        end_time: datetime | None,
        asset_type: AssetType,
    ) -> pl.DataFrame:
        # 加密货币不存在除权因子, close == raw_close
        return pl.DataFrame()

    def get_minute(
        self,
        symbols: list[str],
        start_time: datetime | None,
        end_time: datetime | None,
        asset_type: AssetType,
        freq: str = "1m",
    ) -> pl.DataFrame:
        if not symbols or start_time is None:
            return pl.DataFrame()
        frames = [fetch_crypto_minute(s, start_time.date()) for s in symbols]
        frames = [f for f in frames if not f.is_empty()]
        return pl.concat(frames, how="diagonal_relaxed") if frames else pl.DataFrame()

    def get_realtime(
        self,
        universes: list[str] | None = None,
        symbols: list[str] | None = None,
    ) -> pl.DataFrame:
        records = fetch_crypto_ticker24()
        if symbols:
            wanted = set(symbols)
            records = [r for r in records if r["symbol"] in wanted]
        return pl.DataFrame(records) if records else pl.DataFrame()
