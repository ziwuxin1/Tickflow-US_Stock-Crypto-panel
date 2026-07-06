"""个人 Portfolio 服务 — 交易流水存取 + 纯函数计算。

存储: data/user_data/portfolio_trades.parquet (spec: docs/superpowers/specs/2026-07-06-portfolio-design.md)
口径: 加权平均成本法; 买入手续费摊入成本, 卖出手续费扣减已实现盈亏。
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from pathlib import Path

import polars as pl

from app.config import settings

TRADE_COLS = {"id": pl.Utf8, "symbol": pl.Utf8, "side": pl.Utf8,
              "price": pl.Float64, "qty": pl.Float64, "fee": pl.Float64,
              "traded_at": pl.Utf8, "note": pl.Utf8}
_EPS = 1e-9


class TimelineError(ValueError):
    """流水时间线非法(出现超卖)。"""


def _path() -> Path:
    p = settings.data_dir / "user_data" / "portfolio_trades.parquet"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def load_trades() -> list[dict]:
    p = _path()
    if not p.exists():
        return []
    df = pl.read_parquet(p)
    return [] if df.is_empty() else df.to_dicts()


def save_trades(trades: list[dict]) -> None:
    df = pl.DataFrame(trades, schema=TRADE_COLS) if trades else pl.DataFrame(schema=TRADE_COLS)
    df.write_parquet(_path())


def new_trade(symbol: str, side: str, price: float, qty: float,
              fee: float = 0.0, traded_at: str = "", note: str = "") -> dict:
    return {"id": uuid.uuid4().hex, "symbol": symbol.strip().upper(), "side": side,
            "price": float(price), "qty": float(qty), "fee": float(fee or 0.0),
            "traded_at": traded_at or date.today().isoformat(), "note": note or ""}


def _sorted(trades: list[dict]) -> list[dict]:
    return sorted(trades, key=lambda t: (t["traded_at"], t["id"]))


def validate_timeline(trades: list[dict]) -> None:
    """按时间结转, 任何时刻卖出量 > 持仓量 → TimelineError(含冲突笔 id 与可卖量)。"""
    qty: dict[str, float] = {}
    for t in _sorted(trades):
        s = t["symbol"]
        if t["side"] == "buy":
            qty[s] = qty.get(s, 0.0) + t["qty"]
        else:
            held = qty.get(s, 0.0)
            if t["qty"] > held + _EPS:
                raise TimelineError(
                    f"交易 {t['id']} ({s} {t['traded_at']}) 卖出 {t['qty']} 超过当时持仓 {held:g}")
            qty[s] = held - t["qty"]


def _carry(trades: list[dict]) -> dict[str, dict]:
    """结转每个 symbol 的 qty/avg_cost/realized/fees。"""
    st: dict[str, dict] = {}
    for t in _sorted(trades):
        s = t["symbol"]
        p = st.setdefault(s, {"qty": 0.0, "avg_cost": 0.0, "realized_pnl": 0.0, "fees": 0.0})
        p["fees"] += t["fee"]
        if t["side"] == "buy":
            total_cost = p["qty"] * p["avg_cost"] + t["qty"] * t["price"] + t["fee"]
            p["qty"] += t["qty"]
            p["avg_cost"] = total_cost / p["qty"] if p["qty"] > _EPS else 0.0
        else:
            p["realized_pnl"] += (t["price"] - p["avg_cost"]) * t["qty"] - t["fee"]
            p["qty"] = max(0.0, p["qty"] - t["qty"])
            if p["qty"] <= _EPS:
                p["qty"], p["avg_cost"] = 0.0, 0.0
    return st


def summarize_positions(trades: list[dict], prices: dict[str, dict]) -> dict:
    """当前持仓明细 + 汇总。prices[symbol] = {close, prev_close, name?}, 缺失容忍。"""
    st = _carry(trades)
    positions = []
    totals = {"market_value": 0.0, "cost_basis": 0.0, "unrealized_pnl": 0.0,
              "realized_pnl": 0.0, "today_pnl": 0.0, "fees": 0.0}
    for s, p in sorted(st.items()):
        totals["realized_pnl"] += p["realized_pnl"]
        totals["fees"] += p["fees"]
        if p["qty"] <= _EPS:
            continue
        q = prices.get(s) or {}
        close, prev = q.get("close"), q.get("prev_close")
        mv = close * p["qty"] if close else None
        cost = p["avg_cost"] * p["qty"]
        upnl = (close - p["avg_cost"]) * p["qty"] if close else None
        tpnl = (close - prev) * p["qty"] if close and prev else None
        positions.append({
            "symbol": s, "name": q.get("name"), "qty": p["qty"],
            "avg_cost": p["avg_cost"], "close": close, "market_value": mv,
            "cost_basis": cost, "unrealized_pnl": upnl,
            "unrealized_pct": (close / p["avg_cost"] - 1) * 100 if close and p["avg_cost"] > _EPS else None,
            "today_pnl": tpnl, "realized_pnl": p["realized_pnl"], "fees": p["fees"],
        })
        totals["cost_basis"] += cost
        if mv is not None:
            totals["market_value"] += mv
            totals["unrealized_pnl"] += upnl
        if tpnl is not None:
            totals["today_pnl"] += tpnl
    return {"positions": positions, "totals": totals}


def build_equity_curve(trades: list[dict], closes: dict[str, dict[str, float]],
                       end_date: str | None = None) -> list[dict]:
    """自最早交易日至 end_date 的逐日曲线。closes[symbol][date_iso]=close, 缺失日前值填充。

    返回 [{date, market_value, cost_basis, pnl}], pnl = 市值 − 持仓成本 + 累计已实现。
    """
    if not trades:
        return []
    ordered = _sorted(trades)
    start = date.fromisoformat(ordered[0]["traded_at"])
    end = date.fromisoformat(end_date) if end_date else date.today()
    ti = 0
    qty: dict[str, float] = {}
    avg: dict[str, float] = {}
    realized = 0.0
    last_close: dict[str, float] = {}
    out: list[dict] = []
    d = start
    while d <= end:
        ds = d.isoformat()
        while ti < len(ordered) and ordered[ti]["traded_at"] <= ds:
            t = ordered[ti]
            s = t["symbol"]
            if t["side"] == "buy":
                total = qty.get(s, 0.0) * avg.get(s, 0.0) + t["qty"] * t["price"] + t["fee"]
                qty[s] = qty.get(s, 0.0) + t["qty"]
                avg[s] = total / qty[s] if qty[s] > _EPS else 0.0
            else:
                realized += (t["price"] - avg.get(s, 0.0)) * t["qty"] - t["fee"]
                qty[s] = max(0.0, qty.get(s, 0.0) - t["qty"])
                if qty[s] <= _EPS:
                    qty[s], avg[s] = 0.0, 0.0
            ti += 1
        mv = cost = 0.0
        for s, q in qty.items():
            if q <= _EPS:
                continue
            c = closes.get(s, {}).get(ds)
            if c is not None:
                last_close[s] = c
            c = last_close.get(s)
            if c is not None:
                mv += q * c
            cost += q * avg.get(s, 0.0)
        out.append({"date": ds, "market_value": mv, "cost_basis": cost,
                    "pnl": mv - cost + realized})
        d += timedelta(days=1)
    return out
