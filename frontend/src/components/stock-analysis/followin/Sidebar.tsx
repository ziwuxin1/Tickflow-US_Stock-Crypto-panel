/**
 * Followin 智能体控制台 —— 左侧栏(252px 定宽)。
 * 品牌头 + 智能体/历史双标签 + 新建按钮 + 搜索 + 分组折叠列表 + 底部配置。
 */
import { useState } from 'react'
import { Radio, Search, ChevronDown, Plus, Pencil, Sparkles, Loader2 } from 'lucide-react'
import { Avatar } from './Decor'
import { chamfer, hexA, firstChar, TAG_COLOR } from './theme'
import type { FollowinAgent, FollowinSkillDef, HistoryItem, SideTab } from './types'

interface SidebarProps {
  sideTab: SideTab
  onSideTab: (t: SideTab) => void
  agents: FollowinAgent[]
  groups: string[]
  collapsed: Record<string, boolean>
  activeAgentId: string | null
  history: HistoryItem[]
  catalog: FollowinSkillDef[]
  /** 每个智能体的取数状态:loading=转圈 / success=绿点闪 / error=红点闪。 */
  agentStatus: Record<string, 'loading' | 'success' | 'error'>
  loading: boolean
  onSelectAgent: (id: string) => void
  onSelectHistory: (h: HistoryItem) => void
  onToggleGroup: (g: string) => void
  onNewAgent: () => void
  onEditAgent: (a: FollowinAgent) => void
}

export function Sidebar(p: SidebarProps) {
  const [q, setQ] = useState('')

  const kw = q.trim().toLowerCase()
  const filtered = kw
    ? p.agents.filter(a => `${a.name}${a.role}${a.group}`.toLowerCase().includes(kw))
    : p.agents
  // 分组顺序:已知 groups 顺序 + 任何遗漏的分组
  const orderedGroups = [...p.groups, ...filtered.map(a => a.group).filter(g => !p.groups.includes(g))]
    .filter((g, i, arr) => arr.indexOf(g) === i)
    .filter(g => filtered.some(a => a.group === g))

  const skillTitle = (id: string | undefined) => (id ? p.catalog.find(c => c.id === id)?.title : undefined)

  return (
    <aside
      className="flex w-[252px] shrink-0 flex-col border-r border-[rgba(213,240,33,.12)]"
      style={{ background: 'linear-gradient(180deg,#0d0b07,#0a0806)' }}
    >
      {/* 品牌头 */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <span className="flex h-7 w-7 items-center justify-center bg-[#d5f021]" style={{ clipPath: chamfer(5) }}>
          <Radio className="h-4 w-4 text-[#0d0b07]" />
        </span>
        <div className="leading-tight">
          <div className="text-[13px] font-bold tracking-wide text-[#e8e6d8]">FOLLOWIN</div>
          <div className="font-mono text-[8.5px] tracking-[2px] text-[#8f8c7a]">AI 智能体 · AGENTS</div>
        </div>
      </div>

      {/* 双标签 */}
      <div className="flex gap-1 px-3">
        <Tab active={p.sideTab === 'agents'} onClick={() => p.onSideTab('agents')} label="智能体" />
        <Tab active={p.sideTab === 'history'} onClick={() => p.onSideTab('history')} label="历史" />
      </div>

      {/* 主行动按钮 */}
      <div className="px-3 pt-2">
        <button
          onClick={p.onNewAgent}
          className="cp-btn-solid flex w-full items-center justify-center gap-1.5 bg-[#d5f021] py-2 text-[12.5px] font-bold text-[#0d0b07]"
          style={{ clipPath: chamfer(7), boxShadow: '0 0 18px rgba(213,240,33,.28)' }}
        >
          <Plus className="h-4 w-4" />{p.sideTab === 'agents' ? '新建智能体' : '新建检索'}
        </button>
      </div>

      {/* 搜索(仅智能体标签) */}
      {p.sideTab === 'agents' && (
        <div className="px-3 pt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6a6754]" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜索智能体…"
              className="w-full border border-[rgba(94,242,228,.2)] bg-[rgba(16,14,9,.5)] py-1.5 pl-8 pr-2 text-[12px] text-[#e8e6d8] placeholder:text-[#6a6754] focus:border-[rgba(94,242,228,.5)] focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* 列表 */}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {p.loading && p.agents.length === 0 ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#8f8c7a]" /></div>
        ) : p.sideTab === 'agents' ? (
          orderedGroups.map(g => {
            const inGroup = filtered.filter(a => a.group === g)
            const isCollapsed = !!p.collapsed[g]
            const dot = inGroup[0]?.color || '#8f8c7a'
            return (
              <div key={g} className="mb-1">
                <button
                  onClick={() => p.onToggleGroup(g)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-[rgba(213,240,33,.04)]"
                >
                  <ChevronDown className="h-3.5 w-3.5 text-[#8f8c7a] transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }} />
                  <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
                  <span className="text-[12.5px] font-bold text-[#c8c5b4]">{g}</span>
                  <span className="ml-auto font-mono text-[10px] text-[#6a6754]">{inGroup.length} 位</span>
                </button>
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{ maxHeight: isCollapsed ? 0 : inGroup.length * 130, opacity: isCollapsed ? 0 : 1 }}
                >
                  {inGroup.map(a => (
                    <AgentCard
                      key={a.id}
                      agent={a}
                      active={a.id === p.activeAgentId}
                      skillHint={skillTitle(a.skills[0])}
                      status={p.agentStatus[a.id]}
                      onSelect={() => p.onSelectAgent(a.id)}
                      onEdit={() => p.onEditAgent(a)}
                    />
                  ))}
                </div>
              </div>
            )
          })
        ) : (
          <HistoryList history={p.history} onSelect={p.onSelectHistory} />
        )}
      </div>

      {/* 底部 */}
      <div className="flex items-center gap-2 border-t border-[rgba(213,240,33,.1)] px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 text-[#5ef2e4]" />
        <span className="text-[11px] text-[#8f8c7a]">AI 配置</span>
        <span className="ml-auto border border-[rgba(94,242,228,.35)] px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-[#5ef2e4]" style={{ clipPath: chamfer(4) }}>SONNET</span>
      </div>
    </aside>
  )
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1.5 text-center text-[12px] font-semibold transition-colors"
      style={active ? { background: '#d5f021', color: '#0d0b07', clipPath: chamfer(5) } : { color: '#8f8c7a' }}
    >
      {label}
    </button>
  )
}

function AgentCard({ agent, active, skillHint, status, onSelect, onEdit }: {
  agent: FollowinAgent; active: boolean; skillHint?: string
  status?: 'loading' | 'success' | 'error'
  onSelect: () => void; onEdit: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className="group relative mx-1 my-1 cursor-pointer px-2.5 py-2 transition-colors"
      style={{
        clipPath: chamfer(10),
        border: `1px solid ${active ? '#d5f021' : 'rgba(213,240,33,.13)'}`,
        background: active ? '#15140b' : 'rgba(16,14,9,.4)',
        boxShadow: active ? 'inset 0 0 22px rgba(213,240,33,.07)' : 'none',
      }}
    >
      {active && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#d5f021]" style={{ boxShadow: '0 0 10px #d5f021' }} />}
      {/* 标题栏 */}
      <div
        className="mb-1 flex items-center gap-1.5 pb-1"
        style={{ borderBottom: '1px solid rgba(213,240,33,.1)', background: active ? 'linear-gradient(90deg,rgba(213,240,33,.16),transparent 82%)' : 'none' }}
      >
        <Avatar color={agent.color} char={firstChar(agent.name)} size={22} />
        <span className="truncate text-[13px] font-bold text-[#e8e6d8]" style={{ fontFamily: "'Microsoft YaHei','微软雅黑',sans-serif" }}>{agent.name}</span>
        {/* 取数状态:转圈 / 绿点闪(成功)/ 红点闪(失败) */}
        {status === 'loading' && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-[#d5f021]" />}
        {status === 'success' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#4fd08a]" title="数据已加载完成" style={{ animation: 'cpBlink 1.4s step-end infinite', boxShadow: '0 0 6px #4fd08a' }} />
        )}
        {status === 'error' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#f75049]" title="加载失败" style={{ animation: 'cpBlink 1.4s step-end infinite', boxShadow: '0 0 6px #f75049' }} />
        )}
        {active && <span className="border border-[rgba(94,242,228,.4)] px-1 font-mono text-[8px] text-[#5ef2e4]">ON</span>}
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="ml-auto p-0.5 text-[#6a6754] opacity-0 transition-opacity hover:text-[#d5f021] group-hover:opacity-100"
          title="编辑"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
      {/* 头衔 */}
      <div className="text-[11.5px]" style={{ color: active ? '#c9cba8' : '#8f8c7a', fontFamily: "'Microsoft YaHei','微软雅黑',sans-serif" }}>{agent.role}</div>
      {/* 底部行 */}
      <div className="mt-1 flex items-center justify-between">
        <span className="truncate font-mono text-[10px] text-[#8f8c7a]">{agent.skills.length} 项技能{skillHint ? ` · ${skillHint}` : ''}</span>
        <span className="shrink-0 border border-[rgba(213,240,33,.2)] px-1 font-mono text-[9px] text-[#8f8c7a]">{agent.skills.length}</span>
      </div>
    </div>
  )
}

function HistoryList({ history, onSelect }: {
  history: HistoryItem[]; onSelect: (h: HistoryItem) => void
}) {
  if (history.length === 0) return <div className="px-3 py-8 text-center text-[11px] text-[#6a6754]">暂无历史检索</div>
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startYesterday = startToday - 86400000
  const bucket = (ts: number) => (ts >= startToday ? '今天' : ts >= startYesterday ? '昨天' : '更早')
  const groupsOrder = ['今天', '昨天', '更早']
  const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      {groupsOrder.map(gk => {
        const items = history.filter(h => bucket(h.ts) === gk)
        if (!items.length) return null
        return (
          <div key={gk} className="mb-2">
            <div className="px-2 py-1 font-mono text-[10px] tracking-widest text-[#6a6754]">{gk}</div>
            {items.map(h => {
              const c = TAG_COLOR[h.tag] || '#8f8c7a'
              return (
                <button
                  key={h.id}
                  onClick={() => onSelect(h)}
                  className="relative mx-1 my-0.5 flex w-[calc(100%-8px)] items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-[rgba(213,240,33,.05)]"
                  style={{ clipPath: chamfer(7), border: '1px solid rgba(213,240,33,.1)' }}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c }} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[#c8c5b4]">{h.title}</span>
                  <span className="shrink-0 px-1 font-mono text-[8.5px]" style={{ color: c, background: hexA(c, 0.12) }}>{h.tag}</span>
                  <span className="shrink-0 font-mono text-[9px] text-[#6a6754]">{fmtTime(h.ts)}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
