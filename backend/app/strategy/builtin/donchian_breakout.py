"""唐奇安通道突破 — 收盘创 60 日新高 + 量能确认, 经典趋势跟随入场"""
import polars as pl

META = {
    "id": "donchian_breakout",
    "name": "唐奇安通道突破",
    "description": "收盘创 60 日新高 (唐奇安上轨突破) 且量比 ≥ 1.5, 趋势跟随",
    "tags": ["突破", "趋势", "放量"],
    "params": [
        {"id": "vol_ratio_min", "label": "最低量比", "type": "float",
         "default": 1.5, "min": 0.5, "max": 5.0, "step": 0.1},
    ],
    "scoring": {"momentum_20d": 0.4, "vol_ratio_5d": 0.3, "amount": 0.3},
    "order_by": "score",
    "descending": True,
    "limit": 100,
}

ENTRY_SIGNALS = ["signal_n_day_high"]
EXIT_SIGNALS = ["signal_ma20_breakdown"]
STOP_LOSS = -0.08
MAX_HOLD_DAYS = 20
ALERTS = [
    {"field": "signal_volume_surge", "message": "突破放量异动"},
]


def filter(df: pl.DataFrame, params: dict) -> pl.Expr:
    vol_min = params.get("vol_ratio_min", 1.5)
    return (
        pl.col("signal_n_day_high").fill_null(False)
        & (pl.col("vol_ratio_5d") >= vol_min)
    )
