/**
 * Followin 智能体控制台 —— 快速取数结果渲染。
 * 移植自旧版:按工具智能展示(metrics=行情/财务面板;news/signal=条目卡),
 * 底部保留原始 JSON 折叠。样式改为 Cyberpunk 黄/青。
 */
import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { ToolCat } from './types'

export function FastResult({ tool, data }: { tool: ToolCat; data: any }) {
  const quota = data?.meta?.quota
  return (
    <div className="space-y-2">
      {tool === 'metrics' ? <MetricsView data={data} /> : <ItemsView data={data} />}
      <div className="flex items-center gap-3 pt-1">
        {quota && <span className="font-mono text-[9px] text-[#5ef2e4]/60">配额 {quota.remaining}/{quota.limit}</span>}
        <details className="text-[10px]">
          <summary className="cursor-pointer select-none text-[#6a6754] hover:text-[#8f8c7a]">原始 JSON</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap text-[9px] leading-relaxed text-[#8f8c7a]">{JSON.stringify(data, null, 2)}</pre>
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
  const ne = fund?.next_earnings_estimate
  const hasAny = snap || hist || lq || tc || ne
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
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-semibold text-[#e8e6d8]">{snap?.name || hist?.symbol || '行情'}</span>
            {snap?.exchange && <span className="font-mono text-[9px] text-[#8f8c7a]">{snap.exchange}</span>}
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="font-mono text-xl font-bold text-[#e8e6d8]">{fmtNum(price)}</span>
            {chg != null && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-[#5ef2e4]' : 'text-[#f75049]'}`}>
                {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {up ? '+' : ''}{chg.toFixed(2)} ({chgPct != null ? `${up ? '+' : ''}${chgPct.toFixed(2)}%` : '—'})
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] sm:grid-cols-4">
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
        <Panel title={`最新季度(${lq.period} ${lq.fiscalYear})`}>
          <Kv k="营收" v={lq.revenue} fmt /><Kv k="净利润" v={lq.netIncome} fmt /><Kv k="毛利" v={lq.grossProfit} fmt />
          <Kv k="EPS" v={lq.eps} /><Kv k="经营利润" v={lq.operatingIncome} fmt /><Kv k="EBITDA" v={lq.ebitda} fmt />
        </Panel>
      )}
      {tc && (
        <Panel title="分析师目标价" cols={3}>
          <Kv k="低" v={tc.targetLow} /><Kv k="中位" v={tc.targetMedian ?? tc.targetConsensus} /><Kv k="高" v={tc.targetHigh} />
        </Panel>
      )}
      {ne && (
        <Panel title={`下季预估${ne.date ? `(${ne.date})` : ''}`} cols={2}>
          <Kv k="预估 EPS" v={ne.epsEstimated} /><Kv k="预估营收" v={ne.revenueEstimated} fmt />
        </Panel>
      )}
    </div>
  )
}

function Panel({ title, children, cols = 3 }: { title: string; children: ReactNode; cols?: number }) {
  return (
    <div className="border border-[rgba(213,240,33,.14)] bg-[rgba(255,255,255,.02)] px-2.5 py-2">
      <div className="mb-1 text-[10px] font-semibold text-[#5ef2e4]">{title}</div>
      <div className={`grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] ${cols === 3 ? 'sm:grid-cols-3' : ''}`}>{children}</div>
    </div>
  )
}

function Kv({ k, v, fmt }: { k: string; v: any; fmt?: boolean }) {
  if (v == null || v === '') return null
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[#8f8c7a]">{k}</span>
      <span className="font-mono text-[#c8c5b4]">{fmt ? fmtNum(v) : (typeof v === 'number' ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v))}</span>
    </div>
  )
}

function ItemsView({ data }: { data: any }) {
  const items = extractItems(data)
  if (items.length === 0) return <div className="text-xs text-[#8f8c7a]">未提取到可展示条目,见下方原始 JSON。</div>
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="border border-[rgba(213,240,33,.12)] bg-[rgba(255,255,255,.015)] px-2.5 py-2">
          {it.title && <div className="mb-0.5 text-[12px] font-semibold text-[#e8e6d8]">{it.title}</div>}
          {it.meta && <div className="mb-1 font-mono text-[9px] text-[#8f8c7a]">{it.meta}</div>}
          {it.body && <div className="line-clamp-5 whitespace-pre-wrap text-[11px] leading-relaxed text-[#c8c5b4]">{it.body}</div>}
        </div>
      ))}
    </div>
  )
}

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

function pickRaw(o: any, keys: string[]): any {
  for (const k of keys) { const v = o?.[k]; if (v != null && v !== '') return v }
  return undefined
}

function fmtTime(v: any): string | undefined {
  if (v == null || v === '') return undefined
  let ms: number | null = null
  const n = typeof v === 'number' ? v : (/^\d+$/.test(String(v)) ? Number(v) : NaN)
  if (isFinite(n)) ms = n > 1e12 ? n : n > 1e9 ? n * 1000 : null
  if (ms == null) { const t = Date.parse(String(v)); if (isFinite(t)) ms = t }
  if (ms == null) return String(v)
  try {
    return new Date(ms).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return undefined }
}

function findFirstObjectArray(node: any, depth = 0): any[] | null {
  if (depth > 5 || node == null) return null
  if (Array.isArray(node)) return node.length && node.every(x => x && typeof x === 'object') ? node : null
  if (typeof node === 'object') {
    for (const v of Object.values(node)) { const r = findFirstObjectArray(v, depth + 1); if (r && r.length) return r }
  }
  return null
}

function pick(o: any, keys: string[]): string | undefined {
  for (const k of keys) { const v = o?.[k]; if (v != null && v !== '' && (typeof v === 'string' || typeof v === 'number')) return String(v) }
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
