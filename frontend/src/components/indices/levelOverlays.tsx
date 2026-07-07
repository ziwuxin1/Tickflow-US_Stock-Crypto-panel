/**
 * K线主图价位叠加层 — 水平关键价位线 + 通道曲线(布林/Keltner/ATR)。
 * 个股分析页(AnalysisKChart)传入数据; 坐标函数由 KLineChart 注入。
 */
import { clamp } from './chartMath'
import { MONO } from './tokens'

export interface LevelLine {
  value: number
  label: string
  color: string
}

export interface CurveOverlay {
  key: string
  /** 与 bars 索引对齐的序列(缺失为 null) */
  points: (number | null)[]
  color: string
  /** 默认虚线; 传 false 画实线(如布林中轨) */
  dashed?: boolean
}

interface Geometry {
  px: (i: number) => number
  py: (v: number) => number
  plotL: number
  plotR: number
  lo: number
  hi: number
  off: number
  endData: number
}

/** 标签防重叠: 按 y 升序至少间隔 minGap */
function spreadLabels(ys: number[], minGap = 12): number[] {
  const out: number[] = []
  for (const y of ys) {
    const prev = out[out.length - 1]
    out.push(prev != null && y - prev < minGap ? prev + minGap : y)
  }
  return out
}

/** 水平价位线: 虚线横贯 + 右缘"标签 数值"文字(超出可视价格区间的线不画) */
export function LevelLinesLayer({ lines, geo }: { lines: LevelLine[]; geo: Geometry }) {
  const { py, plotL, plotR, lo, hi } = geo
  const visible = lines
    .filter(l => l.value >= lo && l.value <= hi)
    .sort((a, b) => py(a.value) - py(b.value))
  if (visible.length === 0) return null
  const labelYs = spreadLabels(visible.map(l => py(l.value) - 5))

  return (
    <g>
      {visible.map((l, k) => {
        const y = py(l.value)
        return (
          <g key={`${l.label}-${l.value}`}>
            <line x1={plotL} y1={y} x2={plotR} y2={y} stroke={l.color} strokeWidth={1} strokeDasharray="5 4" opacity={0.6} />
            <text x={plotR - 4} y={labelYs[k]} textAnchor="end" fontSize={10} fontWeight={600} fill={l.color} fontFamily={MONO}>
              {l.label} {l.value.toFixed(2)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** 通道曲线: 可视区裁剪 + 越界 clamp(与均线一致), 末端标注最新值 */
export function CurvesLayer({ curves, geo }: { curves: CurveOverlay[]; geo: Geometry }) {
  const { px, py, plotR, lo, hi, off, endData } = geo

  return (
    <g>
      {curves.map(c => {
        let pts = ''
        for (let i = off; i <= endData; i++) {
          const v = c.points[i]
          if (v == null) continue
          pts += `${px(i).toFixed(1)},${py(clamp(v, lo, hi)).toFixed(1)} `
        }
        if (!pts) return null
        // 末端数值标签: 仅当曲线延伸到可视区最后一根且值在区间内
        const lastV = c.points[endData]
        const showEnd = lastV != null && lastV >= lo && lastV <= hi
        return (
          <g key={c.key}>
            <polyline
              points={pts.trim()} fill="none" stroke={c.color} strokeWidth={1.1}
              strokeDasharray={c.dashed === false ? undefined : '5 4'} opacity={0.8} strokeLinejoin="round"
            />
            {showEnd && (
              <text
                x={Math.min(px(endData) + 6, plotR - 2)} y={py(clamp(lastV!, lo, hi)) + 3.5}
                fontSize={10} fill={c.color} fontFamily={MONO}
              >
                {lastV!.toFixed(2)}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}
