/**
 * 三角区(收敛三角形)检测与图层 — 指数/个股K线共用。
 * 取最近窗口交替拐点的最后 2 个高点与 2 个低点拟合上下轨:
 * 上下轨向右收敛(下轨斜率 > 上轨斜率)且交点(apex)在形态之后、不过分遥远时判定成立。
 */
import { clamp, type KBar } from './chartMath'
import { collectAltPivots } from './waveSignals'
import { TRI_LINE, TRI_FILL, MONO } from './tokens'

/** 直线: 过 (i0, v0), 斜率 slope(价格/根) */
interface TrendLine {
  i0: number
  v0: number
  slope: number
}

export interface TriangleZone {
  upper: TrendLine
  lower: TrendLine
  /** 参与拟合的最早拐点索引(绘制起点) */
  startI: number
  /** 上下轨交点(索引空间, 可为小数) */
  apexI: number
  apexV: number
}

const valueAt = (l: TrendLine, i: number) => l.v0 + l.slope * (i - l.i0)

/** apex 距最后一根K的最大允许距离(根): 超过视为近似平行, 不算收敛 */
const MAX_APEX_AHEAD = 90
/** 形态最小跨度(根): 太窄的"三角"没有分析意义 */
const MIN_SPAN = 10

export function detectTriangle(bars: KBar[], windowSize = 90): TriangleZone | null {
  const n = bars.length
  if (n < 30) return null
  const alt = collectAltPivots(bars, windowSize)
  if (!alt || alt.length < 4) return null

  // 窗口两端截断邻域产生的"伪拐点"(最新一根K几乎总是截断窗口的极值)
  // 不参与趋势线拟合, 否则平行/发散形态会被误判为收敛
  const start = Math.max(0, n - windowSize)
  const solid = alt.filter(p => p.i >= start + 2 && p.i <= n - 3)
  const highs = solid.filter(p => p.isHigh).slice(-2)
  const lows = solid.filter(p => !p.isHigh).slice(-2)
  if (highs.length < 2 || lows.length < 2) return null

  const upper: TrendLine = {
    i0: highs[0].i,
    v0: highs[0].v,
    slope: (highs[1].v - highs[0].v) / (highs[1].i - highs[0].i),
  }
  const lower: TrendLine = {
    i0: lows[0].i,
    v0: lows[0].v,
    slope: (lows[1].v - lows[0].v) / (lows[1].i - lows[0].i),
  }
  // 收敛条件: 下轨斜率必须大于上轨(向右夹紧)
  if (!(lower.slope > upper.slope)) return null

  const startI = Math.min(highs[0].i, lows[0].i)
  const lastPivotI = Math.max(highs[1].i, lows[1].i)
  if (lastPivotI - startI < MIN_SPAN) return null

  // 形态区间内上轨必须在下轨之上(否则两线已缠绕, 不是有效三角)
  if (valueAt(upper, startI) <= valueAt(lower, startI)) return null
  if (valueAt(upper, lastPivotI) <= valueAt(lower, lastPivotI)) return null

  // 交点: v = slope*i + b, b = v0 - slope*i0
  const bU = upper.v0 - upper.slope * upper.i0
  const bL = lower.v0 - lower.slope * lower.i0
  const apexI = (bL - bU) / (upper.slope - lower.slope)
  // apex 必须在形态之后且不过分超前; 允许略早于当前K(刚收敛完的形态)
  if (apexI <= lastPivotI || apexI < n - 8) return null
  if (apexI - (n - 1) > MAX_APEX_AHEAD) return null

  return { upper, lower, startI, apexI, apexV: valueAt(upper, apexI) }
}

interface Geometry {
  px: (i: number) => number
  py: (v: number) => number
  lo: number
  hi: number
}

interface TriangleZoneLayerProps {
  tri: TriangleZone
  geo: Geometry
  /** 绘图区左/右边界对应的索引(小数), 用于裁剪 */
  iLeft: number
  iRight: number
}

/** 三角区图层: 半透明填充 + 上下轨虚线 + apex 圆点 + "三角区"标签 */
export function TriangleZoneLayer({ tri, geo, iLeft, iRight }: TriangleZoneLayerProps) {
  const { px, py, lo, hi } = geo
  const iA = Math.max(tri.startI, iLeft)
  const iB = Math.min(tri.apexI, iRight)
  if (iB - iA < 1) return null

  const cv = (v: number) => clamp(v, lo, hi)
  const uA = valueAt(tri.upper, iA)
  const uB = valueAt(tri.upper, iB)
  const lA = valueAt(tri.lower, iA)
  const lB = valueAt(tri.lower, iB)
  const xA = px(iA)
  const xB = px(iB)

  const poly = [
    `${xA.toFixed(1)},${py(cv(uA)).toFixed(1)}`,
    `${xB.toFixed(1)},${py(cv(uB)).toFixed(1)}`,
    `${xB.toFixed(1)},${py(cv(lB)).toFixed(1)}`,
    `${xA.toFixed(1)},${py(cv(lA)).toFixed(1)}`,
  ].join(' ')

  // 标签放在形态中部(上下轨之间), 避开K线密集的上下沿
  const midI = (iA + iB) / 2
  const midV = (valueAt(tri.upper, midI) + valueAt(tri.lower, midI)) / 2
  const apexVisible = tri.apexI <= iRight

  return (
    <g>
      <polygon points={poly} fill={TRI_FILL} stroke="none" />
      <line
        x1={xA} y1={py(cv(uA))} x2={xB} y2={py(cv(uB))}
        stroke={TRI_LINE} strokeWidth={1.4} strokeDasharray="6 4" opacity={0.85}
      />
      <line
        x1={xA} y1={py(cv(lA))} x2={xB} y2={py(cv(lB))}
        stroke={TRI_LINE} strokeWidth={1.4} strokeDasharray="6 4" opacity={0.85}
      />
      {apexVisible && (
        <circle cx={px(tri.apexI)} cy={py(cv(tri.apexV))} r={3.2} fill={TRI_LINE} opacity={0.9} />
      )}
      <text
        x={px(midI)} y={py(cv(midV)) + 4} textAnchor="middle"
        fontSize={11.5} fontWeight={700} fill={TRI_LINE} fontFamily={MONO} opacity={0.95}
      >
        三角区
      </text>
    </g>
  )
}
