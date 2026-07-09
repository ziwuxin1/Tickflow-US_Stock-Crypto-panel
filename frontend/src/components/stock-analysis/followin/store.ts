/**
 * Followin 智能体控制台 —— 客户端状态。
 * - UI 偏好(折叠分组 / 当前智能体 / 字号 / 窗口位置 / 侧栏标签)存 localStorage,跨会话保留。
 * - 智能体与技能目录走后端(useFollowinData hook),CRUD 后本地乐观更新。
 */
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { FollowinAgent, FollowinSkillDef, FollowinAgentDraft } from '@/lib/api'
import type { SideTab, WinRect } from './types'

const LS_KEY = 'followin.ui'

export interface UIPrefs {
  collapsed: Record<string, boolean>
  activeAgentId: string | null
  fontScale: number
  win: WinRect | null
  sideTab: SideTab
}

const DEFAULT_UI: UIPrefs = {
  collapsed: {},
  activeAgentId: null,
  fontScale: 1,
  win: null,
  sideTab: 'agents',
}

export function loadUI(): UIPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULT_UI, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_UI }
}

export function saveUI(patch: Partial<UIPrefs>): void {
  try {
    const next = { ...loadUI(), ...patch }
    localStorage.setItem(LS_KEY, JSON.stringify(next))
  } catch { /* ignore */ }
}

export interface FollowinData {
  agents: FollowinAgent[]
  groups: string[]
  catalog: FollowinSkillDef[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  create: (draft: FollowinAgentDraft) => Promise<FollowinAgent>
  update: (id: string, draft: FollowinAgentDraft) => Promise<FollowinAgent>
  remove: (id: string) => Promise<void>
}

/** 加载智能体 + 技能目录;暴露 CRUD(乐观更新本地列表)。 */
export function useFollowinData(open: boolean): FollowinData {
  const [agents, setAgents] = useState<FollowinAgent[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [catalog, setCatalog] = useState<FollowinSkillDef[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [list, cat] = await Promise.all([
        api.followinAgentsList(),
        api.followinSkillCatalog(),
      ])
      setAgents(list.agents)
      setGroups(list.groups)
      setCatalog(cat.catalog)
    } catch (e: any) {
      setError(String(e?.message ?? '加载智能体失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  // 打开对话框时加载一次(仅首帧,避免每次开关重复拉)
  useEffect(() => {
    if (open && agents.length === 0 && !loading) void reload()
  }, [open, agents.length, loading, reload])

  const mergeGroups = useCallback((next: FollowinAgent[]) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const g of [...groups, ...next.map(a => a.group)]) {
      if (g && !seen.has(g)) { seen.add(g); out.push(g) }
    }
    setGroups(out)
  }, [groups])

  const create = useCallback(async (draft: FollowinAgentDraft) => {
    const { agent } = await api.followinAgentCreate(draft)
    setAgents(prev => { const next = [...prev, agent]; mergeGroups(next); return next })
    return agent
  }, [mergeGroups])

  const update = useCallback(async (id: string, draft: FollowinAgentDraft) => {
    const { agent } = await api.followinAgentUpdate(id, draft)
    setAgents(prev => { const next = prev.map(a => (a.id === id ? agent : a)); mergeGroups(next); return next })
    return agent
  }, [mergeGroups])

  const remove = useCallback(async (id: string) => {
    await api.followinAgentDelete(id)
    setAgents(prev => prev.filter(a => a.id !== id))
  }, [])

  return { agents, groups, catalog, loading, error, reload, create, update, remove }
}
