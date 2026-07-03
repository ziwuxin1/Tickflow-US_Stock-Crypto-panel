"""标的池(Universe)定义(§6.3)。

当前实现:
  - 美股全市场: TickFlow `US_Equity` universe(quotes.get_by_universes 拉取并缓存)
  - 加密货币: Binance USDT 现货交易对(binance_provider.fetch_crypto_instruments, 按成交额取前 N)
  - 自选池 = 用户的 watchlist
"""
from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Literal

import polars as pl

from app.config import settings
from app.tickflow.client import get_client

logger = logging.getLogger(__name__)

PoolId = Literal["US_Equity", "Crypto", "watchlist"]


def _find_universe_id(hints: list[str]) -> str | None:
    """从 universes.list() 里按 name/id 子串匹配找一个 universe id。"""
    try:
        tf = get_client()
        unis = tf.universes.list()
    except Exception as e:
        logger.warning("universes.list failed: %s", e)
        return None
    for u in unis or []:
        item = u if isinstance(u, dict) else {"id": getattr(u, "id", ""), "name": getattr(u, "name", "")}
        haystack = (item.get("id", "") + " " + item.get("name", "")).lower()
        for h in hints:
            if h.lower() in haystack:
                return item["id"]
    return None


def _pool_cache_path(pool_id: str) -> Path:
    return settings.data_dir / "pools" / f"{pool_id}.parquet"


def get_pool(pool_id: PoolId, refresh: bool = False) -> list[str]:
    """返回标的池里的 symbol 列表。"""
    if pool_id == "watchlist":
        return _load_watchlist()

    cache = _pool_cache_path(pool_id)
    if cache.exists() and not refresh:
        df = pl.read_parquet(cache)
        return df["symbol"].to_list()

    symbols = _fetch_pool(pool_id)
    if symbols:
        cache.parent.mkdir(parents=True, exist_ok=True)
        pl.DataFrame({"symbol": symbols, "as_of": [date.today()] * len(symbols)}).write_parquet(cache)
    return symbols


def _fetch_pool(pool_id: PoolId) -> list[str]:
    """拉取池成份。

    US_Equity: 先用 universes.list 找到 universe id, 再 quotes.get_by_universes 拉成份。
    Crypto: 从 Binance exchangeInfo 拉 USDT 现货交易对(按 24h 成交额取前 N)。
    """
    if pool_id == "US_Equity":
        tf = get_client()
        # 全美股(含 ETF/CEF)— 优先直接用 US_Equity universe
        uid = _find_universe_id(["US_Equity", "美股", "US Equity"])
        if not uid:
            logger.warning("无法在 TickFlow universes 列表里匹配到 US_Equity")
            return []
        try:
            df = tf.quotes.get_by_universes([uid], as_dataframe=True)
            if df is not None and len(df) > 0 and "symbol" in df.columns:
                return sorted(set(df["symbol"].astype(str).tolist()))
        except Exception as e:
            logger.warning("fetch US_Equity via universe %s failed: %s", uid, e)
        return []

    if pool_id == "Crypto":
        try:
            from app.data_providers import binance_provider
            inst = binance_provider.fetch_crypto_instruments()
            if not inst.is_empty() and "symbol" in inst.columns:
                return sorted(set(inst["symbol"].to_list()))
        except Exception as e:
            logger.warning("fetch Crypto pool via binance failed: %s", e)

    return []


def _load_watchlist() -> list[str]:
    """读取用户自选(由 watchlist service 维护)。"""
    path = settings.data_dir / "user_data" / "watchlist.parquet"
    if not path.exists():
        return []
    df = pl.read_parquet(path)
    if df.is_empty() or "symbol" not in df.columns:
        return []
    return df["symbol"].to_list()


# 兜底:Free 用户/无 API 时给一个小型可用集合,让 UI 不至于空白
DEMO_SYMBOLS = [
    "AAPL.US",   # 苹果
    "MSFT.US",   # 微软
    "NVDA.US",   # 英伟达
    "GOOGL.US",  # 谷歌A
    "AMZN.US",   # 亚马逊
    "META.US",   # Meta
    "TSLA.US",   # 特斯拉
    "AVGO.US",   # 博通
    "JPM.US",    # 摩根大通
    "SPY.US",    # 标普500ETF
    "BTCUSDT",   # 比特币
    "ETHUSDT",   # 以太坊
]
