"""实时行情日K落盘守卫测试。

场景背景(2026-07 事故): 用户在美东周一凌晨(周末/假日后)手动刷新行情,
拿到的是上一交易日(07-02)的旧快照, 却按 wall-clock 美东日期(07-06)落盘,
污染 kline_daily 的 max(date) → 盘后管道增量起点被推到 07-06,
真实缺口 07-02 永远不被回补, 图表停在 07-01。
"""
from __future__ import annotations

from datetime import date, datetime

from app import markets
from app.services.quote_service import QuoteService

US_EASTERN = markets.US_EASTERN


def _ts_ms(y: int, m: int, d: int, hh: int = 16, mm: int = 0) -> float:
    """美东时间 → 毫秒时间戳。"""
    return datetime(y, m, d, hh, mm, tzinfo=US_EASTERN).timestamp() * 1000


# ---- markets.us_date_from_timestamp ----

def test_us_date_from_timestamp_ms():
    assert markets.us_date_from_timestamp(_ts_ms(2026, 7, 2)) == date(2026, 7, 2)


def test_us_date_from_timestamp_seconds():
    assert markets.us_date_from_timestamp(_ts_ms(2026, 7, 2) / 1000) == date(2026, 7, 2)


def test_us_date_from_timestamp_invalid():
    assert markets.us_date_from_timestamp(None) is None
    assert markets.us_date_from_timestamp(0) is None
    assert markets.us_date_from_timestamp("not-a-ts") is None


# ---- QuoteService.resolve_us_flush_date ----

def test_stale_weekend_snapshot_skipped():
    """事故回归: 周一凌晨拿到上周四(07-02)旧快照, 不得按 07-06 落盘。"""
    records = [{"symbol": "MSFT.US", "timestamp": _ts_ms(2026, 7, 2)}]
    assert QuoteService.resolve_us_flush_date(
        records, today=date(2026, 7, 6), in_session=False,
    ) is None


def test_fresh_intraday_snapshot_flushed():
    records = [{"symbol": "MSFT.US", "timestamp": _ts_ms(2026, 7, 6, 10, 30)}]
    assert QuoteService.resolve_us_flush_date(
        records, today=date(2026, 7, 6), in_session=True,
    ) == date(2026, 7, 6)


def test_after_close_same_day_flushed():
    """收盘后当天刷新: 时间戳仍属今天 → 允许落盘最终蜡烛。"""
    records = [{"symbol": "MSFT.US", "timestamp": _ts_ms(2026, 7, 6, 16, 0)}]
    assert QuoteService.resolve_us_flush_date(
        records, today=date(2026, 7, 6), in_session=False,
    ) == date(2026, 7, 6)


def test_no_timestamp_falls_back_to_session_gate():
    """无 timestamp 退化: 交易时段内信任 wall-clock, 时段外跳过。"""
    records = [{"symbol": "MSFT.US"}]
    assert QuoteService.resolve_us_flush_date(
        records, today=date(2026, 7, 6), in_session=True,
    ) == date(2026, 7, 6)
    assert QuoteService.resolve_us_flush_date(
        records, today=date(2026, 7, 6), in_session=False,
    ) is None


def test_empty_records():
    assert QuoteService.resolve_us_flush_date([], today=date(2026, 7, 6)) is None


def test_mixed_bad_timestamps_use_best_valid():
    records = [
        {"symbol": "A.US", "timestamp": "garbage"},
        {"symbol": "B.US", "timestamp": None},
        {"symbol": "C.US", "timestamp": _ts_ms(2026, 7, 6, 11, 0)},
    ]
    assert QuoteService.resolve_us_flush_date(
        records, today=date(2026, 7, 6), in_session=True,
    ) == date(2026, 7, 6)
