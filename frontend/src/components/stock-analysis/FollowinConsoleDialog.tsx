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
  TrendingUp, TrendingDown, Activity,
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
  subject?: string  // 最近一次提问认出的实体(BTC/NVDA…), 供推荐问题跟随
}

/** 从提问里认出实体: 优先大写 ticker(BTC/NVDA), 认不出返回 undefined */
function subjectOf(text: string): string | undefined {
  const m = (text || '').match(/(?<![A-Za-z])[A-Z]{2,6}(?![A-Za-z])/)
  return m ? m[0] : undefined
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

const CRYPTO_SYMS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'MATIC', 'TON', 'TRX', 'LTC', 'BCH', 'SHIB', 'PEPE', 'USDT', 'USDC', 'WIF']
function isCryptoName(s: string): boolean {
  const up = (s || '').toUpperCase()
  return CRYPTO_SYMS.some(c => up.includes(c)) || /比特币|以太坊|加密|狗狗/.test(s || '')
}

// 小白引导: 按工具 + 加密/股票 + 当前标的生成「点了就搜」的自然语言问题(不用懂术语)
function suggestFor(tool: ToolId, disp: string, crypto: boolean): string[] {
  if (tool === 'news') return [
    `${disp} 最新消息`,
    `${disp} 今天为什么涨/跌?`,
    '今天市场有什么大新闻?',
    crypto ? '加密市场有什么热点?' : '美联储 / 宏观 最新动态',
  ]
  if (tool === 'signal') {
    // 加密没有 SEC 内部人/13F, 只问 KOL/大户/仓位/情绪
    if (crypto) return [
      `${disp} 大户和 KOL 怎么看?`,
      `${disp} 谁在喊单?`,
      `${disp} 交易员多空仓位`,
      `${disp} 市场情绪如何?`,
    ]
    return [
      `${disp} 内部人最近有买卖吗?`,
      `${disp} 机构(13F)持仓变化`,
      `${disp} KOL / 分析师怎么看?`,
      `谁在买 ${disp}?`,
    ]
  }
  return [
    `${disp} 现在多少钱?`,
    crypto ? `${disp} 技术面怎么样?` : `${disp} 估值贵不贵?`,
    crypto ? `${disp} 最近走势` : `${disp} 最新财报怎么样?`,
    crypto ? `${disp} 关键支撑压力` : `${disp} 分析师目标价`,
  ]
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

  const send = async (override?: string) => {
    if (!active) return
    const q = (override ?? active.input).trim() || (name ? `${name} ${symbol}` : symbol)
    const tool = active.tool
    const userMsg: Msg = { id: uid(), role: 'user', tool, text: q }
    const botMsg: Msg = { id: uid(), role: 'followin', tool, loading: true }
    patch(active.id, t => ({
      ...t,
      input: '',
      title: t.msgs.length === 0 ? q.slice(0, 14) : t.title,
      subject: subjectOf(q) ?? t.subject,  // 认出实体则更新, 供推荐问题跟随
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
  const disp = name || symbol.replace(/\.US$/i, '')

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
          {active.msgs.length === 0 && <EmptyHint tool={active.tool} disp={active.subject || disp} onPick={q => send(q)} />}
          {active.msgs.map(m => (
            m.role === 'user'
              ? <UserBubble key={m.id} msg={m} />
              : <BotBubble key={m.id} msg={m} />
          ))}
        </div>

        {/* 常驻推荐问题(点了就搜, 小白友好) */}
        {active.msgs.length > 0 && (
          <div className="px-4 pt-2 shrink-0">
            <SuggestChips tool={active.tool} disp={active.subject || disp} onPick={q => send(q)} compact />
          </div>
        )}

        {/* 输入区 */}
        <div className="px-4 py-3 border-t border-[rgba(94,242,228,.15)] shrink-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* 主类目: 新闻检索 / 决策工具(与旧版一致) */}
            <GroupBtn active={active.tool === 'news'} onClick={() => patch(active.id, t => ({ ...t, tool: 'news' }))} icon={Newspaper} label="新闻检索" />
            <GroupBtn active={active.tool !== 'news'} onClick={() => patch(active.id, t => ({ ...t, tool: t.tool === 'news' ? 'metrics' : t.tool }))} icon={Radar} label="决策工具" />
            <div className="h-4 w-px bg-border/40 mx-1" />
            {/* 子选项: 新闻→快速/标准; 决策工具→指标/信号 */}
            {active.tool === 'news' ? (
              <>
                <MiniToggle active={active.mode === 'quick'} onClick={() => patch(active.id, t => ({ ...t, mode: 'quick' }))} icon={Zap} label="快速" />
                <MiniToggle active={active.mode === 'standard'} onClick={() => patch(active.id, t => ({ ...t, mode: 'standard' }))} icon={Gauge} label="标准" />
              </>
            ) : (
              <>
                <MiniToggle active={active.tool === 'metrics'} onClick={() => patch(active.id, t => ({ ...t, tool: 'metrics' }))} icon={BarChart3} label="指标" />
                <MiniToggle active={active.tool === 'signal'} onClick={() => patch(active.id, t => ({ ...t, tool: 'signal' }))} icon={Activity} label="信号" />
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
              onClick={() => send()}
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

function GroupBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      active ? 'bg-[#5ef2e4] text-[#062120]' : 'text-secondary hover:text-foreground hover:bg-white/5'
    }`}>
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
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

function EmptyHint({ tool, disp, onPick }: { tool: ToolId; disp: string; onPick: (q: string) => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-8">
      <Radio className="h-8 w-8 text-[#5ef2e4]/40" />
      <div className="text-sm text-secondary">不知道问什么?点下面的问题直接搜 👇</div>
      <div className="text-[11px] text-muted max-w-sm leading-relaxed">
        先在下方选「新闻检索 / 决策工具」,再点一个问题(也可自己输入)。右上「+」可像浏览器一样开多个会话。
      </div>
      <SuggestChips tool={tool} disp={disp} onPick={onPick} />
    </div>
  )
}

/** 小白引导: 按工具+标的生成「点了就搜」的问题气泡 */
function SuggestChips({ tool, disp, onPick, compact }: { tool: ToolId; disp: string; onPick: (q: string) => void; compact?: boolean }) {
  const list = suggestFor(tool, disp, isCryptoName(disp))
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? '' : 'justify-center max-w-lg mt-1'}`}>
      {!compact && <span className="w-full text-[10px] text-muted/60 mb-0.5">试试这些「{TOOL_META[tool].label}」问题:</span>}
      {list.map(q => (
        <button
          key={q}
          onClick={() => onPick(q)}
          className="inline-flex items-center px-2.5 py-1 rounded-full border border-[rgba(94,242,228,.3)] bg-[rgba(94,242,228,.05)] text-[11px] text-[#8ff5e8] hover:bg-[rgba(94,242,228,.15)] transition-colors"
        >
          {q}
        </button>
      ))}
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
    meta: [
      pick(o, ['source_name', 'source', 'author', 'exchange', 'category', 'side']),
      fmtTime(pickRaw(o, ['published_ts', 'timestamp', 'time', 'date', 'published_at', 'acceptedDate', 'created_at', 'updated_at'])),
    ].filter(Boolean).join(' · ') || undefined,
    body: pick(o, ['content', 'summary', 'description', 'body', 'text', 'reason']) || compactNums(o),
  }))
}

/** 取原始值(数字或字符串, 不转 String) */
function pickRaw(o: any, keys: string[]): any {
  for (const k of keys) {
    const v = o?.[k]
    if (v != null && v !== '') return v
  }
  return undefined
}

/** 时间字段格式化: 支持 epoch 秒/毫秒 与可读日期字符串 → 「MM-DD HH:mm」 */
function fmtTime(v: any): string | undefined {
  if (v == null || v === '') return undefined
  let ms: number | null = null
  const n = typeof v === 'number' ? v : (/^\d+$/.test(String(v)) ? Number(v) : NaN)
  if (isFinite(n)) ms = n > 1e12 ? n : n > 1e9 ? n * 1000 : null
  if (ms == null) {
    const t = Date.parse(String(v))
    if (isFinite(t)) ms = t
  }
  if (ms == null) return String(v)
  try {
    return new Date(ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return undefined }
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
