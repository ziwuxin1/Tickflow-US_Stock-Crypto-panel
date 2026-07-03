"""强势收盘 — 大涨且收盘贴近日内最高价, 全天买盘占优"""
import polars as pl

META = {
    "id": "strong_close_near_high",
    "name": "强势收盘",
    "description": "涨幅 ≥ 5% 且收盘价 ≥ 98% 日内最高, 量比 ≥ 1.5, 收在最强位置",
    "tags": ["强势", "收盘", "放量"],
    "params": [
        {"id": "min_change", "label": "最低涨幅%", "type": "float",
         "default": 5.0, "min": 2.0, "max": 15.0, "step": 0.5},
        {"id": "close_ratio", "label": "收盘/最高价下限", "type": "float",
         "default": 0.98, "min": 0.90, "max": 1.0, "step": 0.005},
        {"id": "vol_ratio_min", "label": "最低量比", "type": "float",
         "default": 1.5, "min": 0.5, "max": 5.0, "step": 0.1},
    ],
    "scoring": {"change_pct": 0.4, "vol_ratio_5d": 0.3, "amount": 0.3},
    "order_by": "score",
    "descending": True,
    "limit": 50,
}

ENTRY_SIGNALS = []
EXIT_SIGNALS = ["signal_ma20_breakdown"]
STOP_LOSS = -0.05
MAX_HOLD_DAYS = 5
ALERTS = []


def filter(df: pl.DataFrame, params: dict) -> pl.Expr:
    min_chg = params.get("min_change", 5.0) / 100.0
    ratio = params.get("close_ratio", 0.98)
    vol_min = params.get("vol_ratio_min", 1.5)
    return (
        (pl.col("change_pct") >= min_chg)
        & (pl.col("close") >= pl.col("high") * ratio)
        & (pl.col("vol_ratio_5d") >= vol_min)
    )
