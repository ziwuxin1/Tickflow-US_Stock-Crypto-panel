"""Followin AI 智能体存储 + 技能目录 + 技能→工具路由。

存储位置: data/user_data/followin_agents.json
结构: {"agents": [...], "groups": [...]}

沿用 preferences.py 的 merge-write JSON 模式 (无数据库/ORM)。
技能目录 SKILL_CATALOG 与技能→工具映射 SKILL_TOOLS 为纯常量;
tools_for_skills() 把智能体勾选的技能翻译成 followin MCP 的 --allowedTools 子集,
这是"技能真实限制工具"的接入点 —— 未勾选的技能对应工具不放行。

每个 agent 形状严格为:
  {"id","name","role","group","color","desc","skills":[...]}

编码规范: 不可变风格更新 (返回新 dict/list, 不原地改传入对象)。
"""
from __future__ import annotations

import copy
import json
import logging
import re
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)


# ================================================================
# 常量: followin 工具全集 + 中文标签
# ================================================================

# followin MCP 工具全集 (传给 --allowedTools 的名字)。
ALL_FOLLOWIN_TOOLS: tuple[str, ...] = (
    "mcp__followin__metrics",
    "mcp__followin__news",
    "mcp__followin__signal",
    "mcp__followin__twitter",
    "mcp__followin__subscription",
)

# 工具中文标签 (拼提示词"授权范围"用)。
TOOL_CN: dict[str, str] = {
    "mcp__followin__metrics": "行情/技术/基本面",
    "mcp__followin__news": "新闻/研报",
    "mcp__followin__signal": "资金/内部人/KOL",
    "mcp__followin__twitter": "X情报",
    "mcp__followin__subscription": "订阅",
}


# ================================================================
# 技能目录 (顺序固定)
# ================================================================

SKILL_CATALOG: list[dict] = [
    # ---- 新闻检索 (永久免费) ----
    {
        "id": "realtime",
        "group": "news",
        "title": "实时快讯流",
        "desc": "加密+财经+宏观跨市场快讯,1h/4h/12h/1d 时间窗灵活过滤,多源聚合去重输出。",
        "tags": ["跨市场", "时间窗过滤", "多源去重"],
    },
    {
        "id": "topics",
        "group": "news",
        "title": "热点话题聚合",
        "desc": "话题级聚类,一个话题多源映射,按热度排序,一眼看全市场注意力焦点。",
        "tags": ["话题聚类", "多源映射", "热度排序"],
    },
    {
        "id": "articles",
        "group": "news",
        "title": "深度文章库",
        "desc": "全球财经+Crypto 深度媒体长文聚合(Reuters/CNBC/WSJ/Bloomberg/FT),含原文与译文。",
        "tags": ["深度长文", "原文+译文", "财经媒体"],
    },
    {
        "id": "research",
        "group": "news",
        "title": "研报库",
        "desc": "独立分析师+财经长文聚合,AI 可直接读全文做 thesis 拆解。",
        "tags": ["独立分析师", "Substack", "thesis拆解"],
    },
    {
        "id": "kol",
        "group": "news",
        "title": "KOL 观点流",
        "desc": "加密+美股 KOL 推文聚合(230+ 美股 × 100+ 加密),按 ticker/品牌词/时间窗检索。",
        "tags": ["crypto+美股", "raw推文", "按ticker检索"],
    },
    {
        "id": "community",
        "group": "news",
        "title": "社群讨论",
        "desc": "按代币/美股 ticker/关键词检索 Telegram+X 公开讨论,含原文与多语言。",
        "tags": ["Telegram+X", "代币+ticker", "Agent自行提取"],
    },
    # ---- 决策工具 (按额度) ----
    {
        "id": "signals",
        "group": "decision",
        "title": "策略 + 实盘 + 内部人信号",
        "desc": "KOL 付费频道喊单(100+ 私域)+顶级交易员实盘仓位+内部人与政客交易(Form 4 / 参众两院)。",
        "tags": ["KOL喊单", "100+付费频道", "交易员实盘", "Form 4 高管"],
    },
    {
        "id": "usdata",
        "group": "decision",
        "title": "美股深度数据",
        "desc": "1 次调用拿全 12 块画像:三表+PE/PB/EV+同行对比+分析师评级与目标价+EPS 预期,最长 30 年历史。",
        "tags": ["12块真聚合", "30年历史", "分析师评级"],
    },
    {
        "id": "macro",
        "group": "decision",
        "title": "宏观经济指标",
        "desc": "FRED 84 万+ 时间序列直连(GDP/CPI/利率/国债/失业/非农),经济日历提前预警。",
        "tags": ["FRED 84万+", "经济日历", "事件预警"],
    },
    {
        "id": "global",
        "group": "decision",
        "title": "全球行情",
        "desc": "大宗商品(金/油/银)、全球指数(S&P/NASDAQ/道指)、外汇 7×24 实时与历史报价。",
        "tags": ["大宗商品", "全球指数", "7×24实时"],
    },
    {
        "id": "xsearch",
        "group": "decision",
        "title": "X 深度检索",
        "desc": "全套 Twitter 情报:高级搜索+用户深度档案+关系图谱+完整线程上下文+地区热门趋势。",
        "tags": ["高级搜索", "关系图谱", "完整线程"],
    },
]

# 合法技能 id 集合 (校验 skills 用)。
_VALID_SKILL_IDS: set[str] = {s["id"] for s in SKILL_CATALOG}


# ================================================================
# 技能 → followin 工具映射
# ================================================================

SKILL_TOOLS: dict[str, list[str]] = {
    "realtime": ["mcp__followin__news"],
    "topics": ["mcp__followin__news"],
    "articles": ["mcp__followin__news"],
    "research": ["mcp__followin__news"],
    "kol": ["mcp__followin__signal", "mcp__followin__twitter"],
    "community": ["mcp__followin__news", "mcp__followin__twitter"],
    "signals": ["mcp__followin__signal"],
    "usdata": ["mcp__followin__metrics"],
    "macro": ["mcp__followin__metrics"],
    "global": ["mcp__followin__metrics"],
    "xsearch": ["mcp__followin__twitter"],
}


def _ordered_unique(items: list) -> list:
    """保序去重 (过滤 falsy)。"""
    seen: set = set()
    out: list = []
    for it in items:
        if it and it not in seen:
            seen.add(it)
            out.append(it)
    return out


def tools_for_skills(skills: list[str]) -> tuple[str, ...]:
    """把技能 id 列表翻译成 followin 工具并集 (去重保序)。

    空技能或无匹配工具时回退全 5 个工具, 保证不会因空技能导致无工具可用。
    """
    tools: list[str] = []
    for skill in skills or []:
        tools.extend(SKILL_TOOLS.get(skill, []))
    merged = _ordered_unique(tools)
    if not merged:
        return ALL_FOLLOWIN_TOOLS
    return tuple(merged)


def tool_labels(tools: tuple[str, ...] | list[str]) -> list[str]:
    """工具全名 → 中文标签列表 (拼提示词授权范围用)。"""
    return [TOOL_CN.get(t, t) for t in tools]


# ================================================================
# 颜色板 / 默认分组 / 种子智能体
# ================================================================

AGENT_COLORS: list[str] = [
    "#d5f021", "#5ef2e4", "#f75049", "#d9a531", "#c98af0", "#4fd08a",
]

DEFAULT_GROUPS: list[str] = ["美股组", "加密货币组", "新闻组", "信号策略组"]

DEFAULT_COLOR: str = "#d5f021"

SEED_AGENTS: list[dict] = [
    {
        "id": "mike",
        "name": "Mike",
        "role": "美股分析师",
        "group": "美股组",
        "color": "#5ef2e4",
        "desc": "盯盘美股财报与分析师预期,擅长基本面拆解。",
        "skills": ["usdata", "macro", "articles"],
    },
    {
        "id": "jason",
        "name": "Jason",
        "role": "宏观策略师",
        "group": "美股组",
        "color": "#d9a531",
        "desc": "从宏观数据与利率环境判断大盘方向。",
        "skills": ["macro", "global", "research"],
    },
    {
        "id": "candy",
        "name": "Candy",
        "role": "加密货币分析师",
        "group": "加密货币组",
        "color": "#d5f021",
        "desc": "链上+行情双驱动,擅长加密叙事与板块轮动。",
        "skills": ["global", "kol", "community"],
    },
    {
        "id": "leo",
        "name": "Leo",
        "role": "链上巨鲸追踪",
        "group": "加密货币组",
        "color": "#c98af0",
        "desc": "专盯巨鲸地址与资金流向异动。",
        "skills": ["signals", "xsearch", "community"],
    },
    {
        "id": "nina",
        "name": "Nina",
        "role": "首席快讯官",
        "group": "新闻组",
        "color": "#f75049",
        "desc": "只做一件事:第一时间把全市场快讯拉齐去重。",
        "skills": ["realtime", "topics", "articles"],
    },
    {
        "id": "ray",
        "name": "Ray",
        "role": "信号交易员",
        "group": "信号策略组",
        "color": "#4fd08a",
        "desc": "聚合内部人与顶级交易员信号,输出可执行策略。",
        "skills": ["signals", "usdata", "xsearch"],
    },
]

# agent 允许写入的字段 (update 合并用, id 由系统管理不在内)。
_AGENT_FIELDS: tuple[str, ...] = ("name", "role", "group", "color", "desc", "skills")


# ================================================================
# 存储 (merge-write JSON, 不可变风格)
# ================================================================

def _path() -> Path:
    from app.config import settings
    p = settings.data_dir / "user_data" / "followin_agents.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _write(state: dict) -> None:
    _path().write_text(
        json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8",
    )


def load() -> dict:
    """读取存储; 首次无文件时写入 seed 并返回。

    返回 {"agents": [...], "groups": [...]}。
    """
    p = _path()
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("agents"), list):
                groups = data.get("groups")
                return {
                    "agents": data["agents"],
                    "groups": groups if isinstance(groups, list) else [],
                }
        except Exception as e:  # noqa: BLE001
            logger.warning("followin_agents.json malformed: %s", e)
    seed = {
        "agents": copy.deepcopy(SEED_AGENTS),
        "groups": list(DEFAULT_GROUPS),
    }
    _write(seed)
    return seed


def list_agents() -> dict:
    """返回 {"agents": [...], "groups": [...]}。

    groups = 已存 groups 与所有 agent.group 的有序并集 (保序去重)。
    """
    state = load()
    agents = state.get("agents", [])
    groups = _ordered_unique(
        list(state.get("groups", [])) + [a.get("group", "") for a in agents]
    )
    return {"agents": agents, "groups": groups}


def get_agent(agent_id: str) -> dict | None:
    """按 id 取智能体; 不存在返回 None。"""
    for a in load().get("agents", []):
        if a.get("id") == agent_id:
            return copy.deepcopy(a)
    return None


def _clean_skills(skills) -> list[str]:
    """过滤成 SKILL_CATALOG 里存在的 id (保序去重)。"""
    seen: set = set()
    out: list[str] = []
    for s in skills or []:
        if s in _VALID_SKILL_IDS and s not in seen:
            seen.add(s)
            out.append(s)
    return out


def _clean_color(color) -> str:
    """color 不在 AGENT_COLORS 则取默认。"""
    c = str(color or "").strip()
    return c if c in AGENT_COLORS else DEFAULT_COLOR


def _clean_group(group) -> str:
    """group 空则取 DEFAULT_GROUPS[0]。"""
    g = str(group or "").strip()
    return g or DEFAULT_GROUPS[0]


def _normalize_agent(fields: dict, agent_id: str) -> dict:
    """把原始字段规范化成严格 agent 形状 (name 非空校验)。"""
    name = str(fields.get("name") or "").strip()
    if not name:
        raise ValueError("name 不能为空")
    return {
        "id": agent_id,
        "name": name,
        "role": str(fields.get("role") or "").strip(),
        "group": _clean_group(fields.get("group")),
        "color": _clean_color(fields.get("color")),
        "desc": str(fields.get("desc") or "").strip(),
        "skills": _clean_skills(fields.get("skills")),
    }


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(name).lower()).strip("-")
    return slug or "agent"


def _gen_id(name: str, existing: set[str]) -> str:
    """name 的 slug + 短随机后缀, 保证在 existing 内唯一。"""
    base = _slugify(name)
    while True:
        candidate = f"{base}-{uuid.uuid4().hex[:6]}"
        if candidate not in existing:
            return candidate


def create_agent(data: dict) -> dict:
    """新建智能体。name 空抛 ValueError; 返回新 agent。"""
    fields = data or {}
    name = str(fields.get("name") or "").strip()
    if not name:
        raise ValueError("name 不能为空")

    state = load()
    existing_ids = {a.get("id") for a in state.get("agents", [])}
    agent = _normalize_agent(fields, _gen_id(name, existing_ids))

    new_agents = list(state.get("agents", [])) + [agent]
    new_groups = _ordered_unique(list(state.get("groups", [])) + [agent["group"]])
    _write({"agents": new_agents, "groups": new_groups})
    return agent


def update_agent(agent_id: str, data: dict) -> dict:
    """合并更新智能体。不存在抛 ValueError; 返回更新后的 agent。"""
    state = load()
    agents = state.get("agents", [])
    idx = next((i for i, a in enumerate(agents) if a.get("id") == agent_id), None)
    if idx is None:
        raise ValueError(f"智能体不存在: {agent_id}")

    fields = data or {}
    merged = dict(agents[idx])
    for k in _AGENT_FIELDS:
        if k in fields:
            merged[k] = fields[k]
    updated = _normalize_agent(merged, agent_id)

    new_agents = [updated if i == idx else a for i, a in enumerate(agents)]
    new_groups = _ordered_unique(list(state.get("groups", [])) + [updated["group"]])
    _write({"agents": new_agents, "groups": new_groups})
    return updated


def delete_agent(agent_id: str) -> bool:
    """删除智能体; 返回是否删除成功。"""
    state = load()
    agents = state.get("agents", [])
    new_agents = [a for a in agents if a.get("id") != agent_id]
    if len(new_agents) == len(agents):
        return False
    _write({"agents": new_agents, "groups": list(state.get("groups", []))})
    return True
