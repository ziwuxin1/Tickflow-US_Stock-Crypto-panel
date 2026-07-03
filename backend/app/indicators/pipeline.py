"""enriched 表计算流水线(§7.5 / §7.7 Step 2)。

存储层 (enriched parquet):
  仅存储基础行情窄表 (13 列), 指标和信号由各服务即时计算。

  存储列: symbol, date, OHLCV(前复权), volume, amount,
          raw_close, raw_high, raw_low, turnover_rate,
          consecutive_up_days

设计:
  - 100% Polars 表达式(SQL 窗口无法表达递归 EMA)
  - 每只标的独立计算(`.over("symbol")`)— 美股/加密混存, 周末分区只有加密行也天然兼容
  - 有 adj_factor 时先应用前复权再算指标(美股拆股/分红);加密无因子直接用 raw
  - streaming collect 控制内存
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

import polars as pl

from app.config import settings

logger = logging.getLogger(__name__)


# ── 自定义信号缓存 ─────────────────────────────────────
# 从 data/user_data/custom_signals/*.json 加载并编译为 Polars 表达式。
# 模块级缓存：首次调用时加载，invalidate_custom_signals() 后下次重载。
_custom_signal_exprs: dict[str, pl.Expr] | None = None


def _get_custom_signal_exprs() -> dict[str, pl.Expr]:
    """懒加载自定义信号表达式（带模块级缓存）。"""
    global _custom_signal_exprs
    if _custom_signal_exprs is None:
        from app.strategy import custom_signals
        try:
            sigs = custom_signals.load_all(settings.data_dir)
            _custom_signal_exprs = custom_signals.build_expressions(sigs)
        except Exception as e:
            logger.warning("custom signals load failed: %s", e)
            _custom_signal_exprs = {}
    return _custom_signal_exprs


def invalidate_custom_signals() -> None:
    """失效自定义信号缓存（保存/删除信号后调用，下次计算重新加载）。"""
    global _custom_signal_exprs
    _custom_signal_exprs = None


# enriched parquet 仅存储的列 (13 列)
ENRICHED_STORAGE_COLS = [
    "symbol", "date",
    "open", "high", "low", "close",          # 前复权
    "volume", "amount",
    "raw_close", "raw_high", "raw_low",       # 不复权原始价
    "turnover_rate",                           # 依赖当时的 float_shares, 不可回推
    "consecutive_up_days",                     # 递推状态, 需从历史 cum_sum
]


# ================================================================
# enriched 完整列清单 (存储 + 运行时计算)
# 供 AI 审查代码时参考: 策略/筛选/回测 可直接使用以下列名。
# 分类: 存储列 → 指标列 → 信号列 → JOIN 列
# ================================================================
ENRICHED_COLUMNS: dict[str, dict[str, str]] = {
    # ── 存储列 (parquet 持久化) ──────────────────────────
    "symbol":                  "标的代码 (如 AAPL.US / BTCUSDT)",
    "date":                    "交易日期",
    "open":                    "前复权开盘价",
    "high":                    "前复权最高价",
    "low":                     "前复权最低价",
    "close":                   "前复权收盘价",
    "volume":                  "成交量(股/币)",
    "amount":                  "成交额(USD/USDT)",
    "raw_close":               "原始收盘价(未复权)",
    "raw_high":                "原始最高价(未复权)",
    "raw_low":                 "原始最低价(未复权)",
    "turnover_rate":           "换手率(%, volume/流通股本*100; 加密为 null)",
    "consecutive_up_days":     "连续收涨天数 (change_pct>0 连续计数)",
    # ── 基础指标 ─────────────────────────────────────────
    "prev_close":              "前收盘价",
    "change_pct":              "日涨跌幅(小数, 如 0.05 = 5%)",
    "change_amount":           "日涨跌额",
    "amplitude":               "日振幅 (最高-最低)/昨收",
    # ── 均线 MA ──────────────────────────────────────────
    "ma5":                     "5日简单均线",
    "ma10":                    "10日简单均线",
    "ma20":                    "20日简单均线",
    "ma30":                    "30日简单均线",
    "ma60":                    "60日简单均线(季线)",
    # ── 指数均线 EMA ─────────────────────────────────────
    "ema5":                    "5日指数均线",
    "ema10":                   "10日指数均线",
    "ema20":                   "20日指数均线",
    "ema30":                   "30日指数均线",
    "ema60":                   "60日指数均线",
    # ── MACD ─────────────────────────────────────────────
    "macd_dif":                "MACD DIF线(快线-慢线)",
    "macd_dea":                "MACD DEA线(信号线)",
    "macd_hist":               "MACD柱状图 (DIF-DEA)×2",
    # ── 布林带 BOLL ──────────────────────────────────────
    "boll_upper":              "布林带上轨 MA20+2σ",
    "boll_lower":              "布林带下轨 MA20-2σ",
    # ── KDJ ──────────────────────────────────────────────
    "kdj_k":                   "KDJ K值",
    "kdj_d":                   "KDJ D值",
    "kdj_j":                   "KDJ J值 (3K-2D)",
    # ── ATR ──────────────────────────────────────────────
    "atr_14":                  "14日平均真实波幅",
    # ── 量价 ─────────────────────────────────────────────
    "vol_ma5":                 "5日成交均量",
    "vol_ma10":                "10日成交均量",
    "vol_ratio_5d":            "量比 (成交量/5日均量)",
    # ── 极值 ─────────────────────────────────────────────
    "high_60d":                "60日最高价",
    "low_60d":                 "60日最低价",
    # ── 动量 ─────────────────────────────────────────────
    "momentum_5d":             "5日动量(涨跌幅小数)",
    "momentum_10d":            "10日动量",
    "momentum_20d":            "20日动量",
    "momentum_30d":            "30日动量",
    "momentum_60d":            "60日动量",
    # ── 波动率 ───────────────────────────────────────────
    "annual_vol_20d":          "20日年化波动率",
    # ── RSI ──────────────────────────────────────────────
    "rsi_6":                   "6日相对强弱指标",
    "rsi_14":                  "14日相对强弱指标",
    "rsi_24":                  "24日相对强弱指标",
    # ── 信号列 (bool) ────────────────────────────────────
    "signal_ma_golden_5_20":   "MA5上穿MA20 (金叉)",
    "signal_ma_dead_5_20":     "MA5下穿MA20 (死叉)",
    "signal_ma_golden_20_60":  "MA20上穿MA60",
    "signal_macd_golden":      "MACD金叉 (DIF上穿DEA)",
    "signal_macd_dead":        "MACD死叉 (DIF下穿DEA)",
    "signal_ma20_breakout":    "收盘突破MA20上方",
    "signal_ma20_breakdown":   "收盘跌破MA20下方",
    "signal_n_day_high":       "创60日新高",
    "signal_n_day_low":        "创60日新低",
    "signal_boll_breakout_upper": "突破布林上轨",
    "signal_boll_breakdown_lower": "跌破布林下轨",
    "signal_volume_surge":     "放量 (量比≥2.0)",
    # ── JOIN 列 (由 repository 从 instruments 表补充) ───
    "name":                    "标的名称 (来自 instruments)",
    "total_shares":            "总股本 (来自 instruments, 加密为 null)",
    "float_shares":            "流通股本 (来自 instruments, 加密为 null)",
}

# 仅供 AI/开发者快速索引: 按类别的列名列表
ENRICHED_COLUMNS_BY_CATEGORY: dict[str, list[str]] = {
    "storage":  [k for k in ENRICHED_COLUMNS if k in ENRICHED_STORAGE_COLS],
    "basic":    ["prev_close", "change_pct", "change_amount", "amplitude"],
    "ma":       ["ma5", "ma10", "ma20", "ma30", "ma60"],
    "ema":      ["ema5", "ema10", "ema20", "ema30", "ema60"],
    "macd":     ["macd_dif", "macd_dea", "macd_hist"],
    "boll":     ["boll_upper", "boll_lower"],
    "kdj":      ["kdj_k", "kdj_d", "kdj_j"],
    "atr":      ["atr_14"],
    "volume":   ["vol_ma5", "vol_ma10", "vol_ratio_5d"],
    "extremes": ["high_60d", "low_60d"],
    "momentum": ["momentum_5d", "momentum_10d", "momentum_20d", "momentum_30d", "momentum_60d"],
    "volatility": ["annual_vol_20d"],
    "rsi":      ["rsi_6", "rsi_14", "rsi_24"],
    "signals":  [k for k in ENRICHED_COLUMNS if k.startswith("signal_")],
    "join":     ["name", "total_shares", "float_shares"],
}


def _ema_alpha(span: int) -> float:
    return 2.0 / (span + 1)


def _apply_adj_factor(raw: pl.DataFrame, factors: pl.DataFrame) -> pl.DataFrame:
    """对 raw K 线应用前复权 (forward adjustment)。

    adj_factor 结构: symbol, trade_date, ex_factor
    ex_factor 含义: 每次除权事件的 pre/post 比值(个股级,非累积)。

    前复权原理:
      - 保持最新价格不变,将历史价格向下调整以消除除权缺口
      - adjusted = raw × cumprod_at_D / total_cumprod
      - 等价于: adjusted = raw / (该日期之后所有事件的 ex_factor 乘积)
    """
    if factors.is_empty():
        return raw

    # 确保类型一致
    factors = factors.with_columns(
        pl.col("trade_date").cast(pl.Date, strict=False),
        pl.col("ex_factor").cast(pl.Float64, strict=False),
    ).select("symbol", "trade_date", "ex_factor").drop_nulls()

    if factors.is_empty():
        return raw

    # 去重 + 排序 + 累积乘积 (一趟完成)
    factors_sorted = (
        factors.sort(["symbol", "trade_date"])
        .unique(subset=["symbol", "trade_date"])
        .sort(["symbol", "trade_date"])
        .with_columns(
            pl.col("ex_factor").cum_prod().over("symbol").alias("cum_factor"),
        )
    )

    # 每个 symbol 的总累积因子
    total_factors = (
        factors_sorted
        .group_by("symbol")
        .agg(pl.col("cum_factor").last().alias("total_factor"))
    )

    raw_sorted = raw.sort(["symbol", "date"])

    # join_asof backward: 每根 K 线取 <= 其 date 的最新累积因子
    # 同时带 trade_date 列用于判断除权日标记
    df = raw_sorted.join_asof(
        factors_sorted.select("symbol", "trade_date", "cum_factor"),
        left_on="date",
        right_on="trade_date",
        by="symbol",
        strategy="backward",
    )

    # 补充 total_factor + 前复权 + 除权标记,一次 with_columns 完成
    df = df.join(total_factors, on="symbol", how="left")

    is_ex = pl.col("trade_date") == pl.col("date")
    ratio = pl.col("cum_factor").fill_null(1.0) / pl.col("total_factor").fill_null(1.0)
    price_cols = [c for c in ("open", "high", "low", "close") if c in df.columns]

    df = df.with_columns(
        [pl.col(c) * ratio for c in price_cols]
        + [
            is_ex.alias("ex_rights"),
        ]
    ).drop(["trade_date", "cum_factor", "total_factor"])

    return df


# ================================================================
# 技术指标计算 (从 OHLCV 计算)
# ================================================================

def compute_indicators(df: pl.DataFrame) -> pl.DataFrame:
    """从 OHLCV 数据计算全套技术指标。

    输入必须包含: symbol, date, open, high, low, close, volume
    返回添加了所有指标列的 DataFrame。
    """
    if df.is_empty():
        return df

    import time as _time
    _t0 = _time.perf_counter()

    df = df.sort(["symbol", "date"])

    # Pass 1: 均线 + EMA + MACD 基础 + BOLL 基础 + KDJ 基础 + ATR 基础 + 量价 + 极值
    prev_close = pl.col("close").shift(1).over("symbol")
    df = df.with_columns([
        # 前收盘价
        prev_close.alias("prev_close"),
        # MA (最大 MA60)
        pl.col("close").rolling_mean(5).over("symbol").alias("ma5"),
        pl.col("close").rolling_mean(10).over("symbol").alias("ma10"),
        pl.col("close").rolling_mean(20).over("symbol").alias("ma20"),
        pl.col("close").rolling_mean(30).over("symbol").alias("ma30"),
        pl.col("close").rolling_mean(60).over("symbol").alias("ma60"),
        # EMA (不含 ema12/ema26, MACD 内部自算)
        pl.col("close").ewm_mean(alpha=_ema_alpha(5), adjust=False).over("symbol").alias("ema5"),
        pl.col("close").ewm_mean(alpha=_ema_alpha(10), adjust=False).over("symbol").alias("ema10"),
        pl.col("close").ewm_mean(alpha=_ema_alpha(20), adjust=False).over("symbol").alias("ema20"),
        pl.col("close").ewm_mean(alpha=_ema_alpha(30), adjust=False).over("symbol").alias("ema30"),
        pl.col("close").ewm_mean(alpha=_ema_alpha(60), adjust=False).over("symbol").alias("ema60"),
        # MACD base (内部计算, 不存 ema12/ema26)
        pl.col("close").ewm_mean(alpha=_ema_alpha(12), adjust=False).over("symbol").alias("_ema12"),
        pl.col("close").ewm_mean(alpha=_ema_alpha(26), adjust=False).over("symbol").alias("_ema26"),
        # BOLL base
        pl.col("close").rolling_std(20).over("symbol").alias("_boll_std"),
        # KDJ base
        pl.col("low").rolling_min(9).over("symbol").alias("_kdj_ln"),
        pl.col("high").rolling_max(9).over("symbol").alias("_kdj_hn"),
        # ATR base
        pl.max_horizontal(
            pl.col("high") - pl.col("low"),
            (pl.col("high") - prev_close).abs(),
            (pl.col("low") - prev_close).abs(),
        ).alias("_tr"),
        # 量价 base
        pl.col("volume").rolling_mean(5).over("symbol").alias("vol_ma5"),
        pl.col("volume").rolling_mean(10).over("symbol").alias("vol_ma10"),
        pl.col("volume").rolling_mean(5).over("symbol").alias("_vol_ma5"),
        # 极值 (60 日最高/最低价, 与增量路径口径一致: 用 high/low 而非 close)
        pl.col("high").rolling_max(60).over("symbol").alias("high_60d"),
        pl.col("low").rolling_min(60).over("symbol").alias("low_60d"),
    ])

    # Pass 2: MACD + BOLL (基于 Pass 1 基础列)
    df = df.with_columns([
        (pl.col("_ema12") - pl.col("_ema26")).alias("macd_dif"),
        (pl.col("ma20") + 2 * pl.col("_boll_std")).alias("boll_upper"),
        (pl.col("ma20") - 2 * pl.col("_boll_std")).alias("boll_lower"),
    ]).with_columns(
        pl.col("macd_dif").ewm_mean(alpha=_ema_alpha(9), adjust=False).over("symbol").alias("macd_dea"),
    ).with_columns(
        ((pl.col("macd_dif") - pl.col("macd_dea")) * 2).alias("macd_hist"),
    )

    # Pass 3: KDJ
    _kdj_rsv = (
        100 * (pl.col("close") - pl.col("_kdj_ln"))
        / (pl.col("_kdj_hn") - pl.col("_kdj_ln")).fill_null(1e-12)
    )
    df = df.with_columns([
        _kdj_rsv.ewm_mean(alpha=1.0 / 3, adjust=False).over("symbol").alias("kdj_k"),
    ]).with_columns([
        pl.col("kdj_k").ewm_mean(alpha=1.0 / 3, adjust=False).over("symbol").alias("kdj_d"),
    ]).with_columns([
        (3 * pl.col("kdj_k") - 2 * pl.col("kdj_d")).alias("kdj_j"),
    ])

    # Pass 4: ATR + 量比 + 动量 + 波动 + 涨跌幅 + 涨跌额 + 振幅
    df = df.with_columns(
        pl.col("_tr").ewm_mean(alpha=1.0 / 14, adjust=False).over("symbol").alias("atr_14"),
    ).with_columns(
        (pl.col("volume") / pl.col("_vol_ma5")).alias("vol_ratio_5d"),
    ).with_columns([
        # 动量: 5d/10d/20d/30d/60d
        (pl.col("close") / pl.col("close").shift(5).over("symbol") - 1).alias("momentum_5d"),
        (pl.col("close") / pl.col("close").shift(10).over("symbol") - 1).alias("momentum_10d"),
        (pl.col("close") / pl.col("close").shift(20).over("symbol") - 1).alias("momentum_20d"),
        (pl.col("close") / pl.col("close").shift(30).over("symbol") - 1).alias("momentum_30d"),
        (pl.col("close") / pl.col("close").shift(60).over("symbol") - 1).alias("momentum_60d"),
        # 日涨跌幅
        (pl.col("close") / pl.col("close").shift(1).over("symbol") - 1).alias("change_pct"),
    ]).with_columns(
        # 涨跌额
        (pl.col("close") - pl.col("close").shift(1).over("symbol")).alias("change_amount"),
    ).with_columns(
        # 振幅 = (high - low) / prev_close
        pl.when(pl.col("close").shift(1).over("symbol") > 0)
          .then((pl.col("high") - pl.col("low")) / pl.col("close").shift(1).over("symbol"))
          .otherwise(None)
          .alias("amplitude"),
    ).with_columns(
        # 日涨跌幅 (用于波动率)
        pl.col("close").pct_change().over("symbol").alias("_daily_pct"),
    ).with_columns(
        # 年化波动率
        (pl.col("_daily_pct").rolling_std(20).over("symbol") * (252 ** 0.5))
            .alias("annual_vol_20d"),
    )

    # Pass 5: RSI
    df = df.with_columns(
        pl.col("close").diff().over("symbol").alias("_delta"),
    ).with_columns([
        pl.when(pl.col("_delta") > 0).then(pl.col("_delta")).otherwise(0.0).alias("_gain"),
        pl.when(pl.col("_delta") < 0).then(-pl.col("_delta")).otherwise(0.0).alias("_loss"),
    ])
    for n in (6, 14, 24):
        a = 1.0 / n
        df = df.with_columns([
            pl.col("_gain").ewm_mean(alpha=a, adjust=False).over("symbol").alias(f"_rsi_avg_gain_{n}"),
            pl.col("_loss").ewm_mean(alpha=a, adjust=False).over("symbol").alias(f"_rsi_avg_loss_{n}"),
        ]).with_columns(
            (100 - 100 / (1 + pl.col(f"_rsi_avg_gain_{n}") /
                         pl.when(pl.col(f"_rsi_avg_loss_{n}") == 0)
                           .then(1e-12)
                           .otherwise(pl.col(f"_rsi_avg_loss_{n}"))
                         )).alias(f"rsi_{n}"),
        )

    # Pass 6: 连续收涨天数 (change_pct > 0 的连续计数, cum_sum 分组技巧)
    _is_up = (pl.col("change_pct") > 0).fill_null(False)
    df = df.with_columns(
        (~_is_up).cast(pl.UInt32).cum_sum().over("symbol").alias("_grp_up"),
    ).with_columns(
        pl.when(_is_up)
          .then(_is_up.cast(pl.UInt32).cum_sum().over("symbol", "_grp_up"))
          .otherwise(0)
          .cast(pl.UInt32)
          .alias("consecutive_up_days"),
    )

    # Pass 7: 换手率 (需要 float_shares, 后续在 compute_all 中 JOIN instruments 后补充)

    # 清理临时列
    df = df.drop(["_boll_std", "_tr", "_ema12", "_ema26",
                  "_kdj_ln", "_kdj_hn", "_vol_ma5", "_daily_pct",
                  "_delta", "_gain", "_loss", "_grp_up",
                  "_rsi_avg_gain_6", "_rsi_avg_loss_6",
                  "_rsi_avg_gain_14", "_rsi_avg_loss_14",
                  "_rsi_avg_gain_24", "_rsi_avg_loss_24"])

    _elapsed = (_time.perf_counter() - _t0) * 1000
    import logging as _logging
    _logging.getLogger(__name__).debug("compute_indicators: %.1fms, %d rows", _elapsed, len(df))

    return df


def compute_signals(df: pl.DataFrame) -> pl.DataFrame:
    """从已有指标列计算原子信号布尔列。

    输入必须包含 compute_indicators() 产出的指标列。
    """
    if df.is_empty():
        return df

    df = df.with_columns([
        ((pl.col("ma5") > pl.col("ma20")) &
         (pl.col("ma5").shift(1).over("symbol") <= pl.col("ma20").shift(1).over("symbol")))
            .alias("signal_ma_golden_5_20"),
        ((pl.col("ma5") < pl.col("ma20")) &
         (pl.col("ma5").shift(1).over("symbol") >= pl.col("ma20").shift(1).over("symbol")))
            .alias("signal_ma_dead_5_20"),
        ((pl.col("ma20") > pl.col("ma60")) &
         (pl.col("ma20").shift(1).over("symbol") <= pl.col("ma60").shift(1).over("symbol")))
            .alias("signal_ma_golden_20_60"),
        ((pl.col("macd_dif") > pl.col("macd_dea")) &
         (pl.col("macd_dif").shift(1).over("symbol") <= pl.col("macd_dea").shift(1).over("symbol")))
            .alias("signal_macd_golden"),
        ((pl.col("macd_dif") < pl.col("macd_dea")) &
         (pl.col("macd_dif").shift(1).over("symbol") >= pl.col("macd_dea").shift(1).over("symbol")))
            .alias("signal_macd_dead"),
        ((pl.col("close") > pl.col("ma20")) &
         (pl.col("close").shift(1).over("symbol") <= pl.col("ma20").shift(1).over("symbol")))
            .alias("signal_ma20_breakout"),
        ((pl.col("close") < pl.col("ma20")) &
         (pl.col("close").shift(1).over("symbol") >= pl.col("ma20").shift(1).over("symbol")))
            .alias("signal_ma20_breakdown"),
        (pl.col("close") >= pl.col("high_60d")).alias("signal_n_day_high"),
        (pl.col("close") <= pl.col("low_60d")).alias("signal_n_day_low"),
        (pl.col("close") > pl.col("boll_upper")).alias("signal_boll_breakout_upper"),
        (pl.col("close") < pl.col("boll_lower")).alias("signal_boll_breakdown_lower"),
        (pl.col("vol_ratio_5d") >= 2.0).alias("signal_volume_surge"),
    ])

    # 自定义信号（用户配置的字段+运算符+值组合，编译为布尔列）
    from app.strategy import custom_signals
    df = custom_signals.inject(df, _get_custom_signal_exprs())

    return df


def _compute_turnover_rate(df: pl.DataFrame, instruments: pl.DataFrame) -> pl.DataFrame:
    """计算换手率(%) = volume(股) / float_shares(股) * 100。

    美股日 K volume 单位为「股」; 加密货币无流通股本 (float_shares 为 null)
    → turnover_rate 为 null, 下游 (策略/筛选/前端) 已容忍 null。
    """
    if df.is_empty():
        return df

    if "float_shares" not in instruments.columns or "volume" not in df.columns:
        if "turnover_rate" not in df.columns:
            df = df.with_columns(pl.lit(None).cast(pl.Float64).alias("turnover_rate"))
        return df

    inst_subset = instruments.select("symbol", "float_shares").unique(subset=["symbol"])
    df = df.join(inst_subset, on="symbol", how="left", suffix="_inst")
    df = df.with_columns(
        pl.when(pl.col("float_shares") > 0)
          .then(pl.col("volume") / pl.col("float_shares") * 100.0)
          .otherwise(None)
          .alias("turnover_rate")
    )

    # 清理 JOIN 引入的 instruments 列 (不存入 enriched)
    cleanup = [c for c in df.columns if c.endswith("_inst")]
    if "float_shares" in df.columns:
        cleanup.append("float_shares")
    return df.drop(cleanup)


def compute_all(df: pl.DataFrame, instruments: pl.DataFrame | None = None) -> pl.DataFrame:
    """从 OHLCV 计算全套指标 + 信号。一站式调用。

    输入: symbol, date, open, high, low, close, volume, amount, raw_close
    """
    df = compute_indicators(df)
    df = compute_signals(df)
    if instruments is not None and not instruments.is_empty():
        df = _compute_turnover_rate(df, instruments)

    # 清理 NaN / Inf
    float_cols = [c for c in df.columns if df[c].dtype.is_float()]
    if float_cols:
        df = df.with_columns([
            pl.when(pl.col(c).is_nan() | pl.col(c).is_infinite())
              .then(None)
              .otherwise(pl.col(c))
              .alias(c)
            for c in float_cols
        ])

    return df


def filter_halt_days(df: pl.DataFrame) -> pl.DataFrame:
    """过滤无效交易日 (open/high 均为 0 的空 bar)。

    个别数据源会把停牌/无成交日填成 0 价 bar; close 可能被填充为前收盘价
    而非 0, 因此不能用 "OHLC 全零" 判断。通用防御, 避免污染 MA/ATR 等指标
    (Binance 不会产生 0 开盘 K 线, 美股停牌日通常无 bar — 兜底保留)。
    """
    if df.is_empty() or "open" not in df.columns or "high" not in df.columns:
        return df
    return df.filter(~((pl.col("open") == 0) & (pl.col("high") == 0)))


# ================================================================
# Pipeline: 盘后全量计算 + 写入
# ================================================================

def compute_enriched(
    raw: pl.DataFrame,
    factors: pl.DataFrame | None = None,
    instruments: pl.DataFrame | None = None,
) -> pl.DataFrame:
    """对原始日 K 应用前复权 + 全量计算指标 + 信号, 产出完整 enriched (含全部指标列)。

    输入应包含至少: symbol, date, open, high, low, close, volume (可选 amount)。
    如果提供了 factors, 先应用前复权再算指标。
    如果提供了 instruments, 计算换手率。
    """
    if raw.is_empty():
        return raw

    # 过滤停牌日 (会污染指标计算)
    raw = filter_halt_days(raw)

    if raw.is_empty():
        return raw

    # amount 兜底: 免费源美股日 K amount 恒为 0 → 用 close×volume 近似
    if "amount" in raw.columns:
        raw = raw.with_columns(
            pl.when(pl.col("amount").is_null() | (pl.col("amount") <= 0))
              .then(pl.col("close") * pl.col("volume"))
              .otherwise(pl.col("amount"))
              .alias("amount")
        )

    # 保留不复权原始价格（除权对齐/前端展示用）
    raw = raw.with_columns(
        pl.col("close").alias("raw_close"),
        pl.col("high").alias("raw_high"),
        pl.col("low").alias("raw_low"),
    )

    # 应用前复权（只改 open/high/low/close，raw_close 不受影响）
    if factors is not None and not factors.is_empty():
        raw = _apply_adj_factor(raw, factors)

    # 排序
    df = raw.sort(["symbol", "date"])

    # 全量计算指标 + 信号
    df = compute_all(df, instruments=instruments)

    return df


def _select_storage_cols(df: pl.DataFrame) -> pl.DataFrame:
    """写入 parquet 前裁剪到存储列 (13 列)。"""
    cols = [c for c in ENRICHED_STORAGE_COLS if c in df.columns]
    return df.select(cols)


def run_pipeline(data_dir: Path | None = None,
                 symbols: list[str] | None = None,
                 new_dates_only: bool = False,
                 on_batch_done: Callable[[int, int], None] | None = None) -> int:
    """运行盘后管道:读 kline_daily + adj_factor → 前复权 + 计算存储列 → 写 enriched。

    enriched 表仅存储 13 列基础行情窄表 (OHLCV + raw_close/high/low + turnover_rate + 连涨天数)。

    模式:
      - 全量 (symbols=None, new_dates_only=False):
          读全部 kline_daily, 全部重写 enriched 分区。
          用于首次同步、往前扩展历史。
      - 向后增量 (new_dates_only=True):
          只读 enriched 中尚不存在的日期分区对应的 daily 数据,
          为所有标的生成新的 enriched 分区;
          若同时传 symbols, 还会对这些个股的全部已有日期做重算
          (因为除权因子链变了,历史数据的复权比例也要更新)。
      - 除权因子增量 (symbols 指定, new_dates_only=False):
          只对指定 symbol 做局部重算并合并回已有 enriched。
          用于无新日K数据、仅除权因子变更的场景。
    返回写入的行数。
    """
    import time as _t
    t0 = _t.perf_counter()

    d = Path(data_dir or settings.data_dir)
    daily_dir = d / "kline_daily"
    enriched_base = d / "kline_daily_enriched"
    factor_path = d / "adj_factor" / "all.parquet"
    inst_glob = str(d / "instruments" / "**" / "*.parquet")

    if not daily_dir.exists() or not any(daily_dir.rglob("*.parquet")):
        logger.info("无日K数据, 跳过管道")
        return 0

    daily_glob = (daily_dir / "**" / "*.parquet").as_posix()
    _cast = pl.ScanCastOptions(integer_cast="allow-float")
    written = 0

    # 加载 instruments (换手率需要 float_shares)
    instruments = pl.DataFrame()
    try:
        instruments = pl.scan_parquet(inst_glob, cast_options=_cast).collect()
    except Exception as e:  # noqa: BLE001
        logger.warning("instruments 读取失败: %s", e)

    if new_dates_only:
        # ── 向后增量模式 ──
        # 1. 找出 daily 有但 enriched 还没有的日期
        enriched_dates = set()
        if enriched_base.exists():
            enriched_dates = {p.stem.split("=")[1] for p in enriched_base.glob("date=*")}

        # 读新增日期的 daily 数据 (所有标的)
        new_date_dirs = sorted(
            p for p in daily_dir.glob("date=*")
            if p.stem.split("=")[1] not in enriched_dates
        )
        if not new_date_dirs and not symbols:
            logger.info("增量模式: 无新日期, 无需重算")
            return 0

        # 加载复权因子 (全量,因为所有标的都可能需要)
        factors = _load_factors(factor_path)

        # 2. 为新日期计算 enriched (所有标的)
        if new_date_dirs:
            raw_new = pl.scan_parquet(new_date_dirs[0] / "*.parquet", cast_options=_cast)
            for nd in new_date_dirs[1:]:
                raw_new = pl.concat([raw_new, pl.scan_parquet(nd / "*.parquet", cast_options=_cast)], how="diagonal_relaxed")
            raw_new = raw_new.sort(["symbol", "date"]).collect(streaming=True)

            # 增量模式: 只算新日期, 但指标需要历史窗口
            # 读已有 enriched 最近 60 天作为历史前缀
            sym_list = raw_new["symbol"].unique().to_list()
            hist_df = _load_recent_history(enriched_base, sym_list, days=60)

            # 合并历史 + 新数据
            if not hist_df.is_empty():
                # 只取基础行情列做历史前缀
                hist_cols = [c for c in ["symbol", "date", "open", "high", "low", "close",
                                         "volume", "amount", "raw_close", "raw_high", "raw_low"]
                             if c in hist_df.columns]
                raw_full = pl.concat([hist_df.select(hist_cols), raw_new], how="diagonal_relaxed")
            else:
                raw_full = raw_new

            enriched_new = compute_enriched(raw_full, factors=factors, instruments=instruments)

            # 只保留新日期的行
            new_date_set = set()
            for nd in new_date_dirs:
                ds = nd.stem.split("=")[1]
                new_date_set.add(ds)
            enriched_new = enriched_new.filter(
                pl.col("date").map_elements(lambda x: x.isoformat(), return_dtype=pl.Utf8).is_in(list(new_date_set))
            )

            t_new = _t.perf_counter()
            logger.info("增量计算: %d 个新日期, %d 行, 耗时 %.2fs",
                        len(new_date_dirs), enriched_new.height, t_new - t0)

            if not enriched_new.is_empty():
                for date_df in enriched_new.partition_by("date"):
                    dt = date_df["date"][0]
                    ds = dt.isoformat() if hasattr(dt, "isoformat") else str(dt)
                    out = enriched_base / f"date={ds}" / "part.parquet"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    date_df = _select_storage_cols(date_df).sort(["symbol"])
                    date_df.write_parquet(out)
                    written += date_df.height
                t_write_new = _t.perf_counter()
                logger.info("增量写入: %.2fs, %d 行", t_write_new - t_new, written)

        # 3. 受除权因子影响的个股: 重算全部已有日期 (累积因子链变了)
        if symbols:
            sym_set = set(symbols)
            raw_sym = pl.scan_parquet(daily_glob, cast_options=_cast).sort(["symbol", "date"])
            raw_sym = raw_sym.filter(pl.col("symbol").is_in(list(sym_set)))
            raw_sym = raw_sym.collect(streaming=True)
            if not raw_sym.is_empty():
                factors_sym = factors.filter(pl.col("symbol").is_in(list(sym_set))) if not factors.is_empty() else factors
                inst_sym = instruments.filter(pl.col("symbol").is_in(list(sym_set))) if not instruments.is_empty() else instruments
                enriched_sym = compute_enriched(raw_sym, factors=factors_sym, instruments=inst_sym)
                for date_df in enriched_sym.partition_by("date"):
                    dt = date_df["date"][0]
                    ds = dt.isoformat() if hasattr(dt, "isoformat") else str(dt)
                    out = enriched_base / f"date={ds}" / "part.parquet"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    date_df_storage = _select_storage_cols(date_df)
                    if out.exists():
                        existing = pl.read_parquet(out)
                        existing = existing.filter(~pl.col("symbol").is_in(list(sym_set)))
                        date_df_storage = pl.concat([existing, date_df_storage], how="diagonal_relaxed")
                    date_df_storage = date_df_storage.sort(["symbol"])
                    date_df_storage.write_parquet(out)
                    written += date_df.height
                logger.info("除权重算: %d 只, 共写入 %d 行", len(sym_set), written)

        t_done = _t.perf_counter()
        logger.info("增量管道完成: %.2fs, %d 行", t_done - t0, written)
        return written

    # ── 全量 或 除权因子增量 模式 ──
    mode = f"incremental ({len(symbols)} symbols)" if symbols else "full"
    base = d / "kline_daily_enriched"

    # 加载复权因子 (全量加载一次,每批复用)
    factors = _load_factors(factor_path)

    # 局部模式: 过滤 instruments
    inst_use = instruments

    import gc

    # ── 按 symbol 分批处理: 每只股只有 ~244 行, 无冗余计算 ──
    # 先获取全部 symbol 列表
    lf_all = pl.scan_parquet(daily_glob, cast_options=_cast)
    if symbols:
        sym_set = set(symbols)
        lf_all = lf_all.filter(pl.col("symbol").is_in(list(sym_set)))

    all_symbols = (
        lf_all.select("symbol").unique().sort("symbol")
        .collect(streaming=True)["symbol"].to_list()
    )
    if not all_symbols:
        logger.info("无日K数据, 跳过管道")
        return 0

    total_syms = len(all_symbols)
    logger.info("全量计算: %d 只标的, 按 symbol 分批 [%s]", total_syms, mode)

    if not factors.is_empty() and symbols:
        factors = factors.filter(pl.col("symbol").is_in(list(sym_set)))
    if not factors.is_empty():
        logger.info("读取复权因子: %d 行", factors.height)
    if not instruments.is_empty() and symbols:
        inst_use = instruments.filter(pl.col("symbol").is_in(list(sym_set)))

    from app.services import preferences as prefs_mod
    SYM_BATCH = prefs_mod.get_enriched_batch_size()  # 每批 N 只 × ~244 天, 可在设置中调整
    total_batches = (total_syms + SYM_BATCH - 1) // SYM_BATCH

    # 全量模式: 先清理旧 enriched 目录, 最后一次性按日期写入
    # 收集所有批次结果, 按日期分区写入
    from collections import defaultdict
    date_buffers: dict[str, list[pl.DataFrame]] = defaultdict(list)

    for batch_start in range(0, total_syms, SYM_BATCH):
        batch_end = min(batch_start + SYM_BATCH, total_syms)
        batch_syms = all_symbols[batch_start:batch_end]

        # 只读取本批 symbol 的数据
        lf_batch = pl.scan_parquet(daily_glob, cast_options=_cast)
        lf_batch = lf_batch.filter(pl.col("symbol").is_in(batch_syms))
        raw = lf_batch.sort(["symbol", "date"]).collect(streaming=True)

        if raw.is_empty():
            continue

        # 本批的 factors / instruments
        batch_factors = (
            factors.filter(pl.col("symbol").is_in(batch_syms))
            if not factors.is_empty() else factors
        )
        batch_inst = (
            inst_use.filter(pl.col("symbol").is_in(batch_syms))
            if not inst_use.is_empty() else inst_use
        )

        # 计算
        enriched = compute_enriched(raw, factors=batch_factors, instruments=batch_inst)

        if not enriched.is_empty():
            if symbols:
                # 局部模式: 直接按日期合并写入
                for date_df in enriched.partition_by("date"):
                    dt = date_df["date"][0]
                    ds = dt.isoformat() if hasattr(dt, "isoformat") else str(dt)
                    out = base / f"date={ds}" / "part.parquet"
                    out.parent.mkdir(parents=True, exist_ok=True)
                    date_df_storage = _select_storage_cols(date_df)
                    if out.exists():
                        existing = pl.read_parquet(out)
                        existing = existing.filter(~pl.col("symbol").is_in(batch_syms))
                        date_df_storage = pl.concat([existing, date_df_storage], how="diagonal_relaxed")
                    date_df_storage = date_df_storage.sort(["symbol"])
                    date_df_storage.write_parquet(out)
                    written += date_df_storage.height
            else:
                # 全量模式: 缓冲到 date_buffers, 最后一次性写入
                for date_df in enriched.partition_by("date"):
                    dt = date_df["date"][0]
                    ds = dt.isoformat() if hasattr(dt, "isoformat") else str(dt)
                    date_buffers[ds].append(_select_storage_cols(date_df).sort(["symbol"]))
                    written += date_df.height

        del raw, enriched, batch_factors, batch_inst
        gc.collect()

        logger.info("symbol 批次 %d/%d (%s ~ %s), 已处理 %d 行",
                     batch_start // SYM_BATCH + 1,
                     total_batches,
                     batch_syms[0], batch_syms[-1], written)

        # 通知进度
        if on_batch_done:
            on_batch_done(batch_start // SYM_BATCH + 1, total_batches)

    # 全量模式: 按日期分区写入
    if not symbols and date_buffers:
        if base.exists():
            import shutil
            shutil.rmtree(base)
        base.mkdir(parents=True, exist_ok=True)

        for ds, dfs in date_buffers.items():
            out = base / f"date={ds}" / "part.parquet"
            out.parent.mkdir(parents=True, exist_ok=True)
            merged = pl.concat(dfs, how="diagonal_relaxed").sort(["symbol"])
            merged.write_parquet(out)

        date_buffers.clear()
        gc.collect()

    t_done = _t.perf_counter()
    adj_label = "含复权" if not factors.is_empty() else "无复权"
    logger.info("enriched 完成 [%s]: %.2fs, 共 %d 行, %s",
                mode, t_done - t0, written, adj_label)
    return written


def _load_factors(factor_path: Path) -> pl.DataFrame:
    """加载复权因子文件。"""
    if not factor_path.exists():
        return pl.DataFrame()
    try:
        return pl.read_parquet(factor_path)
    except Exception as e:  # noqa: BLE001
        logger.warning("复权因子读取失败: %s", e)
        return pl.DataFrame()


def _load_recent_history(enriched_base: Path, symbols: list[str], days: int) -> pl.DataFrame:
    """从已有 enriched parquet 加载最近 N 天的历史数据(用于增量模式的指标计算窗口)。

    只读基础行情列, 作为指标计算的历史前缀。
    """
    from datetime import date, timedelta
    cutoff = date.today() - timedelta(days=days + 30)  # 多读 30 天余量

    try:
        # 注意: 此处必须用本地 cast options (run_pipeline 里的 _cast 是函数局部变量,
        # 早期版本误引用导致 NameError 被 except 吞掉, 增量模式历史前缀一直加载失败)。
        cast = pl.ScanCastOptions(integer_cast="allow-float")
        lf = (
            pl.scan_parquet(str(enriched_base / "**" / "*.parquet"), cast_options=cast)
            .filter(
                (pl.col("symbol").is_in(symbols))
                & (pl.col("date") >= cutoff)
            )
            .sort(["symbol", "date"])
        )
        hist_cols = [c for c in ["symbol", "date", "open", "high", "low", "close",
                                 "volume", "amount", "raw_close", "raw_high", "raw_low"]
                    if c in lf.schema]
        return lf.select(hist_cols).collect()
    except Exception as e:  # noqa: BLE001
        logger.warning("历史数据加载失败: %s", e)
        return pl.DataFrame()


def compute_enriched_single(daily_for_symbol: pl.DataFrame) -> pl.DataFrame:
    """单股版本 — Free 用户用,拉下来单股 K 后即时计算全部指标+信号返回给前端。"""
    if daily_for_symbol.is_empty():
        return daily_for_symbol

    # 过滤停牌
    daily_for_symbol = filter_halt_days(daily_for_symbol)
    if daily_for_symbol.is_empty():
        return daily_for_symbol

    # 保留 raw_close (与存储 schema 对齐, 无复权时等于 close)
    daily_for_symbol = daily_for_symbol.with_columns(pl.col("close").alias("raw_close"))

    # 即时计算全套指标 + 信号 (无复权因子, 无 instruments)
    return compute_all(daily_for_symbol)


# ================================================================
# 盘中增量计算: 只算今天 5500 行 (不复算历史)
# ================================================================

def compute_enriched_today(
    live_agg: pl.DataFrame,
    prev_enriched: pl.DataFrame,
    today_ohlcv: pl.DataFrame,
    instruments: pl.DataFrame | None = None,
) -> pl.DataFrame:
    """用昨天的递推状态 + 今天的 OHLCV 增量计算今天的 enriched 数据。

    只处理 ~5500 行, 耗时 ~10-50ms (替代全量 compute_enriched 的 1.5-2s)。

    参数:
        live_agg:       repo.get_live_agg() — 包含所有递推状态 + 窗口聚合
        prev_enriched:  repo.get_enriched_latest() — 昨天的完整 enriched (用于信号交叉判断)
        today_ohlcv:    今天的 OHLCV (symbol, date, open, high, low, close, volume, amount)
        instruments:    维表 (换手率需要 float_shares)

    返回:
        今天的 enriched DataFrame (~5500 行, 64 列)
    """
    if today_ohlcv.is_empty() or live_agg.is_empty():
        return pl.DataFrame()

    alpha = _ema_alpha

    # ---- JOIN: 今天的 OHLCV + 昨天的递推状态 ----
    df = today_ohlcv.join(live_agg, on="symbol", how="inner")

    # ---- 前复权: 保存原始价 → 调整 OHLCV ----
    df = df.with_columns([
        pl.col("close").alias("raw_close"),
        pl.col("high").alias("raw_high"),
        pl.col("low").alias("raw_low"),
    ])
    if "_adj_factor" in df.columns:
        af = pl.col("_adj_factor").fill_null(1.0)
        df = df.with_columns([
            (pl.col("open") * af).alias("open"),
            (pl.col("high") * af).alias("high"),
            (pl.col("low") * af).alias("low"),
            (pl.col("close") * af).alias("close"),
        ])

    # ---- volume 统一 Float64 ----
    df = df.with_columns(pl.col("volume").cast(pl.Float64))

    # ---- ex_rights: 盘中除权极罕见, 直接 false ----
    df = df.with_columns(pl.lit(False).alias("ex_rights"))

    # ---- 基础涨跌 ----
    # prev_close: 有则直接用 (来自 API quote_extra, raw), 需要乘 adj_factor 对齐复权价
    if "prev_close" not in df.columns:
        prev_close = pl.col("close_right") if "close_right" in df.columns else pl.col("close")
        df = df.with_columns(prev_close.alias("prev_close"))
    elif "_adj_factor" in df.columns:
        # API 返回的 prev_close 是原始价, 乘复权因子对齐复权价 (用于 change_pct)
        df = df.with_columns((pl.col("prev_close") * pl.col("_adj_factor").fill_null(1.0)).alias("prev_close"))

    # change_pct / change_amount / amplitude: 有则直接用, 无则计算
    if "change_pct" not in df.columns:
        df = df.with_columns((pl.col("close") / pl.col("prev_close") - 1).alias("change_pct"))
    if "change_amount" not in df.columns:
        df = df.with_columns((pl.col("close") - pl.col("prev_close")).alias("change_amount"))
    if "amplitude" not in df.columns:
        df = df.with_columns(
            pl.when(pl.col("prev_close") > 0)
              .then((pl.col("high") - pl.col("low")) / pl.col("prev_close"))
              .otherwise(None)
              .alias("amplitude"),
        )

    # ---- EMA (递推) ----
    df = df.with_columns([
        (alpha(5)  * pl.col("close") + (1 - alpha(5))  * pl.col("ema5")).alias("ema5"),
        (alpha(10) * pl.col("close") + (1 - alpha(10)) * pl.col("ema10")).alias("ema10"),
        (alpha(20) * pl.col("close") + (1 - alpha(20)) * pl.col("ema20")).alias("ema20"),
        (alpha(30) * pl.col("close") + (1 - alpha(30)) * pl.col("ema30")).alias("ema30"),
        (alpha(60) * pl.col("close") + (1 - alpha(60)) * pl.col("ema60")).alias("ema60"),
    ])

    # ---- MACD (递推) ----
    ema12 = alpha(12) * pl.col("close") + (1 - alpha(12)) * pl.col("_ema12")
    ema26 = alpha(26) * pl.col("close") + (1 - alpha(26)) * pl.col("_ema26")
    dif = ema12 - ema26
    dea = alpha(9) * dif + (1 - alpha(9)) * pl.col("macd_dea")
    df = df.with_columns([
        dif.alias("macd_dif"),
        dea.alias("macd_dea"),
        ((dif - dea) * 2).alias("macd_hist"),
    ])

    # ---- MA (用部分和) ----
    df = df.with_columns([
        ((pl.col("_ma5_partial_sum") + pl.col("close")) / 5).alias("ma5"),
        ((pl.col("_ma10_partial_sum") + pl.col("close")) / 10).alias("ma10"),
        ((pl.col("_ma20_partial_sum") + pl.col("close")) / 20).alias("ma20"),
        ((pl.col("_ma30_partial_sum") + pl.col("close")) / 30).alias("ma30"),
        ((pl.col("_ma60_partial_sum") + pl.col("close")) / 60).alias("ma60"),
    ])

    # ---- Bollinger ----
    boll_sum = pl.col("_boll_partial_sum") + pl.col("close")
    boll_sq_sum = pl.col("_boll_partial_sq_sum") + pl.col("close") ** 2
    boll_ma = boll_sum / 20
    boll_var = boll_sq_sum / 20 - boll_ma ** 2
    boll_std = pl.when(boll_var > 0).then(boll_var.sqrt()).otherwise(0.0)
    df = df.with_columns([
        (boll_ma + 2 * boll_std).alias("boll_upper"),
        (boll_ma - 2 * boll_std).alias("boll_lower"),
    ])

    # ---- KDJ (递推) ----
    kdj_ln = pl.min_horizontal(pl.col("_kdj_8d_low"), pl.col("low"))
    kdj_hn = pl.max_horizontal(pl.col("_kdj_8d_high"), pl.col("high"))
    rsv = (pl.col("close") - kdj_ln) / (kdj_hn - kdj_ln).fill_null(1e-12) * 100
    k_today = rsv / 3 + pl.col("kdj_k") * 2 / 3
    d_today = k_today / 3 + pl.col("kdj_d") * 2 / 3
    df = df.with_columns([
        k_today.alias("kdj_k"),
        d_today.alias("kdj_d"),
        (3 * k_today - 2 * d_today).alias("kdj_j"),
    ])

    # ---- ATR (递推) ----
    tr = pl.max_horizontal(
        pl.col("high") - pl.col("low"),
        (pl.col("high") - pl.col("prev_close")).abs(),
        (pl.col("low") - pl.col("prev_close")).abs(),
    )
    df = df.with_columns(
        (tr / 14 + pl.col("atr_14") * 13 / 14).alias("atr_14"),
    )

    # ---- RSI (递推, n=6,14,24) ----
    delta = pl.col("close") - pl.col("prev_close")
    gain = pl.when(delta > 0).then(delta).otherwise(0.0)
    loss = pl.when(delta < 0).then(-delta).otherwise(0.0)
    for n in (6, 14, 24):
        a = 1.0 / n
        avg_gain = (1 - a) * pl.col(f"_rsi_avg_gain_{n}") + a * gain
        avg_loss = (1 - a) * pl.col(f"_rsi_avg_loss_{n}") + a * loss
        df = df.with_columns([
            avg_gain.alias(f"_rsi_avg_gain_{n}"),
            avg_loss.alias(f"_rsi_avg_loss_{n}"),
            (100 - 100 / (1 + avg_gain / pl.when(avg_loss == 0).then(1e-12).otherwise(avg_loss)))
            .alias(f"rsi_{n}"),
        ])

    # ---- 量比 ----
    vol_ma5 = (pl.col("_vol_ma5_partial_sum") + pl.col("volume")) / 5
    vol_ma10 = (pl.col("_vol_ma10_partial_sum") + pl.col("volume")) / 10
    df = df.with_columns([
        vol_ma5.alias("vol_ma5"),
        vol_ma10.alias("vol_ma10"),
        (pl.col("volume") / vol_ma5).alias("vol_ratio_5d"),
    ])

    # ---- 极值 60 日 ----
    df = df.with_columns([
        pl.max_horizontal(pl.col("_high_59d"), pl.col("high")).alias("high_60d"),
        pl.min_horizontal(pl.col("_low_59d"), pl.col("low")).alias("low_60d"),
    ])

    # ---- 动量 (5d/10d/20d/30d/60d) ----
    df = df.with_columns([
        (pl.col("close") / pl.col("_close_5d_ago") - 1).alias("momentum_5d"),
        (pl.col("close") / pl.col("_close_10d_ago") - 1).alias("momentum_10d"),
        (pl.col("close") / pl.col("_close_20d_ago") - 1).alias("momentum_20d"),
        (pl.col("close") / pl.col("_close_30d_ago") - 1).alias("momentum_30d"),
        (pl.col("close") / pl.col("_close_60d_ago") - 1).alias("momentum_60d"),
    ])

    # ---- 年化波动率 20d (递推) ----
    # 用 Welford 简化: sum + sum_sq of 19 historical returns + today's return
    today_ret = pl.col("close") / pl.col("prev_close") - 1
    total_sum = pl.col("_vol_19d_pct_sum").fill_null(0.0) + today_ret
    total_sq_sum = pl.col("_vol_19d_pct_sq_sum").fill_null(0.0) + today_ret ** 2
    vol_mean = total_sum / 20
    vol_var = total_sq_sum / 20 - vol_mean ** 2
    df = df.with_columns(
        pl.when(vol_var > 0)
          .then(vol_var.sqrt() * (252 ** 0.5))
          .otherwise(None)
          .alias("annual_vol_20d"),
    )

    # ---- 信号 (需要昨天的指标值判断交叉) ----
    if not prev_enriched.is_empty():
        sig_prev = prev_enriched.select(
            "symbol",
            pl.col("ma5").alias("_prev_ma5"),
            pl.col("ma20").alias("_prev_ma20"),
            pl.col("ma60").alias("_prev_ma60"),
            pl.col("macd_dif").alias("_prev_dif"),
            pl.col("macd_dea").alias("_prev_dea"),
            pl.col("boll_upper").alias("_prev_boll_upper"),
            pl.col("boll_lower").alias("_prev_boll_lower"),
            pl.col("close").alias("_prev_close_enriched"),
        )
        df = df.join(sig_prev, on="symbol", how="left")

        df = df.with_columns([
            # MA 金叉/死叉
            ((pl.col("ma5") > pl.col("ma20")) & (pl.col("_prev_ma5") <= pl.col("_prev_ma20")))
                .alias("signal_ma_golden_5_20"),
            ((pl.col("ma5") < pl.col("ma20")) & (pl.col("_prev_ma5") >= pl.col("_prev_ma20")))
                .alias("signal_ma_dead_5_20"),
            ((pl.col("ma20") > pl.col("ma60")) & (pl.col("_prev_ma20") <= pl.col("_prev_ma60")))
                .alias("signal_ma_golden_20_60"),
            # MACD 金叉/死叉
            ((pl.col("macd_dif") > pl.col("macd_dea")) & (pl.col("_prev_dif") <= pl.col("_prev_dea")))
                .alias("signal_macd_golden"),
            ((pl.col("macd_dif") < pl.col("macd_dea")) & (pl.col("_prev_dif") >= pl.col("_prev_dea")))
                .alias("signal_macd_dead"),
            # MA20 突破/跌破
            ((pl.col("close") > pl.col("ma20")) & (pl.col("_prev_close_enriched") <= pl.col("_prev_ma20")))
                .alias("signal_ma20_breakout"),
            ((pl.col("close") < pl.col("ma20")) & (pl.col("_prev_close_enriched") >= pl.col("_prev_ma20")))
                .alias("signal_ma20_breakdown"),
            # BOLL 突破
            (pl.col("close") >= pl.col("boll_upper")).alias("signal_boll_breakout_upper"),
            (pl.col("close") <= pl.col("boll_lower")).alias("signal_boll_breakdown_lower"),
        ])

        df = df.drop([
            c for c in df.columns
            if c.startswith("_prev_") and c != "_prev_consec_up_days"
        ])

    # N日新高/新低 + 放量
    df = df.with_columns([
        (pl.col("close") >= pl.col("high_60d")).alias("signal_n_day_high"),
        (pl.col("close") <= pl.col("low_60d")).alias("signal_n_day_low"),
        (pl.col("vol_ratio_5d") >= 2.0).alias("signal_volume_surge"),
    ])

    # ---- 换手率 + 连续收涨天数 (递推) ----
    df = _compute_stats_today(df, instruments)

    # ---- 清理内部列 ----
    drop_cols = [
        "close_right", "high_right", "low_right",
        "_ma5_partial_sum", "_ma10_partial_sum", "_ma20_partial_sum",
        "_ma30_partial_sum", "_ma60_partial_sum",
        "_boll_partial_sum", "_boll_partial_sq_sum",
        "_high_59d", "_low_59d",
        "_close_5d_ago", "_close_10d_ago", "_close_20d_ago",
        "_close_30d_ago", "_close_60d_ago",
        "_vol_ma5_partial_sum", "_vol_ma10_partial_sum",
        "_kdj_8d_low", "_kdj_8d_high",
        "_window_len",
        "_rsi_avg_gain_6", "_rsi_avg_loss_6",
        "_rsi_avg_gain_14", "_rsi_avg_loss_14",
        "_rsi_avg_gain_24", "_rsi_avg_loss_24",
        "_ema12", "_ema26",
        "_adj_factor",
        "_vol_19d_pct_sum", "_vol_19d_pct_sq_sum",
        "_prev_consec_up_days",
    ]
    df = df.drop([c for c in drop_cols if c in df.columns])

    # 自定义信号（日级实时路径同样注入）
    from app.strategy import custom_signals
    df = custom_signals.inject(df, _get_custom_signal_exprs())

    # 清理 NaN / Inf
    float_cols = [c for c in df.columns if df[c].dtype.is_float()]
    if float_cols:
        df = df.with_columns([
            pl.when(pl.col(c).is_nan() | pl.col(c).is_infinite())
              .then(None)
              .otherwise(pl.col(c))
              .alias(c)
            for c in float_cols
        ])

    return df


def _compute_stats_today(df: pl.DataFrame, instruments: pl.DataFrame | None) -> pl.DataFrame:
    """盘中增量版的换手率 + 连续收涨天数计算。

    换手率(%) = volume(股) / float_shares(股) * 100; 加密无流通股本 → null。
    consecutive_up_days: 用 live_agg 携带的昨日值 ``_prev_consec_up_days`` 递推
    (今日收涨 → +1, 否则归零)。旧 enriched 分区缺该列时兜 0。
    """
    # ---- 换手率: API 有则直接用, 无则从 float_shares 计算 ----
    had_float_shares = "float_shares" in df.columns
    if "turnover_rate" not in df.columns:
        if (
            not had_float_shares
            and instruments is not None
            and not instruments.is_empty()
            and "float_shares" in instruments.columns
        ):
            inst_subset = instruments.select("symbol", "float_shares").unique(subset=["symbol"])
            df = df.join(inst_subset, on="symbol", how="left", suffix="_inst")
        if "float_shares" in df.columns and "volume" in df.columns:
            df = df.with_columns(
                pl.when(pl.col("float_shares") > 0)
                  .then(pl.col("volume") / pl.col("float_shares") * 100.0)
                  .otherwise(None)
                  .alias("turnover_rate")
            )
        else:
            df = df.with_columns(pl.lit(None).cast(pl.Float64).alias("turnover_rate"))

    # ---- 连续收涨天数: 收涨 +1, 否则归零 ----
    if "_prev_consec_up_days" not in df.columns:
        df = df.with_columns(pl.lit(0).cast(pl.UInt32).alias("_prev_consec_up_days"))
    prev_up = pl.col("_prev_consec_up_days").fill_null(0).cast(pl.UInt32)
    df = df.with_columns(
        pl.when(pl.col("change_pct") > 0)
          .then((prev_up + 1).cast(pl.UInt32))
          .otherwise(pl.lit(0).cast(pl.UInt32))
          .alias("consecutive_up_days")
    )

    # 清理 JOIN 引入的 instruments 列
    cleanup = [c for c in df.columns if c.endswith("_inst")]
    if not had_float_shares and "float_shares" in df.columns:
        cleanup.append("float_shares")
    return df.drop([c for c in cleanup if c in df.columns])
