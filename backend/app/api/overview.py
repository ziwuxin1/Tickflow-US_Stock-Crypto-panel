"""市场总览聚合 API。

聚合逻辑统一在 services.market_overview_builder(唯一实现),
本模块仅负责 HTTP 端点 + 进程内 TTL 缓存。
"""
from __future__ import annotations

import time
from datetime import date
from typing import Any

from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/overview", tags=["overview"])

_CACHE_TTL = 5.0
_cache: dict[str, Any] | None = None
_cache_key: str | None = None
_cache_ts: float = 0.0


def invalidate_overview_cache() -> None:
    """清空总览聚合结果缓存。

    清除数据后调用, 避免看板在 TTL 窗口内继续返回旧的聚合结果。
    """
    global _cache, _cache_key, _cache_ts
    _cache = None
    _cache_key = None
    _cache_ts = 0.0


def _build_overview(request: Request, as_of: date | None = None) -> dict:
    """装配市场总览(委托给 services.market_overview_builder)。

    逻辑抽离至 build_market_overview,以解耦对 Request 的依赖,
    使大盘复盘等无 Request 的调用方可复用同一装配逻辑。
    """
    from app.services.market_overview_builder import build_market_overview
    return build_market_overview(
        repo=request.app.state.repo,
        quote_service=getattr(request.app.state, "quote_service", None),
        as_of=as_of,
    )


@router.get("/market")
def market_overview(request: Request, as_of: date | None = None):
    """总览页单次请求聚合数据，避免前端拉全市场明细后再计算。"""
    global _cache, _cache_key, _cache_ts
    now = time.time()
    cache_key = as_of.isoformat() if as_of else "latest"
    if _cache is not None and _cache_key == cache_key and (now - _cache_ts) < _CACHE_TTL:
        return _cache
    data = _build_overview(request, as_of)
    _cache = data
    _cache_key = cache_key
    _cache_ts = now
    return data
