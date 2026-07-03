"""动量领涨 — 5日动量 ≥ 10% + 今日涨幅 ≥ 5% + 放量确认"""
import polars as pl

META = {
    "id": "momentum_leader",
    "name": "动量领涨",
    "description": "5日动量 ≥ 10% 且今日涨幅 ≥ 5%, 量比 ≥ 1.5, 追踪短线领涨标的",
    "tags": ["动量", "强势", "放量"],
    "params": [
        {"id": "min_momentum", "label": "最低5日动量%", "type": "float",
         "default": 10.0, "min": 3.0, "max": 30.0, "step": 1.0},
        {"id": "min_change", "label": "最低涨幅%", "type": "float",
         "default": 5.0, "min": 2.0, "max": 15.0, "step": 0.5},
        {"id": "vol_ratio_min", "label": "最低量比", "type": "float",
         "default": 1.5, "min": 0.5, "max": 5.0, "step": 0.1},
    ],
    "scoring": {"momentum_5d": 0.4, "change_pct": 0.3, "amount": 0.3},
    "order_by": "score",
    "descending": True,
    "limit": 50,
}

ENTRY_SIGNALS = []
EXIT_SIGNALS = ["signal_ma20_breakdown"]
STOP_LOSS = -0.06
MAX_HOLD_DAYS = 10
ALERTS = []


def filter(df: pl.DataFrame, params: dict) -> pl.Expr:
    min_mom = params.get("min_momentum", 10.0) / 100.0
    min_chg = params.get("min_change", 5.0) / 100.0
    vol_min = params.get("vol_ratio_min", 1.5)
    return (
        (pl.col("momentum_5d") >= min_mom)
        & (pl.col("change_pct") >= min_chg)
        & (pl.col("vol_ratio_5d") >= vol_min)
    )
