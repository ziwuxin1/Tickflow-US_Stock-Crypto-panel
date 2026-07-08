"""用户偏好设置持久化。

存储位置: data/user_data/preferences.json
沿用 secrets_store 的 merge-write 模式,但不做 chmod 0600 (非敏感数据)。
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _path() -> Path:
    from app.config import settings
    p = settings.data_dir / "user_data" / "preferences.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def load() -> dict:
    p = _path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            logger.warning("preferences.json malformed: %s", e)
    return {}


def save(updates: dict) -> dict:
    """合并写入。返回新内容。"""
    current = load()
    current.update(updates)
    _path().write_text(
        json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8",
    )
    return current


def get_realtime_quotes_enabled() -> bool:
    return load().get("realtime_quotes_enabled", False)


def get_indices_nav_pinned() -> bool:
    """侧栏指数报价卡片是否固定显示。默认 True（常驻）。
    关闭后，卡片跟随实时行情开关（仅实时开时显示）。"""
    return load().get("indices_nav_pinned", True)


def get_realtime_quote_interval() -> float:
    return load().get("realtime_quote_interval", 10.0)


def get_realtime_watchlist_symbols() -> list[str]:
    """Free 档自选实时监控标的:直接取自选页前 5 个。"""
    try:
        from app.services import watchlist
        rows = watchlist.list_symbols()
    except Exception as e:  # noqa: BLE001
        logger.warning("load watchlist for realtime failed: %s", e)
        return []
    out: list[str] = []
    for row in rows:
        symbol = str((row or {}).get("symbol") or "").strip().upper()
        if symbol and symbol not in out:
            out.append(symbol)
        if len(out) >= 5:
            break
    return out


def set_realtime_watchlist_symbols(symbols: list[str]) -> list[str]:  # noqa: ARG001
    """兼容旧接口: Free 实时标的现在由自选页前 5 个决定。"""
    return get_realtime_watchlist_symbols()


def set_realtime_quote_interval(interval: float) -> float:
    """保存行情轮询间隔（不在此做 min/max 校验，由调用方按档位限制）。"""
    current = load()
    current["realtime_quote_interval"] = interval
    _path().write_text(
        json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8",
    )
    return interval


def get_minute_sync_enabled() -> bool:
    return load().get("minute_sync_enabled", False)


def get_minute_sync_days() -> int:
    return max(1, min(30, load().get("minute_sync_days", 5)))


# ===== 数据源选择 (默认 TickFlow；第一阶段仅日K切换入口) =====

_ALLOWED_DATA_PROVIDERS = {"tickflow"}


def get_daily_data_provider() -> str:
    provider = str(load().get("daily_data_provider", "tickflow") or "tickflow").lower()
    return provider if provider in _ALLOWED_DATA_PROVIDERS else "tickflow"


def get_adj_factor_provider() -> str:
    provider = str(load().get("adj_factor_provider", "same_as_daily") or "same_as_daily").lower()
    if provider == "same_as_daily":
        return provider
    return provider if provider in _ALLOWED_DATA_PROVIDERS else "same_as_daily"


def get_minute_data_provider() -> str:
    provider = str(load().get("minute_data_provider", "tickflow") or "tickflow").lower()
    return provider if provider in _ALLOWED_DATA_PROVIDERS else "tickflow"


def get_realtime_data_provider() -> str:
    # 盘中实时现阶段仅支持 TickFlow。
    return "tickflow"


# ===== 盘后管道拉取内容开关 (美股 / 加密 / ETF / 指数 独立控制) =====

def get_pipeline_pull_us_equity() -> bool:
    """是否拉取美股日K。默认 True。"""
    return load().get("pipeline_pull_us_equity", True)


def get_pipeline_pull_crypto() -> bool:
    """是否拉取加密货币日K (Binance)。默认 True。"""
    return load().get("pipeline_pull_crypto", True)


def get_pipeline_pull_etf() -> bool:
    """是否拉取 ETF 日K。默认 False(美股 ETF 已包含在主 universe 内)。"""
    return load().get("pipeline_pull_etf", False)


def get_pipeline_pull_index() -> bool:
    """是否拉取指数/基准日K (SPY/QQQ/BTC 等)。默认 True。"""
    return load().get("pipeline_pull_index", True)


_PIPELINE_PULL_KEYS = (
    "pipeline_pull_us_equity", "pipeline_pull_crypto",
    "pipeline_pull_etf", "pipeline_pull_index",
)


def get_pipeline_pull_types() -> dict:
    """返回全部拉取开关的当前值。"""
    return {
        "pipeline_pull_us_equity": get_pipeline_pull_us_equity(),
        "pipeline_pull_crypto": get_pipeline_pull_crypto(),
        "pipeline_pull_etf": get_pipeline_pull_etf(),
        "pipeline_pull_index": get_pipeline_pull_index(),
    }


def set_pipeline_pull_types(cfg: dict) -> dict:
    """批量保存拉取开关。只接受白名单内的布尔字段。"""
    updates = {
        k: bool(v) for k, v in cfg.items()
        if k in _PIPELINE_PULL_KEYS and v is not None
    }
    save(updates)
    return get_pipeline_pull_types()


def get_pipeline_index_symbols() -> str:
    """指数自定义拉取代码(逗号/换行/空格分隔)。空串表示全量。"""
    return str(load().get("pipeline_index_symbols", "") or "").strip()


def set_pipeline_index_symbols(symbols: str) -> str:
    """保存指数自定义代码,返回规范化后的字符串。"""
    save({"pipeline_index_symbols": symbols})
    return get_pipeline_index_symbols()


def get_pipeline_schedule() -> dict:
    """返回美股盘后管道调度时间 {"hour": 17, "minute": 0} (美东时间, 16:00 收盘后)。"""
    d = load().get("pipeline_schedule", {"hour": 17, "minute": 0})
    return {"hour": d.get("hour", 17), "minute": d.get("minute", 0)}


def set_pipeline_schedule(hour: int, minute: int) -> dict:
    """保存盘后管道调度时间 (美东时间语义, 不做钳制)。"""
    h = max(0, min(23, hour))
    m = max(0, min(59, minute))
    save({"pipeline_schedule": {"hour": h, "minute": m}})
    return {"hour": h, "minute": m}


def get_instruments_schedule() -> dict:
    """返回盘前标的维表调度时间 {"hour": 8, "minute": 30} (美东时间, 09:30 开盘前)。"""
    d = load().get("instruments_schedule", {"hour": 8, "minute": 30})
    return {"hour": d.get("hour", 8), "minute": d.get("minute", 30)}


def set_instruments_schedule(hour: int, minute: int) -> dict:
    """保存盘前标的维表调度时间 (美东时间语义, 不做钳制)。"""
    h = max(0, min(23, hour))
    m = max(0, min(59, minute))
    save({"instruments_schedule": {"hour": h, "minute": m}})
    return {"hour": h, "minute": m}


def get_enriched_batch_size() -> int:
    """返回 enriched 全量计算每批 symbol 数量。"""
    return max(1, min(10000, load().get("enriched_batch_size", 1000)))


def set_enriched_batch_size(size: int) -> int:
    """保存 enriched 全量计算批次大小。"""
    size = max(10, min(6000, size))
    save({"enriched_batch_size": size})
    return size


def get_index_daily_batch_size() -> int:
    """返回指数日 K 同步每批 symbol 数量。"""
    return max(1, min(10000, load().get("index_daily_batch_size", 100)))


def set_index_daily_batch_size(size: int) -> int:
    """保存指数日 K 同步批次大小。"""
    size = max(1, min(10000, size))
    save({"index_daily_batch_size": size})
    return size


# 复盘推送可选渠道白名单 (微信等暂未实现, 不在白名单内, 前端仅作占位)
# 多选: 不推送 = 空数组, 而非 'none'
REVIEW_PUSH_CHANNELS = {"feishu"}


def get_review_schedule() -> dict:
    """定时复盘调度 {"enabled": False, "hour": 17, "minute": 15}。默认关闭。

    美股 16:00 (美东) 收盘, 默认 17:15 在盘后管道 (默认 17:00) 之后复盘。
    """
    d = load().get("review_schedule", {"enabled": False, "hour": 17, "minute": 15})
    return {
        "enabled": bool(d.get("enabled", False)),
        "hour": d.get("hour", 17),
        "minute": d.get("minute", 15),
    }


def set_review_schedule(enabled: bool, hour: int, minute: int) -> dict:
    """保存定时复盘调度 (美东时间语义, 不做钳制)。

    enabled=False 时时间仍保存(下次开启可沿用), 但调度器不会注册 job。
    """
    h = max(0, min(23, hour))
    m = max(0, min(59, minute))
    save({"review_schedule": {"enabled": bool(enabled), "hour": h, "minute": m}})
    return {"enabled": bool(enabled), "hour": h, "minute": m}


def get_review_push_channels() -> list[str]:
    """复盘推送渠道(多选) — 选定的外部工具列表, 复盘归档后逐个推送。

    与 review_schedule / 实时行情完全独立, 常驻可单独设置。
    空列表 = 不推送; ['feishu'] = 推送到飞书(复用监控中心全局 feishu_webhook_url/secret)。

    向后兼容:
      - 老多版本单选 review_push_channel=='feishu' → ['feishu']
      - 更老布尔 review_push_enabled==True → ['feishu']
    """
    d = load()
    raw = d.get("review_push_channels")
    if isinstance(raw, list):
        return [c for c in raw if c in REVIEW_PUSH_CHANNELS]
    # 兼容老单选字符串
    if d.get("review_push_channel") == "feishu":
        return ["feishu"]
    # 兼容更老布尔开关
    if d.get("review_push_enabled") is True:
        return ["feishu"]
    return []


def set_review_push_channels(channels: list[str]) -> list[str]:
    """保存复盘推送渠道(多选)。过滤白名单外的值、去重、保序。空列表 = 不推送。"""
    seen: set[str] = set()
    cleaned: list[str] = []
    for c in channels or []:
        if c in REVIEW_PUSH_CHANNELS and c not in seen:
            seen.add(c)
            cleaned.append(c)
    save({"review_push_channels": cleaned})
    return cleaned



# ===== 实时监控 =====

# 页面 SSE 刷新配置: { "watchlist": true, "monitor": true, ... }
# 可刷新的页面列表及其默认值
SSE_REFRESH_PAGES_DEFAULT = {
    "watchlist": True,
}

SIDEBAR_INDEX_SYMBOLS_DEFAULT = ["SPY.US", "QQQ.US", "BTCUSDT", "ETHUSDT"]


def _sidebar_index_allowed() -> set[str]:
    """侧栏指数白名单 = 大盘基准 ETF + 核心加密 (来自 app.markets 常量)。"""
    from app.markets import CORE_CRYPTO_SYMBOLS, CORE_INDEX_SYMBOLS
    return set(CORE_INDEX_SYMBOLS) | set(CORE_CRYPTO_SYMBOLS)


# ===== 盘中实时行情范围 (独立于盘后管道范围) =====


def get_realtime_pull_stock() -> bool:
    return load().get("realtime_pull_stock", True)


def get_realtime_pull_etf() -> bool:
    # 老用户兼容: ETF 实时默认关闭，避免升级后请求量/写盘量突然增加。
    return load().get("realtime_pull_etf", False)


def get_realtime_pull_index() -> bool:
    return load().get("realtime_pull_index", True)


def get_realtime_pull_crypto() -> bool:
    """加密货币实时行情开关 (Binance 全市场 ticker, 单请求)。默认 True。"""
    return load().get("realtime_pull_crypto", True)


def get_realtime_index_mode() -> str:
    mode = str(load().get("realtime_index_mode", "core") or "core").lower()
    return mode if mode in {"core", "all"} else "core"


def get_realtime_index_symbols() -> list[str]:
    stored = load().get("realtime_index_symbols", SIDEBAR_INDEX_SYMBOLS_DEFAULT)
    if isinstance(stored, str):
        import re
        stored = [s.strip() for s in re.split(r"[,\s]+", stored) if s.strip()]
    return [str(s) for s in stored if str(s).strip()]


def set_realtime_quote_scope(cfg: dict) -> dict:
    updates = {}
    for key in ("realtime_pull_stock", "realtime_pull_etf", "realtime_pull_index",
                "realtime_pull_crypto"):
        if key in cfg and cfg[key] is not None:
            updates[key] = bool(cfg[key])
    if "realtime_index_mode" in cfg and cfg["realtime_index_mode"] in {"core", "all"}:
        updates["realtime_index_mode"] = cfg["realtime_index_mode"]
    if "realtime_index_symbols" in cfg and cfg["realtime_index_symbols"] is not None:
        updates["realtime_index_symbols"] = cfg["realtime_index_symbols"]
    if updates:
        save(updates)
    return get_realtime_quote_scope()


def get_realtime_quote_scope() -> dict:
    return {
        "realtime_pull_stock": get_realtime_pull_stock(),
        "realtime_pull_etf": get_realtime_pull_etf(),
        "realtime_pull_index": get_realtime_pull_index(),
        "realtime_pull_crypto": get_realtime_pull_crypto(),
        "realtime_index_mode": get_realtime_index_mode(),
        "realtime_index_symbols": get_realtime_index_symbols(),
    }


def get_sse_refresh_pages() -> dict[str, bool]:
    """返回每个页面的 SSE 刷新开关。"""
    stored = load().get("sse_refresh_pages", {})
    # 合并默认值 (新增页面自动出现)
    result = dict(SSE_REFRESH_PAGES_DEFAULT)
    result.update(stored)
    return result


def set_sse_refresh_pages(pages: dict[str, bool]) -> dict[str, bool]:
    """保存页面 SSE 刷新配置。"""
    save({"sse_refresh_pages": pages})
    return get_sse_refresh_pages()


def get_sidebar_index_symbols() -> list[str]:
    """返回左侧菜单显示的指数/基准代码 (白名单过滤, 旧 A 股代码自动失效)。"""
    stored = load().get("sidebar_index_symbols", SIDEBAR_INDEX_SYMBOLS_DEFAULT)
    allowed = _sidebar_index_allowed()
    filtered = [s for s in stored if s in allowed]
    return filtered or list(SIDEBAR_INDEX_SYMBOLS_DEFAULT)


def get_strategy_monitor_enabled() -> bool:
    """策略告警评估总开关。"""
    return load().get("strategy_monitor_enabled", False)


def get_system_notify_enabled() -> bool:
    """系统通知开关 — 开启后监控告警同时推送到操作系统通知中心。"""
    return load().get("system_notify_enabled", False)


def set_system_notify_enabled(enabled: bool) -> bool:
    """保存系统通知开关。"""
    save({"system_notify_enabled": bool(enabled)})
    return bool(enabled)


def get_followin_enabled() -> bool:
    """Followin 数据源总开关(个股 AI 预测「Followin 实时」)。默认启用。"""
    return load().get("followin_enabled", True)


def set_followin_enabled(enabled: bool) -> bool:
    """保存 Followin 数据源总开关。"""
    save({"followin_enabled": bool(enabled)})
    return bool(enabled)


def get_tickflow_enabled() -> bool:
    """TickFlow 数据源总开关(实时行情)。默认启用;关闭则停用实时行情。"""
    return load().get("tickflow_enabled", True)


def set_tickflow_enabled(enabled: bool) -> bool:
    """保存 TickFlow 数据源总开关。"""
    save({"tickflow_enabled": bool(enabled)})
    return bool(enabled)


def get_feishu_webhook_url() -> str:
    """飞书自定义机器人 Webhook 地址 — 全局共用一处, 所有启用推送的规则都推到这一个群。"""
    return load().get("feishu_webhook_url", "")


def get_feishu_webhook_secret() -> str:
    """飞书自定义机器人签名密钥 — 机器人启用「签名校验」时必填, 留空表示不验签。"""
    return load().get("feishu_webhook_secret", "")


def set_feishu_webhook_url(url: str) -> str:
    """保存飞书 Webhook 地址。传入空串表示清空配置。"""
    save({"feishu_webhook_url": str(url or "").strip()})
    return get_feishu_webhook_url()


def set_feishu_webhook_secret(secret: str) -> str:
    """保存飞书签名密钥。传入空串表示不验签。"""
    save({"feishu_webhook_secret": str(secret or "").strip()})
    return get_feishu_webhook_secret()


def get_webhook_enabled_default() -> bool:
    """新建监控规则时是否默认勾选「飞书推送」。

    数据模型当前只有一个 webhook_enabled 布尔 (即飞书), QMT/ptrade 待定。
    此默认值供规则编辑器新建规则时预填, 单条规则仍可独立修改。
    """
    return load().get("webhook_enabled_default", False)


def set_webhook_enabled_default(enabled: bool) -> bool:
    """保存飞书推送默认勾选态。"""
    save({"webhook_enabled_default": bool(enabled)})
    return get_webhook_enabled_default()


def get_screener_auto_run() -> bool:
    """选股页进入时是否自动运行所有策略 (获取命中数)。默认开。"""
    return load().get("screener_auto_run", True)


def get_strategy_monitor_ids() -> list[str]:
    """返回监控池中的策略 ID。"""
    return load().get("strategy_monitor_ids", [])


def set_realtime_monitor_config(cfg: dict) -> dict:
    """批量更新实时监控配置。"""
    updates = {}
    if "sse_refresh_pages" in cfg:
        updates["sse_refresh_pages"] = cfg["sse_refresh_pages"]
    if "strategy_monitor_enabled" in cfg:
        updates["strategy_monitor_enabled"] = cfg["strategy_monitor_enabled"]
    if "strategy_monitor_ids" in cfg:
        updates["strategy_monitor_ids"] = cfg["strategy_monitor_ids"]
    if "sidebar_index_symbols" in cfg:
        allowed = _sidebar_index_allowed()
        updates["sidebar_index_symbols"] = [s for s in cfg["sidebar_index_symbols"] if s in allowed]
    if "screener_auto_run" in cfg:
        updates["screener_auto_run"] = bool(cfg["screener_auto_run"])
    if updates:
        save(updates)
    return get_realtime_monitor_config()


def get_realtime_monitor_config() -> dict:
    """返回完整的实时监控配置。"""
    return {
        "sse_refresh_pages": get_sse_refresh_pages(),
        "strategy_monitor_enabled": get_strategy_monitor_enabled(),
        "strategy_monitor_ids": get_strategy_monitor_ids(),
        "sidebar_index_symbols": get_sidebar_index_symbols(),
        "screener_auto_run": get_screener_auto_run(),
    }


def get_nav_order() -> list[str]:
    """返回左侧菜单的自定义排序（内置页面 path + 扩展分析菜单 id）。"""
    return load().get("nav_order", [])


def set_nav_order(order: list[str]) -> list[str]:
    """保存左侧菜单排序。"""
    save({"nav_order": order})
    return get_nav_order()


def get_nav_hidden() -> list[str]:
    """返回左侧菜单中隐藏的项 id 列表。"""
    return load().get("nav_hidden", [])


def set_nav_hidden(hidden: list[str]) -> list[str]:
    """保存左侧菜单隐藏项。"""
    save({"nav_hidden": hidden})
    return get_nav_hidden()


def get_watchlist_columns() -> list[dict] | None:
    """返回自选列表列配置。"""
    return load().get("watchlist_columns")


def set_watchlist_columns(columns: list[dict]) -> list[dict]:
    """保存自选列表列配置。"""
    save({"watchlist_columns": columns})
    return columns


def get_screener_result_columns() -> list[dict] | None:
    """返回策略结果列表列配置。"""
    return load().get("screener_result_columns")


def set_screener_result_columns(columns: list[dict]) -> list[dict]:
    """保存策略结果列表列配置。"""
    save({"screener_result_columns": columns})
    return columns


# ===== 首次使用引导 =====

def get_onboarding_completed() -> bool:
    """是否已完成首次使用向导。默认 False（新用户）。"""
    return bool(load().get("onboarding_completed", False))


def set_onboarding_completed(done: bool = True) -> bool:
    """标记首次使用向导完成状态。"""
    save({"onboarding_completed": bool(done)})
    return bool(done)


# ===== 财务数据同步时间(持久化,重启不丢失) =====
# 结构: { "metrics": "2026-06-25T10:00:00+08:00", "income": ..., ... }

def get_financial_sync_times() -> dict[str, str]:
    """返回各财务表的最后同步时间(ISO 字符串)。未同步过的表不在返回值中。"""
    return load().get("financial_sync_times", {}) or {}


def set_financial_sync_time(table: str, iso_ts: str) -> None:
    """更新单张财务表的最后同步时间(合并写入,不清除其他表)。"""
    times = get_financial_sync_times()
    times[table] = iso_ts
    save({"financial_sync_times": times})
