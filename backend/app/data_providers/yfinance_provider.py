"""Yahoo Finance 免费美股数据源 (yfinance, 无需 API key)。

定位: TickFlow 免 key 只给历史日 K; yfinance 补充「近实时报价 + 更即时的日 K」,
适合按需看图 / 自选列表 / 少量标的。**不适合全市场盘后扫描** —— Yahoo 对大批量
请求会限流甚至临时封 IP, 全市场日 K 仍建议用 TickFlow (settings.us_data_source)。

符号约定: 项目内部美股为 `AAPL.US`; Yahoo 用 `AAPL` (代码内的点按 Yahoo 惯例转连字符,
如 `BRK.B.US` -> `BRK-B`)。对外一律返回项目内部的 `.US` 形式。
"""
from __future__ import annotations

import logging
import math
import time
from datetime import date, datetime, timedelta
from typing import Any

import polars as pl

logger = logging.getLogger(__name__)

# Yahoo 限流防护: 相邻请求最小间隔 (秒)。批量拉取时逐只之间 sleep。
_MIN_INTERVAL = 0.25
_last_call_ts = 0.0


def _throttle() -> None:
    global _last_call_ts
    wait = _MIN_INTERVAL - (time.time() - _last_call_ts)
    if wait > 0:
        time.sleep(wait)
    _last_call_ts = time.time()


def to_yahoo(symbol: str) -> str:
    """`AAPL.US` -> `AAPL`; `BRK.B.US` -> `BRK-B` (Yahoo 用连字符表示子类股)。"""
    s = symbol.strip().upper()
    if s.endswith(".US"):
        s = s[:-3]
    return s.replace(".", "-")


def from_yahoo(yahoo_symbol: str) -> str:
    """`AAPL` -> `AAPL.US`; `BRK-B` -> `BRK.B.US` (还原项目内部符号)。"""
    return yahoo_symbol.strip().upper().replace("-", ".") + ".US"


def _history_to_polars(hist, symbol: str) -> pl.DataFrame:
    """把 yfinance 的 pandas history DataFrame 规范成 canonical 日 K 列。"""
    if hist is None or len(hist) == 0:
        return pl.DataFrame()
    df = pl.from_pandas(hist.reset_index())
    # yfinance 列名: Date/Datetime, Open, High, Low, Close, Volume, Dividends, Stock Splits
    rename = {}
    for src, dst in (("Date", "date"), ("Datetime", "date"), ("Open", "open"),
                     ("High", "high"), ("Low", "low"), ("Close", "close"),
                     ("Volume", "volume")):
        if src in df.columns:
            rename[src] = dst
    df = df.rename(rename)
    if "date" in df.columns and df.schema["date"] != pl.Date:
        df = df.with_columns(pl.col("date").cast(pl.Date, strict=False))
    for col in ("open", "high", "low", "close", "volume"):
        if col in df.columns:
            df = df.with_columns(pl.col(col).cast(pl.Float64, strict=False))
    df = df.with_columns(pl.lit(symbol).alias("symbol"))
    # amount(成交额) Yahoo 不提供, 用 close*volume 兜底 (与美股 TickFlow 口径一致)
    if {"close", "volume"}.issubset(df.columns):
        df = df.with_columns((pl.col("close") * pl.col("volume")).alias("amount"))
    keep = [c for c in ("symbol", "date", "open", "high", "low", "close", "volume", "amount")
            if c in df.columns]
    return df.select(keep).drop_nulls(subset=["open", "close"])


def fetch_us_daily(
    symbols: list[str],
    start: datetime | date | None = None,
    end: datetime | date | None = None,
    count: int | None = None,
) -> pl.DataFrame:
    """拉取美股日 K (未复权 raw OHLCV)。

    优先用 start/end 区间(end 含当天); 仅给 count 时按「K 线根数」回溯(非日历天)。
    返回 canonical 列: symbol/date/open/high/low/close/volume/amount。
    """
    import yfinance as yf

    if not symbols:
        return pl.DataFrame()

    period = None
    # 仅给 count(无 start/end)时: 按 K 线根数回溯, 不是日历天。日历天数需放大
    # (含周末/节假日), 经验系数 1.5 + 缓冲 10 天; 拉回后每 symbol .tail(count) 截到根数。
    if start is None and end is None:
        n = count or 250
        days = math.ceil(n * 1.5) + 10
        period = f"{max(days, 30)}d"

    # end 为「包含」语义: yfinance 的 end 排他, date/datetime 均 +1 天保证含当天那根
    # (start==end==today 时也能正常返回当天)。
    yf_end = end
    if isinstance(end, (date, datetime)):
        yf_end = end + timedelta(days=1)

    frames: list[pl.DataFrame] = []
    for sym in symbols:
        y = to_yahoo(sym)
        _throttle()
        try:
            t = yf.Ticker(y)
            if period:
                hist = t.history(period=period, interval="1d", auto_adjust=False,
                                 actions=False, raise_errors=False)
            else:
                hist = t.history(start=start, end=yf_end, interval="1d", auto_adjust=False,
                                 actions=False, raise_errors=False)
        except Exception as e:  # noqa: BLE001
            logger.warning("yfinance 拉取 %s 失败: %s", sym, e)
            continue
        sub = _history_to_polars(hist, sym)
        # 仅按 count 拉取时截到根数(period 放大后可能多拉几根)
        if period and count and not sub.is_empty():
            sub = sub.tail(count)
        if not sub.is_empty():
            frames.append(sub)

    if not frames:
        return pl.DataFrame()
    return pl.concat(frames, how="diagonal_relaxed").sort(["symbol", "date"])


def fetch_us_quotes(symbols: list[str]) -> list[dict]:
    """近实时报价 (fast_info, 分钟级延迟)。映射到 quote_service 期望字段。"""
    import yfinance as yf

    out: list[dict] = []
    for sym in symbols:
        y = to_yahoo(sym)
        _throttle()
        try:
            fi = yf.Ticker(y).fast_info

            def g(*names, _fi=fi):
                for n in names:
                    v = _fi.get(n) if hasattr(_fi, "get") else getattr(_fi, n, None)
                    if v is not None:
                        return float(v)
                return None

            last = g("lastPrice", "last_price")
            prev = g("previousClose", "previous_close")
            if last is None:
                continue
            change_pct = ((last - prev) / prev) if (prev and prev > 0) else None
            out.append({
                "symbol": sym,
                "last_price": last,
                "prev_close": prev,
                "open": g("open"),
                "high": g("dayHigh", "day_high"),
                "low": g("dayLow", "day_low"),
                "volume": g("lastVolume", "last_volume"),
                "change_pct": change_pct,
            })
        except Exception as e:  # noqa: BLE001
            logger.debug("yfinance 报价 %s 失败: %s", sym, e)
            continue
    return out


# ===== 分钟 K(分时) =====

# 分钟 K canonical 列(与 kline_sync.CANONICAL_MINUTE_COLS 一致)
_MINUTE_COLS = ["symbol", "datetime", "open", "high", "low", "close", "volume", "amount"]


def fetch_us_minute(symbol: str, trade_date: date) -> pl.DataFrame:
    """拉取单只美股某天的 1 分钟 K(免 key,Yahoo 免费源)。

    返回 canonical 列: symbol/datetime/open/high/low/close/volume/amount。
    - 用 yfinance history(interval="1m"),区间锁定 trade_date 当天(end 排他,+1 天含当天)。
    - 符号用 to_yahoo 转换(AAPL.US → AAPL,BRK.B.US → BRK-B)。
    - amount(成交额)Yahoo 不提供 → close*volume 兜底。
    - 只保留 trade_date 当天的数据点(Yahoo 可能带前后日的零星 bar)。
    """
    import yfinance as yf

    y = to_yahoo(symbol)
    yf_end = trade_date + timedelta(days=1)  # end 排他,+1 天含当天
    _throttle()
    try:
        hist = yf.Ticker(y).history(
            start=trade_date, end=yf_end, interval="1m",
            auto_adjust=False, actions=False, raise_errors=False,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("yfinance 分钟 K 拉取 %s (%s) 失败: %s", symbol, trade_date, e)
        return pl.DataFrame()

    if hist is None or len(hist) == 0:
        return pl.DataFrame()

    df = pl.from_pandas(hist.reset_index())
    rename = {}
    for src, dst in (("Datetime", "datetime"), ("Date", "datetime"), ("index", "datetime"),
                     ("Open", "open"), ("High", "high"), ("Low", "low"),
                     ("Close", "close"), ("Volume", "volume")):
        if src in df.columns and dst not in df.columns:
            rename[src] = dst
    df = df.rename(rename)
    if "datetime" not in df.columns:
        return pl.DataFrame()

    # 统一转 Datetime('us')(Yahoo 分钟索引带时区,去时区落成 naive 美东本地时刻交给前端处理)
    df = df.with_columns(
        pl.col("datetime").cast(pl.Datetime("us"), strict=False).dt.replace_time_zone(None)
    )
    for col in ("open", "high", "low", "close", "volume"):
        if col in df.columns:
            df = df.with_columns(pl.col(col).cast(pl.Float64, strict=False))
    df = df.with_columns(pl.lit(symbol).alias("symbol"))
    # amount 兜底: close*volume
    if {"close", "volume"}.issubset(df.columns):
        df = df.with_columns((pl.col("close") * pl.col("volume")).alias("amount"))

    # 只保留 trade_date 当天(Yahoo 偶尔返回相邻日的 bar)
    df = df.filter(pl.col("datetime").dt.date() == trade_date)
    keep = [c for c in _MINUTE_COLS if c in df.columns]
    return df.select(keep).drop_nulls(subset=["open", "close"]).sort("datetime")


# ===== 财务(income / balance_sheet / cash_flow / metrics) =====

# yfinance 财务矩阵(行=科目、列=报告期)的科目名 → 归一化 snake_case 字段名映射。
# yfinance 行名随版本略有差异,取常见别名做兜底;缺失字段给 None,不崩。
_INCOME_MAP: dict[str, tuple[str, ...]] = {
    "total_revenue": ("Total Revenue", "TotalRevenue", "Operating Revenue"),
    "gross_profit": ("Gross Profit", "GrossProfit"),
    "operating_income": ("Operating Income", "OperatingIncome", "Operating Income Loss"),
    "net_income": ("Net Income", "NetIncome", "Net Income Common Stockholders"),
    "eps": ("Basic EPS", "BasicEPS", "Diluted EPS", "DilutedEPS"),
}
_BALANCE_MAP: dict[str, tuple[str, ...]] = {
    "total_assets": ("Total Assets", "TotalAssets"),
    "total_liabilities": (
        "Total Liabilities Net Minority Interest", "Total Liabilities",
        "TotalLiabilitiesNetMinorityInterest",
    ),
    "stockholders_equity": (
        "Stockholders Equity", "StockholdersEquity", "Total Equity Gross Minority Interest",
    ),
    "total_debt": ("Total Debt", "TotalDebt"),
}
_CASHFLOW_MAP: dict[str, tuple[str, ...]] = {
    "operating_cash_flow": (
        "Operating Cash Flow", "OperatingCashFlow",
        "Cash Flow From Continuing Operating Activities",
    ),
    "investing_cash_flow": (
        "Investing Cash Flow", "InvestingCashFlow",
        "Cash Flow From Continuing Investing Activities",
    ),
    "financing_cash_flow": (
        "Financing Cash Flow", "FinancingCashFlow",
        "Cash Flow From Continuing Financing Activities",
    ),
    "free_cash_flow": ("Free Cash Flow", "FreeCashFlow"),
}


def _pd_matrix_to_records(matrix, field_map: dict[str, tuple[str, ...]], symbol: str) -> list[dict]:
    """把 yfinance 转置矩阵(行=科目、列=报告期)转成「每期一条记录、科目为列」。

    - matrix: pandas DataFrame(index=科目名,columns=报告期 Timestamp),可能为空。
    - field_map: 归一化字段名 → yfinance 行名候选(取首个命中)。
    - 每条记录含 symbol、period_end(期末日期 YYYY-MM-DD)及全部归一化字段(缺失给 None)。
    - 按期末日期倒序(最新在前)。
    """
    if matrix is None or getattr(matrix, "empty", True):
        return []
    # 行名 → 值序列的快速查找(大小写/空格差异容忍)
    index_lookup: dict[str, Any] = {}
    for row_name in matrix.index:
        index_lookup[str(row_name).strip().lower()] = row_name

    def _row_value(candidates: tuple[str, ...], col) -> float | None:
        for cand in candidates:
            key = cand.strip().lower()
            if key in index_lookup:
                try:
                    v = matrix.loc[index_lookup[key], col]
                except Exception:  # noqa: BLE001
                    continue
                if v is None:
                    continue
                try:
                    fv = float(v)
                except (TypeError, ValueError):
                    continue
                if fv == fv:  # 过滤 NaN
                    return fv
        return None

    records: list[dict] = []
    for col in matrix.columns:
        period_end = None
        try:
            period_end = col.date().isoformat() if hasattr(col, "date") else str(col)[:10]
        except Exception:  # noqa: BLE001
            period_end = str(col)[:10]
        rec: dict = {"symbol": symbol, "period_end": period_end}
        for field, candidates in field_map.items():
            rec[field] = _row_value(candidates, col)
        records.append(rec)
    # 按期末倒序(最新在前)
    records.sort(key=lambda r: r.get("period_end") or "", reverse=True)
    return records


def _derive_metrics(income: list[dict], balance: list[dict], info: dict, symbol: str) -> list[dict]:
    """从 income+balance 派生指标,不足处用 ticker.info 兜底。返回单条 metrics 记录列表。"""
    latest_income = income[0] if income else {}
    latest_balance = balance[0] if balance else {}
    period_end = latest_income.get("period_end") or latest_balance.get("period_end")

    revenue = latest_income.get("total_revenue")
    gross = latest_income.get("gross_profit")
    net = latest_income.get("net_income")
    assets = latest_balance.get("total_assets")
    liabilities = latest_balance.get("total_liabilities")
    equity = latest_balance.get("stockholders_equity")

    def _safe_div(a, b):
        if a is None or b in (None, 0):
            return None
        return a / b

    gross_margin = _safe_div(gross, revenue)
    net_margin = _safe_div(net, revenue)
    roe = _safe_div(net, equity)
    debt_to_asset = _safe_div(liabilities, assets)

    def _info(*names):
        for n in names:
            v = info.get(n)
            if v is not None:
                try:
                    return float(v)
                except (TypeError, ValueError):
                    continue
        return None

    rec = {
        "symbol": symbol,
        "period_end": period_end,
        "pe": _info("trailingPE", "forwardPE"),
        "pb": _info("priceToBook"),
        "market_cap": _info("marketCap"),
        "roe": roe if roe is not None else _info("returnOnEquity"),
        "gross_margin": gross_margin if gross_margin is not None else _info("grossMargins"),
        "net_margin": net_margin if net_margin is not None else _info("profitMargins"),
        "debt_to_asset": debt_to_asset,
    }
    return [rec]


def fetch_us_financials(symbol: str) -> dict[str, list[dict]]:
    """拉取单只美股的财务四表(免 key,Yahoo 免费源)。

    返回 {"income": [...], "balance_sheet": [...], "cash_flow": [...], "metrics": [...]},
    每张表是按报告期的记录列表(每条含 symbol、period_end 及该表科目字段,缺失给 None)。
    把 yfinance 的 income_stmt/balance_sheet/cashflow(行=科目、列=期)转置成每期一条记录。
    任何字段/子表缺失都不崩(返回空列表或 None 字段)。
    """
    import yfinance as yf

    empty = {"income": [], "balance_sheet": [], "cash_flow": [], "metrics": []}
    y = to_yahoo(symbol)
    _throttle()
    try:
        ticker = yf.Ticker(y)
        income_mat = ticker.income_stmt
        balance_mat = ticker.balance_sheet
        cashflow_mat = ticker.cashflow
    except Exception as e:  # noqa: BLE001
        logger.warning("yfinance 财务拉取 %s 失败: %s", symbol, e)
        return empty

    income = _pd_matrix_to_records(income_mat, _INCOME_MAP, symbol)
    balance = _pd_matrix_to_records(balance_mat, _BALANCE_MAP, symbol)
    cash_flow = _pd_matrix_to_records(cashflow_mat, _CASHFLOW_MAP, symbol)

    info: dict = {}
    try:
        info = ticker.info or {}
    except Exception:  # noqa: BLE001 — info 拉取失败不影响三表,派生指标退化用报表值
        info = {}
    metrics = _derive_metrics(income, balance, info, symbol)

    return {
        "income": income,
        "balance_sheet": balance,
        "cash_flow": cash_flow,
        "metrics": metrics,
    }


class YFinanceProvider:
    """MarketDataProvider 兼容实现 (美股)。data_providers.registry 注册用。"""

    name = "yfinance"

    def get_daily(self, symbols, start_time, end_time, asset_type="stock"):
        return fetch_us_daily(symbols, start_time, end_time)

    def get_realtime(self, universes=None, symbols=None):
        return pl.DataFrame(fetch_us_quotes(symbols or []))
