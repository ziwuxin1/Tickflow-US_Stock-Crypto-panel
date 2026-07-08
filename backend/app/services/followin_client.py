"""Followin MCP 直连客户端(JSON-RPC over streamable HTTP)。

不 spawn LLM, 直接对 followin_mcp_url 发 tools/call 取结构化数据, 用于把原本
走 TickFlow 的数据(日K / 实时报价 / 财务)改由 Followin 供数。

Key 取自 secrets.json(followin_api_key), 回退 config。协议: MCP streamable-HTTP,
每次调用做 initialize → notifications/initialized → tools/call(短会话, 用后即弃)。

配额有限(默认 1000 次/天), 高频路径(实时轮询/全市场批量)慎用。
"""
from __future__ import annotations

import json
import logging

import httpx

from app import secrets_store
from app.config import settings

logger = logging.getLogger(__name__)

_PROTOCOL_VERSION = "2025-06-18"
_DEFAULT_TIMEOUT = 30.0


class FollowinError(RuntimeError):
    """Followin 取数失败(未配置 / 鉴权失败 / 协议错误 / 无数据)。"""


def is_active() -> bool:
    """当前是否应把行情数据源切到 Followin。

    规则: TickFlow 数据源总开关关闭 + Followin 已启用且已配置 key。
    即「关掉 TickFlow 且开着 Followin」时, 行情/日K 改由 Followin 供数。
    """
    try:
        from app.services import preferences
        if preferences.get_tickflow_enabled():
            return False
        if not preferences.get_followin_enabled():
            return False
        return bool(secrets_store.get_followin_key())
    except Exception:  # noqa: BLE001
        return False


def _headers(session_id: str | None = None) -> dict:
    key = secrets_store.get_followin_key()
    if not key:
        raise FollowinError("未配置 Followin API Key(设置 → Followin)")
    h = {
        "x-api-key": key,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if session_id:
        h["Mcp-Session-Id"] = session_id
    return h


def _parse_body(resp: httpx.Response) -> dict:
    """解析 MCP 响应体: application/json 或 text/event-stream(取最后一帧 data)。"""
    ctype = resp.headers.get("content-type", "")
    if "text/event-stream" in ctype:
        payload: str | None = None
        for line in resp.text.splitlines():
            s = line.strip()
            if s.startswith("data:"):
                payload = s[5:].strip()
        if payload is None:
            raise FollowinError("Followin SSE 响应无 data 帧")
        return json.loads(payload)
    return json.loads(resp.text)


def _rpc(client: httpx.Client, method: str, params: dict | None, rpc_id: int,
         session_id: str | None) -> tuple[httpx.Response, dict]:
    body: dict = {"jsonrpc": "2.0", "id": rpc_id, "method": method}
    if params is not None:
        body["params"] = params
    resp = client.post(settings.followin_mcp_url, json=body, headers=_headers(session_id))
    if resp.status_code in (401, 403):
        raise FollowinError("Followin API Key 无效或无权限(鉴权失败)")
    resp.raise_for_status()
    return resp, _parse_body(resp)


def _notify(client: httpx.Client, method: str, session_id: str | None) -> None:
    """发通知(无 id, 不等结果)。"""
    body = {"jsonrpc": "2.0", "method": method}
    try:
        client.post(settings.followin_mcp_url, json=body, headers=_headers(session_id))
    except httpx.HTTPError:
        pass


def _extract_tool_result(result: dict) -> dict:
    """从 MCP tools/call 结果里取出业务 JSON。

    优先 structuredContent; 否则取 content[] 里第一个 text 块解析 JSON。
    """
    if isinstance(result.get("structuredContent"), dict):
        return result["structuredContent"]
    for block in result.get("content", []) or []:
        if isinstance(block, dict) and block.get("type") == "text":
            try:
                return json.loads(block["text"])
            except (json.JSONDecodeError, KeyError, TypeError):
                continue
    raise FollowinError("Followin 工具结果无可解析的 JSON")


def _safe_text(result: dict) -> str:
    for block in result.get("content", []) or []:
        if isinstance(block, dict) and block.get("type") == "text":
            return str(block.get("text", ""))[:200]
    return ""


def call_tool(name: str, arguments: dict, timeout: float = _DEFAULT_TIMEOUT) -> dict:
    """调用一个 Followin MCP 工具, 返回其业务 JSON(已解包 content)。

    完整握手后 tools/call; 抛 FollowinError 表示失败(调用方决定回退)。
    """
    with httpx.Client(timeout=timeout) as client:
        resp, init = _rpc(client, "initialize", {
            "protocolVersion": _PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "alphaflow", "version": "1.0"},
        }, rpc_id=1, session_id=None)
        if "error" in init:
            raise FollowinError(f"initialize 失败: {init['error']}")
        session_id = resp.headers.get("mcp-session-id")
        _notify(client, "notifications/initialized", session_id)

        _, out = _rpc(client, "tools/call",
                      {"name": name, "arguments": arguments},
                      rpc_id=2, session_id=session_id)
        if "error" in out:
            raise FollowinError(f"tools/call 失败: {out['error']}")
        result = out.get("result", {})
        if result.get("isError"):
            raise FollowinError(f"Followin 工具返回错误: {_safe_text(result)}")
        return _extract_tool_result(result)


# ================================================================
# 符号映射: app 用 "AAPL.US" / crypto "BTCUSDT"; Followin 用裸 ticker + asset_type
# ================================================================

def _split_symbol(symbol: str) -> tuple[str, str]:
    """app 符号 → (followin_keyword, asset_type)。

    "AAPL.US" → ("AAPL", "tradfi"); 其它交易所后缀去后缀按 tradfi; 无后缀视为 crypto。
    """
    s = symbol.strip().upper()
    if s.endswith(".US"):
        return s[:-3], "tradfi"
    if "." in s:
        return s.split(".")[0], "tradfi"
    return s, "crypto"


# ================================================================
# 高层取数: 映射到 app 数据结构
# ================================================================

def _num(v) -> float | None:
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


import re as _re

# 大写 2-6 字母, 两侧不接 ASCII 字母(\b 对 CJK 无效: "NVDA今天" 里 NVDA 后无边界)
_TICKER_RE = _re.compile(r"(?<![A-Za-z0-9])[A-Z]{2,6}(?![A-Za-z])")
_TICKER_STOP = {"US", "USD", "USDT", "ETF", "AI", "IPO", "CEO", "CFO", "IT", "OK", "A", "I",
                "THE", "AND", "FOR", "PE", "PB", "EV", "GDP", "CPI"}


def _tickers(text: str) -> list[str]:
    """从查询里粗提取 ticker —— 只取原文里本就大写的 token(真 ticker),
    不整体 upper(否则英文小写词如 quote/price 会被误当 ticker)。去噪后返回。"""
    cands = _TICKER_RE.findall(text or "")
    return list(dict.fromkeys(c for c in cands if c not in _TICKER_STOP))[:5]


_CRYPTO_SET = {"BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT",
               "MATIC", "TON", "TRX", "LTC", "BCH", "SHIB", "PEPE", "USDT", "USDC", "WIF"}
_CRYPTO_WORDS = ("比特币", "以太坊", "加密", "狗狗币", "山寨", "meme", "crypto")


def _looks_crypto(text: str) -> bool:
    """判断查询是否指向加密资产(供 signal 只查 KOL/仓位、metrics/news 设 asset_type)。"""
    if set(_TICKER_RE.findall(text or "")) & _CRYPTO_SET:
        return True
    low = (text or "").lower()
    return any(w in (text or "") or w in low for w in _CRYPTO_WORDS)


def _signal_categories(q: str) -> list[str]:
    """按提问意图选信号类别, 让不同问题返回不同数据(否则都一样)。"""
    low = (q or "").lower()
    cats: list[str] = []
    if any(w in q for w in ("内部人", "高管")) or "insider" in low or "form 4" in low or "form4" in low:
        cats.append("insider_trading")
    if any(w in q for w in ("机构", "13F", "13f")) or "institution" in low:
        cats.append("institutional")
    if any(w in q for w in ("喊单", "观点", "怎么看", "看多", "看空", "共识")) or "kol" in low or "consensus" in low:
        cats.append("kol_call")
    if any(w in q for w in ("仓位", "大户", "谁在买", "多空", "情绪")) or "position" in low:
        cats.append("trader_position")
    return list(dict.fromkeys(cats))


def console_query(tool: str, query: str, mode: str = "standard",
                  asset_type: str = "", timeout: float = 45.0) -> dict:
    """Followin 控制台查询(前端对话框用): tool ∈ news / metrics / signal。

    返回该工具的原始业务 JSON(results/meta)。失败抛 FollowinError。
    """
    q = (query or "").strip()
    crypto = _looks_crypto(q)
    args: dict = {}
    if asset_type in ("crypto", "tradfi"):
        args["asset_type"] = asset_type
    elif crypto:
        args["asset_type"] = "crypto"  # 认出加密 → 收窄到加密资产, 提升相关度
    if tool == "news":
        args.update({
            "query": q,
            "search_depth": "quick" if mode == "quick" else "standard",
            # 默认只取最近 1 天, 否则 followin 按相关度会捞出几个月/去年的旧文
            "time_range": "1d",
            "limit": 15, "verbosity": "standard",
        })
    elif tool == "signal":
        kw = _tickers(q)
        # 信号频率低于新闻, 取最近一周; 同样避免返回过期信号
        args.update({"query": q, "time_range": "1w", "limit": 15, "verbosity": "standard"})
        if kw:
            args["keywords"] = kw
        cats = _signal_categories(q)
        if crypto:
            # 加密无 SEC Form4/13F, 只保留 KOL 喊单 + 交易员仓位;
            # 否则 followin 会拿「BTC」去匹配无关的旧内部人/机构披露(2013/2021 年)
            cats = [c for c in cats if c in ("kol_call", "trader_position")] or ["kol_call", "trader_position"]
        if cats:
            args["categories"] = cats
    elif tool == "metrics":
        kw = _tickers(q)
        # 关键: followin 对中文原文召回极差(常返回 null), 强制 categories 也易空返回。
        # 识别到 ticker → 用纯英文 query(丢掉中文原文)+ keywords; 否则原样传 q 兜底。
        if kw:
            args.update({"query": f"{' '.join(kw)} latest price quote and fundamentals", "keywords": kw, "limit": 10, "verbosity": "detail"})
        else:
            args.update({"query": q or "comprehensive analysis", "limit": 10, "verbosity": "detail"})
    else:
        raise FollowinError(f"未知 Followin 工具: {tool}")
    return call_tool(tool, args, timeout=timeout)


def daily_kline(symbol: str, limit: int = 365) -> list[dict]:
    """日K历史 → [{date, open, high, low, close, volume}, ...](旧→新排序)。

    limit 上限 365(Followin 历史序列上限)。空/失败抛 FollowinError。
    """
    kw, asset = _split_symbol(symbol)
    data = call_tool("metrics", {
        "keywords": [kw],
        "asset_type": asset,
        "categories": ["market"],
        "query": "daily OHLCV candles history",
        "time_range": "365d",
        "limit": max(1, min(365, limit)),
    })
    rows = (((data or {}).get("results") or {}).get("market") or {}).get("history") or []
    out = [
        {
            "date": r["date"],
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": float(r.get("volume") or 0),
        }
        for r in rows if r.get("date") is not None
    ]
    if not out:
        raise FollowinError(f"Followin 无 {symbol} 日K数据")
    out.sort(key=lambda x: x["date"])
    return out


def quote(symbol: str) -> dict:
    """实时报价快照 → {symbol, price, open, high, low, prev_close, volume, ...}。"""
    kw, asset = _split_symbol(symbol)
    data = call_tool("metrics", {
        "keywords": [kw],
        "asset_type": asset,
        "categories": ["market"],
        "query": "latest realtime quote snapshot",
        "limit": 1,
    })
    snaps = (((data or {}).get("results") or {}).get("market") or {}).get("snapshot") or []
    if not snaps:
        raise FollowinError(f"Followin 无 {symbol} 报价")
    s = snaps[0]
    return {
        "symbol": symbol,
        "name": s.get("name"),
        "price": _num(s.get("price")),
        "open": _num(s.get("open")),
        "high": _num(s.get("dayHigh")),
        "low": _num(s.get("dayLow")),
        "prev_close": _num(s.get("previousClose")),
        "volume": _num(s.get("volume")),
        "market_cap": _num(s.get("marketCap")),
        "year_high": _num(s.get("yearHigh")),
        "year_low": _num(s.get("yearLow")),
        "exchange": s.get("exchange"),
    }
