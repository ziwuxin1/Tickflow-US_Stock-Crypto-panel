/**
 * 指数页右栏分时图 — design_handoff_index_page §4(Gemini 风格, 无卡片)。
 * 大价格头部 + 点阵背景(mask 裁掉曲线下方) + 紫渐变平滑曲线 + 端点呼吸/涟漪 +
 * 现价胶囊 + 悬停十字线胶囊 + 时间周期 tabs + 成交量副图。
 * 1D 用分时数据; 1W/1M/3M/1Y 复用日线收盘序列。
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Lock } from 'lucide-react'
import type { MinuteKlineRow } from '@/lib/api'
import { clamp, fmtHM, fmtVol, niceStep, smoothQPath, type KBar } from './chartMath'
import {
  UP, DOWN, MONO, I_PURPLE, I_LINE_STOPS, I_DOT_STROKE, I_RIPPLE, I_TAB_GRAD,
  TXT_TITLE, TXT_SECONDARY, TXT_WEAKER, TXT_FAINT, TXT_FAINTEST,
  VOL5_COLOR, VOL10_COLOR, I_VH, I_PX_H, IV_VH, IV_PX_H,
} from './tokens'

const I_L = 14
const I_T = 16
const I_B = 400

const PERIODS = ['1D', '1W', '1M', '3M', '1Y'] as const
type Period = (typeof PERIODS)[number]
const PERIOD_DAYS: Record<Exclude<Period, '1D'>, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }

interface Pt {
  label: string
  price: number
  vol: number
}

interface IntradayPanelProps {
  minuteRows: MinuteKlineRow[]
  dailyBars: KBar[]
  prevClose?: number | null
  quoteVolume?: number | null
  quoteAmount?: number | null
  minuteLocked?: boolean
  minuteLoading?: boolean
  /** 分时数据的实际日期(后端返回), 用于头部标签 */
  dateLabel?: string | null
  /** 加密标的: 7×24 无收盘, 基线为 UTC 0点日界价 */
  crypto?: boolean
  /** 实时模式(未选中历史日期) */
  live?: boolean
  /** 点击 LIVE 返回实时模式 */
  onBackToLive?: () => void
}

export function IntradayPanel({
  minuteRows, dailyBars, prevClose, quoteVolume, quoteAmount, minuteLocked, minuteLoading,
  dateLabel, crypto, live, onBackToLive,
}: IntradayPanelProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const wrapRef = useRef<HTMLDivElement>(null)
  const [iw, setIw] = useState(460)
  const [period, setPeriod] = useState<Period>('1D')
  const [win, setWin] = useState<{ iVis: number; iEnd: number } | null>(null)
  const [hover, setHover] = useState<number | null>(null) // 悬停点索引
  const dragRef = useRef<{ x: number; iEnd: number; w: number } | null>(null)

  // ===== 序列构建 =====
  const { pts, pv, baselineLabel } = useMemo(() => {
    if (period === '1D') {
      const p: Pt[] = minuteRows
        .filter(r => r?.close != null)
        .map(r => ({ label: fmtHM(r.datetime), price: Number(r.close), vol: Number(r.volume ?? 0) }))
      const base = prevClose ?? (minuteRows.length ? Number(minuteRows[0].open) : null)
      const day = dateLabel ? dateLabel.slice(5) : '今日'
      const baseHint = crypto ? '较UTC0点' : '较昨收'
      return { pts: p, pv: base, baselineLabel: `${day} 盘中 · ${baseHint}` }
    }
    const days = PERIOD_DAYS[period]
    const slice = dailyBars.slice(-days)
    const prevBar = dailyBars[dailyBars.length - slice.length - 1]
    const p: Pt[] = slice.map(b => ({ label: b.date.slice(5), price: b.close, vol: b.volume }))
    return { pts: p, pv: prevBar?.close ?? slice[0]?.open ?? null, baselineLabel: `${period} 区间` }
  }, [period, minuteRows, dailyBars, prevClose, dateLabel, crypto])

  const M = pts.length
  const minVis = M >= 300 ? 60 : Math.max(10, Math.round(M * 0.2))
  const iVis = win ? clamp(win.iVis, Math.min(minVis, M || 1), Math.max(M, 1)) : Math.max(M, 1)
  const iEnd = win ? clamp(win.iEnd, iVis - 1, Math.max(M - 1, 0)) : Math.max(M - 1, 0)
  const iOff = iEnd - iVis + 1

  useEffect(() => {
    setWin(null)
    setHover(null)
  }, [period, M])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && Math.abs(w - iw) > 2) setIw(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===== 几何 =====
  const VW2 = Math.max(200, Math.round(iw * I_VH / I_PX_H))
  const iR = VW2 - 54

  const geo = useMemo(() => {
    if (M < 2 || pv == null) return null
    let lo = Infinity
    let hi = -Infinity
    for (let i = iOff; i <= iEnd; i++) {
      if (pts[i].price < lo) lo = pts[i].price
      if (pts[i].price > hi) hi = pts[i].price
    }
    const pad = (hi - lo) * 0.04 || Math.abs(hi) * 0.002 || 1
    lo -= pad; hi += pad
    const ix = (i: number) => I_L + ((i - iOff) / Math.max(iVis - 1, 1)) * (iR - I_L)
    const iy = (v: number) => I_T + (hi - v) / (hi - lo) * (I_B - I_T)
    return { lo, hi, ix, iy }
  }, [pts, M, pv, iOff, iEnd, iVis, iR])

  // ===== 平滑曲线 + 面积 =====
  const curve = useMemo(() => {
    if (!geo) return null
    const { ix, iy } = geo
    const stepS = Math.max(1, Math.round(iVis / 65))
    const SS: Array<[number, number]> = []
    for (let i = iOff; i <= iEnd; i += stepS) SS.push([ix(i), iy(pts[i].price)])
    SS.push([ix(iEnd), iy(pts[iEnd].price)])
    const path = smoothQPath(SS)
    const area = `${path}L${SS[SS.length - 1][0].toFixed(1)} 424L${SS[0][0].toFixed(1)} 424Z`
    // 密集采样平滑曲线(按贝塞尔分段求值), 悬停点必须挂在绘制曲线上而非原始数据点,
    // 否则抽样步长大时(如 1Y 日线)悬停点会脱离曲线上下抖动。
    const dense: Array<[number, number]> = [SS[0]]
    let segStart = SS[0]
    for (let k = 1; k < SS.length - 1; k++) {
      const ctrl = SS[k]
      const segEnd: [number, number] = [(SS[k][0] + SS[k + 1][0]) / 2, (SS[k][1] + SS[k + 1][1]) / 2]
      for (const t of [0.25, 0.5, 0.75, 1]) {
        const mt = 1 - t
        dense.push([
          mt * mt * segStart[0] + 2 * mt * t * ctrl[0] + t * t * segEnd[0],
          mt * mt * segStart[1] + 2 * mt * t * ctrl[1] + t * t * segEnd[1],
        ])
      }
      segStart = segEnd
    }
    dense.push(SS[SS.length - 1]) // 尾段与 smoothQPath 的收尾 L 一致
    return { path, area, endX: ix(iEnd), endY: iy(pts[iEnd].price), dense }
  }, [geo, pts, iOff, iEnd, iVis])

  /** 在密集采样的曲线折线上按 x 线性插值求 y */
  const curveYAt = (x: number): number | null => {
    const d = curve?.dense
    if (!d || d.length === 0) return null
    if (x <= d[0][0]) return d[0][1]
    for (let i = 1; i < d.length; i++) {
      if (x <= d[i][0]) {
        const [x0, y0] = d[i - 1]
        const [x1, y1] = d[i]
        const f = x1 > x0 ? (x - x0) / (x1 - x0) : 0
        return y0 + (y1 - y0) * f
      }
    }
    return d[d.length - 1][1]
  }

  // ===== 轴刻度 =====
  const axis = useMemo(() => {
    if (!geo) return null
    const { lo, hi, ix, iy } = geo
    const yTicks: Array<{ y: number; label: string }> = []
    const st = niceStep(hi - lo, 5)
    for (let t = Math.ceil(lo / st) * st; t <= hi; t += st) {
      yTicks.push({ y: iy(t), label: t >= 100 ? t.toFixed(1) : t.toFixed(2) })
    }
    const xTicks: Array<{ x: number; label: string; anchor: 'start' | 'middle' | 'end' }> = []
    for (let k = 0; k <= 4; k++) {
      const idx = Math.round(iOff + (iVis - 1) * k / 4)
      if (idx < 0 || idx >= M) continue
      xTicks.push({
        x: ix(idx),
        label: pts[idx].label,
        anchor: k === 0 ? 'start' : k === 4 ? 'end' : 'middle',
      })
    }
    return { yTicks, xTicks }
  }, [geo, pts, M, iOff, iVis])

  // ===== 成交量副图 =====
  const volChart = useMemo(() => {
    if (!geo || M < 2) return null
    const { ix } = geo
    const stepV = Math.max(1, Math.round(iVis / 130))
    const sVol: number[] = []
    const sIdx: number[] = []
    for (let i = Math.max(iOff, stepV); i <= iEnd; i += stepV) {
      sVol.push(pts[i].vol)
      sIdx.push(i)
    }
    if (!sVol.length) return null
    const vmax = Math.max(...sVol) * 1.08 || 1
    const ivy = (v: number) => 104 - (v / vmax) * 94
    const bw2 = Math.max(0.6, (iR - I_L) / sVol.length * 0.28)
    let up = ''; let down = ''
    sVol.forEach((v, k) => {
      const i = sIdx[k]
      const x = ix(i)
      const bar = `M${(x - bw2).toFixed(1)} ${ivy(v).toFixed(1)}H${(x + bw2).toFixed(1)}V104H${(x - bw2).toFixed(1)}Z`
      const prev = pts[Math.max(i - stepV, 0)].price
      if (pts[i].price >= prev) up += bar; else down += bar
    })
    const maLine = (m: number) => {
      let s = ''
      for (let k = m - 1; k < sVol.length; k++) {
        let sum = 0
        for (let j = k - m + 1; j <= k; j++) sum += sVol[j]
        s += `${ix(sIdx[k]).toFixed(1)},${ivy(Math.min(sum / m, vmax)).toFixed(1)} `
      }
      return s.trim()
    }
    const last5 = sVol.slice(-5)
    const last10 = sVol.slice(-10)
    return {
      up, down, vol5: maLine(5), vol10: maLine(10),
      lastVol: sVol[sVol.length - 1],
      vol5v: last5.reduce((a, b) => a + b, 0) / Math.max(last5.length, 1),
      vol10v: last10.reduce((a, b) => a + b, 0) / Math.max(last10.length, 1),
    }
  }, [geo, pts, M, iOff, iEnd, iVis, iR])

  // ===== 交互 =====
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const svg = (e.target as Element | null)?.closest?.('svg[data-isvg]')
      if (!svg || M < 2) return
      e.preventDefault()
      const r = svg.getBoundingClientRect()
      const frac = clamp((e.clientX - r.left) / r.width, 0, 1)
      setWin(w => {
        const curVis = w ? w.iVis : M
        const curEnd = w ? w.iEnd : M - 1
        let nv = Math.round(curVis * (e.deltaY > 0 ? 1.25 : 0.8))
        nv = clamp(nv, Math.min(minVis, M), M)
        if (nv === curVis) return w
        const anchor = curEnd - curVis + 1 + frac * curVis
        const noff = clamp(Math.round(anchor - frac * nv), 0, M - nv)
        return { iVis: nv, iEnd: noff + nv - 1 }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [M, minVis])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || M < 2) return
    e.preventDefault()
    dragRef.current = { x: e.clientX, iEnd, w: e.currentTarget.getBoundingClientRect().width }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const per = d.w / iVis
      const ne = clamp(Math.round(d.iEnd - (ev.clientX - d.x) / per), iVis - 1, M - 1)
      setWin(w => (w && w.iEnd === ne ? w : { iVis, iEnd: ne }))
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const onHoverMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo || M < 2) return
    const r = e.currentTarget.getBoundingClientRect()
    const vx = (e.clientX - r.left) / r.width * VW2
    if (vx < I_L || vx > iR) {
      setHover(null)
      return
    }
    const k = clamp(iOff + Math.round((vx - I_L) / (iR - I_L) * (iVis - 1)), iOff, iOff + iVis - 1)
    setHover(k)
  }

  // ===== 头部数值 =====
  const lastPrice = M ? pts[M - 1].price : null
  const chg = lastPrice != null && pv != null ? lastPrice - pv : null
  const chgPct = chg != null && pv ? (chg / pv) * 100 : null
  const chgUp = (chg ?? 0) >= 0
  const totalVol = quoteVolume ?? (period === '1D'
    ? minuteRows.reduce((a, r) => a + Number(r.volume ?? 0), 0)
    : pts.reduce((a, p) => a + p.vol, 0))
  const totalAmt = quoteAmount ?? (period === '1D'
    ? minuteRows.reduce((a, r) => a + Number(r.amount ?? 0), 0)
    : null)
  const [intPart, decPart] = (lastPrice != null ? lastPrice.toFixed(2) : '--.--').split('.')

  const showLock = period === '1D' && minuteLocked
  const showEmpty = !showLock && (M < 2 || pv == null)

  // 悬停派生
  const hoverGeo = hover != null && geo ? (() => {
    const sx = geo.ix(hover)
    // 点吸附到绘制的平滑曲线, 数值仍取原始数据
    const sy = curveYAt(sx) ?? geo.iy(pts[hover].price)
    const pc = pv ? (pts[hover].price / pv - 1) * 100 : 0
    let bx = sx - 186
    if (bx < 12) bx = sx + 28
    bx = Math.min(bx, VW2 - 168)
    const by = clamp(sy - 23, 12, 372)
    return { sx, sy, pc, bx, by }
  })() : null

  // 端点胶囊
  const endCap = curve ? (() => {
    const tpX = Math.max(curve.endX - 182, 8)
    const tpY = Math.max(curve.endY - 24, 14)
    return { tpX, tpY }
  })() : null

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column' }}>
      {/* 头部: 大价格 + 涨跌 + 量额 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '2px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, fontFamily: MONO }}>
          <span style={{ fontSize: 31, fontWeight: 700, color: TXT_TITLE, lineHeight: 1 }}>{intPart}</span>
          <span style={{ fontSize: 19, fontWeight: 700, color: '#9aa0bc' }}>.{decPart}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11.5, fontFamily: MONO }}>
          <span style={{ color: chgUp ? UP : DOWN, fontWeight: 700 }}>
            {chgUp ? '↗' : '↘'} {chg != null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}` : '--'} ({chgPct != null ? `${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%` : '--'})
          </span>
          <span style={{ color: TXT_WEAKER }}>{baselineLabel}</span>
          <span style={{ marginLeft: 'auto', color: TXT_WEAKER }}>量 <b style={{ color: TXT_SECONDARY, fontWeight: 600 }}>{fmtVol(totalVol)}</b></span>
          {totalAmt != null && totalAmt > 0 && (
            <span style={{ color: TXT_WEAKER }}>额 <b style={{ color: TXT_SECONDARY, fontWeight: 600 }}>{fmtVol(totalAmt)}</b></span>
          )}
        </div>
      </div>

      {/* 主图 */}
      {showLock ? (
        <div style={{ height: I_PX_H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Lock size={20} color={TXT_FAINT} />
          <div style={{ fontSize: 12, color: TXT_SECONDARY }}>分时数据权限需 Pro+</div>
          <div style={{ fontSize: 10, color: TXT_FAINT }}>升级套餐后可查看指数分时走势 · 可切换 1W/1M 查看日线走势</div>
        </div>
      ) : showEmpty ? (
        <div style={{ height: I_PX_H, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: TXT_FAINT }}>
          {minuteLoading ? '分时加载中…' : '暂无分时数据'}
        </div>
      ) : (
        <svg
          data-isvg="" viewBox={`0 0 ${VW2} ${I_VH}`} preserveAspectRatio="none"
          style={{ width: '100%', height: I_PX_H, display: 'block', touchAction: 'none', cursor: 'grab' }}
          onPointerDown={onPointerDown}
          onDoubleClick={() => setWin(null)}
          onPointerMove={onHoverMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`iLineG${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={I_LINE_STOPS[0]} />
              <stop offset="55%" stopColor={I_LINE_STOPS[1]} />
              <stop offset="100%" stopColor={I_LINE_STOPS[2]} />
            </linearGradient>
            <pattern id={`iDotsP${uid}`} width="34" height="34" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1.5" fill="rgba(170,140,250,.22)" />
            </pattern>
            <linearGradient id={`iDotVG${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#555" />
              <stop offset="18%" stopColor="#fff" />
              <stop offset="78%" stopColor="#fff" />
              <stop offset="100%" stopColor="#111" />
            </linearGradient>
            <mask id={`iDotV${uid}`}>
              <rect x="0" y="0" width={VW2} height={I_VH} fill={`url(#iDotVG${uid})`} />
              {curve && <path d={curve.area} fill="#000" />}
            </mask>
            <radialGradient id={`iGlow${uid}`}>
              <stop offset="0%" stopColor="rgba(177,140,255,.8)" />
              <stop offset="45%" stopColor="rgba(177,140,255,.2)" />
              <stop offset="100%" stopColor="rgba(177,140,255,0)" />
            </radialGradient>
            <radialGradient id={`iAmb${uid}`}>
              <stop offset="0%" stopColor="rgba(140,100,240,.16)" />
              <stop offset="100%" stopColor="rgba(140,100,240,0)" />
            </radialGradient>
            <linearGradient id={`iFill${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(150,115,245,.22)" />
              <stop offset="55%" stopColor="rgba(100,72,190,.09)" />
              <stop offset="100%" stopColor="rgba(45,35,90,0)" />
            </linearGradient>
            <linearGradient id={`iFadeLG${uid}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#000" />
              <stop offset="7%" stopColor="#fff" />
              <stop offset="88%" stopColor="#fff" />
              <stop offset="100%" stopColor="#000" />
            </linearGradient>
            <mask id={`iFade${uid}`}>
              <rect x="0" y="0" width={VW2} height={I_VH} fill={`url(#iFadeLG${uid})`} />
            </mask>
          </defs>
          {curve && (
            <g mask={`url(#iFade${uid})`}>
              <g mask={`url(#iDotV${uid})`}>
                <rect x="8" y="8" width={VW2 - 16} height="412" fill={`url(#iDotsP${uid})`} />
              </g>
              <ellipse cx={curve.endX} cy={curve.endY} rx="215" ry="185" fill={`url(#iAmb${uid})`} />
              <path d={curve.area} fill={`url(#iFill${uid})`} />
              <path
                d={curve.path} fill="none" stroke={`url(#iLineG${uid})`} strokeWidth={2}
                strokeLinecap="round" strokeLinejoin="round"
                style={{ filter: 'drop-shadow(0 0 4px rgba(177,140,255,.28))' }}
              />
            </g>
          )}
          {/* 轴 */}
          {axis && (
            <g>
              {axis.yTicks.map((t, i) => (
                <text key={i} x={10} y={t.y + 3.5} fontSize={10} fill={TXT_WEAKER} fontFamily={MONO}>{t.label}</text>
              ))}
              {axis.xTicks.map((t, i) => (
                <text key={i} x={t.x} y={436} textAnchor={t.anchor} fontSize={10} fill={TXT_FAINT} fontFamily={MONO}>{t.label}</text>
              ))}
            </g>
          )}
          {/* 端点固定十字线 + 现价胶囊(悬停时隐藏) */}
          {curve && endCap && hover == null && (
            <g>
              <line x1={I_L} y1={curve.endY} x2={VW2 - 8} y2={curve.endY} stroke="rgba(160,130,245,.45)" strokeWidth={1} strokeDasharray="4 4" />
              <line x1={curve.endX} y1={16} x2={curve.endX} y2={418} stroke="rgba(160,130,245,.32)" strokeWidth={1} strokeDasharray="4 4" />
              <rect x={endCap.tpX} y={endCap.tpY} width={152} height={46} rx={12} fill="rgba(214,235,214,.08)" stroke="rgba(255,255,255,.16)" />
              <rect x={endCap.tpX + 10} y={endCap.tpY + 11} width={24} height={24} rx={8} fill="rgba(177,140,255,.16)" />
              <text x={endCap.tpX + 22} y={endCap.tpY + 28} textAnchor="middle" fontSize={13} fill={I_PURPLE}>{chgUp ? '↗' : '↘'}</text>
              <text x={endCap.tpX + 44} y={endCap.tpY + 22} fontSize={13} fontWeight={700} fill={TXT_TITLE} fontFamily={MONO}>
                {lastPrice != null ? lastPrice.toFixed(2) : '--'}
              </text>
              <text x={endCap.tpX + 44} y={endCap.tpY + 37} fontSize={10} fill="#8f95b2">现价</text>
            </g>
          )}
          {/* 端点氛围光 + 涟漪 + 呼吸点 */}
          {curve && (
            <g>
              <ellipse
                cx={curve.endX} cy={curve.endY} rx={17} ry={17} fill={`url(#iGlow${uid})`}
                style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'glowPulse 2.2s ease-in-out infinite' }}
              />
              <circle
                cx={curve.endX} cy={curve.endY} r={9} fill="none" stroke={I_RIPPLE} strokeWidth={1.6}
                style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'ripple 2.2s ease-out infinite' }}
              />
              <circle
                cx={curve.endX} cy={curve.endY} r={9} fill="none" stroke={I_RIPPLE} strokeWidth={1.6}
                style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'ripple 2.2s ease-out infinite', animationDelay: '-1.1s' }}
              />
              <ellipse
                cx={curve.endX} cy={curve.endY} rx={4} ry={4} fill="#120e24" stroke={I_DOT_STROKE} strokeWidth={2}
                style={{ transformBox: 'fill-box', transformOrigin: 'center', animation: 'dotPulse 2.2s ease-in-out infinite' }}
              />
            </g>
          )}
          {/* 悬停十字线 + 胶囊 */}
          {hoverGeo && hover != null && (
            <g pointerEvents="none">
              <line x1={hoverGeo.sx} y1={8} x2={hoverGeo.sx} y2={420} stroke="rgba(160,130,245,.5)" strokeWidth={1} strokeDasharray="4 4" />
              <line x1={8} y1={hoverGeo.sy} x2={VW2 - 8} y2={hoverGeo.sy} stroke="rgba(160,130,245,.38)" strokeWidth={1} strokeDasharray="4 4" />
              <circle
                cx={hoverGeo.sx} cy={hoverGeo.sy} r={11} fill="rgba(177,140,255,.16)"
                style={{
                  transformBox: 'fill-box', transformOrigin: 'center',
                  animation: 'dotPulse 1.6s ease-in-out infinite',
                  animationDelay: `-${(performance.now() % 1600).toFixed(0)}ms`,
                }}
              />
              <ellipse cx={hoverGeo.sx} cy={hoverGeo.sy} rx={4.5} ry={4.5} fill={I_PURPLE} stroke="#d9ccff" strokeWidth={1.4} />
              <rect x={hoverGeo.bx} y={hoverGeo.by} width={156} height={46} rx={12} fill="rgba(210,205,240,.09)" stroke="rgba(255,255,255,.16)" />
              <rect x={hoverGeo.bx + 10} y={hoverGeo.by + 11} width={24} height={24} rx={8} fill="rgba(177,140,255,.16)" />
              <text x={hoverGeo.bx + 22} y={hoverGeo.by + 28} textAnchor="middle" fontSize={13} fill={I_PURPLE}>{hoverGeo.pc >= 0 ? '↗' : '↘'}</text>
              <text x={hoverGeo.bx + 44} y={hoverGeo.by + 22} fontSize={13} fontWeight={700} fill={TXT_TITLE} fontFamily={MONO}>
                {pts[hover].price.toFixed(2)}
              </text>
              <text x={hoverGeo.bx + 44} y={hoverGeo.by + 37} fontSize={10} fill={hoverGeo.pc >= 0 ? UP : DOWN} fontFamily={MONO}>
                {hoverGeo.pc >= 0 ? '+' : ''}{hoverGeo.pc.toFixed(2)}% <tspan fill={TXT_WEAKER}>{pts[hover].label}</tspan>
              </text>
            </g>
          )}
        </svg>
      )}

      {/* 底部: LIVE + 时间周期 tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '14px 6px 4px',
        fontSize: 11.5, fontFamily: MONO, borderTop: '1px solid rgba(255,255,255,.06)', marginTop: 8,
      }}>
        <button
          onClick={onBackToLive}
          title={live ? '实时模式' : '返回今日实时分时'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
            color: live ? I_PURPLE : TXT_WEAKER, background: 'transparent', border: 'none',
            cursor: onBackToLive ? 'pointer' : 'default', fontFamily: 'inherit', fontSize: 'inherit',
          }}
        >
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: live ? I_PURPLE : TXT_FAINTEST,
            boxShadow: live ? '0 0 6px rgba(177,140,255,.8)' : 'none',
          }} />LIVE
        </button>
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={p === period ? {
              color: '#fff', background: I_TAB_GRAD, borderRadius: 999, padding: '5px 14px',
              fontWeight: 700, boxShadow: '0 2px 12px rgba(140,100,240,.35)',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
            } : {
              color: TXT_WEAKER, padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
              background: 'transparent', border: 'none', fontFamily: 'inherit', fontSize: 'inherit',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* 成交量副图 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '12px 6px 2px',
        fontSize: 10.5, fontFamily: MONO, borderTop: '1px solid rgba(255,255,255,.06)', marginTop: 10,
      }}>
        <span style={{ color: '#838aa8' }}>成交量</span>
        {volChart && (
          <>
            <span style={{ marginLeft: 'auto', color: UP }}>量:{fmtVol(volChart.lastVol)}</span>
            <span style={{ color: VOL5_COLOR }}>VOL5:{fmtVol(volChart.vol5v)}</span>
            <span style={{ color: VOL10_COLOR }}>VOL10:{fmtVol(volChart.vol10v)}</span>
          </>
        )}
      </div>
      <svg viewBox={`0 0 ${VW2} ${IV_VH}`} preserveAspectRatio="none" style={{ width: '100%', height: IV_PX_H, display: 'block' }}>
        {volChart && (
          <>
            <path d={volChart.up} fill={UP} opacity={0.85} />
            <path d={volChart.down} fill={DOWN} opacity={0.85} />
            <polyline points={volChart.vol5} fill="none" stroke={VOL5_COLOR} strokeWidth={1.3} strokeLinejoin="round" />
            <polyline points={volChart.vol10} fill="none" stroke={VOL10_COLOR} strokeWidth={1.3} strokeLinejoin="round" />
          </>
        )}
      </svg>
    </div>
  )
}
