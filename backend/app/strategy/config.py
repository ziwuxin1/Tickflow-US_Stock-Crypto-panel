"""策略配置持久化 — 读写用户覆盖值。

职责: 将每个策略的用户定制设置（基础参数、策略参数、评分、买卖信号）持久化到 JSON。
不知道: 引擎、AI、前端、回测。
存储: data/user_data/strategy_overrides/{strategy_id}.json
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# A股时代遗留的 basic_filter 键 — 引擎已删除对应实现, 载入旧 override 时静默丢弃,
# 避免用户磁盘上的历史配置把已删功能 (ST 过滤/板块映射等) 重新带回来。
_REMOVED_BASIC_FILTER_KEYS = {"boards", "exclude_st", "exclude_new_days"}


def _overrides_dir(data_dir: Path) -> Path:
    d = data_dir / "user_data" / "strategy_overrides"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _path(data_dir: Path, strategy_id: str) -> Path:
    return _overrides_dir(data_dir) / f"{strategy_id}.json"


def load_override(data_dir: Path, strategy_id: str) -> dict:
    """读取策略的用户覆盖配置，不存在返回空 dict"""
    p = _path(data_dir, strategy_id)
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        # 清理 basic_filter 中值为 None/空的键（避免固化无意义的空值），
        # 并按白名单丢弃已删除的 A 股遗留键 (boards/exclude_st/exclude_new_days)。
        bf = data.get("basic_filter")
        if isinstance(bf, dict):
            cleaned = {
                k: v for k, v in bf.items()
                if v is not None and k not in _REMOVED_BASIC_FILTER_KEYS
            }
            if cleaned:
                data["basic_filter"] = cleaned
            else:
                del data["basic_filter"]
        return data
    except Exception as e:
        logger.warning("load override %s failed: %s", strategy_id, e)
        return {}


def save_override(data_dir: Path, strategy_id: str, overrides: dict) -> None:
    """保存策略的用户覆盖配置（全量覆盖写）"""
    p = _path(data_dir, strategy_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(overrides, ensure_ascii=False, indent=2), encoding="utf-8")


def delete_override(data_dir: Path, strategy_id: str) -> None:
    """删除策略的用户覆盖配置（重置为默认值）"""
    p = _path(data_dir, strategy_id)
    if p.exists():
        p.unlink()


def list_overrides(data_dir: Path) -> dict[str, dict]:
    """返回所有策略的覆盖配置 {strategy_id: overrides}"""
    d = _overrides_dir(data_dir)
    result: dict[str, dict] = {}
    for f in d.glob("*.json"):
        try:
            sid = f.stem
            result[sid] = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
    return result
