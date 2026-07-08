/**
 * AI 自动预测可视化面板 — K 线下方的新手友好报告(web3 motion 风格)。
 *
 * 结构: 结论横幅(观点徽章+一句话+置信度) → 关键点位卡片行 → 技术信号灯 →
 *       风险/机会双列 → 操作建议(持仓/未持仓) → 免责行。
 * 同时导出 predictionToLevels(): 把预测点位转成 K 线图叠加线。
 */
import { motion } from 'framer-motion'
import { Loader2, Minus, ShieldAlert, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import type { PredictResponse, StockPrediction } from '@/lib/api'
import type { LevelLine } from '@/components/indices/levelOverlays'

// ===== 点位配色(图表线与卡片共用的单一数据源) =====
const LV_COLORS = {
  entry: '#2ecc80',      // 进场/加仓 - 绿
  exit: '#f0923c',       // 离场/减仓 - 橙
  stop: '#ef4444',       // 止损 - 红
  breakout: '#e8c84d',   // 突破确认 - 金
  rebound: '#4dd8e8',    // 反弹目标 - 青
  pullback: '#38bdf8',   // 回踩观察 - 天蓝
  support: '#2ecc80',    // 支撑区 - 绿
  breakdown: '#e86a8a',  // 跌破目标 - 品红
} as const

interface FlatLevel {
  label: string
  price: number
  color: string
  note: string
}

/** 预测点位拍平成统一列表(图表线与卡片共用) */
export function flattenPredLevels(p: StockPrediction | null): FlatLevel[] {
  if (!p) return []
  const out: FlatLevel[] = []
  const lv = p.levels
  lv.entry.forEach((pt, i) => out.push({
    label: lv.entry.length > 1 ? `进场${i + 1}档` : '进场', price: pt.price, color: LV_COLORS.entry, note: pt.note,
  }))
  lv.exit.forEach((pt, i) => out.push({
    label: lv.exit.length > 1 ? `离场${i + 1}档` : '离场', price: pt.price, color: LV_COLORS.exit, note: pt.note,
  }))
  if (lv.stop_loss) out.push({ label: '止损', price: lv.stop_loss.price, color: LV_COLORS.stop, note: lv.stop_loss.note })
  if (lv.breakout) out.push({ label: '突破点', price: lv.breakout.price, color: LV_COLORS.breakout, note: lv.breakout.note })
  if (lv.rebound_target) out.push({ label: '反弹目标', price: lv.rebound_target.price, color: LV_COLORS.rebound, note: lv.rebound_target.note })
  if (lv.pullback_watch) out.push({ label: '回踩观察', price: lv.pullback_watch.price, color: LV_COLORS.pullback, note: lv.pullback_watch.note })
  if (lv.support_zone) {
    out.push({ label: '支撑区顶', price: lv.support_zone.high, color: LV_COLORS.support, note: '' })
    out.push({ label: '支撑区底', price: lv.support_zone.low, color: LV_COLORS.support, note: '' })
  }
  if (lv.breakdown_target) out.push({ label: '跌破目标', price: lv.breakdown_target.price, color: LV_COLORS.breakdown, note: lv.breakdown_target.note })
  return out
}

/** 预测点位 → K 线图水平叠加线 */
export function predictionToLevels(p: StockPrediction | null): LevelLine[] {
  return flattenPredLevels(p).map(l => ({ value: l.price, label: `AI·${l.label}`, color: l.color }))
}

// ===== 信号灯语义 =====
const SIG_GOOD = new Set(['金叉', '超卖', '突破上轨'])
const SIG_BAD = new Set(['死叉', '超买', '跌破下轨'])
const SIG_NAMES: Record<string, string> = { macd: 'MACD', rsi: 'RSI', kdj: 'KDJ', boll: '布林带' }

const STANCE_STYLE = {
  看多: { color: '#2ecc80', bg: 'rgba(46,204,128,.12)', Icon: TrendingUp },
  看空: { color: '#e05a4a', bg: 'rgba(224,90,74,.12)', Icon: TrendingDown },
  中性: { color: '#8a91a8', bg: 'rgba(138,145,168,.12)', Icon: Minus },
} as const

interface Props {
  data: PredictResponse | null
  loading: boolean
}

export function AiPredictPanel({ data, loading }: Props) {
  if (loading) return <PanelSkeleton />
  if (!data) return null

  const p = data.prediction
  const close = data.close
  const st = STANCE_STYLE[p.stance] ?? STANCE_STYLE.中性
  const flat = flattenPredLevels(p)
  const isFollowin = data.source === 'followin'
  const srcLabel = isFollowin ? 'Followin 实时' : 'global-stock-data'
  const srcFooter = isFollowin ? 'Followin MCP 实时数据' : 'global-stock-data 技能'

  const pct = (v: number) => {
    if (!close) return ''
    const d = (v / close - 1) * 100
    return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="mt-3 rounded-xl border border-border/50 overflow-hidden"
      style={{ background: 'linear-gradient(160deg, rgba(20,24,54,.72), rgba(10,13,32,.9))' }}
    >
      {/* 结论横幅 */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border/40">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#b18cff]">
          <Sparkles className="h-3.5 w-3.5" /> AI 自动预测
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold"
          style={{ color: st.color, backgroundColor: st.bg, border: `1px solid ${st.color}55` }}
        >
          <st.Icon className="h-4 w-4" />
          {p.stance}
        </span>
        <span className="text-sm text-foreground font-medium">{p.one_liner}</span>
        {p.confidence != null && (
          <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-muted shrink-0">
            信号一致度
            <span className="relative h-1.5 w-24 rounded-full bg-white/10 overflow-hidden">
              <motion.span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ backgroundColor: st.color }}
                initial={{ width: 0 }}
                animate={{ width: `${p.confidence}%` }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
              />
            </span>
            <span className="font-mono font-bold text-foreground">{p.confidence}</span>
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* 关键点位卡片 */}
        {flat.length > 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
            {flat.map((l, i) => (
              <motion.div
                key={`${l.label}-${l.price}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.05 * i }}
                title={l.note || l.label}
                className="rounded-lg border px-2.5 py-2"
                style={{ borderColor: l.color + '44', backgroundColor: l.color + '0f' }}
              >
                <div className="flex items-center gap-1.5 text-[10px]" style={{ color: l.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </div>
                <div className="mt-0.5 font-mono text-sm font-bold text-foreground">{l.price.toFixed(2)}</div>
                <div className="text-[9px] font-mono text-muted">{pct(l.price)}</div>
              </motion.div>
            ))}
          </div>
        )}

        {/* 技术信号灯 */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-muted mr-1">技术信号</span>
          {(['macd', 'rsi', 'kdj', 'boll'] as const).map(k => {
            const v = p.signals[k] || '中性'
            const color = SIG_GOOD.has(v) ? '#2ecc80' : SIG_BAD.has(v) ? '#e05a4a' : '#8a91a8'
            return (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium"
                style={{ borderColor: color + '44', backgroundColor: color + '12', color }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
                {SIG_NAMES[k]} · {v}
              </span>
            )
          })}
        </div>

        {/* 风险 / 机会 */}
        {(p.risks.length > 0 || p.opportunities.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {p.risks.length > 0 && (
              <div className="rounded-lg border border-bear/25 bg-bear/5 px-3 py-2">
                <div className="text-[10px] font-semibold text-bear mb-1">⚠ 主要风险</div>
                {p.risks.map((r, i) => (
                  <div key={i} className="text-[11px] text-secondary leading-relaxed">· {r}</div>
                ))}
              </div>
            )}
            {p.opportunities.length > 0 && (
              <div className="rounded-lg border border-bull/25 bg-bull/5 px-3 py-2">
                <div className="text-[10px] font-semibold text-bull mb-1">✦ 主要机会</div>
                {p.opportunities.map((o, i) => (
                  <div key={i} className="text-[11px] text-secondary leading-relaxed">· {o}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 操作建议 */}
        {(p.advice.holding || p.advice.no_position) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {p.advice.holding && (
              <div className="rounded-lg border border-border/50 bg-base/30 px-3 py-2">
                <div className="text-[10px] font-semibold text-foreground mb-1">已持仓怎么办</div>
                <div className="text-[11px] text-secondary leading-relaxed">{p.advice.holding}</div>
              </div>
            )}
            {p.advice.no_position && (
              <div className="rounded-lg border border-border/50 bg-base/30 px-3 py-2">
                <div className="text-[10px] font-semibold text-foreground mb-1">没持仓怎么办</div>
                <div className="text-[11px] text-secondary leading-relaxed">{p.advice.no_position}</div>
              </div>
            )}
          </div>
        )}

        {/* 研究报告全文(折叠) */}
        {data.report && (
          <details className="rounded-lg border border-border/40 bg-base/20 px-3 py-2 group">
            <summary className="cursor-pointer text-[11px] font-medium text-secondary hover:text-foreground transition-colors select-none">
              📄 查看完整研究报告({srcLabel})
            </summary>
            <div className="mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-secondary border-t border-border/30 pt-2">
              {data.report}
            </div>
          </details>
        )}

        {/* 免责 */}
        <div className="flex items-center gap-1.5 text-[9px] text-muted/70 pt-1 border-t border-border/30">
          <ShieldAlert className="h-3 w-3 shrink-0" />
          由 Claude Code · {srcFooter}生成, 仅供参考, 不构成投资建议 · 生成于 {new Date(data.generated_at).toLocaleString('zh-CN')}
        </div>
      </div>
    </motion.div>
  )
}

/** 生成中的骨架屏 */
function PanelSkeleton() {
  return (
    <div className="mt-3 rounded-xl border border-border/50 bg-base/20 px-4 py-4">
      <div className="flex items-center gap-2 text-[11px] text-[#b18cff] font-medium mb-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Claude Code 正在运行 global-stock-data 技能拉取最新数据并生成报告…(约 2-5 分钟, 可继续浏览其他内容)
      </div>
      <div className="space-y-2">
        {[64, 88, 76].map((w, i) => (
          <div key={i} className="h-3 rounded bg-white/5 animate-pulse" style={{ width: `${w}%` }} />
        ))}
        <div className="grid gap-2 pt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))' }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}
