# 个人 Portfolio 板块实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交易流水驱动的个人持仓组合：流水 CRUD → 自动汇总持仓/盈亏 → 净值曲线，独立页 + Dashboard 卡片。

**Architecture:** 单 parquet 流水表（`data/user_data/portfolio_trades.parquet`）为唯一事实来源；`services/portfolio.py` 提供纯函数计算（可单测）+ parquet IO；`api/portfolio.py` 组装行情（QuoteService 实时 → enriched 收盘兜底）；前端独立页 `/portfolio` + Dashboard GlassCard。

**Tech Stack:** FastAPI + polars + pytest（后端 venv: `backend/.venv/Scripts/python.exe`）；React + react-query + ECharts + Tailwind（赛博朋克 tokens）。

**Spec:** `docs/superpowers/specs/2026-07-06-portfolio-design.md`

---

## 文件结构

- Create: `backend/app/services/portfolio.py` — parquet IO + 纯函数（持仓汇总/时间线校验/净值曲线）
- Create: `backend/app/api/portfolio.py` — REST 端点 + 行情组装
- Create: `backend/tests/test_portfolio.py` — 纯函数单测
- Modify: `backend/app/main.py` — 注册 router（约 :243 后）
- Modify: `frontend/src/lib/api.ts` — 类型 + API 封装（文件末尾追加）
- Create: `frontend/src/pages/Portfolio.tsx` — 独立页
- Create: `frontend/src/components/dashboard/PortfolioCard.tsx` — Dashboard 卡片
- Modify: `frontend/src/router.tsx` — 路由（children 数组）
- Modify: `frontend/src/components/Layout.tsx` — nav 数组（:64-72）
- Modify: `frontend/src/pages/Dashboard.tsx` — 挂卡片

---

### Task 1: 后端纯函数 — 持仓汇总 / 时间线校验 / 净值曲线（TDD）

**Files:**
- Create: `backend/tests/test_portfolio.py`
- Create: `backend/app/services/portfolio.py`

- [ ] **Step 1: 写失败测试**

`backend/tests/test_portfolio.py`：

```python
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_portfolio.py -q`
Expected: FAIL（ModuleNotFoundError / ImportError）

- [ ] **Step 3: 实现 `backend/app/services/portfolio.py`**

```python
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
```

- [ ] **Step 4: 跑测试全绿**

Run: `cd backend && .venv/Scripts/python.exe -m pytest tests/test_portfolio.py -q`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/portfolio.py backend/tests/test_portfolio.py
git commit -m "feat: portfolio 服务层 — 流水存取与盈亏/净值纯函数"
```

---

### Task 2: 后端 API

**Files:**
- Create: `backend/app/api/portfolio.py`
- Modify: `backend/app/main.py`（import 区 + `app.include_router(alerts.router)`（:243）之后）

- [ ] **Step 1: 实现 `backend/app/api/portfolio.py`**

```python
"""个人 Portfolio API — 流水 CRUD / 持仓汇总 / 净值曲线。"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import portfolio as pf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class TradeIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=20)
    side: str = Field(pattern="^(buy|sell)$")
    price: float = Field(gt=0)
    qty: float = Field(gt=0)
    fee: float = Field(default=0.0, ge=0)
    traded_at: str = ""
    note: str = ""


def _validated_save(trades: list[dict]) -> None:
    try:
        pf.validate_timeline(trades)
    except pf.TimelineError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    pf.save_trades(trades)


@router.get("/trades")
def list_trades():
    rows = pf.load_trades()
    rows.sort(key=lambda t: (t["traded_at"], t["id"]), reverse=True)
    return {"trades": rows}


@router.post("/trades")
def add_trade(body: TradeIn):
    if body.traded_at:
        try:
            date.fromisoformat(body.traded_at)
        except ValueError as e:
            raise HTTPException(status_code=400, detail="traded_at 需为 YYYY-MM-DD") from e
    trades = pf.load_trades()
    trades.append(pf.new_trade(body.symbol, body.side, body.price, body.qty,
                               body.fee, body.traded_at, body.note))
    _validated_save(trades)
    return {"status": "ok"}


@router.put("/trades/{trade_id}")
def update_trade(trade_id: str, body: TradeIn):
    trades = pf.load_trades()
    hit = next((t for t in trades if t["id"] == trade_id), None)
    if hit is None:
        raise HTTPException(status_code=404, detail="trade not found")
    updated = {**hit, "symbol": body.symbol.strip().upper(), "side": body.side,
               "price": body.price, "qty": body.qty, "fee": body.fee,
               "traded_at": body.traded_at or hit["traded_at"], "note": body.note}
    _validated_save([updated if t["id"] == trade_id else t for t in trades])
    return {"status": "ok"}


@router.delete("/trades/{trade_id}")
def delete_trade(trade_id: str):
    trades = pf.load_trades()
    if not any(t["id"] == trade_id for t in trades):
        raise HTTPException(status_code=404, detail="trade not found")
    _validated_save([t for t in trades if t["id"] != trade_id])
    return {"status": "ok"}


def _held_symbols(trades: list[dict]) -> list[str]:
    return sorted({t["symbol"] for t in trades})


def _fetch_prices(request: Request, symbols: list[str]) -> dict[str, dict]:
    """现价: 本地日K最近两根收盘(最新作现价, 次新作昨收); QuoteService 实时覆盖现价。"""
    import polars as pl
    out: dict[str, dict] = {}
    if not symbols:
        return out
    repo = request.app.state.repo
    end = date.today()
    df = repo.get_daily_batch(symbols, end - timedelta(days=15), end,
                              columns=["symbol", "date", "close"])
    if not df.is_empty():
        for r in (df.sort("date").group_by("symbol")
                    .agg(pl.col("close").alias("closes")).to_dicts()):
            closes = r["closes"]
            out[r["symbol"]] = {"close": closes[-1],
                                "prev_close": closes[-2] if len(closes) > 1 else None}
    qs = getattr(request.app.state, "quote_service", None)
    if qs:
        live, _d = qs.get_enriched_today()
        if not live.is_empty():
            for r in live.filter(pl.col("symbol").is_in(symbols)).to_dicts():
                if not r.get("close"):
                    continue
                cur = out.setdefault(r["symbol"], {"close": None, "prev_close": None})
                # 实时价与本地最新收盘不同日: 本地最新收盘变为昨收
                if cur.get("close") is not None and r["close"] != cur["close"]:
                    cur["prev_close"] = cur["close"]
                cur["close"] = r["close"]
    try:
        inst = repo.get_instruments()
        if not inst.is_empty():
            for r in inst.filter(pl.col("symbol").is_in(symbols)).select(["symbol", "name"]).to_dicts():
                out.setdefault(r["symbol"], {}).update(name=r["name"])
    except Exception:  # noqa: BLE001
        pass
    return out


@router.get("/summary")
def summary(request: Request):
    trades = pf.load_trades()
    prices = _fetch_prices(request, _held_symbols(trades))
    return pf.summarize_positions(trades, prices)


@router.get("/equity_curve")
def equity_curve(request: Request):
    trades = pf.load_trades()
    if not trades:
        return {"curve": []}
    repo = request.app.state.repo
    symbols = _held_symbols(trades)
    start = date.fromisoformat(min(t["traded_at"] for t in trades)) - timedelta(days=7)
    df = repo.get_daily_batch(symbols, start, date.today(),
                              columns=["symbol", "date", "close"])
    closes: dict[str, dict[str, float]] = {}
    if not df.is_empty():
        for r in df.to_dicts():
            closes.setdefault(r["symbol"], {})[str(r["date"])] = r["close"]
    return {"curve": pf.build_equity_curve(trades, closes)}
```

- [ ] **Step 2: 注册路由**

`backend/app/main.py`：在 api import 区（与 `alerts` 等并列、沿用现有 import 风格）加 `portfolio as portfolio_api`；`app.include_router(alerts.router)`（:243）之后加：

```python
app.include_router(portfolio_api.router)
```

- [ ] **Step 3: 冒烟验证（后端重启后）**

```bash
curl -s -X POST localhost:3018/api/portfolio/trades -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL.US","side":"buy","price":100,"qty":10,"traded_at":"2026-07-01"}'
curl -s localhost:3018/api/portfolio/summary
curl -s localhost:3018/api/portfolio/equity_curve
# 超卖应 400:
curl -s -X POST localhost:3018/api/portfolio/trades -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL.US","side":"sell","price":100,"qty":99,"traded_at":"2026-07-02"}'
```
Expected: 前三个返回 ok / positions / curve；最后一个 `{"detail":"交易 ... 超过当时持仓 10"}`。
验证后清理测试数据：`curl -s localhost:3018/api/portfolio/trades` 取 id → `curl -s -X DELETE localhost:3018/api/portfolio/trades/<id>`。

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/portfolio.py backend/app/main.py
git commit -m "feat: portfolio REST API — 流水CRUD/汇总/净值曲线"
```

---

### Task 3: 前端 API 封装

**Files:**
- Modify: `frontend/src/lib/api.ts`（文件末尾追加）

- [ ] **Step 1: 追加类型与函数**

```typescript
// ===== Portfolio =====
export interface PortfolioTrade {
  id: string; symbol: string; side: 'buy' | 'sell'
  price: number; qty: number; fee: number; traded_at: string; note: string
}
export interface PortfolioPosition {
  symbol: string; name: string | null; qty: number; avg_cost: number
  close: number | null; market_value: number | null; cost_basis: number
  unrealized_pnl: number | null; unrealized_pct: number | null
  today_pnl: number | null; realized_pnl: number; fees: number
}
export interface PortfolioSummary {
  positions: PortfolioPosition[]
  totals: { market_value: number; cost_basis: number; unrealized_pnl: number
            realized_pnl: number; today_pnl: number; fees: number }
}
export interface EquityPoint { date: string; market_value: number; cost_basis: number; pnl: number }
export type PortfolioTradeIn = Omit<PortfolioTrade, 'id'>

export const portfolioApi = {
  trades: () => request<{ trades: PortfolioTrade[] }>('/api/portfolio/trades'),
  addTrade: (t: PortfolioTradeIn) =>
    request<{ status: string }>('/api/portfolio/trades', { method: 'POST', body: JSON.stringify(t) }),
  updateTrade: (id: string, t: PortfolioTradeIn) =>
    request<{ status: string }>(`/api/portfolio/trades/${id}`, { method: 'PUT', body: JSON.stringify(t) }),
  deleteTrade: (id: string) =>
    request<{ status: string }>(`/api/portfolio/trades/${id}`, { method: 'DELETE' }),
  summary: () => request<PortfolioSummary>('/api/portfolio/summary'),
  equityCurve: () => request<{ curve: EquityPoint[] }>('/api/portfolio/equity_curve'),
}
```

- [ ] **Step 2: 类型检查通过后 Commit**

Run: `pnpm -C frontend exec tsc --noEmit` → 无错误

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: portfolio 前端 API 封装"
```

---

### Task 4: Portfolio 独立页 + 路由 + 导航

**Files:**
- Create: `frontend/src/pages/Portfolio.tsx`
- Modify: `frontend/src/router.tsx`（import 区 + children 中 `{ path: 'watchlist' ... }` 前）
- Modify: `frontend/src/components/Layout.tsx`（nav 数组 :64-72，「个股分析」行后）

- [ ] **Step 1: 页面组件**

`frontend/src/pages/Portfolio.tsx` 结构：顶部统计条 → 净值曲线 → 持仓表 → 流水表 + 录入弹窗。
数据 react-query；面板用 `GlassCard`；涨跌配色/表格类名参考 `components/stock-analysis/WatchlistCpTable.tsx`；
曲线参考 `components/dashboard/BalanceChart.tsx` 的 ECharts init/resize 模式（面积折线，series 取 `pnl`）。核心骨架：

```tsx
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from '@/components/dashboard/GlassCard'
import { portfolioApi, type PortfolioTradeIn } from '@/lib/api'
import { toast } from '@/components/Toast'

const fmt = (v: number | null | undefined, d = 2) =>
  v == null ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

export function Portfolio() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const summary = useQuery({ queryKey: ['portfolio', 'summary'], queryFn: portfolioApi.summary, refetchInterval: 30_000 })
  const trades = useQuery({ queryKey: ['portfolio', 'trades'], queryFn: portfolioApi.trades })
  const curve = useQuery({ queryKey: ['portfolio', 'curve'], queryFn: portfolioApi.equityCurve })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['portfolio'] })
  const addMut = useMutation({ mutationFn: portfolioApi.addTrade, onSuccess: () => { toast('已记录', 'success'); invalidate() } })
  const delMut = useMutation({ mutationFn: portfolioApi.deleteTrade, onSuccess: invalidate })
  const [showForm, setShowForm] = useState(false)
  // 布局: 统计条(5 项 totals) / 净值曲线 / 持仓表 / 流水表 / 录入弹窗(showForm)
}
```

规格（执行时按此实现，样式对齐现有组件）：
- **统计条**：总市值 / 总成本 / 浮动盈亏 / 已实现盈亏 / 今日盈亏，5 个 `GlassCard variant="stat"`，盈亏值按正负着色（沿用项目涨跌色 token）。
- **录入弹窗字段**：symbol（文本输入 + `/api/kline/instruments/search` 联想下拉，参考 `components/financials/StockFinancialSearch.tsx`）、side（买/卖切换按钮）、price、qty、fee、traded_at（`<input type="date">` 默认今天）、note。提交走 `addMut`；错误 toast 由 api.ts 统一处理（超卖 400 文案直接可见）。
- **持仓表列**：代码 / 名称 / 数量 / 均价 / 现价 / 市值 / 浮动盈亏(率) / 今日盈亏；行点击 `navigate('/stock-analysis?symbol=' + symbol)`。
- **流水表列**：日期 / 代码 / 方向 / 价格 / 数量 / 手续费 / 备注 / 删除（`window.confirm` 后 `delMut`）。
- **空态**：无流水时居中「暂无持仓 · 记一笔」按钮（可复用 `components/dashboard/DotGridEmpty.tsx`）。

- [ ] **Step 2: 路由 + 导航**

`router.tsx`：`import { Portfolio } from './pages/Portfolio'`；children 中 `{ path: 'watchlist' ... }` 前加：

```tsx
      { path: 'portfolio', element: <Portfolio /> },
```

`Layout.tsx` nav 数组（:66「个股分析」行后）加（`Briefcase` 加入 lucide-react import）：

```tsx
  { to: '/portfolio',  label: '持仓组合', icon: Briefcase },
```

- [ ] **Step 3: 验证**

`pnpm -C frontend exec tsc --noEmit` 通过；浏览器 3013 打开 `/portfolio`：
录一笔买入 → 统计条/持仓表/曲线出数；录超卖 → toast 显示 400 文案；删除流水后数据恢复。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Portfolio.tsx frontend/src/router.tsx frontend/src/components/Layout.tsx
git commit -m "feat: 持仓组合独立页 + 路由导航"
```

---

### Task 5: Dashboard 概览卡片

**Files:**
- Create: `frontend/src/components/dashboard/PortfolioCard.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`（卡片栅格挂载，位置参考现有卡片排布）

- [ ] **Step 1: 卡片组件**

```tsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { GlassCard, CornerMarks } from './GlassCard'
import { portfolioApi } from '@/lib/api'

export function PortfolioCard() {
  const navigate = useNavigate()
  const { data } = useQuery({ queryKey: ['portfolio', 'summary'], queryFn: portfolioApi.summary, refetchInterval: 60_000 })
  const t = data?.totals
  // GlassCard variant="stat" corners, 整卡 onClick={() => navigate('/portfolio')}, cursor-pointer
  // 标题「持仓组合」; 主数值: 总市值;
  // 次行: 今日盈亏 与 累计盈亏(unrealized_pnl + realized_pnl), 正负着色;
  // 无持仓(positions 空): 「暂无持仓 · 点击记一笔」
}
```

字号/配色对齐同目录 `EdgeStatCard.tsx` / `StatCards.tsx` 与 `tokens.ts`（NEON/涨跌色），不引入新样式。

- [ ] **Step 2: 挂到 `Dashboard.tsx` 栅格；`pnpm -C frontend exec tsc --noEmit` + 浏览器验证空态与有数状态**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/PortfolioCard.tsx frontend/src/pages/Dashboard.tsx
git commit -m "feat: Dashboard 持仓组合概览卡片"
```

---

### Task 6: 收尾验证

- [ ] **Step 1: 后端全量测试**：`cd backend && .venv/Scripts/python.exe -m pytest tests/ -q` → 全绿
- [ ] **Step 2: 生产构建**：`pnpm -C frontend build` 成功；`curl -s localhost:3018/api/portfolio/summary` 正常
- [ ] **Step 3: 端到端走查**（3013）：录 2 买 1 卖（含加密 BTCUSDT）→ 汇总/曲线/今日盈亏正确；Dashboard 卡片数值与独立页一致
- [ ] **Step 4: 若有微调，收尾 Commit**

---

## Self-Review 结论

- **Spec 覆盖**：存储/盈亏口径/CRUD/summary/equity_curve/独立页/Dashboard卡片/路由导航/测试 — 均有对应任务；「编辑/删除后时间线重校验」由 `_validated_save` 统一实现。
- **占位符**：后端与 API 为完整代码；前端 Task 4/5 给出骨架代码 + 精确规格清单（列、字段、交互、参考组件路径），执行者无需自行决策。
- **类型一致性**：service 字段（snake_case）与 API 响应、前端 interface 一一对应；`TimelineError` → HTTP 400 → 前端 toast 链路一致。
