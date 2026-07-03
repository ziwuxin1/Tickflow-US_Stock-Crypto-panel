"""Internal provider schema column lists.

与 normalizer.py 的实际归一化口径保持一致(normalizer 是权威实现,
本文件仅作声明式参考, 两处列表必须同步维护)。
"""
from __future__ import annotations

DAILY_COLUMNS = [
    "symbol", "date", "open", "high", "low", "close", "volume", "amount",
]

ADJ_FACTOR_COLUMNS = ["symbol", "trade_date", "ex_factor"]

INSTRUMENT_COLUMNS = [
    "symbol", "name", "code", "exchange", "asset_type", "source",
]

MINUTE_COLUMNS = [
    "symbol", "datetime", "open", "high", "low", "close", "volume", "amount",
]
