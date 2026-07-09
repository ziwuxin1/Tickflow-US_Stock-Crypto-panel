"""Followin AI 智能体 CRUD + 技能目录 API。

路由前缀: /api/followin-agents

端点:
  GET    /                获取全部智能体与分组 {"agents":[...],"groups":[...]}
  GET    /skill-catalog   获取技能目录 {"catalog":[...]}
  POST   /                新建智能体 {"agent": {...}}; name 空 → 400
  PUT    /{agent_id}      更新智能体 {"agent": {...}}; 不存在 → 404
  DELETE /{agent_id}      删除智能体 {"ok": bool}
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import followin_agents

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/followin-agents", tags=["followin-agents"])


class AgentDraft(BaseModel):
    """新建/更新智能体请求体。"""
    name: str
    role: str = ""
    group: str = ""
    color: str = ""
    desc: str = ""
    skills: list[str] = []


@router.get("/")
def list_agents() -> dict:
    """全部智能体 + 分组。"""
    return followin_agents.list_agents()


@router.get("/skill-catalog")
def skill_catalog() -> dict:
    """技能目录 (顺序固定)。"""
    return {"catalog": followin_agents.SKILL_CATALOG}


@router.post("/")
def create_agent(draft: AgentDraft) -> dict:
    """新建智能体。name 空返回 400。"""
    try:
        agent = followin_agents.create_agent(draft.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"agent": agent}


@router.put("/{agent_id}")
def update_agent(agent_id: str, draft: AgentDraft) -> dict:
    """更新智能体。不存在返回 404; 校验失败返回 400。"""
    if followin_agents.get_agent(agent_id) is None:
        raise HTTPException(404, f"智能体不存在: {agent_id}")
    try:
        agent = followin_agents.update_agent(agent_id, draft.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {"agent": agent}


@router.delete("/{agent_id}")
def delete_agent(agent_id: str) -> dict:
    """删除智能体。"""
    return {"ok": followin_agents.delete_agent(agent_id)}
