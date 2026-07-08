/**
 * Followin 数据检索 —— 浏览器式多标签 + 对话流。
 *
 * - 顶部像浏览器一样多 tab(+ 新建 / × 关闭),每个 tab 一条独立会话。
 * - 每 tab 是一问一答的对话:你的提问气泡 + Followin 结果气泡(多轮)。
 * - 输入区选工具:新闻检索(news) / 指标(metrics) / 信号(signal),按工具智能渲染结果。
 * 数据经后端直连 Followin MCP。会话在页面内跨「开关对话框」保留(内存缓存)。
 */
import { useEffect, useRef, useState } from 'react'
import {
  Radio, Search, Loader2, Newspaper, BarChart3, Radar, X, Zap, Gauge, Plus,
  TrendingUp, TrendingDown,
} from 'lucide-react'
import { api } from '@/lib/api'

type ToolId = 'news' | 'metrics' | 'signal'

interface Msg {
  id: string
  role: 'user' | 'followin'
  tool: ToolId
  text?: string          // 用户提问
  data?: any             // followin 结果
  error?: string
  loading?: boolean
}

interface TabState {
  id: string
  title: string
  tool: ToolId
  mode: 'quick' | 'standard'
  input: string
  msgs: Msg[]
}

// 跨「开关对话框」保留会话(页面内内存缓存)
let TAB_CACHE: TabState[] | null = null

const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const freshTab = (): TabState => ({ id: uid(), title: '新会话', tool: 'metrics', mode: 'standard', input: '', msgs: [] })

const TOOL_META: Record<ToolId, { label: string; icon: any; ph: string }> = {
  news: { label: '新闻', icon: Newspaper, ph: '问新闻 — 例如:NVDA 财报解读 / 比特币最新消息' },
  metrics: { label: '指标', icon: BarChart3, ph: '问行情/财务 — 例如:NVDA 现价 / 苹果 估值 / 特斯拉三表' },
  signal: { label: '信号', icon: Radar, ph: '问信号 — 例如:NVDA KOL 喊单 / 佩洛西 交易 / 13F 持仓' },
}

export function FollowinConsoleDialog({ open, onClose, symbol, name }: {
  open: boolean
  onClose: () => void
  symbol: string
  name?: string
}) {
  const [tabs, setTabs] = useState<TabState[]>(() => TAB_CACHE ?? [freshTab()])
  const [activeId, setActiveId] = useState<string>(() => (TAB_CACHE?.[0]?.id) ?? tabs[0].id)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { TAB_CACHE = tabs }, [tabs])

  const active = tabs.find(t => t.id === activeId) ?? tabs[0]

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [active?.msgs.length, activeId])

  if (!open) return null

  const patch = (id: string, fn: (t: TabState) => TabState) =>
    setTabs(ts => ts.map(t => (t.id === id ? fn(t) : t)))

  const addTab = () => {
    const t = freshTab()
    setTabs(ts => [...ts, t]); setActiveId(t.id)
  }
  const closeTab = (id: string) => {
    setTabs(ts => {
      const next = ts.filter(t => t.id !== id)
      const arr = next.length ? next : [freshTab()]
      if (id === activeId) setActiveId(arr[arr.length - 1].id)
      return arr
    })
  }

  const send = async () => {
    if (!active) return
    const q = active.input.trim() || (name ? `${name} ${symbol}` : symbol)
    const tool = active.tool
    const userMsg: Msg = { id: uid(), role: 'user', tool, text: q }
    const botMsg: Msg = { id: uid(), role: 'followin', tool, loading: true }
    patch(active.id, t => ({
      ...t,
      input: '',
      title: t.msgs.length === 0 ? q.slice(0, 14) : t.title,
      msgs: [...t.msgs, userMsg, botMsg],
    }))
    try {
      const r = await api.followinConsole({ tool, query: q, mode: active.mode })
      patch(active.id, t => ({ ...t, msgs: t.msgs.map(m => (m.id === botMsg.id ? { ...m, loading: false, data: r.data } : m)) }))
    } catch (e: any) {
      patch(active.id, t => ({ ...t, msgs: t.msgs.map(m => (m.id === botMsg.id ? { ...m, loading: false, error: String(e?.message ?? '查询失败') } : m)) }))
    }
  }

  const anyLoading = active?.msgs.some(m => m.loading)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl h-[86vh] flex flex-col rounded-2xl border border-[rgba(94,242,228,.35)] bg-[#0a0e0d] shadow-[0_0_40px_rgba(94,242,228,.12)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头 */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[rgba(94,242,228,.18)] shrink-0">
          <Radio className="h-4 w-4 text-[#5ef2e4]" />
          <span className="text-sm font-bold text-foreground tracking-wide">Followin 数据检索</span>
          <span className="text-[10px] font-mono text-muted">{name || symbol}</span>
          <button onClick={onClose} className="ml-auto text-muted hover:text-foreground transition-colors" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 浏览器式 tab 条 */}
        <div className="flex items-stretch gap-1 px-2 pt-2 border-b border-[rgba(94,242,228,.12)] shrink-0 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={`group flex items-center gap-1.5 max-w-[160px] px-3 py-1.5 rounded-t-lg text-xs transition-colors shrink-0 ${
                t.id === activeId
                  ? 'bg-[rgba(94,242,228,.1)] text-[#5ef2e4] border-t border-x border-[rgba(94,242,228,.3)]'
                  : 'text-muted hover:text-secondary hover:bg-white/5'
              }`}
            >
              <span className="truncate">{t.title}</span>
              <span
                onClick={e => { e.stopPropagation(); closeTab(t.id) }}
                className="opacity-40 group-hover:opacity-100 hover:text-danger transition-opacity"
                title="关闭标签"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
          <button onClick={addTab} title="新建会话" className="px-2 py-1.5 text-muted hover:text-[#5ef2e4] transition-colors shrink-0">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* 对话流 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {active.msgs.length === 0 && <EmptyHint />}
          {active.msgs.map(m => (
            m.role === 'user'
              ? <UserBubble key={m.id} msg={m} />
              : <BotBubble key={m.id} msg={m} />
          ))}
        </div>

        {/* 输入区 */}
        <div className="px-4 py-3 border-t border-[rgba(94,242,228,.15)] shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            {(Object.keys(TOOL_META) as ToolId[]).map(id => {
              const M = TOOL_META[id]
              const on = active.tool === id
              return (
                <button
                  key={id}
                  onClick={() => patch(active.id, t => ({ ...t, tool: id }))}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    on ? 'bg-[rgba(94,242,228,.15)] text-[#5ef2e4] border border-[rgba(94,242,228,.4)]' : 'text-muted border border-transparent hover:text-secondary'
                  }`}
                >
                  <M.icon className="h-3 w-3" />{M.label}
                </button>
              )
            })}
            {active.tool === 'news' && (
              <>
                <div className="h-4 w-px bg-border/40 mx-1" />
                <MiniToggle active={active.mode === 'quick'} onClick={() => patch(active.id, t => ({ ...t, mode: 'quick' }))} icon={Zap} label="快速" />
                <MiniToggle active={active.mode === 'standard'} onClick={() => patch(active.id, t => ({ ...t, mode: 'standard' }))} icon={Gauge} label="标准" />
              </>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted/50" />
              <input
                value={active.input}
                onChange={e => patch(active.id, t => ({ ...t, input: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && !anyLoading) send() }}
                placeholder={TOOL_META[active.tool].ph}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[rgba(255,255,255,.04)] border border-[rgba(94,242,228,.25)] text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-[#5ef2e4]/60 transition-colors"
              />
            </div>
            <button
              onClick={send}
              disabled={anyLoading}
              className="h-10 px-5 rounded-xl bg-[#5ef2e4] text-[#062120] text-sm font-bold hover:bg-[#7ff5e8] disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
            >
              {anyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniToggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
      active ? 'bg-[rgba(94,242,228,.15)] text-[#5ef2e4] border border-[rgba(94,242,228,.4)]' : 'text-muted border border-transparent hover:text-secondary'
    }`}>
      <Icon className="h-3 w-3" />{label}
    </button>
  )
}

function UserBubble({ msg }: { msg: Msg }) {
  const M = TOOL_META[msg.tool]
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-[#5ef2e4] text-[#062120] px-3.5 py-2">
        <div className="flex items-center gap-1 text-[9px] font-semibold opacity-70 mb-0.5"><M.icon className="h-2.5 w-2.5" />{M.label}</div>
        <div className="text-[13px] leading-snug">{msg.text}</div>
      </div>
    </div>
  )
}

function BotBubble({ msg }: { msg: Msg }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-[rgba(255,255,255,.03)] border border-border/40 px-3.5 py-2.5 w-full">
        {msg.loading ? (
          <div className="flex items-center gap-2 text-xs text-muted py-1"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在从 Followin 检索…</div>
        ) : msg.error ? (
          <div className="text-xs text-danger">{msg.error}</div>
        ) : (
          <ResultView tool={msg.tool} data={msg.data} />
        )}
      </div>
    </div>
  )
}

// ===== 结果渲染:按工具智能展示 =====

function ResultView({ tool, data }: { tool: ToolId; data: any }) {
  const quota = data?.meta?.quota
  return (
    <div className="space-y-2">
      {tool === 'metrics' ? <MetricsView data={data} /> : <ItemsView data={data} />}
      <div className="flex items-center gap-3 pt-1">
        {quota && <span className="text-[9px] font-mono text-[#5ef2e4]/60">配额 {quota.remaining}/{quota.limit}</span>}
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted/60 hover:text-muted select-none">原始 JSON</summary>
          <pre className="mt-1 max-h-64 overflow-auto text-[9px] leading-relaxed text-muted/70 whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
        </details>
      </div>
    </div>
  )
}

const fmtNum = (v: any) => {
  const n = Number(v)
  if (!isFinite(n)) return String(v ?? '—')
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}万亿`
  if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)}亿`
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function MetricsView({ data }: { data: any }) {
  const market = data?.results?.market ?? {}
  const snap = market.snapshot?.[0]
  const hist = market.history?.[0]
  const fund = data?.results?.fundamentals?.concise?.[0]
  const lq = fund?.latest_quarter
  const tc = fund?.consensus_price
  const hasAny = snap || hist || lq || tc

  if (!hasAny) return <ItemsView data={data} />

  const price = snap?.price ?? hist?.close
  const prev = snap?.previousClose
  const chg = price != null && prev != null ? Number(price) - Number(prev) : null
  const chgPct = chg != null && prev ? (chg / Number(prev)) * 100 : null
  const up = (chg ?? 0) >= 0

  return (
    <div className="space-y-2.5">
      {(snap || hist) && (
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{snap?.name || hist?.symbol || '行情'}</span>
            {snap?.exchange && <span className="text-[9px] font-mono text-muted">{snap.exchange}</span>}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-xl font-mono font-bold text-foreground">{fmtNum(price)}</span>
            {chg != null && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-bull' : 'text-bear'}`}>
                {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {up ? '+' : ''}{chg.toFixed(2)} ({chgPct != null ? `${up ? '+' : ''}${chgPct.toFixed(2)}%` : '—'})
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-2 text-[11px]">
            <Kv k="开" v={snap?.open ?? hist?.open} />
            <Kv k="高" v={snap?.dayHigh ?? hist?.high} />
            <Kv k="低" v={snap?.dayLow ?? hist?.low} />
            <Kv k="昨收" v={prev} />
            <Kv k="总市值" v={snap?.marketCap} fmt />
            <Kv k="52周高" v={snap?.yearHigh} />
            <Kv k="52周低" v={snap?.yearLow} />
            <Kv k="成交量" v={snap?.volume ?? hist?.volume} fmt />
          </div>
        </div>
      )}
      {lq && (
        <div className="rounded-lg border border-border/40 bg-white/[0.02] px-2.5 py-2">
          <div className="text-[10px] font-semibold text-[#5ef2e4] mb-1">最新季度({lq.period} {lq.fiscalYear})</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
            <Kv k="营收" v={lq.revenue} fmt />
            <Kv k="净利润" v={lq.netIncome} fmt />
            <Kv k="毛利" v={lq.grossProfit} fmt />
            <Kv k="EPS" v={lq.eps} />
            <Kv k="经营利润" v={lq.operatingIncome} fmt />
            <Kv k="EBITDA" v={lq.ebitda} fmt />
          </div>
        </div>
      )}
      {tc && (
        <div className="rounded-lg border border-border/40 bg-white/[0.02] px-2.5 py-2">
          <div className="text-[10px] font-semibold text-[#5ef2e4] mb-1">分析师目标价</div>
          <div className="grid grid-cols-3 gap-x-3 text-[11px]">
            <Kv k="低" v={tc.targetLow} />
            <Kv k="中位" v={tc.targetMedian ?? tc.targetConsensus} />
            <Kv k="高" v={tc.targetHigh} />
          </div>
        </div>
      )}
    </div>
  )
}

function Kv({ k, v, fmt }: { k: string; v: any; fmt?: boolean }) {
  if (v == null || v === '') return null
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted/70">{k}</span>
      <span className="font-mono text-secondary">{fmt ? fmtNum(v) : (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v))}</span>
    </div>
  )
}

/** news / signal: 抽取对象数组渲染成条目卡 */
function ItemsView({ data }: { data: any }) {
  const items = extractItems(data)
  if (items.length === 0) return <div className="text-xs text-muted">未提取到可展示条目,见下方原始 JSON。</div>
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-border/30 bg-white/[0.015] px-2.5 py-2">
          {it.title && <div className="text-[12px] font-semibold text-foreground mb-0.5">{it.title}</div>}
          {it.meta && <div className="text-[9px] text-muted/70 mb-1 font-mono">{it.meta}</div>}
          {it.body && <div className="text-[11px] text-secondary leading-relaxed line-clamp-5 whitespace-pre-wrap">{it.body}</div>}
        </div>
      ))}
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-2 py-10">
      <Radio className="h-8 w-8 text-[#5ef2e4]/40" />
      <div className="text-sm text-secondary">在下方选工具、输入问题,开始一段 Followin 检索对话</div>
      <div className="text-[11px] text-muted max-w-sm leading-relaxed">
        新闻检索(快讯/研报/推特) · 指标(现价/财务三表/估值/目标价) · 信号(KOL 喊单/内部人/13F)。
        右上「+」可像浏览器一样开多个会话。
      </div>
    </div>
  )
}

// ===== 通用条目抽取(news/signal) =====

function extractItems(data: any): { title?: string; meta?: string; body?: string }[] {
  if (!data) return []
  const arr = findFirstObjectArray(data?.results ?? data)
  if (!arr) return []
  return arr.slice(0, 25).map((o: any) => ({
    title: pick(o, ['title', 'headline', 'name', 'symbol', 'ticker', 'text']),
    meta: [pick(o, ['source', 'author', 'exchange', 'category', 'side', 'period']), pick(o, ['date', 'time', 'published_at', 'timestamp', 'acceptedDate', 'created_at'])]
      .filter(Boolean).join(' · ') || undefined,
    body: pick(o, ['content', 'summary', 'description', 'body', 'text', 'reason']) || compactNums(o),
  }))
}

function findFirstObjectArray(node: any, depth = 0): any[] | null {
  if (depth > 5 || node == null) return null
  if (Array.isArray(node)) return node.length && node.every(x => x && typeof x === 'object') ? node : null
  if (typeof node === 'object') {
    for (const v of Object.values(node)) {
      const r = findFirstObjectArray(v, depth + 1)
      if (r && r.length) return r
    }
  }
  return null
}

function pick(o: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o?.[k]
    if (v != null && v !== '' && (typeof v === 'string' || typeof v === 'number')) return String(v)
  }
  return undefined
}

function compactNums(o: any): string | undefined {
  if (!o || typeof o !== 'object') return undefined
  const parts = Object.entries(o)
    .filter(([k, v]) => !k.startsWith('_') && (typeof v === 'number' || typeof v === 'string'))
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${v}`)
  return parts.length ? parts.join('  ·  ') : undefined
}
