/**
 * 趋势预测线 — 指数/个股K线共用。
 * 最近 REG_N 根收盘价最小二乘拟合趋势, 从最新K线锚点向右侧空档延伸:
 * 中心虚线 = 趋势外推, 扇面 = ±残差σ随预测距离扩大的置信区间。
 * 纯技术外推, 非 AI 预测。
 */
import { clamp, type KBar } from './chartMath'
import { MONO } from './tokens'

export const FORECAST_LINE = '#b18cff'
const FORECAST_FILL = 'rgba(177,140,255,.10)'

/** 回归窗口(根) */
const REG_N = 20
/** 预测最远距离(根), 避免自由拖拽出超大空档时扇面无限延伸 */
const MAX_HORIZON = 30

export interface Forecast {
  /** 锚点: 最新K线索引与收盘价 */
  i0: number
  v0: number
  /** 趋势斜率(价格/根) */
  slope: number
  /** 回归残差标准差 */
  sigma: number
}

export function computeForecast(bars: KBar[]): Forecast | null {
  const n = bars.length
  if (n < REG_N + 2) return null
  const ys = bars.slice(n - REG_N).map(b => b.close)
  // 最小二乘: x = 0..REG_N-1
  const m = REG_N
  const xMean = (m - 1) / 2
  const yMean = ys.reduce((s, v) => s + v, 0) / m
  let sxy = 0
  let sxx = 0
  for (let x = 0; x < m; x++) {
    sxy += (x - xMean) * (ys[x] - yMean)
    sxx += (x - xMean) * (x - xMean)
  }
  const slope = sxx ? sxy / sxx : 0
  const intercept = yMean - slope * xMean
  let se = 0
  for (let x = 0; x < m; x++) {
    const r = ys[x] - (intercept + slope * x)
    se += r * r
  }
  const sigma = Math.sqrt(se / Math.max(m - 2, 1))
  return { i0: n - 1, v0: bars[n - 1].close, slope, sigma }
}

interface Geometry {
  px: (i: number) => number
  py: (v: number) => number
  lo: number
  hi: number
}

interface ForecastLayerProps {
  fc: Forecast
  geo: Geometry
  /** 绘图区右边界对应的索引(小数), 用于确定预测长度 */
  iRight: number
}

/** 预测线图层: 置信扇面 + 中心虚线 + 端点"预测 xx.xx"标签 */
export function ForecastLayer({ fc, geo, iRight }: ForecastLayerProps) {
  const { px, py, lo, hi } = geo
  const H = Math.min(iRight - fc.i0, MAX_HORIZON)
  if (H < 3) return null

  const cv = (v: number) => clamp(v, lo, hi)
  const at = (h: number) => fc.v0 + fc.slope * h
  /** 置信半宽: σ 随距离线性扩大 */
  const half = (h: number) => fc.sigma * (1 + h / REG_N)

  const STEPS = 8
  const center: string[] = []
  const upper: string[] = []
  const lower: string[] = []
  for (let s = 0; s <= STEPS; s++) {
    const h = H * s / STEPS
    const x = px(fc.i0 + h).toFixed(1)
    center.push(`${x},${py(cv(at(h))).toFixed(1)}`)
    upper.push(`${x},${py(cv(at(h) + half(h))).toFixed(1)}`)
    lower.push(`${x},${py(cv(at(h) - half(h))).toFixed(1)}`)
  }
  const fan = [...upper, ...lower.reverse()].join(' ')
  const endV = at(H)
  const endX = px(fc.i0 + H)
  const endY = py(cv(endV))

  return (
    <g>
      <polygon points={fan} fill={FORECAST_FILL} stroke="none" />
      <polyline
        points={center.join(' ')} fill="none" stroke={FORECAST_LINE}
        strokeWidth={1.6} strokeDasharray="7 5" opacity={0.9} strokeLinejoin="round"
      />
      <circle cx={endX} cy={endY} r={3} fill={FORECAST_LINE} opacity={0.9} />
      <text
        x={endX} y={endY + (fc.slope >= 0 ? -8 : 16)} textAnchor="end"
        fontSize={11} fontWeight={700} fill={FORECAST_LINE} fontFamily={MONO}
      >
        预测 {endV.toFixed(2)}
      </text>
    </g>
  )
}
