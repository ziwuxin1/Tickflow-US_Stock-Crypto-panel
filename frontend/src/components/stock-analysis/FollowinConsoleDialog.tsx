/**
 * Followin 数据检索 —— Cyberpunk AI 智能体控制台。
 *
 * 左侧智能体侧栏(分组/折叠)+ 主区对话 + 底部状态条,四周赛博装饰边框。
 * - 自建多个 AI 智能体(后端存储):身份 + 勾选的擅长技能;技能真实限制其可调 Followin 工具。
 * - 选中智能体 → 进入其独立对话(空态给领域建议问)。
 * - 双模式:快速取数(单工具原始数据) / AI 分析(智能体综合,按其技能路由)。
 * - 弹窗可拖动 + 四边缩放 + 字号缩放(80%–115%)。
 * 设计交接稿见 docs/design-handoff/followin-agent。
 */
import { useEffect, useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Radio, Clock, X } from 'lucide-react'
import { api } from '@/lib/api'
import type { FollowinAgent } from '@/lib/api'
import { Sidebar } from './followin/Sidebar'
import { ChatArea } from './followin/ChatArea'
import { Composer } from './followin/Composer'
import { AgentEditor } from './followin/AgentEditor'
import { DecorBorders, LCorners, StatusBar, Avatar, LiveBadge } from './followin/Decor'
import { useWindow, type ResizeDir } from './followin/useWindow'
import { useFollowinData, loadUI, saveUI } from './followin/store'
import { chamfer, firstChar, subjectOf } from './followin/theme'
import type { AgentSession, ChatMsg, DraftState, HistoryItem, Mode, Panel, SideTab, ToolCat } from './followin/types'

// 跨「开关对话框」保留每个智能体的会话(页面内内存缓存)
let CONVO_CACHE: Record<string, AgentSession> = {}
let HISTORY_CACHE: HistoryItem[] = []

const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

const freshSession = (agentId: string, mode: Mode = 'ai'): AgentSession => ({ agentId, msgs: [], input: '', mode })

/** 快速取数:按问题意图路由到 news/metrics/signal(设计里 composer 无手动类目选择)。 */
function routeTool(q: string): ToolCat {
  if (/新闻|消息|快讯|研报|热点|舆情|报道/.test(q)) return 'news'
  if (/谁在买|内部人|KOL|喊单|13F|持仓|仓位|情绪|巨鲸|大户|机构/.test(q)) return 'signal'
  return 'metrics'
}

/** 领域 tag(历史列表用):按问题/智能体分组粗判。 */
function domainTag(q: string, agent?: FollowinAgent): string {
  if (/链上|巨鲸|质押|on-?chain/i.test(q)) return '链上'
  if (/VIX|期权|衍生|波动率/i.test(q)) return '衍生品'
  if (/宏观|美联储|CPI|利率|非农|GDP/i.test(q)) return '宏观'
  const g = agent?.group || ''
  if (g.includes('加密') || /BTC|ETH|SOL|比特币|以太坊/i.test(q)) return '加密'
  if (g.includes('新闻')) return '新闻'
  return '美股'
}

const RESIZE_HANDLES: { dir: ResizeDir; cls: string }[] = [
  { dir: 'n', cls: 'top-0 left-3 right-3 h-1.5 cursor-ns-resize' },
  { dir: 's', cls: 'bottom-0 left-3 right-3 h-1.5 cursor-ns-resize' },
  { dir: 'w', cls: 'left-0 top-3 bottom-3 w-1.5 cursor-ew-resize' },
  { dir: 'e', cls: 'right-0 top-3 bottom-3 w-1.5 cursor-ew-resize' },
  { dir: 'nw', cls: 'top-0 left-0 h-3 w-3 cursor-nwse-resize' },
  { dir: 'ne', cls: 'top-0 right-0 h-3 w-3 cursor-nesw-resize' },
  { dir: 'sw', cls: 'bottom-0 left-0 h-3 w-3 cursor-nesw-resize' },
  { dir: 'se', cls: 'bottom-0 right-0 h-3 w-3 cursor-nwse-resize' },
]

export function FollowinConsoleDialog({ open, onClose, symbol, name }: {
  open: boolean
  onClose: () => void
  symbol: string
  name?: string
}) {
  const data = useFollowinData(open)
  const wc = useWindow(open)

  const [sideTab, setSideTab] = useState<SideTab>(() => loadUI().sideTab)
  const [panel, setPanel] = useState<Panel>('chat')
  const [activeAgentId, setActiveAgentId] = useState<string | null>(() => loadUI().activeAgentId)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadUI().collapsed)
  const [convos, setConvos] = useState<Record<string, AgentSession>>(() => CONVO_CACHE)
  const [history, setHistory] = useState<HistoryItem[]>(() => HISTORY_CACHE)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 已读标记:agentId → 已查看过的最后一条回复 id。查看过的智能体不再亮完成/失败灯。
  const [seen, setSeen] = useState<Record<string, string>>({})

  useEffect(() => { CONVO_CACHE = convos }, [convos])
  useEffect(() => { HISTORY_CACHE = history }, [history])
  useEffect(() => { saveUI({ sideTab, activeAgentId, collapsed }) }, [sideTab, activeAgentId, collapsed])

  // 智能体加载后:确保 activeAgentId 有效,否则取第一个
  useEffect(() => {
    if (!data.agents.length) return
    if (!activeAgentId || !data.agents.some(a => a.id === activeAgentId)) {
      setActiveAgentId(data.agents[0].id)
    }
  }, [data.agents, activeAgentId])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && panel === 'chat') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, panel, onClose])

  const activeAgent = useMemo(() => data.agents.find(a => a.id === activeAgentId), [data.agents, activeAgentId])
  const session = activeAgentId ? (convos[activeAgentId] ?? freshSession(activeAgentId)) : null

  // 每个智能体的取数状态(供侧栏卡片显示转圈/绿点/红点):
  // 正在取数 → loading(始终显示);完成/失败 → 仅当【非当前查看】且【未读】时亮绿/红点。
  const agentStatus = useMemo(() => {
    const out: Record<string, 'loading' | 'success' | 'error'> = {}
    for (const [id, s] of Object.entries(convos)) {
      if (!s.msgs.length) continue
      if (s.msgs.some(m => m.phase === 'loading' || m.phase === 'streaming')) { out[id] = 'loading'; continue }
      if (id === activeAgentId) continue  // 当前正在查看 = 已读,不亮完成/失败灯
      const last = [...s.msgs].reverse().find(m => m.role === 'agent')
      if (!last || seen[id] === last.id) continue  // 已读 → 不亮灯
      if (last.phase === 'error') out[id] = 'error'
      else if (last.phase === 'done') out[id] = 'success'
    }
    return out
  }, [convos, activeAgentId, seen])

  // 当前查看的智能体完成/失败后 → 标记为已读(切走后也不再亮灯)。
  useEffect(() => {
    if (!activeAgentId) return
    const s = convos[activeAgentId]
    if (!s?.msgs.length) return
    const last = [...s.msgs].reverse().find(m => m.role === 'agent')
    if (last && (last.phase === 'done' || last.phase === 'error')) {
      setSeen(prev => (prev[activeAgentId] === last.id ? prev : { ...prev, [activeAgentId]: last.id }))
    }
  }, [activeAgentId, convos])

  if (!open) return null

  const patchSession = (agentId: string, fn: (s: AgentSession) => AgentSession) =>
    setConvos(cs => ({ ...cs, [agentId]: fn(cs[agentId] ?? freshSession(agentId)) }))

  const pageTicker = subjectOf(symbol) || symbol.replace(/\.[A-Za-z]+$/, '')
  const disp = session?.subject || pageTicker || (name || symbol)

  // ===== 发送 =====
  const send = async (override?: string) => {
    if (!activeAgent || !session) return
    const raw = (override ?? session.input).trim() || (name ? `${name} ${symbol}` : symbol)
    if (!raw) return
    const ctx = session.subject || pageTicker
    const q = (ctx && !subjectOf(raw) && !raw.includes(ctx)) ? `${ctx} ${raw}` : raw
    const mode = session.mode
    const agentId = activeAgent.id
    const userMsg: ChatMsg = { id: uid(), role: 'user', mode, q: raw, tool: mode === 'fast' ? routeTool(q) : undefined }
    const botMsg: ChatMsg = { id: uid(), role: 'agent', mode, phase: 'loading', tool: userMsg.tool }
    const startedAt = Date.now()

    patchSession(agentId, s => ({ ...s, input: '', subject: subjectOf(q) ?? s.subject, msgs: [...s.msgs, userMsg, botMsg] }))
    setHistory(h => [{ id: uid(), agentId, title: raw.slice(0, 20), tag: domainTag(q, activeAgent), ts: startedAt }, ...h].slice(0, 40))

    try {
      if (mode === 'ai') {
        const r = await api.followinAgent({ question: q, symbol, name, agent_id: agentId })
        const elapsed = (Date.now() - startedAt) / 1000
        patchSession(agentId, s => ({ ...s, msgs: s.msgs.map(m => m.id === botMsg.id ? { ...m, phase: 'done', answer: r.answer, toolsUsed: activeAgent.skills.length || undefined, elapsed } : m) }))
      } else {
        const tool = userMsg.tool || 'metrics'
        const r = await api.followinConsole({ tool, query: q, mode: 'standard' })
        patchSession(agentId, s => ({ ...s, msgs: s.msgs.map(m => m.id === botMsg.id ? { ...m, phase: 'done', data: r.data } : m) }))
      }
    } catch (e: any) {
      patchSession(agentId, s => ({ ...s, msgs: s.msgs.map(m => m.id === botMsg.id ? { ...m, phase: 'error', error: String(e?.message ?? '查询失败') } : m) }))
    }
  }

  const busy = !!session?.msgs.some(m => m.phase === 'loading' || m.phase === 'streaming')

  // ===== 编辑器 =====
  const openNew = () => {
    setDraft({ id: null, name: '', role: '', group: data.groups[0] || '美股组', color: '#d5f021', desc: '', skills: {} })
    setEditingId(null); setPanel('edit')
  }
  const openEdit = (a: FollowinAgent) => {
    setDraft({ id: a.id, name: a.name, role: a.role, group: a.group, color: a.color, desc: a.desc, skills: Object.fromEntries(a.skills.map(s => [s, 1])) })
    setEditingId(a.id); setPanel('edit')
  }
  const saveAgent = async () => {
    if (!draft || !draft.name.trim()) return
    setSaving(true)
    try {
      const body = { name: draft.name.trim(), role: draft.role, group: draft.group, color: draft.color, desc: draft.desc, skills: Object.keys(draft.skills) }
      const agent = editingId ? await data.update(editingId, body) : await data.create(body)
      setActiveAgentId(agent.id); setPanel('chat'); setDraft(null); setEditingId(null)
    } catch { /* toast 已由 api 弹 */ } finally { setSaving(false) }
  }

  const selectHistory = (h: HistoryItem) => {
    if (data.agents.some(a => a.id === h.agentId)) { setActiveAgentId(h.agentId); setSideTab('agents') }
  }

  const pct = Math.round(wc.fontScale * 100)

  return createPortal(
    <div className="fixed inset-0 z-[60]" onClick={panel === 'chat' ? onClose : undefined}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

      {/* 窗口 */}
      <div
        className="cpfx absolute flex flex-col overflow-hidden text-[#e8e6d8]"
        style={{
          left: wc.win.x, top: wc.win.y, width: wc.win.w, height: wc.win.h,
          background: 'linear-gradient(180deg, rgba(18,16,10,.98), rgba(11,9,8,.98))',
          border: '1px solid rgba(213,240,33,.22)',
          boxShadow: '0 0 60px rgba(0,0,0,.7), 0 0 40px rgba(213,240,33,.06)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 点阵底 */}
        <div className="pointer-events-none absolute inset-0 opacity-[.6]" style={{ background: 'radial-gradient(rgba(213,240,33,.3) 1.1px, transparent 1.8px)', backgroundSize: '72px 66px' }} />

        {/* 内容行:侧栏 + 主区 */}
        <div className="relative z-[2] flex min-h-0 flex-1">
          <Sidebar
            sideTab={sideTab}
            onSideTab={setSideTab}
            agents={data.agents}
            groups={data.groups}
            collapsed={collapsed}
            activeAgentId={activeAgentId}
            history={history}
            catalog={data.catalog}
            agentStatus={agentStatus}
            loading={data.loading}
            onSelectAgent={id => { setActiveAgentId(id); setPanel('chat') }}
            onSelectHistory={selectHistory}
            onToggleGroup={g => setCollapsed(c => ({ ...c, [g]: !c[g] }))}
            onNewAgent={openNew}
            onEditAgent={openEdit}
          />

          {/* 主区 */}
          <div className="relative flex min-w-0 flex-1 flex-col pr-5">
            {/* 头部(可拖动) */}
            <Header
              activeAgent={activeAgent}
              pct={pct}
              onIncFont={wc.incFont} onDecFont={wc.decFont} onResetFont={wc.resetFont}
              onClose={onClose}
              startDrag={wc.startDrag}
            />

            {/* 对话滚动区 */}
            <ChatArea
              agent={activeAgent}
              msgs={session?.msgs ?? []}
              disp={disp}
              fontScale={wc.fontScale}
              onPick={q => send(q)}
            />

            {/* 输入区 */}
            <Composer
              mode={session?.mode ?? 'ai'}
              onMode={m => activeAgentId && patchSession(activeAgentId, s => ({ ...s, mode: m }))}
              input={session?.input ?? ''}
              onInput={v => activeAgentId && patchSession(activeAgentId, s => ({ ...s, input: v }))}
              onSend={() => send()}
              agent={activeAgent}
              busy={busy}
            />
          </div>

          {/* 编辑器 overlay */}
          {panel === 'edit' && draft && (
            <AgentEditor
              draft={draft}
              editingId={editingId}
              catalog={data.catalog}
              groups={data.groups}
              saving={saving}
              onChange={patch => setDraft(d => d ? { ...d, ...patch } : d)}
              onToggleSkill={id => setDraft(d => {
                if (!d) return d
                const skills = { ...d.skills }
                if (skills[id]) delete skills[id]; else skills[id] = 1
                return { ...d, skills }
              })}
              onCancel={() => { setPanel('chat'); setDraft(null); setEditingId(null) }}
              onSave={saveAgent}
            />
          )}
        </div>

        {/* 底部状态条 */}
        <div className="relative z-[2]"><StatusBar /></div>

        {/* 装饰层 */}
        <DecorBorders />
        <LCorners />

        {/* 缩放手柄 */}
        {RESIZE_HANDLES.map(h => (
          <div key={h.dir} className={`absolute z-[8] ${h.cls}`} onPointerDown={wc.startResize(h.dir)} />
        ))}
      </div>
    </div>,
    document.body,
  )
}

/** 主区头部(可拖动区,标注 data-nodrag 的控件不触发拖动)。 */
function Header({ activeAgent, pct, onIncFont, onDecFont, onResetFont, onClose, startDrag }: {
  activeAgent: FollowinAgent | undefined
  pct: number
  onIncFont: () => void
  onDecFont: () => void
  onResetFont: () => void
  onClose: () => void
  startDrag: (e: ReactPointerEvent) => void
}) {
  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-nodrag]')) return
    startDrag(e)
  }
  return (
    <div
      onPointerDown={onDown}
      className="flex shrink-0 select-none items-center gap-3 border-b border-[rgba(213,240,33,.14)] px-4 py-2.5"
      style={{ cursor: 'move' }}
    >
      <span className="flex h-6 w-6 items-center justify-center bg-[#d5f021]" style={{ clipPath: chamfer(4) }}>
        <Radio className="h-3.5 w-3.5 text-[#0d0b07]" />
      </span>
      <span className="cpfx font-bold tracking-wide text-[#e8e6d8]" style={{ fontSize: 15, animation: 'cpGlitch 7s infinite' }}>
        Followin 数据检索
      </span>
      {activeAgent && (
        <span className="flex items-center gap-1.5 border border-[rgba(213,240,33,.3)] px-2 py-0.5" style={{ clipPath: chamfer(5) }}>
          <Avatar color={activeAgent.color} char={firstChar(activeAgent.name)} size={15} dim />
          <span className="text-[12px] font-semibold" style={{ color: activeAgent.color }}>{activeAgent.name}</span>
          <span className="text-[10px] text-[#8f8c7a]">{activeAgent.role}</span>
        </span>
      )}
      <span className="hidden font-mono text-[9px] tracking-[2px] text-[#6a6754] lg:inline">REALTIME QUOTE · NEWS · ONCHAIN</span>
      <div className="ml-auto flex items-center gap-2" data-nodrag>
        <LiveBadge />
        {/* 字号缩放器 */}
        <div className="flex items-center border border-[rgba(94,242,228,.28)] font-mono text-[11px] text-[#5ef2e4]">
          <button onClick={onDecFont} className="px-1.5 py-0.5 hover:bg-[rgba(94,242,228,.12)]" title="缩小字号">A−</button>
          <button onClick={onResetFont} className="border-x border-[rgba(94,242,228,.28)] px-1.5 py-0.5 hover:bg-[rgba(94,242,228,.12)]" title="重置">{pct}%</button>
          <button onClick={onIncFont} className="px-1.5 py-0.5 hover:bg-[rgba(94,242,228,.12)]" title="放大字号">A+</button>
        </div>
        <button className="p-1 text-[#8f8c7a] hover:text-[#5ef2e4]" title="时钟"><Clock className="h-4 w-4" /></button>
        <button onClick={onClose} className="p-1 text-[#8f8c7a] hover:text-[#f75049]" title="关闭"><X className="h-4 w-4" /></button>
      </div>
    </div>
  )
}
