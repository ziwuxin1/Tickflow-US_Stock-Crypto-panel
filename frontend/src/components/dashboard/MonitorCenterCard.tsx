import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { api, type AlertEvent } from '@/lib/api'
import { cn } from '@/lib/cn'
import { fmtPct } from '@/lib/format'
import { cnSignal } from '@/lib/signals'
import { StockPreviewDialog } from '@/components/StockPreviewDialog'
import { DotGridEmpty } from './DotGridEmpty'
import { GlassCard } from './GlassCard'
import { MONO, TXT_CARD_TITLE, TXT_WEAK } from './tokens'
import { fmtPrice } from './utils'

const SOURCE_BADGE: Record<string, string> = {
  strategy: 'bg-amber-400/10 text-amber-400',
  signal: 'bg-accent/10 text-accent',
  price: 'bg-emerald-400/10 text-emerald-400',
  market: 'bg-purple-500/10 text-purple-400',
}
const SOURCE_LABEL: Record<string, string> = {
  strategy: '策略', signal: '信号', price: '价格', market: '异动',
}
const SEVERITY_BAR: Record<string, string> = {
  info: 'bg-accent/40', warn: 'bg-warning', critical: 'bg-danger',
}

function fmtTs(ts?: number) {
  return ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}

/** 触发记录列表 — 行为与旧看板 MonitorWidget 一致, 空态换点阵网格 */
function AlertList() {
  const [previewEv, setPreviewEv] = useState<AlertEvent | null>(null)
  const alerts = useQuery({
    queryKey: ['alerts', ''],
    queryFn: () => api.alertsList({ days: 7, limit: 10 }),
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
  })
  const events: AlertEvent[] = alerts.data?.alerts ?? []

  if (events.length === 0) {
    return <DotGridEmpty text="暂无触发记录" minHeight={96} />
  }

  return (
    <>
      <div className="mt-1 space-y-1.5">
        {events
          .filter((ev: AlertEvent) => !(ev.source === 'strategy' && !ev.symbol))
          .map((ev, i) => {
            const sev = SEVERITY_BAR[ev.severity ?? 'info'] ?? SEVERITY_BAR.info
            const pct = ev.change_pct ?? 0
            const isStrategy = ev.source === 'strategy'
            const sm = isStrategy ? ev.message?.match(/策略「([^」]+)」/) : null
            const sname = sm ? sm[1] : ''
            const isNew = ev.type === 'new_entry'
            return (
              <motion.div
                key={`${ev.ts}-${i}`}
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                className="relative overflow-hidden border border-[rgba(213,240,33,.09)] bg-[#12100a] pl-2.5 pr-2 py-1.5 hover:border-[rgba(213,240,33,.28)] hover:bg-[#17140d] transition-colors"
              >
                <div className={cn('absolute left-0 top-0 h-full w-0.5', sev)} />
                {/* 第一行: 代码 + 名称 + 价格 + 涨跌幅 (点击代码/名称弹日K) */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => ev.symbol && setPreviewEv(ev)}
                    title={ev.symbol ? `查看 ${ev.symbol} 日K` : undefined}
                    className="inline-flex items-center gap-1 min-w-0 shrink-0 rounded hover:bg-white/[.06] transition-colors -mx-0.5 px-0.5 cursor-pointer"
                  >
                    <span className="font-mono text-[10px] font-medium text-foreground/80">{ev.symbol?.replace(/\.\w+$/, '')}</span>
                    {ev.name && <span className="text-[10px] text-secondary truncate max-w-[5rem]">{ev.name}</span>}
                  </button>
                  <span className="flex-1" />
                  {ev.price != null && (
                    <span className="text-[10px] font-mono text-foreground/60 shrink-0">{fmtPrice(ev.price)}</span>
                  )}
                  {ev.change_pct != null && (
                    <span
                      className="text-[10px] font-mono font-medium shrink-0 w-12 text-right"
                      style={{ color: pct >= 0 ? 'var(--up)' : 'var(--down)' }}
                    >
                      {fmtPct(pct)}
                    </span>
                  )}
                </div>
                {/* 第二行: 策略类型走新格式, 其他走旧格式 */}
                {isStrategy ? (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[9px] font-medium" style={{ color: isNew ? 'var(--up)' : undefined }}>
                      {isNew ? '进入' : '移出'}
                    </span>
                    <span className="text-[9px] text-muted">策略</span>
                    <span className="text-[9px] font-medium text-amber-400">「{sname}」</span>
                    <span className="flex-1" />
                    <span className="text-[8px] text-muted/50 shrink-0 font-mono">{fmtTs(ev.ts)}</span>
                  </div>
                ) : (
                  <>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className={cn('shrink-0 rounded px-1 py-px text-[8px] font-medium', SOURCE_BADGE[ev.source] ?? 'bg-elevated text-muted')}>
                        {SOURCE_LABEL[ev.source] ?? ev.source}
                      </span>
                      {ev.message && (
                        <span className="text-[9px] text-muted truncate flex-1">{ev.message}</span>
                      )}
                      <span className="text-[8px] text-muted/50 shrink-0 font-mono">{fmtTs(ev.ts)}</span>
                    </div>
                    {ev.signals && ev.signals.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {ev.signals.map((s, j) => (
                          <span key={j} className="bg-[rgba(213,240,33,.08)] px-1 py-px text-[8px] text-[#d5f021]">{cnSignal(s)}</span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )
          })}
      </div>

      <StockPreviewDialog
        symbol={previewEv?.symbol ?? null}
        name={previewEv?.name ?? undefined}
        triggerInfo={previewEv ? {
          price: previewEv.price ?? null,
          changePct: previewEv.change_pct ?? null,
          ts: previewEv.ts,
          signals: previewEv.signals,
          message: previewEv.message,
        } : null}
        onClose={() => setPreviewEv(null)}
      />
    </>
  )
}

/** 监控中心卡 — 标题 + 实时信号 + 右上外链, 空态为点阵网格 */
export function MonitorCenterCard() {
  return (
    <GlassCard style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid rgba(213,240,33,.18)' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: TXT_CARD_TITLE, letterSpacing: 2 }}>监控中心</span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: TXT_WEAK, letterSpacing: 1 }}>实时信号</span>
        <Link
          to="/monitor"
          title="进入监控中心"
          style={{ marginLeft: 'auto', display: 'inline-flex', color: TXT_WEAK }}
          className="hover:!text-[#d5f021] transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M7 17L17 7M9 7h8v8" />
          </svg>
        </Link>
      </div>
      <AlertList />
    </GlassCard>
  )
}
