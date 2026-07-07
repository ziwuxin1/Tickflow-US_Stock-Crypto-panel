/**
 * K线波浪理论/信号标注 — design_handoff_index_page §3 信号标注。
 * 设计稿用固定样本拐点; 真实数据改为 zigzag 交替拐点检测(6 点: 低0 高1 低2 高3 低4 高5)。
 */
import type { KBar } from './chartMath'
import {
  UP, FIB_GOLD, FIB_GRAY, SIG_BREAK, SIG_REBOUND,
  WAVE_LINE, WAVE_DOT_BG, WAVE_DOT_FG, WAVE_SEQ, MONO,
} from './tokens'

export interface WavePivot {
  /** bar 索引(全量数据空间) */
  i: number
  /** 拐点价(低点取 low, 高点取 high) */
  v: number
  /** 是否高点 */
  isHigh: boolean
}

/**
 * 窗口内交替拐点序列: 分形候选 + 强制交替(同型连续保留更极端者)。
 * 波浪信号与三角区检测共用。数据不足返回 null。
 */
export function collectAltPivots(bars: KBar[], windowSize = 60): WavePivot[] | null {
  const n = bars.length
  if (n < 30) return null
  const start = Math.max(0, n - windowSize)
  const k = 2 // 分形邻域半径

  // 1. 分形候选拐点(端点邻域截断比较, 保证首尾也能出拐点)
  const candidates: WavePivot[] = []
  for (let i = start; i < n; i++) {
    const s = Math.max(start, i - k)
    const e = Math.min(n - 1, i + k)
    let isLow = true
    let isHighPt = true
    for (let j = s; j <= e; j++) {
      if (bars[j].low < bars[i].low) isLow = false
      if (bars[j].high > bars[i].high) isHighPt = false
    }
    if (isLow) candidates.push({ i, v: bars[i].low, isHigh: false })
    if (isHighPt && !isLow) candidates.push({ i, v: bars[i].high, isHigh: true })
  }

  // 2. 强制交替: 同型连续时保留更极端者
  const alt: WavePivot[] = []
  for (const c of candidates) {
    const prev = alt[alt.length - 1]
    if (!prev || prev.isHigh !== c.isHigh) {
      alt.push(c)
      continue
    }
    const moreExtreme = c.isHigh ? c.v > prev.v : c.v < prev.v
    if (moreExtreme) alt[alt.length - 1] = c
  }
  return alt
}

/** 检测窗口: 最近 N 根内找 6 个交替拐点(低起), 不足返回 null */
export function detectWavePivots(bars: KBar[], windowSize = 60): WavePivot[] | null {
  const alt = collectAltPivots(bars, windowSize)
  if (!alt || alt.length < 6) return null

  // 取最近一段以低点起始的连续 6 点(0低 1高 2低 3高 4低 5高)
  for (let j = alt.length - 6; j >= 0; j--) {
    if (!alt[j].isHigh) return alt.slice(j, j + 6)
  }
  return null
}

interface Geometry {
  px: (i: number) => number
  py: (v: number) => number
  plotL: number
  plotR: number
  lo: number
  hi: number
}

interface WaveSignalsLayerProps {
  pivots: WavePivot[]
  geo: Geometry
  lastClose: number
  lastUp: boolean
}

/**
 * 信号图层: 斐波那契标尺 + 支撑区 + 跌破/反弹目标 + 波浪折线圆点 + 现价线胶囊。
 * 坐标全部在动态 viewBox 空间内计算(由父组件传入 px/py)。
 */
export function WaveSignalsLayer({ pivots, geo, lastClose, lastUp }: WaveSignalsLayerProps) {
  const { px, py, plotL, plotR, lo, hi } = geo
  const midX = (plotL + plotR) / 2 - 20
  const f0 = pivots[0].v
  const rng = pivots[3].v - f0
  if (!(rng > 0)) return null

  const fibs = [
    { r: 0, color: FIB_GRAY, label: '0%' },
    { r: 0.618, color: FIB_GOLD, label: '61.8%' },
    { r: 1, color: FIB_GRAY, label: '100%' },
    { r: 1.618, color: FIB_GOLD, label: '161.8%' },
  ].filter(fb => {
    const v = f0 + rng * fb.r
    return v <= hi && v >= lo
  })

  const supportY = py(f0)
  const breakdownV = f0 - rng * 0.28
  const reboundY = py(pivots[5].v + rng * 0.06)
  const hookEndX = Math.min(px(pivots[5].i) + 92, plotR - 14)
  const hookEndY = py(f0 + rng * 0.618)
  const zigzag = pivots
    .map((p, idx) => `${idx ? 'L' : 'M'}${px(p.i).toFixed(1)} ${py(p.v).toFixed(1)}`)
    .join('')
  const cy = py(lastClose)

  return (
    <g>
      {/* 斐波那契标尺 */}
      {fibs.map(fb => {
        const v = f0 + rng * fb.r
        const y = py(v)
        return (
          <g key={fb.label}>
            <line x1={px(pivots[0].i)} y1={y} x2={plotR} y2={y} stroke={fb.color} strokeWidth={1} opacity={0.7} />
            <text x={plotR - 4} y={y - 5} textAnchor="end" fontSize={11} fontWeight={700} fill={fb.color} fontFamily={MONO}>
              {fb.label}
            </text>
          </g>
        )
      })}
      {/* 支撑区横贯虚线带 */}
      <rect
        x={plotL} y={supportY - 9} width={plotR - plotL} height={18} rx={7}
        fill="rgba(46,204,128,.1)" stroke="rgba(46,204,128,.55)" strokeWidth={1} strokeDasharray="5 4"
      />
      <text x={midX} y={supportY - 14} fontSize={11.5} fontWeight={700} fill={UP}>支撑区</text>
      {/* 跌破目标: 与支撑区标签距离过近时翻到线下方并右移, 避免文字重叠 */}
      {breakdownV > lo && (() => {
        const bdY = py(breakdownV)
        const tooClose = bdY - supportY < 34
        return (
          <g>
            <line x1={plotL} y1={bdY} x2={plotR} y2={bdY} stroke={SIG_BREAK} strokeWidth={1.3} strokeDasharray="6 5" opacity={0.85} />
            <text
              x={tooClose ? midX + 104 : midX} y={tooClose ? bdY + 19 : bdY - 7}
              fontSize={11.5} fontWeight={700} fill={SIG_BREAK}
            >
              跌破目标
            </text>
          </g>
        )
      })()}
      {/* 反弹目标 + 回踩观察 */}
      <line x1={px(pivots[3].i) - 30} y1={reboundY} x2={plotR} y2={reboundY} stroke={SIG_REBOUND} strokeWidth={1.2} strokeDasharray="6 5" opacity={0.9} />
      <text x={px(pivots[5].i) - 14} y={reboundY - 7} fontSize={11} fontWeight={700} fill={SIG_REBOUND}>反弹目标</text>
      <path
        d={`M${px(pivots[5].i).toFixed(1)} ${py(pivots[5].v).toFixed(1)} Q${(px(pivots[5].i) + 55).toFixed(1)} ${py(pivots[5].v).toFixed(1)} ${hookEndX.toFixed(1)} ${hookEndY.toFixed(1)}`}
        fill="none" stroke={SIG_REBOUND} strokeWidth={1.4} strokeDasharray="5 4"
      />
      <text x={hookEndX} y={hookEndY + 17} textAnchor="end" fontSize={11} fontWeight={700} fill={SIG_REBOUND}>回踩观察</text>
      {/* 波浪折线 + 拐点圆 */}
      <path d={zigzag} fill="none" stroke={WAVE_LINE} strokeWidth={1.6} opacity={0.9} strokeLinejoin="round" />
      {pivots.map((p, idx) => {
        const x = px(p.i)
        const y = py(p.v)
        const seqOffset = p.isHigh || idx === 5 ? -17 : 27
        return (
          <g key={idx}>
            <ellipse cx={x} cy={y} rx={11} ry={11} fill={WAVE_DOT_BG} stroke={WAVE_DOT_FG} strokeWidth={1.6} />
            <text x={x} y={y + 3.8} textAnchor="middle" fontSize={11} fontWeight={700} fill={WAVE_DOT_FG} fontFamily={MONO}>{idx}</text>
            <text x={x} y={y + seqOffset} textAnchor="middle" fontSize={10} fill={WAVE_SEQ} fontFamily={MONO}>({idx})</text>
          </g>
        )
      })}
      {/* 现价点虚线 + 价格胶囊 */}
      <line x1={plotL} y1={cy} x2={plotR} y2={cy} stroke="rgba(255,255,255,.3)" strokeWidth={1} strokeDasharray="2 3" />
      <rect x={plotR - 62} y={cy - 9} width={58} height={18} rx={4} fill={lastUp ? '#1f9e63' : '#e05a4a'} />
      <text x={plotR - 33} y={cy + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff" fontFamily={MONO}>
        {lastClose.toFixed(2)}
      </text>
    </g>
  )
}
