"""市场元信息与交易日历工具(美股 + 加密货币)。

跨子系统共享的常量与判别函数:
  - asset_class(symbol): 按 symbol 形态判别资产类别("crypto" 无后缀 / "stock" 带 .US 等后缀)
  - trading_date(asset): 各市场的「当前交易日」— 美股按美东日期, 加密按 UTC 日期
  - is_us_trading_hours(): 美东周一~五 09:30-16:00(DST 由 zoneinfo 处理, 不做节假日表)
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from datetime import time as dt_time
from zoneinfo import ZoneInfo

US_EASTERN = ZoneInfo("America/New_York")
# UTC 直接复用 datetime.UTC(模块属性 markets.UTC 供各处 import)

# 回测基准
BENCHMARK_STOCK = "SPY.US"        # 回测基准(美股)
BENCHMARK_CRYPTO = "BTCUSDT"      # 回测基准(加密)

# 大盘基准(ETF 代理 — TickFlow 无美股指数 universe)
CORE_INDEX_SYMBOLS = ("SPY.US", "QQQ.US", "DIA.US", "IWM.US")
CORE_CRYPTO_SYMBOLS = ("BTCUSDT", "ETHUSDT")
CORE_INDEX_NAMES = {
    "SPY.US": "标普500ETF",
    "QQQ.US": "纳指100ETF",
    "DIA.US": "道琼斯ETF",
    "IWM.US": "罗素2000ETF",
    "BTCUSDT": "比特币",
    "ETHUSDT": "以太坊",
}

# 年化周期数(回测/波动率年化用)
PERIODS_PER_YEAR_STOCK = 252
PERIODS_PER_YEAR_CRYPTO = 365


def asset_class(symbol: str) -> str:
    """按 symbol 形态判别资产类别: 无 "." 后缀 → crypto(如 BTCUSDT), 否则 stock(如 AAPL.US)。"""
    return "crypto" if "." not in (symbol or "") else "stock"


def is_crypto(symbol: str) -> bool:
    """symbol 是否为加密货币交易对。"""
    return asset_class(symbol) == "crypto"


def us_trading_date() -> date:
    """当前美东日期(美股的「今天」— 服务器本地时区无关)。"""
    return datetime.now(US_EASTERN).date()


def crypto_trading_date() -> date:
    """UTC 今天(加密货币按 UTC 日结算)。"""
    return datetime.now(UTC).date()


def trading_date(asset: str = "stock") -> date:
    """按资产类别返回「当前交易日」。"""
    return crypto_trading_date() if asset == "crypto" else us_trading_date()


def is_us_trading_hours(now: datetime | None = None) -> bool:
    """是否处于美股常规交易时段: 美东周一~五 09:30-16:00。

    DST 由 zoneinfo 自动处理; 不做节假日表(休市日无数据返回, 轮询空转无害)。
    now 传 aware datetime 时转换到美东; naive 视为美东时间; 缺省取当前时间。
    """
    if now is None:
        now = datetime.now(US_EASTERN)
    elif now.tzinfo is not None:
        now = now.astimezone(US_EASTERN)
    if now.weekday() >= 5:
        return False
    t = now.time()
    return dt_time(9, 30) <= t <= dt_time(16, 0)


def is_trading_hours(asset: str = "stock") -> bool:
    """按资产类别判断是否交易时段(加密 7x24 恒为 True)。"""
    if asset == "crypto":
        return True
    return is_us_trading_hours()
