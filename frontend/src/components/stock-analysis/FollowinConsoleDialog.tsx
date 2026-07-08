/**
 * Followin 控制台对话框 —— 个股页「AI 自动预测」旁的 Followin 数据检索面板。
 *
 * 两个 Tab:
 *   - 新闻检索(news): 快速/标准, 搜新闻/评论/研报/推特/媒体
 *   - 决策工具: 指标(metrics 行情/财务/技术) / 信号(signal KOL/大户/内部人/13F)
 * 底部展示可用功能清单(FEATURES)。数据经后端直连 Followin MCP。
 */
import { useState } from 'react'
import { Radio, Search, Loader2, Newspaper, BarChart3, Radar, X, Zap, Gauge } from 'lucide-react'
import { api } from '@/lib/api'

type Tab = 'news' | 'decision'
type DecisionTool = 'metrics' | 'signal'

const FEATURES: { group: string; items: { name: string; desc: string }[] }[] = [
  {
    group: '新闻检索 · 永久免费',
    items: [
      { name: '实时快讯流', desc: '加密+财经+宏观跨市场快讯,多源聚合去重' },
      { name: '深度文章 / 研报', desc: 'Reuters/CNBC/WSJ/Bloomberg + 卖方研报,原文+译文' },
      { name: 'KOL 观点 / 社群', desc: '230+ 美股 KOL × 100+ 加密 KOL 推文 + Telegram/X 讨论' },
    ],
  },
  {
    group: '决策工具 · 按额度',
    items: [
      { name: '美股深度数据', desc: '季度/年度三表 + 估值 + 同行 + 分析师评级/目标价 + EPS 预期' },
      { name: '策略/实盘/内部人', desc: 'KOL 喊单 + 交易员实盘仓位 + 内部人 Form4 + 国会交易 + 13F' },
      { name: '全球行情 / 宏观', desc: '大宗/指数/外汇 7×24 + FRED 宏观序列 + 经济日历' },
    ],
  },
]

export function FollowinConsoleDialog({ open, onClose, symbol, name }: {
  open: boolean
  onClose: () => void
  symbol: string
  name?: string
}) {
  const [tab, setTab] = useState<Tab>('news')
  const [decisionTool, setDecisionTool] = useState<DecisionTool>('metrics')
  const [mode, setMode] = useState<'quick' | 'standard'>('standard')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  if (!open) return null

  const tool: 'news' | 'metrics' | 'signal' = tab === 'news' ? 'news' : decisionTool
  const placeholder = tab === 'news'
    ? '新闻检索 — 例如:AAPL 财报解读 / NVDA 研报 / 比特币行情'
    : decisionTool === 'metrics'
      ? '指标检索 — 例如:NVDA 深度分析 / 苹果 估值 / 比特币 实时价格'
      : '信号检索 — 例如:NVDA KOL 喊单 / 特斯拉 内部人交易 / 13F 持仓'

  const runSearch = async () => {
    const q = query.trim() || (name ? `${name} ${symbol}` : symbol)
    setLoading(true); setError(null); setResult(null)
    try {
      const r = await api.followinConsole({ tool, query: q, mode })
      setResult(r.data)
    } catch (e: any) {
      setError(String(e?.message ?? '查询失败'))
    } finally {
      setLoading(false)
    }
  }

  const items = extractItems(result)
  const quota = result?.meta?.quota

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-3xl max-h-[86vh] flex flex-col rounded-2xl border border-[rgba(94,242,228,.35)] bg-[#0a0e0d] shadow-[0_0_40px_rgba(94,242,228,.12)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头 */}
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[rgba(94,242,228,.18)]">
          <Radio className="h-4 w-4 text-[#5ef2e4]" />
          <span className="text-sm font-bold text-foreground tracking-wide">Followin 数据检索</span>
          <span className="text-[10px] font-mono text-muted">{name || symbol}</span>
          {quota && (
            <span className="text-[10px] font-mono text-[#5ef2e4]/70">配额 {quota.remaining}/{quota.limit}</span>
          )}
          <button onClick={onClose} className="ml-auto text-muted hover:text-foreground transition-colors" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab + 子选项 + 搜索框 */}
        <div className="px-5 pt-3.5 pb-3 space-y-2.5 border-b border-[rgba(94,242,228,.12)]">
          <div className="flex items-center gap-2">
            <TabBtn active={tab === 'news'} onClick={() => setTab('news')} icon={Newspaper} label="新闻检索" />
            <TabBtn active={tab === 'decision'} onClick={() => setTab('decision')} icon={Radar} label="决策工具" />
            <div className="ml-2 h-4 w-px bg-border/40" />
            {tab === 'news' ? (
              <>
                <MiniToggle active={mode === 'quick'} onClick={() => setMode('quick')} icon={Zap} label="快速" />
                <MiniToggle active={mode === 'standard'} onClick={() => setMode('standard')} icon={Gauge} label="标准" />
              </>
            ) : (
              <>
                <MiniToggle active={decisionTool === 'metrics'} onClick={() => setDecisionTool('metrics')} icon={BarChart3} label="指标" />
                <MiniToggle active={decisionTool === 'signal'} onClick={() => setDecisionTool('signal')} icon={Radar} label="信号" />
              </>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted/50" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !loading) runSearch() }}
                placeholder={placeholder}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-[rgba(255,255,255,.04)] border border-[rgba(94,242,228,.25)] text-sm text-foreground placeholder:text-muted/40 focus:outline-none focus:border-[#5ef2e4]/60 transition-colors"
              />
            </div>
            <button
              onClick={runSearch}
              disabled={loading}
              className="h-10 px-5 rounded-xl bg-[#5ef2e4] text-[#062120] text-sm font-bold hover:bg-[#7ff5e8] disabled:opacity-40 transition-colors flex items-center gap-1.5 shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              搜索
            </button>
          </div>
        </div>

        {/* 结果 / 功能清单 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-lg border border-danger/25 bg-danger/[0.06] px-3 py-2 text-xs text-danger mb-3">{error}</div>
          )}
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> 正在从 Followin 检索…
            </div>
          )}
          {!loading && !result && !error && (
            <FeatureShowcase />
          )}
          {!loading && result && (
            <div className="space-y-2">
              {items.length > 0 ? items.map((it, i) => (
                <div key={i} className="rounded-lg border border-border/40 bg-[rgba(255,255,255,.02)] px-3 py-2.5">
                  {it.title && <div className="text-xs font-semibold text-foreground mb-0.5">{it.title}</div>}
                  {it.meta && <div className="text-[10px] text-muted/70 mb-1 font-mono">{it.meta}</div>}
                  {it.body && <div className="text-[11px] text-secondary leading-relaxed line-clamp-4 whitespace-pre-wrap">{it.body}</div>}
                </div>
              )) : (
                <div className="text-xs text-muted">未提取到条目,见下方原始数据。</div>
              )}
              <details className="rounded-lg border border-border/30 bg-base/20 px-3 py-2 mt-2">
                <summary className="cursor-pointer text-[11px] text-muted hover:text-secondary select-none">查看原始 JSON</summary>
                <pre className="mt-2 max-h-72 overflow-auto text-[10px] leading-relaxed text-muted/80 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'bg-[#5ef2e4] text-[#062120]' : 'text-secondary hover:text-foreground hover:bg-white/5'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  )
}

function MiniToggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
        active ? 'bg-[rgba(94,242,228,.15)] text-[#5ef2e4] border border-[rgba(94,242,228,.4)]' : 'text-muted border border-transparent hover:text-secondary'
      }`}
    >
      <Icon className="h-3 w-3" />{label}
    </button>
  )
}

function FeatureShowcase() {
  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted">输入关键词后点「搜索」,数据来自 Followin MCP。以下是可用能力:</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FEATURES.map(g => (
          <div key={g.group} className="rounded-xl border border-border/40 bg-[rgba(255,255,255,.02)] p-3">
            <div className="text-xs font-bold text-[#5ef2e4] mb-2">{g.group}</div>
            <div className="space-y-2">
              {g.items.map(it => (
                <div key={it.name}>
                  <div className="text-[11px] font-medium text-foreground">{it.name}</div>
                  <div className="text-[10px] text-muted leading-tight">{it.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 从 Followin 各工具返回里尽力抽取可展示条目(标题/元信息/正文)。 */
function extractItems(data: any): { title?: string; meta?: string; body?: string }[] {
  if (!data) return []
  // 找到响应里第一个"对象数组"作为条目源(news 文章 / signal 信号 / metrics 记录)
  const arr = findFirstObjectArray(data?.results ?? data)
  if (!arr) return []
  return arr.slice(0, 25).map((o: any) => ({
    title: pick(o, ['title', 'name', 'headline', 'symbol', 'ticker']),
    meta: [pick(o, ['source', 'author', 'exchange', 'period', 'category']), pick(o, ['date', 'time', 'published_at', 'timestamp', 'acceptedDate'])]
      .filter(Boolean).join(' · ') || undefined,
    body: pick(o, ['content', 'text', 'summary', 'description', 'body']) || compactNums(o),
  }))
}

function findFirstObjectArray(node: any, depth = 0): any[] | null {
  if (depth > 5 || node == null) return null
  if (Array.isArray(node)) return node.every(x => x && typeof x === 'object') ? node : null
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
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${v}`)
  return parts.length ? parts.join('  ·  ') : undefined
}
