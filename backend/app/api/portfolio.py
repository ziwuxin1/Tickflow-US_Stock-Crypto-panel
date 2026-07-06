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
