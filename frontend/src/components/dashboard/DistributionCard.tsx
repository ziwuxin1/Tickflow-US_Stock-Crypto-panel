import type { OverviewMarket } from '@/lib/api'
import { EdgeStatCard } from './EdgeStatCard'
import { GlassCard } from './GlassCard'
import { LiquidBar } from './LiquidBar'
import { HEAT_BINS, MONO, NEON, TXT_CARD_TITLE, TXT_FAINT, TXT_WEAKER } from './tokens'
import { fmtStockPct, n } from './utils'

const MAX_BAR_H = 164

/** 涨跌分布 / 广度卡 — 8 根热力渐变圆头柱 + 液体对比条 + 均值/中位卡 */
export function DistributionCard({ data }: { data: OverviewMarket }) {
  const rows = data.distribution
  const maxCount = Math.max(...rows.map(r => r.count), 1)
  const avg = n(data.breadth.avg_pct)
  const median = n(data.breadth.median_pct)
  return (
    <GlassCard style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={NEON} strokeWidth="2" strokeLinecap="round">
          <path d="M5 19V10M12 19V4M19 19v-7" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600, color: TXT_CARD_TITLE }}>涨跌分布 / 广度</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: TXT_WEAKER, fontFamily: MONO }}>{data.breadth.total}只</span>
      </div>

      {/* 热力直方图 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, height: 214, padding: '0 4px' }}>
        {rows.map((r, i) => {
          const bin = HEAT_BINS[Math.min(i, HEAT_BINS.length - 1)]
          const h = Math.max(4, Math.round(r.count / maxCount * MAX_BAR_H))
          return (
            <div key={r.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }} title={`${r.label}: ${r.count}只`}>
              <span style={{ fontSize: 10.5, color: bin.num, fontFamily: MONO }}>{r.count}</span>
              <div style={{ width: 22, height: h, borderRadius: 18, background: bin.grad }} />
              <span style={{ fontSize: 9.5, color: TXT_FAINT, fontFamily: MONO, whiteSpace: 'nowrap' }}>{r.label}</span>
            </div>
          )
        })}
      </div>

      {/* 液体对比条 + 涨/平/跌 */}
      <LiquidBar upPct={data.breadth.up_pct} size="sm" />
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, fontFamily: MONO }}>
        <span style={{ color: 'var(--up)' }}>涨 {data.breadth.up}</span>
        <span style={{ margin: '0 auto', color: TXT_WEAKER }}>平 {data.breadth.flat}</span>
        <span style={{ color: 'var(--down)' }}>跌 {data.breadth.down}</span>
      </div>

      {/* 平均 / 中位涨跌 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <EdgeStatCard
          label="平均涨跌" value={fmtStockPct(avg)} valueSize={15}
          tone={(avg ?? 0) >= 0 ? 'up' : 'down'} padding="11px 13px 11px 21px"
        />
        <EdgeStatCard
          label="中位涨跌" value={fmtStockPct(median)} valueSize={15}
          tone={(median ?? 0) >= 0 ? 'up' : 'down'} padding="11px 13px 11px 21px"
        />
      </div>
    </GlassCard>
  )
}
