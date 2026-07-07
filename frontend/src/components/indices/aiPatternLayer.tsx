/**
 * AI 形态图层 — AI 自动预测返回的三角区/预测路径/波浪拐点标注。
 * 与本地算法层(triangleZone/forecastLine/waveSignals)并存, 统一用紫色系区分 AI 来源。
 * 坐标由 KLineChart 注入; AI 给的是日期, 此处二分映射到 bar 索引。
 */
import type { ReactNode } from 'react'
import type { AiPatterns } from '@/lib/api'
import { clamp, type KBar } from './chartMath'
import { MONO, WAVE_DOT_BG } from './tokens'

const AI_COLOR = '#b18cff'
const AI_FILL = 'rgba(177,140,255,.08)'

interface Geometry {
  px: (i: number) => number
  py: (v: number) => number
  lo: number
  hi: number
}

interface AiPatternsLayerProps {
  patterns: AiPatterns
  bars: KBar[]
  geo: Geometry
  /** 绘图区右边界对应的索引(小数), 预测路径延伸裁剪用 */
  iRight: number
}

/** date → bar 索引(二分: 精确命中或落到左邻交易日; 早于首根返回 null) */
function dateToIdx(bars: KBar[], date: string): number | null {
  const n = bars.length
  if (n === 0 || date < bars[0].date) return null
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (bars[mid].date <= date) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function AiPatternsLayer({ patterns, bars, geo, iRight }: AiPatternsLayerProps) {
  const { px, py, lo, hi } = geo
  const n = bars.length
  if (n === 0) return null
  const cv = (v: number) => clamp(v, lo, hi)

  // ===== AI 三角区: 上下轨两端点连线 + 半透明填充 =====
  let triangle: ReactNode = null
  const tri = patterns.triangle
  if (tri?.upper?.length === 2 && tri?.lower?.length === 2) {
    const idx = [tri.upper[0], tri.upper[1], tri.lower[0], tri.lower[1]].map(p => dateToIdx(bars, p.date))
    if (idx.every(i => i != null)) {
      const [u0, u1, l0, l1] = idx as number[]
      const pts = {
        u0: [px(u0), py(cv(tri.upper[0].price))] as const,
        u1: [px(u1), py(cv(tri.upper[1].price))] as const,
        l0: [px(l0), py(cv(tri.lower[0].price))] as const,
        l1: [px(l1), py(cv(tri.lower[1].price))] as const,
      }
      const poly = [pts.u0, pts.u1, pts.l1, pts.l0].map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
      const midX = (pts.u0[0] + pts.u1[0]) / 2
      const midY = (pts.u0[1] + pts.u1[1] + pts.l0[1] + pts.l1[1]) / 4
      triangle = (
        <g>
          <polygon points={poly} fill={AI_FILL} stroke="none" />
          <line x1={pts.u0[0]} y1={pts.u0[1]} x2={pts.u1[0]} y2={pts.u1[1]} stroke={AI_COLOR} strokeWidth={1.4} strokeDasharray="6 4" opacity={0.85} />
          <line x1={pts.l0[0]} y1={pts.l0[1]} x2={pts.l1[0]} y2={pts.l1[1]} stroke={AI_COLOR} strokeWidth={1.4} strokeDasharray="6 4" opacity={0.85} />
          <text x={midX} y={midY + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={AI_COLOR} fontFamily={MONO}>
            AI三角区
          </text>
        </g>
      )
    }
  }

  // ===== AI 预测路径: 从最新收盘沿 AI 给的未来点连虚线 =====
  let forecast: ReactNode = null
  const path = patterns.forecast_path
  if (path && path.length >= 2) {
    const pts: Array<[number, number]> = [[n - 1, bars[n - 1].close]]
    for (const p of path) pts.push([Math.min(n - 1 + p.days_ahead, iRight), p.price])
    const line = pts.map(([i, v]) => `${px(i).toFixed(1)},${py(cv(v)).toFixed(1)}`).join(' ')
    const last = pts[pts.length - 1]
    forecast = (
      <g>
        <polyline points={line} fill="none" stroke={AI_COLOR} strokeWidth={1.8} strokeDasharray="8 5" opacity={0.95} strokeLinejoin="round" />
        {pts.slice(1).map(([i, v], k) => (
          <circle key={k} cx={px(i)} cy={py(cv(v))} r={2.8} fill={AI_COLOR} opacity={0.9} />
        ))}
        <text
          x={px(last[0])} y={py(cv(last[1])) - 9} textAnchor="end"
          fontSize={11} fontWeight={700} fill={AI_COLOR} fontFamily={MONO}
        >
          AI预测 {last[1].toFixed(2)}
        </text>
      </g>
    )
  }

  // ===== AI 波浪拐点: 圆点编号 + 折线 =====
  let waves: ReactNode = null
  const wv = patterns.waves
  if (wv && wv.length >= 2) {
    const pts = wv
      .map(p => ({ i: dateToIdx(bars, p.date), v: p.price, label: p.label ?? '' }))
      .filter((p): p is { i: number; v: number; label: string } => p.i != null)
    if (pts.length >= 2) {
      const zigzag = pts.map((p, k) => `${k ? 'L' : 'M'}${px(p.i).toFixed(1)} ${py(cv(p.v)).toFixed(1)}`).join('')
      waves = (
        <g>
          <path d={zigzag} fill="none" stroke={AI_COLOR} strokeWidth={1.3} opacity={0.7} strokeLinejoin="round" strokeDasharray="2 3" />
          {pts.map((p, k) => (
            <g key={k}>
              <circle cx={px(p.i)} cy={py(cv(p.v))} r={9.5} fill={WAVE_DOT_BG} stroke={AI_COLOR} strokeWidth={1.5} />
              <text x={px(p.i)} y={py(cv(p.v)) + 3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill={AI_COLOR} fontFamily={MONO}>
                {p.label || String(k)}
              </text>
            </g>
          ))}
        </g>
      )
    }
  }

  if (!triangle && !forecast && !waves) return null
  return (
    <g>
      {triangle}
      {waves}
      {forecast}
    </g>
  )
}
