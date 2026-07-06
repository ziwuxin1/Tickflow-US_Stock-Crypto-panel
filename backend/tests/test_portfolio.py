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
    # 无行情持仓不计入汇总(总市值/总成本/浮动均排除), 保持三者口径一致
    assert out["totals"]["market_value"] == 0
    assert out["totals"]["cost_basis"] == 0
    assert out["totals"]["unrealized_pnl"] == 0


def test_totals_only_count_priced_positions():
    """混合有行情/无行情: 汇总仅统计有行情仓, 无行情仓仅在明细体现。"""
    trades = [_t("AAPL.US", "buy", 100, 10, "2026-01-05"),
              _t("FUND.US", "buy", 50, 20, "2026-01-05")]
    out = summarize_positions(trades, {"AAPL.US": {"close": 120.0, "prev_close": 120.0}})
    assert out["totals"]["market_value"] == pytest.approx(1200)
    assert out["totals"]["cost_basis"] == pytest.approx(1000)  # 不含 FUND 的 1000
    assert out["totals"]["unrealized_pnl"] == pytest.approx(200)
    assert len(out["positions"]) == 2  # FUND 仍在明细中


def test_equity_curve_excludes_unpriced_holding():
    """无行情持仓不进曲线成本, pnl 不出现假性断崖。"""
    trades = [_t("AAPL.US", "buy", 100, 10, "2026-01-05"),
              _t("FUND.US", "buy", 50, 100, "2026-01-06")]
    closes = {"AAPL.US": {"2026-01-05": 100.0, "2026-01-06": 100.0}}  # FUND 无任何收盘价
    curve = build_equity_curve(trades, closes, end_date="2026-01-06")
    last = curve[-1]
    # FUND(成本 5000)不计入 → 市值/成本仅 AAPL, pnl 稳定在 0 附近, 无 -5000 断崖
    assert last["market_value"] == pytest.approx(1000)
    assert last["cost_basis"] == pytest.approx(1000)
    assert last["pnl"] == pytest.approx(0)


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
