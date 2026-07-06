"""Portfolio 纯函数测试 — 加权平均成本法、时间线校验、净值曲线。"""
from __future__ import annotations

import pytest

from app.services.portfolio import (
    TimelineError,
    build_equity_curve,
    summarize_positions,
    validate_timeline,
)


def _t(symbol, side, price, qty, traded_at, fee=0.0, id=None):
    return {"id": id or f"{symbol}-{side}-{traded_at}", "symbol": symbol,
            "side": side, "price": price, "qty": qty, "fee": fee,
            "traded_at": traded_at, "note": ""}


def test_buy_updates_avg_cost_with_fee():
    trades = [_t("AAPL.US", "buy", 100, 10, "2026-01-05", fee=10),
              _t("AAPL.US", "buy", 200, 10, "2026-01-06")]
    out = summarize_positions(trades, {"AAPL.US": {"close": 200.0, "prev_close": 190.0}})
    pos = out["positions"][0]
    # (100*10+10 + 200*10) / 20 = 150.5
    assert pos["qty"] == 20
    assert pos["avg_cost"] == pytest.approx(150.5)
    assert pos["market_value"] == pytest.approx(4000)
    assert pos["unrealized_pnl"] == pytest.approx((200 - 150.5) * 20)
    assert pos["today_pnl"] == pytest.approx((200 - 190) * 20)


def test_sell_realizes_pnl_keeps_avg_cost():
    trades = [_t("AAPL.US", "buy", 100, 10, "2026-01-05"),
              _t("AAPL.US", "sell", 120, 4, "2026-01-07", fee=2)]
    out = summarize_positions(trades, {"AAPL.US": {"close": 110.0, "prev_close": 110.0}})
    pos = out["positions"][0]
    assert pos["qty"] == 6
    assert pos["avg_cost"] == pytest.approx(100)
    assert pos["realized_pnl"] == pytest.approx((120 - 100) * 4 - 2)
    assert out["totals"]["realized_pnl"] == pytest.approx(78)


def test_closed_position_excluded_but_realized_kept():
    trades = [_t("AAPL.US", "buy", 100, 5, "2026-01-05"),
              _t("AAPL.US", "sell", 110, 5, "2026-01-06")]
    out = summarize_positions(trades, {})
    assert out["positions"] == []
    assert out["totals"]["realized_pnl"] == pytest.approx(50)


def test_missing_price_leaves_mv_none():
    trades = [_t("NEW.US", "buy", 10, 100, "2026-01-05")]
    out = summarize_positions(trades, {})
    pos = out["positions"][0]
    assert pos["market_value"] is None and pos["unrealized_pnl"] is None


def test_oversell_rejected_with_context():
    trades = [_t("AAPL.US", "buy", 100, 5, "2026-01-05"),
              _t("AAPL.US", "sell", 100, 6, "2026-01-06", id="bad")]
    with pytest.raises(TimelineError) as ei:
        validate_timeline(trades)
    assert "bad" in str(ei.value) and "5" in str(ei.value)


def test_timeline_ok_returns_none():
    assert validate_timeline([_t("AAPL.US", "buy", 100, 5, "2026-01-05")]) is None


def test_equity_curve_ffill_and_realized():
    trades = [_t("AAPL.US", "buy", 100, 10, "2026-01-05"),
              _t("AAPL.US", "sell", 120, 10, "2026-01-08")]
    closes = {"AAPL.US": {"2026-01-05": 100.0, "2026-01-06": 110.0, "2026-01-08": 120.0}}
    curve = build_equity_curve(trades, closes, end_date="2026-01-08")
    by_date = {r["date"]: r for r in curve}
    assert by_date["2026-01-05"]["market_value"] == pytest.approx(1000)
    # 01-07 无收盘价 → 前值填充 110
    assert by_date["2026-01-07"]["market_value"] == pytest.approx(1100)
    # 清仓日: 市值 0, pnl = 已实现 200
    assert by_date["2026-01-08"]["market_value"] == pytest.approx(0)
    assert by_date["2026-01-08"]["pnl"] == pytest.approx(200)


def test_equity_curve_empty_trades():
    assert build_equity_curve([], {}, end_date="2026-01-08") == []
