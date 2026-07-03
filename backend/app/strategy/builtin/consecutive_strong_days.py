"""连续强势 — 连续收涨 ≥ N 天 + 5日动量确认, 趋势惯性追踪"""
import polars as pl

META = {
    "id": "consecutive_strong_days",
    "name": "连续强势",
    "description": "连续收涨 ≥ 3 天且5日动量 ≥ 6%, 短线趋势惯性追踪",
    "tags": ["连涨", "动量", "强势"],
    "params": [
        {"id": "min_days", "label": "最少连涨天数", "type": "int",
         "default": 3, "min": 2, "max": 10, "step": 1},
        {"id": "min_momentum", "label": "最低5日动量%", "type": "float",
         "default": 6.0, "min": 2.0, "max": 20.0, "step": 1.0},
    ],
    "scoring": {"consecutive_up_days": 0.5, "momentum_5d": 0.3, "amount": 0.2},
    "order_by": "score",
    "descending": True,
    "limit": 100,
}

ENTRY_SIGNALS = []
EXIT_SIGNALS = ["signal_ma20_breakdown"]
STOP_LOSS = -0.05
MAX_HOLD_DAYS = 5
ALERTS = []


def filter(df: pl.DataFrame, params: dict) -> pl.Expr:
    min_days = params.get("min_days", 3)
    min_mom = params.get("min_momentum", 6.0) / 100.0
    return (
        (pl.col("consecutive_up_days") >= min_days)
        & (pl.col("momentum_5d") >= min_mom)
    )
