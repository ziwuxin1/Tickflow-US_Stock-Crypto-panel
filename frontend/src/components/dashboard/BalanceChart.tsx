import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { DotGridEmpty } from './DotGridEmpty'
import { GlassCard } from './GlassCard'
import {
  DOWN, INK, MONO, NEON, TXT_BODY, TXT_FAINT, TXT_WEAK, clipBR, clipTL,
} from './tokens'

const SYMBOL = 'SPY.US'
const RANGES = ['1D', '1M', '3M', '6M', '1Y', 'MAX'] as const
type Range = (typeof RANGES)[number]

/** 各档位取日K天数(1D 走分时) */
const RANGE_DAYS: Record<Exclude<Range, '1D'>, number> = {
  '1M': 30, '3M': 66, '6M': 132, '1Y': 260, MAX: 2000,
}

interface Pt { t: string; v: number }

const VW = 720
const VH = 320

function fmtAxis(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
  return v.toFixed(0)
}

/** 横轴标签: 1D 取 HH:MM, 日线取 MM-DD / 年跨度取 YYYY-MM */
function axisLabel(t: string, range: Range): string {
  if (range === '1D') {
    const m = t.match(/(\d{2}):(\d{2})/)
    return m ? `${m[1]}:${m[2]}` : t.slice(-5)
  }
  if (range === '1Y' || range === 'MAX') return t.slice(0, 7)
  return t.slice(5, 10)
}

/**
 * 大盘基准 · Balance 交互图表(设计稿 Portfolio Balance 组件, 接入 SPY 真实行情):
 * 黄色折线 + 竖条纹理渐隐填充 + 鼠标吸附十字线/光晕/切角气泡; 1D~MAX 分段切换。
 */
export function BalanceChart() {
  const uid = useId().replace(/:/g, '')
  const [range, setRange] = useState<Range>('6M')
  const [hoverI, setHoverI] = useState<number | null>(null)

  const q = useQuery({
    queryKey: ['cp-balance', SYMBOL, range],
    queryFn: async (): Promise<Pt[]> => {
      if (range === '1D') {
        const res = await api.indexMinute(SYMBOL)
        return (res.rows ?? []).map(r => ({ t: r.datetime, v: r.close }))
      }
      const res = await api.indexDaily(SYMBOL, RANGE_DAYS[range])
      return (res.rows ?? []).map(r => ({ t: r.date, v: r.close }))
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const pts = q.data ?? []
  const ready = pts.length >= 2

  // ===== 坐标映射(720×320, 上下留 8% 边距) =====
  let body = null
  if (ready) {
    const values = pts.map(p => p.v)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const pad = (rawMax - rawMin) * 0.08 || rawMax * 0.01 || 1
    const lo = rawMin - pad
    const hi = rawMax + pad
    const px = (i: number) => (i / (pts.length - 1)) * VW
    const py = (v: number) => VH - ((v - lo) / (hi - lo)) * VH

    let polyline = ''
    pts.forEach((p, i) => { polyline += `${px(i).toFixed(1)},${py(p.v).toFixed(1)} ` })
    const area = `M0 ${VH} L${pts.map((p, i) => `${px(i).toFixed(1)} ${py(p.v).toFixed(1)}`).join(' L')} L${VW} ${VH} Z`

    // 默认高亮 = 区间峰值
    let peak = 0
    values.forEach((v, i) => { if (v > values[peak]) peak = i })
    const hlI = hoverI != null ? Math.min(hoverI, pts.length - 1) : peak
    const hlPct = (hlI / (pts.length - 1)) * 100
    const hlYPct = (py(values[hlI]) / VH) * 100
    const flip = hlPct >= 38

    // 纵轴 5 档 / 横轴 ~6 个标签
    const yTicks = Array.from({ length: 5 }, (_, i) => hi - ((hi - lo) * i) / 4)
    const xCount = Math.min(6, pts.length)
    const xLabels = Array.from({ length: xCount }, (_, i) => {
      const idx = Math.round((i / (xCount - 1)) * (pts.length - 1))
      return axisLabel(pts[idx].t, range)
    })

    body = (
      <>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 236, padding: '2px 0', fontFamily: MONO, fontSize: 8.5, color: TXT_FAINT, textAlign: 'right', flex: 'none', width: 30 }}>
            {yTicks.map((v, i) => <span key={i}>{fmtAxis(v)}</span>)}
          </div>
          <div
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1)
              const i = Math.round(f * (pts.length - 1))
              if (i !== hoverI) setHoverI(i)
            }}
            onMouseLeave={() => setHoverI(null)}
            style={{ position: 'relative', flex: 1, height: 240, cursor: 'crosshair', minWidth: 0 }}
          >
            <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, display: 'block' }}>
              <defs>
                <pattern id={`pfBars-${uid}`} width="5" height="6" patternUnits="userSpaceOnUse">
                  <rect x="0" y="0" width="1.6" height="6" fill="rgba(213,240,33,.5)" />
                </pattern>
                <linearGradient id={`pfFade-${uid}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fff" stopOpacity=".55" />
                  <stop offset="100%" stopColor="#fff" stopOpacity=".05" />
                </linearGradient>
                <mask id={`pfMask-${uid}`}><path d={area} fill={`url(#pfFade-${uid})`} /></mask>
              </defs>
              <rect x="0" y="0" width={VW} height={VH} fill={`url(#pfBars-${uid})`} mask={`url(#pfMask-${uid})`} />
              <polyline
                points={polyline.trim()}
                fill="none" stroke={NEON} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ filter: 'drop-shadow(0 0 5px rgba(213,240,33,.4))' }}
              />
            </svg>
            {/* 十字线 + 光晕 + 圆环点 + 切角气泡 */}
            <span style={{ position: 'absolute', top: 0, bottom: 0, left: `${hlPct}%`, borderLeft: '1px dashed rgba(213,240,33,.45)', pointerEvents: 'none' }} />
            <span style={{ position: 'absolute', left: 0, right: 0, top: `${hlYPct}%`, borderTop: '1px dashed rgba(213,240,33,.35)', pointerEvents: 'none' }} />
            <span style={{ position: 'absolute', left: `${hlPct}%`, top: `${hlYPct}%`, width: 150, height: 150, transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle,rgba(213,240,33,.22),transparent 65%)', pointerEvents: 'none' }} />
            <span style={{ position: 'absolute', left: `${hlPct}%`, top: `${hlYPct}%`, width: 9, height: 9, transform: 'translate(-50%,-50%)', background: INK, border: `2px solid ${NEON}`, borderRadius: '50%', boxShadow: '0 0 10px rgba(213,240,33,.7)', pointerEvents: 'none' }} />
            <div
              style={{
                position: 'absolute', left: `${hlPct}%`, top: `${hlYPct}%`,
                transform: flip ? 'translate(-108%,-50%)' : 'translate(14px,-50%)',
                display: 'flex', alignItems: 'center', pointerEvents: 'none',
                transition: 'left .08s linear, top .08s linear',
              }}
            >
              <span style={{ width: 22, height: 22, background: 'rgba(213,240,33,.15)', border: '1px solid rgba(213,240,33,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: NEON, fontSize: 11, fontWeight: 700 }}>
                {values[hlI] >= values[0] ? '↑' : '↓'}
              </span>
              <div style={{ background: 'rgba(18,16,10,.94)', border: '1px solid rgba(213,240,33,.4)', padding: '7px 13px', display: 'flex', flexDirection: 'column', gap: 2, clipPath: clipBR(8) }}>
                <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 700, color: TXT_BODY, whiteSpace: 'nowrap' }}>
                  ${values[hlI].toFixed(2)}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 7, color: TXT_WEAK, letterSpacing: 1.5 }}>{pts[hlI].t}</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 38, fontFamily: MONO, fontSize: 8.5, color: TXT_FAINT, letterSpacing: 1 }}>
          {xLabels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}
        </div>
      </>
    )
  }

  const last = ready ? pts[pts.length - 1].v : null
  const periodPct = ready ? (pts[pts.length - 1].v / pts[0].v - 1) * 100 : null
  const periodUp = (periodPct ?? 0) >= 0

  return (
    <GlassCard variant="strong" corners style={{ minWidth: 0 }}>
      {/* 黄色题栏(左上切角) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: NEON, padding: '6px 13px', clipPath: clipTL(11) }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: 2 }}>大盘基准 · Balance</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, color: 'rgba(13,11,7,.7)', letterSpacing: 1.5 }}>MARKET.BENCH // {range}</span>
      </div>
      <div style={{ padding: '14px 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: MONO, fontSize: 8, color: TXT_WEAK, letterSpacing: 2 }}>{SYMBOL} // 标普500ETF</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 700, color: TXT_BODY, lineHeight: 1 }}>
                <span style={{ fontSize: 14, verticalAlign: 6, color: TXT_WEAK }}>$</span>
                {last != null ? last.toFixed(2) : '—'}
              </span>
              {periodPct != null && (
                <span
                  style={{
                    fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: '2px 7px',
                    color: periodUp ? NEON : DOWN,
                    background: periodUp ? 'rgba(213,240,33,.12)' : 'rgba(247,80,73,.12)',
                    border: periodUp ? '1px solid rgba(213,240,33,.4)' : '1px solid rgba(247,80,73,.4)',
                  }}
                >
                  {periodUp ? '↑' : '↓'} {Math.abs(periodPct).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', border: '1px solid rgba(213,240,33,.4)' }}>
            {RANGES.map(t => (
              <span
                key={t}
                onClick={() => { setRange(t); setHoverI(null) }}
                style={{
                  fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                  padding: '4px 10px', cursor: 'pointer',
                  background: t === range ? NEON : 'transparent',
                  color: t === range ? INK : NEON,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {ready ? body : (
          <DotGridEmpty
            text={q.isLoading ? 'LOADING…' : range === '1D' ? '今日暂无分时数据' : '暂无基准行情 · 请先同步指数日K'}
            minHeight={240}
            maskStop={40}
          />
        )}
      </div>
    </GlassCard>
  )
}
