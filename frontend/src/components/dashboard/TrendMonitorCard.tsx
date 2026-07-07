import type { ReactNode } from 'react'
import type { OverviewMarket } from '@/lib/api'
import { EdgeStatCard, type EdgeTone } from './EdgeStatCard'
import { GlassCard } from './GlassCard'
import { DIVIDER, TXT_CARD_TITLE } from './tokens'
import { compactCount, fmtPrice } from './utils'

interface Item {
  label: string
  value: ReactNode
  tone: EdgeTone
}

/** CP perk 卡组面板: 黄字标题栏 + 3×2 网格 */
function PerkPanel({ title, items }: { title: string; items: Item[] }) {
  return (
    <GlassCard style={{ padding: '0 0 12px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 13px', borderBottom: DIVIDER }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TXT_CARD_TITLE, letterSpacing: 2 }}>{title}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, padding: '12px 13px 0' }}>
        {items.map(it => <EdgeStatCard key={it.label} label={it.label} value={it.value} tone={it.tone} />)}
      </div>
    </GlassCard>
  )
}

/** 趋势强度 + 实用监控 — 两块独立 CP 面板堆叠, 各含 3×2 perk 卡 */
export function TrendMonitorCard({ data }: { data: OverviewMarket }) {
  const t = data.trend
  const a = data.activity
  const strongUp = data.breadth.strong_up ?? 0
  const strongDown = data.breadth.strong_down ?? 0
  const hiLoTotal = t.new_high + t.new_low
  const hiLoPct = hiLoTotal > 0 ? Math.round(t.new_high / hiLoTotal * 100) : 50

  const trendItems: Item[] = [
    { label: '站上MA5', value: `${t.above_ma5_pct.toFixed(0)}%`, tone: 'neon' },
    { label: '站上MA20', value: `${t.above_ma20_pct.toFixed(0)}%`, tone: t.above_ma20_pct > 0 ? 'dim' : 'gray' },
    { label: '站上MA60', value: `${t.above_ma60_pct.toFixed(0)}%`, tone: t.above_ma60_pct > 0 ? 'dim' : 'gray' },
    { label: '60日新高', value: compactCount(t.new_high), tone: t.new_high > 0 ? 'up' : 'gray' },
    { label: '60日新低', value: compactCount(t.new_low), tone: t.new_low > 0 ? 'down' : 'gray' },
    { label: '高低比', value: `${hiLoPct}%`, tone: 'dim' },
  ]
  const monitorItems: Item[] = [
    { label: '强势 ≥5%', value: strongUp, tone: strongUp > 0 ? 'up' : 'gray' },
    { label: '弱势 ≤-5%', value: strongDown, tone: strongDown > 0 ? 'down' : 'gray' },
    { label: '站上MA60', value: `${t.above_ma60_pct.toFixed(0)}%`, tone: t.above_ma60_pct > 0 ? 'dim' : 'gray' },
    { label: '新高/新低', value: `${compactCount(t.new_high)}/${compactCount(t.new_low)}`, tone: hiLoTotal > 0 ? 'dim' : 'gray' },
    { label: '高换手数', value: a.high_turnover, tone: a.high_turnover > 0 ? 'dim' : 'gray' },
    { label: '放量占比', value: `${fmtPrice(a.high_vol_ratio, 1)}%`, tone: 'neon' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <PerkPanel title="趋势强度" items={trendItems} />
      <PerkPanel title="实用监控" items={monitorItems} />
    </div>
  )
}
