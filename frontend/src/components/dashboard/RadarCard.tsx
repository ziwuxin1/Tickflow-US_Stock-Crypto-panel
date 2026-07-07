import type { OverviewMarket } from '@/lib/api'
import { GlassCard } from './GlassCard'
import { DIVIDER, MONO, NEON, NEON_BRIGHT, SUB_BG2, TXT_CARD_TITLE, TXT_WEAK } from './tokens'

const CX = 160
const CY = 150
const R = 104

/** 网格层级 → 黄色描边透明度(设计稿: 内 .1 / 中 .14 / 外 .2) */
const GRID_LEVELS: { level: number; stroke: string }[] = [
  { level: 0.33, stroke: 'rgba(213,240,33,.1)' },
  { level: 0.66, stroke: 'rgba(213,240,33,.14)' },
  { level: 1, stroke: 'rgba(213,240,33,.2)' },
]

function vertex(i: number, count: number, radius: number): { x: number; y: number; cos: number; sin: number } {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: CX + cos * radius, y: CY + sin * radius, cos, sin }
}

function ringPoints(count: number, radius: number): string {
  return Array.from({ length: count }, (_, i) => {
    const v = vertex(i, count, radius)
    return `${v.x.toFixed(1)},${v.y.toFixed(1)}`
  }).join(' ')
}

/** 市场情绪雷达 — 黄网格六边形 + 黄多边形填充 + 顶点亮点 + 中心评分圆徽 */
export function RadarCard({ radar, score }: { radar: OverviewMarket['radar']; score: number; ambient?: boolean }) {
  const count = Math.max(radar.length, 3)
  const dataPoints = radar.map((r, i) => {
    const radius = R * Math.max(0, Math.min(100, r.value)) / 100
    return { ...vertex(i, count, radius), label: r.label, key: r.key }
  })
  const labels = radar.map((r, i) => {
    const v = vertex(i, count, 1)
    return {
      key: r.key,
      label: r.label,
      x: CX + v.cos * (R + 14),
      y: CY + v.sin * (R + 16) + 4,
      anchor: (v.cos > 0.2 ? 'start' : v.cos < -0.2 ? 'end' : 'middle') as 'start' | 'end' | 'middle',
    }
  })
  return (
    <GlassCard style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderBottom: DIVIDER }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TXT_CARD_TITLE, letterSpacing: 2 }}>市场情绪雷达</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: TXT_WEAK, letterSpacing: 1 }}>
          评分 <b style={{ color: NEON }}>{score}</b>
        </span>
      </div>
      {radar.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 220, fontSize: 12, color: TXT_WEAK }}>
          暂无雷达数据
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
          <svg viewBox="0 0 320 300" style={{ width: '100%', maxHeight: 300, display: 'block' }}>
            {GRID_LEVELS.map(({ level, stroke }) => (
              <polygon key={level} points={ringPoints(count, R * level)} fill="none" stroke={stroke} strokeWidth="1" />
            ))}
            <path
              d={Array.from({ length: count }, (_, i) => {
                const v = vertex(i, count, R)
                return `M${CX} ${CY}L${v.x.toFixed(1)} ${v.y.toFixed(1)}`
              }).join('')}
              stroke="rgba(213,240,33,.1)"
              strokeWidth="1"
              fill="none"
            />
            <polygon
              points={dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="rgba(213,240,33,.16)"
              stroke={NEON}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {dataPoints.map(p => <circle key={p.key} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.4" fill={NEON_BRIGHT} />)}
            <circle cx={CX} cy={CY} r="26" fill={SUB_BG2} stroke="rgba(213,240,33,.6)" strokeWidth="1.5" />
            <text x={CX} y={CY + 6} textAnchor="middle" fontSize="17" fontWeight="700" fill={NEON} fontFamily={MONO}>
              {score}
            </text>
            {labels.map(l => (
              <text key={l.key} x={l.x.toFixed(1)} y={l.y.toFixed(1)} textAnchor={l.anchor} fontSize="10.5" fontWeight="600" letterSpacing="1" fill={TXT_WEAK}>
                {l.label}
              </text>
            ))}
          </svg>
        </div>
      )}
    </GlassCard>
  )
}
