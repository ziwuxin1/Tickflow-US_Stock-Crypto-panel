"""AI 自动预测服务 — 通过本机 Claude Code CLI 运行 global-stock-data 技能。

职责:
  组装 /global-stock-data 研究提示词(含结构化点位 JSON 要求) →
  spawn `claude -p`(用户已登录的 Claude Code, 无需 API Key, 技能自行联网拉最新数据) →
  解析报告末尾的 JSON 代码块并严格校验 →
  返回 {prediction(画线用), report(全文), close, generated_at}。

与 stock_analyzer.py 的区别: 那边走后端配置的 LLM API(需 Key)分析本地数据;
这边走 Claude Code CLI + 技能, 数据由技能实时抓取(新浪/Yahoo/东财/SEC 等)。

不知道: HTTP、前端。
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import shutil
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from app.markets import is_crypto

logger = logging.getLogger(__name__)

_STANCES = ("看多", "看空", "中性")
# 价位偏离现价超过该比例视为幻觉, 丢弃(加密波动大, 放宽)
_MAX_DEVIATION = 0.45
# Claude Code 运行技能拉全量数据通常需要几分钟
_CLI_TIMEOUT = 900.0

_JSON_SCHEMA = """{
  "stance": "看多" 或 "看空" 或 "中性",
  "one_liner": "一句话观点(30字内)",
  "confidence": 0 到 100 的整数(信号一致性),
  "signals": {
    "macd": "金叉" 或 "死叉" 或 "中性",
    "rsi": "超买" 或 "超卖" 或 "中性",
    "kdj": "金叉" 或 "死叉" 或 "中性",
    "boll": "突破上轨" 或 "回踩中轨" 或 "跌破下轨" 或 "收窄" 或 "中性"
  },
  "levels": {
    "entry": [{"price": 数字, "note": "第一档轻仓"}],
    "exit": [{"price": 数字, "note": "减仓档"}],
    "stop_loss": {"price": 数字, "note": "止损理由"},
    "breakout": {"price": 数字, "note": "形态/三角区突破确认点"},
    "rebound_target": {"price": 数字, "note": "反弹目标"},
    "pullback_watch": {"price": 数字, "note": "回踩观察位"},
    "support_zone": {"low": 数字, "high": 数字},
    "breakdown_target": {"price": 数字, "note": "跌破后下看目标"}
  },
  "patterns": {
    "triangle": {
      "upper": [{"date": "YYYY-MM-DD", "price": 数字}, {"date": "YYYY-MM-DD", "price": 数字}],
      "lower": [{"date": "YYYY-MM-DD", "price": 数字}, {"date": "YYYY-MM-DD", "price": 数字}]
    },
    "forecast_path": [{"days_ahead": 5, "price": 数字}, {"days_ahead": 10, "price": 数字}, {"days_ahead": 20, "price": 数字}],
    "waves": [{"date": "YYYY-MM-DD", "price": 数字, "label": "0"}, {"date": "YYYY-MM-DD", "price": 数字, "label": "1"}]
  },
  "risks": ["风险点1", "风险点2"],
  "opportunities": ["机会点1", "机会点2"],
  "advice": {
    "holding": "已持仓操作建议, 带具体价格区间(80字内)",
    "no_position": "未持仓操作建议, 带具体价格区间(80字内)"
  }
}

patterns 说明:
- triangle: K线近期若存在收敛三角形态, 给出上轨/下轨各两个端点(左→右, 日期取实际K线交易日); 无明显形态省略
- forecast_path: 未来价格路径预测(必填, 2-4 个点, days_ahead 为向后交易日数, 建议 5/10/20)
- waves: 波浪理论拐点标注(可选, 按时间升序最多 6 个, label 用 "0"-"5", 日期取实际拐点交易日)"""


def _coin_base(symbol: str) -> str:
    return re.sub(r"(USDT|USDC|BUSD)$", "", symbol, flags=re.IGNORECASE)


def build_research_prompt(symbol: str, name: str, source: str = "global") -> str:
    """组装研究提示词(与前端 GlobalResearchButton 模板一致) + JSON 附录。

    source="global": 走 /global-stock-data 技能自带数据抓取(新浪/Yahoo/东财/SEC)。
    source="followin": 同一套研究要求, 但数据改由 Followin MCP 抓取(mcp__followin__*)。
    """
    crypto = is_crypto(symbol)
    market = "加密货币" if crypto else "美股"
    tag = _coin_base(symbol) if crypto else f"${symbol.split('.')[0]}"
    crypto_note = (
        "\n（加密标的：跳过财务三表/机构持仓/SEC/期权等股票专属部分，重点分析行情结构、链上/衍生品数据与资金流。）\n"
        if crypto else ""
    )
    display = f"{name} {tag}".strip() if name else tag
    if source == "followin":
        asset_type = "crypto" if crypto else "tradfi"
        header = (
            f"我要研究 [{display}]（[市场：{market}]），请给我一份完整研究报告。\n"
            f"【数据来源 —— 必须用 Followin MCP 抓取 {symbol} 的最新数据(asset_type=\"{asset_type}\")，"
            "不要用内置爬虫或其它数据源】\n"
            "- 行情/实时报价/OHLCV历史/技术指标/基本面(含分析师评级与目标价、财报日历、同业) → 调 mcp__followin__metrics\n"
            "- 新闻/评论/研报/推特/媒体 → 调 mcp__followin__news\n"
            "- 谁在买(KOL喊单/大户/内部人/13F机构持仓) → 调 mcp__followin__signal\n"
        )
    else:
        header = (
            f"/global-stock-data 我要研究 [{display}]（[市场：{market}]），\n"
            "请用 global-stock-data 技能给我一份完整研究报告。\n"
        )
    return f"""{header}{crypto_note}
需要包含：
1. 公司基本信息（当前股价、涨跌幅、市值、52周高低）
2. 近期 K 线（最近 6 个月日线）+ 技术指标判断
   - MACD 金叉/死叉
   - RSI 超买/超卖
   - KDJ 交叉
   - 布林带突破/收窄
3. 关键财务指标（最近 4 期）：营收、净利、毛利率、ROE、资产负债率
4. 财务三表摘要：利润表 / 资产负债表 / 现金流量表
5. 分析师评级 + 目标价（buy/hold/sell + 目标价区间）
6. 机构持仓（前 10 大机构 + 内部人持股比例）
7. 资金流向（最近 30 天主力净流入/流出趋势）
8. 新闻 + SEC 文件（最近 10 条新闻、近期 10-K/10-Q/8-K 摘要）
9. 期权链（美股才有，港股跳过）

最后给 1-2 段中文总结：
- 一句话观点（看多/看空/中性）
- 主要风险点
- 主要机会点
- 操作建议（给出具体价格区间：
  现有持仓：建议在什么区间分批减仓/加仓、是否保留底仓；
  未持仓：不要在什么价位追入，建议等到什么区间或出现什么信号再操作）

【重要】报告正文结束后, 必须额外追加一个 ```json 代码块(合法 JSON, 无注释), 输出结构化交易点位:
{_JSON_SCHEMA}
所有价位基于上面报告的分析推演, 落到具体数字。entry 为进场/分批加仓点(1-3 档),
exit 为减仓/离场点(1-2 档); stance/one_liner/signals/entry/stop_loss/advice 必填,
无明显形态的可选字段省略。这个 JSON 块会被程序解析用于图表画线, 格式错误会导致失败。"""


# ================================================================
# Claude Code CLI 调用
# ================================================================

# 技能需要联网抓数据与临时读写, 放行常用工具(不使用 dangerously-skip-permissions)
_ALLOWED_TOOLS = [
    "Bash", "WebFetch", "WebSearch", "Read", "Glob", "Grep",
    "Write", "Edit", "Skill", "ToolSearch", "TodoWrite", "Task",
]


def _find_claude() -> str | None:
    return shutil.which("claude")


def _followin_mcp_config() -> dict | None:
    """构造 followin MCP 服务器配置(含鉴权头)。

    优先用应用内「设置 → AI」保存的 x-api-key(secrets.json)按固定端点组装;
    找不到再回退读取用户 ~/.claude.json 里已连接的 followin 配置。
    仅在运行时读取, 不落库、不写入仓库; 供 followin 数据源 spawn claude 时按需加载。
    """
    from app import secrets_store
    from app.config import settings
    key = secrets_store.get_followin_key()
    if key:
        return {
            "type": "http",
            "url": settings.followin_mcp_url,
            "headers": {"x-api-key": key},
        }
    # 回退: 用户 ~/.claude.json 里已连接的 followin(先看顶层 mcpServers, 再扫各 project)
    try:
        data = json.loads((Path.home() / ".claude.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None
    top = data.get("mcpServers") or {}
    if isinstance(top, dict) and top.get("followin"):
        return top["followin"]
    for proj in (data.get("projects") or {}).values():
        servers = (proj or {}).get("mcpServers") or {}
        if isinstance(servers, dict) and servers.get("followin"):
            return servers["followin"]
    return None


async def _run_claude_cli(
    prompt: str,
    timeout: float = _CLI_TIMEOUT,
    mcp_config_path: str | None = None,
    extra_tools: tuple[str, ...] = (),
) -> str:
    """headless 运行 `claude -p`, 返回最终文本输出。

    mcp_config_path: 传入时以 --strict-mcp-config + --mcp-config 只加载该文件里的 MCP
    (followin 数据源用); 不传则不加载任何 MCP(global 数据源, 技能自带抓取)。
    extra_tools: 追加到 --allowedTools 的工具名(如 followin 的 mcp__followin__* )。
    """
    exe = _find_claude()
    if not exe:
        raise ValueError("未找到 claude 命令: 请确认本机已安装并登录 Claude Code CLI")

    # 提示词经 stdin 传入(UTF-8): Windows 下经 .CMD/argv 传中文会变乱码
    args = [
        exe, "-p", "--output-format", "text",
        # 数据抓取类任务用 sonnet 足够, 比用户默认模型快数倍
        "--model", "sonnet",
        # 严格 MCP: 只加载显式 --mcp-config 里的服务器(followin), 不传则不加载任何 MCP。
        # 用户环境往往配置了大量 MCP, 无头运行全量加载慢且易卡, 故不继承全局配置。
        "--strict-mcp-config",
    ]
    if mcp_config_path:
        args += ["--mcp-config", mcp_config_path]
    args += ["--allowedTools", *_ALLOWED_TOOLS, *extra_tools]
    creationflags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW

    # 剥离认证类环境变量: 后端若从 Claude Code 会话启动会继承 ANTHROPIC_API_KEY 等,
    # 子进程 claude 检测到后会抢占 claude.ai 登录态并失败, 必须强制走用户登录账号
    env = os.environ.copy()
    for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
              "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT"):
        env.pop(k, None)
    # 关闭用户全局 hooks 网关(如 ECC GateGuard)对无头运行工具调用的拦截, 否则技能会被反复卡住
    env["ECC_GATEGUARD"] = "off"

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(Path.home()),
        env=env,
        creationflags=creationflags,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=prompt.encode("utf-8")), timeout=timeout,
        )
    except asyncio.TimeoutError:
        proc.kill()
        raise ValueError(f"Claude Code 运行超时({int(timeout)}s), 请重试") from None

    out = (stdout or b"").decode("utf-8", errors="replace").strip()
    if proc.returncode != 0:
        err = (stderr or b"").decode("utf-8", errors="replace").strip()
        logger.warning("claude CLI exit=%s stderr=%s", proc.returncode, err[:500])
        raise ValueError(f"Claude Code 运行失败(exit {proc.returncode}): {err[:200] or '无错误输出'}")
    if not out:
        raise ValueError("Claude Code 未返回内容, 请重试")
    return out


# ================================================================
# LLM 输出解析与严格校验
# ================================================================

def _extract_json(text: str) -> tuple[dict | None, str]:
    """提取报告末尾的 JSON 代码块, 返回 (json, 去掉该块的报告正文)。

    优先取最后一个 ```json 围栏块; 找不到时回退为全文最后一个 {...}。
    """
    blocks = list(re.finditer(r"```json\s*([\s\S]*?)```", text))
    for m in reversed(blocks):
        try:
            obj = json.loads(m.group(1))
            if isinstance(obj, dict):
                report = (text[:m.start()] + text[m.end():]).strip()
                return obj, report
        except json.JSONDecodeError:
            continue
    # 回退: 全文最后一个大括号块
    end = text.rfind("}")
    start = text.rfind("{", 0, end)
    # 逐步向左扩展找到能解析的最大块
    while start >= 0:
        try:
            obj = json.loads(text[start:end + 1])
            if isinstance(obj, dict) and "stance" in obj:
                return obj, (text[:start] + text[end + 1:]).strip()
        except json.JSONDecodeError:
            pass
        start = text.rfind("{", 0, start)
    return None, text.strip()


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 4) if math.isfinite(f) and f > 0 else None


def _point(v) -> dict | None:
    if not isinstance(v, dict):
        return None
    p = _num(v.get("price"))
    if p is None:
        return None
    return {"price": p, "note": str(v.get("note") or "")[:40]}


def _strs(v, cap: int = 4, ln: int = 60) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x).strip()[:ln] for x in v[:cap] if str(x).strip()]


_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _dated_point(v) -> dict | None:
    """{"date","price"} 校验(历史形态点, 只验正数不验偏离)。"""
    if not isinstance(v, dict):
        return None
    d = str(v.get("date") or "")[:10]
    p = _num(v.get("price"))
    if p is None or not _DATE_RE.match(d):
        return None
    out = {"date": d, "price": p}
    label = str(v.get("label") or "").strip()[:4]
    if label:
        out["label"] = label
    return out


def _sanitize_patterns(raw, close: float | None) -> dict:
    """patterns 段校验: triangle 上下轨端点 / forecast_path 未来路径 / waves 拐点。"""
    pat = raw if isinstance(raw, dict) else {}

    def _line(v) -> list[dict] | None:
        if not isinstance(v, list) or len(v) < 2:
            return None
        pts = [p for p in (_dated_point(x) for x in v[:2]) if p]
        return pts if len(pts) == 2 and pts[0]["date"] < pts[1]["date"] else None

    tri_raw = pat.get("triangle") if isinstance(pat.get("triangle"), dict) else {}
    upper, lower = _line(tri_raw.get("upper")), _line(tri_raw.get("lower"))
    triangle = {"upper": upper, "lower": lower} if upper and lower else None

    path = []
    if isinstance(pat.get("forecast_path"), list):
        for item in pat["forecast_path"][:4]:
            if not isinstance(item, dict):
                continue
            p = _num(item.get("price"))
            try:
                d = int(item.get("days_ahead"))
            except (TypeError, ValueError):
                continue
            if p is None or not (1 <= d <= 60):
                continue
            if close and abs(p / close - 1) > _MAX_DEVIATION:
                continue
            path.append({"days_ahead": d, "price": p})
    path.sort(key=lambda x: x["days_ahead"])

    waves = [p for p in (_dated_point(x) for x in (pat.get("waves") or [])[:6] if x) if p] \
        if isinstance(pat.get("waves"), list) else []

    return {
        "triangle": triangle,
        "forecast_path": path if len(path) >= 2 else None,
        "waves": waves if len(waves) >= 2 else None,
    }


def sanitize_prediction(raw: dict, close: float | None) -> dict:
    """严格校验 LLM JSON: 非法字段丢弃、价位幻觉过滤, 保证前端可安全消费。"""

    def in_range(p: float | None) -> bool:
        if p is None:
            return False
        return not close or abs(p / close - 1) <= _MAX_DEVIATION

    def keep_point(v) -> dict | None:
        pt = _point(v)
        return pt if pt and in_range(pt["price"]) else None

    def keep_points(v, cap: int) -> list[dict]:
        if not isinstance(v, list):
            return []
        out = []
        for item in v[:cap]:
            pt = keep_point(item)
            if pt:
                out.append(pt)
        return out

    lv = raw.get("levels") if isinstance(raw.get("levels"), dict) else {}

    zone = lv.get("support_zone") if isinstance(lv.get("support_zone"), dict) else {}
    z_lo, z_hi = _num(zone.get("low")), _num(zone.get("high"))
    if z_lo is not None and z_hi is not None and z_lo > z_hi:
        z_lo, z_hi = z_hi, z_lo
    support_zone = {"low": z_lo, "high": z_hi} if in_range(z_lo) and in_range(z_hi) else None

    sig = raw.get("signals") if isinstance(raw.get("signals"), dict) else {}
    signals = {k: str(sig.get(k) or "中性")[:6] for k in ("macd", "rsi", "kdj", "boll")}

    adv = raw.get("advice") if isinstance(raw.get("advice"), dict) else {}

    try:
        confidence = max(0, min(100, int(raw.get("confidence"))))
    except (TypeError, ValueError):
        confidence = None

    stance = raw.get("stance")
    return {
        "stance": stance if stance in _STANCES else "中性",
        "one_liner": str(raw.get("one_liner") or "").strip()[:60],
        "confidence": confidence,
        "signals": signals,
        "levels": {
            "entry": keep_points(lv.get("entry"), 3),
            "exit": keep_points(lv.get("exit"), 2),
            "stop_loss": keep_point(lv.get("stop_loss")),
            "breakout": keep_point(lv.get("breakout")),
            "rebound_target": keep_point(lv.get("rebound_target")),
            "pullback_watch": keep_point(lv.get("pullback_watch")),
            "support_zone": support_zone,
            "breakdown_target": keep_point(lv.get("breakdown_target")),
        },
        "patterns": _sanitize_patterns(raw.get("patterns"), close),
        "risks": _strs(raw.get("risks")),
        "opportunities": _strs(raw.get("opportunities")),
        "advice": {
            "holding": str(adv.get("holding") or "").strip()[:160],
            "no_position": str(adv.get("no_position") or "").strip()[:160],
        },
    }


# ================================================================
# 预测入口
# ================================================================

def _local_close(repo, symbol: str) -> float | None:
    """本地最新收盘价(仅用于点位幻觉过滤与距现价百分比), 无数据返回 None。"""
    try:
        end = date.today()
        df = repo.get_daily(symbol, end - timedelta(days=30), end)
        if df.is_empty() or "close" not in df.columns:
            return None
        return float(df.tail(1)["close"][0])
    except Exception:  # noqa: BLE001
        return None


async def predict_stock(repo, symbol: str, name: str = "", source: str = "global") -> dict:
    """通过 Claude Code CLI 运行研究提示词, 返回结构化预测 + 报告全文。

    source="global": 走 global-stock-data 技能自带抓取; source="followin": 同套提示词,
    数据改由 Followin MCP 抓取(运行时从 ~/.claude.json 读取其配置, 临时加载, 用后即删)。
    返回 {"prediction", "report", "close", "generated_at"}; 失败抛 ValueError。
    """
    prompt = build_research_prompt(symbol, name, source)

    mcp_path: str | None = None
    extra_tools: tuple[str, ...] = ()
    if source == "followin":
        fcfg = _followin_mcp_config()
        if not fcfg:
            raise ValueError("未找到 followin MCP 配置, 请先在 Claude Code 中连接 followin 后重试")
        fd, mcp_path = tempfile.mkstemp(suffix=".json", prefix="followin-mcp-")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"mcpServers": {"followin": fcfg}}, f)
        extra_tools = (
            "mcp__followin__metrics", "mcp__followin__news",
            "mcp__followin__signal", "mcp__followin__twitter",
            "mcp__followin__subscription",
        )

    try:
        text = await _run_claude_cli(prompt, mcp_config_path=mcp_path, extra_tools=extra_tools)
    finally:
        if mcp_path:
            try:
                os.remove(mcp_path)
            except OSError:
                pass

    raw, report = _extract_json(text)
    if raw is None:
        logger.warning("claude predict unparsable for %s, tail=%s", symbol, text[-300:])
        raise ValueError("报告已生成但未找到结构化点位 JSON, 请重试")

    close = _local_close(repo, symbol)
    return {
        "prediction": sanitize_prediction(raw, close),
        "report": report,
        "close": close,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
