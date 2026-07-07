import type { ReactNode } from 'react'
import type { OverviewMarket } from '@/lib/api'
import { fmtBigNum } from '@/lib/format'
import { GlassCard } from './GlassCard'
import { DOWN, MONO, NEON, TXT_BODY, TXT_FAINT, TXT_FAINTEST, TXT_WEAK, UP } from './tokens'
import { compactCount, fmtPrice } from './utils'

interface StatCellDef {
  label: string
  value: ReactNode
  sub: string
  color?: string
  glow?: string
}

function StatCell({ def }: { def: StatCellDef }) {
  return (
    <GlassCard as="div" variant="stat" style={{ padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, color: TXT_WEAK, letterSpacing: 1.5 }}>{def.label}</span>
      <span
        style={{
          fontSize: 22, fontWeight: 700, fontFamily: MONO, lineHeight: 1,
          color: def.color ?? TXT_BODY,
          whiteSpace: 'nowrap',
          ...(def.glow ? { textShadow: def.glow } : {}),
        }}
      >
        {def.value}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 9, color: TXT_FAINT }}>{def.sub}</span>
    </GlassCard>
  )
}

/** 市场统计卡 ×6 — 6 列网格(涨青 / 跌红 / 额黄) */
export function StatCards({ data }: { data: OverviewMarket }) {
  const strongUp = data.breadth.strong_up ?? 0
  const strongDown = data.breadth.strong_down ?? 0
  const cells: StatCellDef[] = [
    {
      label: '上涨家数', value: data.breadth.up, sub: `${data.breadth.up_pct.toFixed(1)}% ADVANCING`,
      color: UP, glow: '0 0 18px rgba(94,242,228,.25)',
    },
    { label: '下跌家数', value: data.breadth.down, sub: `平盘 ${data.breadth.flat} · FLAT`, color: DOWN },
    {
      label: '强势 / 弱势',
      value: (
        <>
          <span style={{ color: UP }}>{strongUp}</span>
          <span style={{ color: TXT_FAINTEST }}>/</span>
          <span style={{ color: DOWN }}>{strongDown}</span>
        </>
      ),
      sub: '涨跌幅 ≥5%',
    },
    { label: '60日新高', value: compactCount(data.trend.new_high), sub: `60日新低 ${compactCount(data.trend.new_low)}` },
    {
      label: '总成交额', value: fmtBigNum(data.amount.total), sub: `均额 ${fmtBigNum(data.amount.avg)} · TURNOVER`,
      color: NEON, glow: '0 0 18px rgba(213,240,33,.2)',
    },
    {
      label: '换手 / 量比',
      value: `${fmtPrice(data.activity.avg_turnover, 1)}% / ${fmtPrice(data.activity.vol_ratio, 2)}`,
      sub: `高换手 ${data.activity.high_turnover} · 放量 ${fmtPrice(data.activity.high_vol_ratio, 1)}%`,
      color: NEON,
    },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14, position: 'relative' }}>
      {cells.map(def => <StatCell key={def.label} def={def} />)}
    </div>
  )
}
