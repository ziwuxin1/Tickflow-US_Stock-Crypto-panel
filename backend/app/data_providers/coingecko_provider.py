"""CoinGecko 免费数据源 —— 加密货币市值 / 流通量 / 排名。

定位: 核心行情(日K/分钟K/实时)走 Binance; CoinGecko 只补 Binance 没有的
「市值 / 流通量 / 市值排名」。用来给加密 instruments 填 total_shares/float_shares,
从而让市值筛选、换手率(成交量/流通量)等现有机制对加密也生效。

免 key 可用(公共端点, 约 30 次/分限流); 可选 settings.coingecko_api_key(Demo/Pro)。
符号约定: CoinGecko 用 coin id(bitcoin)与 symbol(btc); 本项目用 Binance 交易对
(BTCUSDT)。映射规则: cg_symbol.upper() + "USDT"(与 Binance USDT 现货对齐)。
"""
from __future__ import annotations

import logging
import time

import httpx

logger = logging.getLogger(__name__)

# 相邻请求最小间隔(秒), 规避免费档 ~30 次/分限流
_MIN_INTERVAL = 2.2
_last_call_ts = 0.0


def _throttle() -> None:
    global _last_call_ts
    wait = _MIN_INTERVAL - (time.time() - _last_call_ts)
    if wait > 0:
        time.sleep(wait)
    _last_call_ts = time.time()


def _base_url() -> str:
    from app.config import settings
    return (settings.coingecko_api_base or "https://api.coingecko.com/api/v3").rstrip("/")


def _headers() -> dict:
    from app.config import settings
    key = settings.coingecko_api_key or ""
    # Demo key 用 x-cg-demo-api-key; Pro 用 x-cg-pro-api-key。留空则无鉴权(公共档)。
    if not key:
        return {}
    header_name = "x-cg-pro-api-key" if "pro" in _base_url() else "x-cg-demo-api-key"
    return {header_name: key}


def _to_pair_symbol(cg_symbol: str) -> str:
    """CoinGecko symbol(btc) → 本项目 Binance 交易对(BTCUSDT)。"""
    return f"{(cg_symbol or '').strip().upper()}USDT"


def fetch_crypto_market_data(limit: int = 300) -> dict[str, dict]:
    """拉取市值榜, 返回 {交易对符号: 市值/流通量信息}。

    键为 BTCUSDT 形式(与本项目加密 symbol 对齐); 值含:
      market_cap, circulating_supply, total_supply, market_cap_rank, price。
    同一 symbol 多个币种时取市值最大者(coins/markets 已按市值降序, 首次命中即最大)。
    失败返回空 dict(调用方降级为不填充, 不阻断)。
    """
    base = _base_url()
    headers = _headers()
    per_page = 250
    pages = (limit + per_page - 1) // per_page

    out: dict[str, dict] = {}
    try:
        with httpx.Client(timeout=20.0, headers=headers) as client:
            for page in range(1, pages + 1):
                _throttle()
                resp = client.get(
                    f"{base}/coins/markets",
                    params={
                        "vs_currency": "usd",
                        "order": "market_cap_desc",
                        "per_page": per_page,
                        "page": page,
                    },
                )
                resp.raise_for_status()
                rows = resp.json()
                if not isinstance(rows, list) or not rows:
                    break
                for r in rows:
                    sym = _to_pair_symbol(r.get("symbol", ""))
                    # 首次命中即最大市值, 不覆盖(避免小市值同名币顶掉)
                    if sym in out:
                        continue
                    out[sym] = {
                        "market_cap": r.get("market_cap"),
                        "circulating_supply": r.get("circulating_supply"),
                        "total_supply": r.get("total_supply"),
                        "market_cap_rank": r.get("market_cap_rank"),
                        "price": r.get("current_price"),
                    }
    except Exception as e:  # noqa: BLE001
        logger.warning("CoinGecko 市值数据拉取失败: %s", e)
        return {}
    return out
