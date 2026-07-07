/**
 * 指数页日 K 线图 — design_handoff_index_page §3 中栏K线区。
 * SVG 自绘: 蜡烛+MA+波浪信号 / 成交量 / MACD 三图共用横轴, 缩放平移联动。
 * 动态坐标系: viewBox 宽 = 容器宽 × (视口高/像素高), 保证 1:1 像素比文字不变形。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { clamp, fmtVol, niceStep, sma, type KBar } from './chartMath'
import { detectWavePivots, WaveSignalsLayer } from './waveSignals'
import { detectTriangle, TriangleZoneLayer } from './triangleZone'
import { computeForecast, ForecastLayer } from './forecastLine'
import { AiPatternsLayer } from './aiPatternLayer'
import type { AiPatterns } from '@/lib/api'
import { CurvesLayer, LevelLinesLayer, type CurveOverlay, type LevelLine } from './levelOverlays'
import {
  UP, DOWN, MA_COLORS, VOL5_COLOR, VOL10_COLOR, DIF_COLOR, DEA_COLOR,
  MONO, GRID_STROKE, AXIS_TEXT, AXIS_TEXT_DIM, TXT_SECONDARY, TXT_WEAK, TXT_FAINTEST,
  K_VH, K_PX_H, SUB_VH, SUB_PX_H,
} from './tokens'

const MIN_VIS = 5
const MAX_VIS = 2200

// ===== 时间范围快捷档(日K: 24H 由分时面板承担) =====
type PresetKey = '7d' | '1m' | '3m' | '6m' | 'ytd' | '1y' | 'max'
const RANGE_PRESETS: { key: PresetKey; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: 'ytd', label: 'YTD' },
  { key: '1y', label: '1Y' },
  { key: 'max', label: 'Max' },
]

/** 按日期回溯计算预设档的可见根数(交易日) */
function presetVisible(bars: KBar[], key: PresetKey): number {
  const n = bars.length
  if (n === 0) return 0
  if (key === 'max') return n
  const last = new Date(`${bars[n - 1].date}T00:00:00Z`)
  const from = new Date(last)
  if (key === '7d') from.setUTCDate(from.getUTCDate() - 7)
  else if (key === '1m') from.setUTCMonth(from.getUTCMonth() - 1)
  else if (key === '3m') from.setUTCMonth(from.getUTCMonth() - 3)
  else if (key === '6m') from.setUTCMonth(from.getUTCMonth() - 6)
  else if (key === '1y') from.setUTCFullYear(from.getUTCFullYear() - 1)
  else from.setUTCMonth(0, 1) // ytd: 当年 1 月 1 日
  const iso = from.toISOString().slice(0, 10)
  let i = n - 1
  while (i > 0 && bars[i - 1].date >= iso) i--
  return n - i
}
/** 最新K线右侧预留空档: 可见根数的 25%(下限 10 格), 给波浪预测线/三角区/价位标签留足空间 */
const FUTURE_PAD_MIN = 10
const FUTURE_PAD_RATIO = 0.25
const padFor = (vis: number) =>
  Math.min(Math.max(FUTURE_PAD_MIN, Math.round(vis * FUTURE_PAD_RATIO)), Math.max(0, vis - 2))

/** 自由平移上限: 最多把K线拖到只剩 2 根在左缘(右侧空档大小随意) */
const maxEndFor = (n: number, vis: number) =>
  Math.max(n - 1, 0) + Math.max(padFor(vis), vis - 2)
const PLOT_T = 14
const PLOT_B = 408
const SUB_T = 8
const SUB_B = 104
const MACD_T = 8
const MACD_B = 102

interface ChartWindow {
  vis: number
  end: number
  yOff: number
  /** 价格轴纵向缩放倍率(拖价格轴调节), 1=自动适配 */
  yScale: number
}

interface KLineChartProps {
  bars: KBar[]
  showSignals?: boolean
  /** 三角区(收敛三角形)检测标注, 默认开 */
  showTriangle?: boolean
  /** 趋势预测线(线性回归外推+置信扇面), 默认开 */
  showForecast?: boolean
  /** AI 形态标注: 三角区/预测路径/波浪拐点(个股分析页 AI 预测传入) */
  aiPatterns?: AiPatterns | null
  /** 水平关键价位线(个股分析页传入) */
  levelLines?: LevelLine[]
  /** 通道曲线: 布林/Keltner/ATR(个股分析页传入) */
  curves?: CurveOverlay[]
  /** 初始可见K线根数, 默认 60 */
  defaultVisible?: number
  /** 十字线点击某根 K 时回调(联动分时日期) */
  onDateClick?: (date: string) => void
}

function defaultWindow(n: number, defVis = 60): ChartWindow {
  const vis = Math.min(defVis, Math.max(n, 1))
  return { vis, end: n - 1 + padFor(vis), yOff: 0, yScale: 1 }
}

/** MACD 轴标签自适应精度 */
function fmtMacdTick(v: number): string {
  const a = Math.abs(v)
  if (a >= 100) return v.toFixed(0)
  if (a >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

/** 价格轴标签: 大数值减小数位, 避免超出 44px 轴宽被截断(如 BTC 6 万) */
function fmtPriceTick(v: number): string {
  const a = Math.abs(v)
  if (a >= 10000) return v.toFixed(0)
  if (a >= 1000) return v.toFixed(1)
  return v.toFixed(2)
}

export function KLineChart({
  bars, showSignals = true, showTriangle = true, showForecast = true,
  aiPatterns, levelLines, curves, defaultVisible = 60, onDateClick,
}: KLineChartProps) {
  const n = bars.length
  const wrapRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<SVGSVGElement>(null)
  const [kw, setKw] = useState(1000)
  const [win, setWin] = useState<ChartWindow>(() => defaultWindow(n, defaultVisible))
  const [hover, setHover] = useState<{ vx: number; vy: number } | null>(null)
  /** 当前激活的时间范围档(手动缩放/平移后失效) */
  const [preset, setPreset] = useState<PresetKey | null>(null)
  const dragRef = useRef<{
    x: number; y: number; end: number; yOff: number; w: number; moved: boolean
    mode: 'pan' | 'yaxis' | 'xaxis'; vis: number; yScale: number
  } | null>(null)

  // 数据量变化(切换标的/同步后)复位窗口
  useEffect(() => {
    setWin(defaultWindow(n, defaultVisible))
    setHover(null)
    setPreset(null)
  }, [n, bars[0]?.date, defaultVisible])

  /** 应用时间范围档: 定位到最新K线, 可见根数按日期回溯 */
  const applyPreset = (k: PresetKey) => {
    const v = clamp(presetVisible(bars, k), Math.min(MIN_VIS, n || 1), Math.min(MAX_VIS, Math.max(n, 1)))
    setWin({ vis: v, end: n - 1 + padFor(v), yOff: 0, yScale: 1 })
    setPreset(k)
  }

  // 容器宽度监听
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && Math.abs(w - kw) > 2) setKw(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 视口高度监听: 图表高度自适应屏幕
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 900))
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 最大化(全屏覆盖层), Esc 退出
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    if (!maximized) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMaximized(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maximized])

  /** 主/副图像素高: 随视口高度缩放, 小屏不低于设计稿基准(378/96); 最大化时占比更高 */
  const mainPxH = clamp(Math.round(vh * (maximized ? 0.62 : 0.55)), K_PX_H, maximized ? 1400 : 1100)
  const subPxH = clamp(Math.round(vh * (maximized ? 0.13 : 0.11)), SUB_PX_H, maximized ? 220 : 180)

  const vis = clamp(win.vis, Math.min(MIN_VIS, n || 1), Math.min(MAX_VIS, Math.max(n, 1)))
  const end = clamp(win.end, vis - 1, maxEndFor(n, vis))
  const off = end - vis + 1
  /** 数据侧终点: end 可越过最后一根K(右侧空档), 数据遍历只到 n-1 */
  const endData = Math.min(end, n - 1)

  // ===== 几何(全部在 viewBox 坐标系内) =====
  const VW = Math.max(300, Math.round(kw * K_VH / mainPxH))
  const plotL = 44
  const plotR = VW - 10
  const step = (plotR - plotL) / Math.max(vis, 1)
  /** 蜡烛半宽: 实体占间距 78%, 保留 22% 空隙 */
  const bw = step * 0.39
  const px = (i: number) => plotL + (i - off) * step + step / 2

  const geo = useMemo(() => {
    if (n === 0 || endData < off) return null
    let lo = Infinity
    let hi = -Infinity
    for (let i = off; i <= endData; i++) {
      if (bars[i].low < lo) lo = bars[i].low
      if (bars[i].high > hi) hi = bars[i].high
    }
    const pad = (hi - lo) * 0.06 || 1
    lo -= pad
    hi += pad
    // 价格轴缩放: 围绕中点按 yScale 扩缩, 再叠加纵向平移 yOff
    const mid = (lo + hi) / 2
    const half = (hi - lo) / 2 * win.yScale
    lo = mid - half + win.yOff
    hi = mid + half + win.yOff
    const py = (v: number) => PLOT_T + (hi - v) / (hi - lo) * (PLOT_B - PLOT_T)
    return { lo, hi, py }
  }, [bars, n, off, endData, win.yOff, win.yScale])

  // ===== 主图路径 =====
  const main = useMemo(() => {
    if (!geo || n === 0) return null
    const { lo, hi, py } = geo
    let upW = ''; let dnW = ''; let upB = ''; let dnB = ''
    for (let i = off; i <= endData; i++) {
      const b = bars[i]
      const x = px(i)
      const up = b.close >= b.open
      const yT = py(Math.max(b.open, b.close))
      const yBm = Math.max(py(Math.min(b.open, b.close)), yT + 1)
      const wick = `M${x.toFixed(1)} ${py(b.high).toFixed(1)}L${x.toFixed(1)} ${py(b.low).toFixed(1)}`
      const body = `M${(x - bw).toFixed(1)} ${yT.toFixed(1)}H${(x + bw).toFixed(1)}V${yBm.toFixed(1)}H${(x - bw).toFixed(1)}Z`
      if (up) { upW += wick; upB += body } else { dnW += wick; dnB += body }
    }
    // 网格 + 轴标签
    let grid = ''
    const yTicks: Array<{ y: number; label: string }> = []
    const stepY = niceStep(hi - lo, 9)
    for (let t = Math.ceil(lo / stepY) * stepY; t <= hi; t += stepY) {
      grid += `M${plotL} ${py(t).toFixed(1)}H${plotR}`
      yTicks.push({ y: py(t), label: fmtPriceTick(t) })
    }
    const xTicks: Array<{ x: number; label: string }> = []
    const lStep = Math.max(2, Math.round(vis / 6))
    for (let i = off + Math.floor(lStep / 2); i <= endData; i += lStep) {
      xTicks.push({ x: px(i), label: bars[i].date })
    }
    // 均线(可视区裁剪, 越界 clamp 到边界)
    const maLine = (key: 'ma5' | 'ma10' | 'ma20' | 'ma60') => {
      let s = ''
      for (let i = off; i <= endData; i++) {
        const v = bars[i][key]
        if (v == null) continue
        s += `${px(i).toFixed(1)},${py(clamp(v, lo, hi)).toFixed(1)} `
      }
      return s.trim()
    }
    return {
      upW, dnW, upB, dnB, grid, yTicks, xTicks,
      ma5: maLine('ma5'), ma10: maLine('ma10'), ma20: maLine('ma20'), ma60: maLine('ma60'),
    }
  }, [geo, bars, n, off, endData, vis, VW]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 成交量副图 =====
  const volumes = useMemo(() => bars.map(b => b.volume), [bars])
  const vol = useMemo(() => {
    if (n === 0) return null
    let vMax = 0
    for (let i = off; i <= endData; i++) vMax = Math.max(vMax, volumes[i])
    vMax = vMax * 1.05 || 1
    const vy = (v: number) => SUB_B - (v / vMax) * (SUB_B - SUB_T)
    let up = ''; let down = ''
    for (let i = off; i <= endData; i++) {
      const x = px(i)
      const bar = `M${(x - bw).toFixed(1)} ${vy(volumes[i]).toFixed(1)}H${(x + bw).toFixed(1)}V${SUB_B}H${(x - bw).toFixed(1)}Z`
      if (bars[i].close >= bars[i].open) up += bar; else down += bar
    }
    const maLine = (m: number) => {
      let s = ''
      for (let i = Math.max(m - 1, off); i <= endData; i++) {
        const v = sma(volumes, m, i)
        if (v == null) continue
        s += `${px(i).toFixed(1)},${vy(Math.min(v, vMax)).toFixed(1)} `
      }
      return s.trim()
    }
    const tick = niceStep(vMax, 2)
    const ticks: Array<{ y: number; label: string }> = []
    for (let t = tick; t < vMax; t += tick) ticks.push({ y: vy(t), label: fmtVol(t) })
    return { up, down, vol5: maLine(5), vol10: maLine(10), ticks }
  }, [bars, volumes, n, off, endData, VW]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== MACD 副图 =====
  const macd = useMemo(() => {
    if (n === 0) return null
    let mAbs = 0
    for (let i = off; i <= endData; i++) {
      mAbs = Math.max(mAbs, Math.abs(bars[i].dif), Math.abs(bars[i].dea), Math.abs(bars[i].hist))
    }
    mAbs = mAbs * 1.15 || 1
    const mMid = (MACD_T + MACD_B) / 2
    const my = (v: number) => mMid - (v / mAbs) * (MACD_B - MACD_T) / 2
    let up = ''; let down = ''
    for (let i = off; i <= endData; i++) {
      const x = px(i)
      const y = my(bars[i].hist)
      const bar = `M${(x - bw * 0.7).toFixed(1)} ${Math.min(y, mMid).toFixed(1)}H${(x + bw * 0.7).toFixed(1)}V${Math.max(y, mMid).toFixed(1)}H${(x - bw * 0.7).toFixed(1)}Z`
      if (bars[i].hist >= 0) up += bar; else down += bar
    }
    const lineP = (key: 'dif' | 'dea') => {
      let s = ''
      for (let i = off; i <= endData; i++) s += `${px(i).toFixed(1)},${my(bars[i][key]).toFixed(1)} `
      return s.trim()
    }
    const mTick = mAbs / 2
    return { up, down, difP: lineP('dif'), deaP: lineP('dea'), mMid, my, mTick }
  }, [bars, n, off, endData, VW]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 波浪信号 =====
  const pivots = useMemo(() => (showSignals ? detectWavePivots(bars) : null), [bars, showSignals])

  // ===== 三角区(收敛三角形) =====
  const triangle = useMemo(() => (showTriangle ? detectTriangle(bars) : null), [bars, showTriangle])

  // ===== 趋势预测线 =====
  const forecast = useMemo(() => (showForecast ? computeForecast(bars) : null), [bars, showForecast])

  // ===== 交互: 滚轮缩放(非 passive) =====
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const svg = (e.target as Element | null)?.closest?.('svg[data-kchart]')
      if (!svg) return
      e.preventDefault()
      setPreset(null)
      const r = svg.getBoundingClientRect()
      const frac = clamp((e.clientX - r.left) / r.width, 0, 1)
      setWin(w => {
        const maxVis = Math.min(MAX_VIS, Math.max(n, 1))
        let nv = Math.round(w.vis * (e.deltaY > 0 ? 1.2 : 1 / 1.2))
        nv = clamp(nv, Math.min(MIN_VIS, maxVis), maxVis)
        if (nv === w.vis) return w
        const anchor = w.end - w.vis + 1 + frac * w.vis
        const noff = clamp(Math.round(anchor - frac * nv), 0, maxEndFor(n, nv) - nv + 1)
        return { ...w, vis: nv, end: noff + nv - 1 }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [n])

  // ===== 交互: 绘图区拖拽平移 / 价格轴拖拽纵向缩放 / 日期轴拖拽横向缩放 =====
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    // 轴区域仅主图有效: 左侧价格轴柱(vx<plotL) / 底部日期轴条(vy>PLOT_B)
    let mode: 'pan' | 'yaxis' | 'xaxis' = 'pan'
    if (e.currentTarget === mainRef.current) {
      const vx = (e.clientX - r.left) / r.width * VW
      const vy = (e.clientY - r.top) / r.height * K_VH
      if (vx < plotL) mode = 'yaxis'
      else if (vy > PLOT_B) mode = 'xaxis'
    }
    dragRef.current = { x: e.clientX, y: e.clientY, end, yOff: win.yOff, w: r.width, moved: false, mode, vis, yScale: win.yScale }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || !geo) return
      if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 4) {
        if (!d.moved) setPreset(null)
        d.moved = true
      }
      if (d.mode === 'yaxis') {
        // 向下拖 = 放大价格范围(压扁), 向上拖 = 压缩范围(拉伸)
        const ny = clamp(d.yScale * Math.exp((ev.clientY - d.y) / 150), 0.15, 12)
        setWin(w2 => (Math.abs(ny - w2.yScale) > 1e-4 ? { ...w2, yScale: ny } : w2))
        return
      }
      if (d.mode === 'xaxis') {
        // 向右拖 = 拉伸K线(减少可见根数), 向左拖 = 压缩; 右缘锚定
        const maxVis = Math.min(MAX_VIS, Math.max(n, 1))
        const nv = clamp(Math.round(d.vis * Math.exp(-(ev.clientX - d.x) / 200)), Math.min(MIN_VIS, maxVis), maxVis)
        setWin(w2 => (nv !== w2.vis ? { ...w2, vis: nv } : w2))
        return
      }
      const per = d.w / vis
      const nEnd = clamp(Math.round(d.end - (ev.clientX - d.x) / per), vis - 1, maxEndFor(n, vis))
      const ppp = (geo.hi - geo.lo) / mainPxH * (K_VH / (PLOT_B - PLOT_T))
      const nyOff = d.yOff + (ev.clientY - d.y) * ppp
      setWin(w2 => (nEnd !== w2.end || Math.abs(nyOff - w2.yOff) > 0.005 ? { ...w2, end: nEnd, yOff: nyOff } : w2))
    }
    const onUp = () => {
      dragRef.current = null
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const onDoubleClick = () => {
    setWin(defaultWindow(n, defaultVisible))
    setPreset(null)
  }

  // ===== 十字线(仅主图) =====
  const [axisCursor, setAxisCursor] = useState<'grab' | 'ns-resize' | 'ew-resize'>('grab')
  const onMainMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const vx = (e.clientX - r.left) / r.width * VW
    const vy = (e.clientY - r.top) / r.height * K_VH
    if (vx >= plotL && vx <= plotR && vy >= PLOT_T && vy <= PLOT_B) setHover({ vx, vy })
    else setHover(null)
    // 轴区域光标提示: 价格轴上下缩放 / 日期轴左右缩放
    setAxisCursor(vx < plotL ? 'ns-resize' : vy > PLOT_B ? 'ew-resize' : 'grab')
  }

  const hoverIdx = useMemo(() => {
    if (!hover || n === 0) return null
    return clamp(Math.round((hover.vx - plotL - step / 2) / step) + off, off, endData)
  }, [hover, n, off, endData, step, plotL])

  const onMainClick = () => {
    if (dragRef.current?.moved) return
    if (hoverIdx != null && onDateClick) onDateClick(bars[hoverIdx].date)
  }

  if (n === 0 || !geo || !main || !vol || !macd) return null
  const { lo, hi, py } = geo

  const infoIdx = hoverIdx ?? n - 1
  const ib = bars[infoIdx]
  const ibPrev = infoIdx > 0 ? bars[infoIdx - 1].close : ib.open
  const ibChg = ibPrev ? (ib.close / ibPrev - 1) * 100 : 0
  const cUp = ib.close >= ib.open

  // 十字线派生几何
  const cross = hover && hoverIdx != null ? (() => {
    const sx = px(hoverIdx)
    const price = hi - (hover.vy - PLOT_T) / (PLOT_B - PLOT_T) * (hi - lo)
    const tipX = sx > plotR - 220 ? sx - 200 : sx + 16
    const tipY = clamp(hover.vy - 44, 18, 300)
    return { sx, price, tipX, tipY }
  })() : null

  const svgStyle: React.CSSProperties = { width: '100%', display: 'block', touchAction: 'none', cursor: 'grab' }
  const legendRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px 2px',
    fontSize: 10.5, fontFamily: MONO, borderTop: '1px solid rgba(255,255,255,.06)', marginTop: 6,
  }

  return (
    <div
      ref={wrapRef}
      style={maximized ? {
        position: 'fixed', inset: 0, zIndex: 60, background: '#0c102a',
        padding: '16px 22px', display: 'flex', flexDirection: 'column', overflow: 'auto',
      } : { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      {/* OHLC 信息行 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '7px 10px',
        borderRadius: 8, background: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.06)',
        fontSize: 10.5, fontFamily: MONO,
      }}>
        <span style={{ color: TXT_SECONDARY }}>{ib.date}</span>
        <span style={{ color: TXT_WEAK }}>开 <b style={{ color: ib.open >= ibPrev ? UP : DOWN, fontWeight: 600 }}>{ib.open.toFixed(2)}</b></span>
        <span style={{ color: TXT_WEAK }}>高 <b style={{ color: UP, fontWeight: 600 }}>{ib.high.toFixed(2)}</b></span>
        <span style={{ color: TXT_WEAK }}>低 <b style={{ color: DOWN, fontWeight: 600 }}>{ib.low.toFixed(2)}</b></span>
        <span style={{ color: TXT_WEAK }}>收 <b style={{ color: cUp ? UP : DOWN, fontWeight: 600 }}>{ib.close.toFixed(2)}</b></span>
        <span style={{ color: ibChg >= 0 ? UP : DOWN, fontWeight: 700 }}>{ibChg >= 0 ? '+' : ''}{ibChg.toFixed(2)}%</span>
      </div>
      {/* MA 图例行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 10px', fontSize: 10.5, fontFamily: MONO }}>
        <span style={{ color: MA_COLORS.ma5 }}>MA5:{ib.ma5 != null ? ib.ma5.toFixed(2) : '--'}</span>
        <span style={{ color: MA_COLORS.ma10 }}>MA10:{ib.ma10 != null ? ib.ma10.toFixed(2) : '--'}</span>
        <span style={{ color: MA_COLORS.ma20 }}>MA20:{ib.ma20 != null ? ib.ma20.toFixed(2) : '--'}</span>
        <span style={{ color: MA_COLORS.ma60 }}>MA60:{ib.ma60 != null ? ib.ma60.toFixed(2) : '--'}</span>
        {/* 时间范围快捷档 */}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {RANGE_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              style={{
                padding: '2.5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 10.5, fontWeight: 700, fontFamily: MONO, lineHeight: 1.3,
                background: preset === p.key ? 'rgba(255,255,255,.14)' : 'transparent',
                color: preset === p.key ? '#f2f4fa' : AXIS_TEXT,
              }}
            >
              {p.label}
            </button>
          ))}
        </span>
        <span style={{ color: TXT_FAINTEST }}>滚轮缩放 · 拖拽平移 · 双击复位</span>
        {/* 最大化 / 还原 */}
        <button
          onClick={() => setMaximized(m => !m)}
          title={maximized ? '还原 (Esc)' : '最大化'}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(255,255,255,.12)',
            background: maximized ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.04)',
            color: '#c8cde0', cursor: 'pointer', padding: 0,
          }}
        >
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>
      {/* K 线主图 */}
      <svg
        ref={mainRef} data-kchart="" viewBox={`0 0 ${VW} ${K_VH}`} preserveAspectRatio="none"
        style={{ ...svgStyle, height: mainPxH, cursor: axisCursor }}
        onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
        onPointerMove={onMainMove} onPointerLeave={() => setHover(null)} onClick={onMainClick}
      >
        <path d={main.grid} stroke={GRID_STROKE} strokeWidth={1} fill="none" />
        <g>
          {main.yTicks.map((t, i) => (
            <text key={i} x={38} y={t.y + 3.5} textAnchor="end" fontSize={10} fill={AXIS_TEXT} fontFamily={MONO}>{t.label}</text>
          ))}
          {main.xTicks.map((t, i) => (
            <text key={i} x={t.x} y={452} textAnchor="middle" fontSize={10} fill={AXIS_TEXT_DIM} fontFamily={MONO}>{t.label}</text>
          ))}
        </g>
        <path d={main.upW} stroke={UP} strokeWidth={1} fill="none" />
        <path d={main.dnW} stroke={DOWN} strokeWidth={1} fill="none" />
        <path d={main.upB} fill={UP} />
        <path d={main.dnB} fill={DOWN} />
        <polyline points={main.ma5} fill="none" stroke={MA_COLORS.ma5} strokeWidth={1.4} strokeLinejoin="round" />
        <polyline points={main.ma10} fill="none" stroke={MA_COLORS.ma10} strokeWidth={1.4} strokeLinejoin="round" />
        <polyline points={main.ma20} fill="none" stroke={MA_COLORS.ma20} strokeWidth={1.4} strokeLinejoin="round" />
        <polyline points={main.ma60} fill="none" stroke={MA_COLORS.ma60} strokeWidth={1.6} strokeLinejoin="round" />
        {curves && curves.length > 0 && (
          <CurvesLayer curves={curves} geo={{ px, py, plotL, plotR, lo, hi, off, endData }} />
        )}
        {levelLines && levelLines.length > 0 && (
          <LevelLinesLayer lines={levelLines} geo={{ px, py, plotL, plotR, lo, hi, off, endData }} />
        )}
        {triangle && (
          <TriangleZoneLayer
            tri={triangle}
            geo={{ px, py, lo, hi }}
            iLeft={off - 0.5}
            iRight={off + vis - 0.5}
          />
        )}
        {forecast && (
          <ForecastLayer fc={forecast} geo={{ px, py, lo, hi }} iRight={off + vis - 0.5} />
        )}
        {aiPatterns && (
          <AiPatternsLayer patterns={aiPatterns} bars={bars} geo={{ px, py, lo, hi }} iRight={off + vis - 0.5} />
        )}
        {pivots && (
          <WaveSignalsLayer
            pivots={pivots}
            geo={{ px, py, plotL, plotR, lo, hi }}
            lastClose={bars[n - 1].close}
            lastUp={n > 1 ? bars[n - 1].close >= bars[n - 2].close : true}
          />
        )}
        {/* 十字线 */}
        {cross && hoverIdx != null && (
          <g pointerEvents="none">
            <line x1={cross.sx} y1={PLOT_T} x2={cross.sx} y2={PLOT_B} stroke="rgba(255,255,255,.4)" strokeWidth={1} strokeDasharray="4 4" />
            <line x1={plotL} y1={hover!.vy} x2={plotR} y2={hover!.vy} stroke="rgba(255,255,255,.4)" strokeWidth={1} strokeDasharray="4 4" />
            <rect x={plotR - 60} y={hover!.vy - 9} width={56} height={18} rx={4} fill="#2a3050" />
            <text x={plotR - 32} y={hover!.vy + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#fff" fontFamily={MONO}>{cross.price.toFixed(2)}</text>
            <rect x={cross.sx - 40} y={412} width={80} height={17} rx={4} fill="#2a3050" />
            <text x={cross.sx} y={424.5} textAnchor="middle" fontSize={10} fill="#fff" fontFamily={MONO}>{bars[hoverIdx].date}</text>
            {/* OHLC 浮窗 */}
            <rect x={cross.tipX} y={cross.tipY} width={184} height={86} rx={9} fill="rgba(13,17,40,.94)" stroke="rgba(255,255,255,.15)" />
            <text x={cross.tipX + 12} y={cross.tipY + 20} fontSize={10.5} fill={TXT_SECONDARY} fontFamily={MONO}>
              {bars[hoverIdx].date}{'  '}
              <tspan fill={ibChg >= 0 ? UP : DOWN} fontWeight={700}>{ibChg >= 0 ? '+' : ''}{ibChg.toFixed(2)}%</tspan>
            </text>
            <text x={cross.tipX + 12} y={cross.tipY + 40} fontSize={10.5} fill={TXT_WEAK} fontFamily={MONO}>
              开 <tspan fill="#e8ebf7">{ib.open.toFixed(2)}</tspan>{'  '}收 <tspan fill={cUp ? UP : DOWN} fontWeight={700}>{ib.close.toFixed(2)}</tspan>
            </text>
            <text x={cross.tipX + 12} y={cross.tipY + 58} fontSize={10.5} fill={TXT_WEAK} fontFamily={MONO}>
              高 <tspan fill={UP}>{ib.high.toFixed(2)}</tspan>{'  '}低 <tspan fill={DOWN}>{ib.low.toFixed(2)}</tspan>
            </text>
            <text x={cross.tipX + 12} y={cross.tipY + 76} fontSize={10.5} fill={TXT_WEAK} fontFamily={MONO}>
              量 <tspan fill="#e8ebf7">{fmtVol(ib.volume)}</tspan>
            </text>
          </g>
        )}
      </svg>
      {/* 成交量副图 */}
      <div style={legendRow}>
        <span style={{ color: TXT_WEAK, fontFamily: 'inherit' }}>成交量</span>
        <span style={{ marginLeft: 'auto', color: UP }}>量:{fmtVol(ib.volume)}</span>
        <span style={{ color: VOL5_COLOR }}>VOL5:{fmtVol(sma(volumes, 5, infoIdx))}</span>
        <span style={{ color: VOL10_COLOR }}>VOL10:{fmtVol(sma(volumes, 10, infoIdx))}</span>
      </div>
      <svg
        data-kchart="" viewBox={`0 0 ${VW} ${SUB_VH}`} preserveAspectRatio="none"
        style={{ ...svgStyle, height: subPxH }}
        onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      >
        <g>
          {vol.ticks.map((t, i) => (
            <text key={i} x={38} y={t.y + 3.5} textAnchor="end" fontSize={10} fill={AXIS_TEXT_DIM} fontFamily={MONO}>{t.label}</text>
          ))}
        </g>
        <path d={vol.up} fill={UP} opacity={0.85} />
        <path d={vol.down} fill={DOWN} opacity={0.85} />
        <polyline points={vol.vol5} fill="none" stroke={VOL5_COLOR} strokeWidth={1.3} strokeLinejoin="round" />
        <polyline points={vol.vol10} fill="none" stroke={VOL10_COLOR} strokeWidth={1.3} strokeLinejoin="round" />
      </svg>
      {/* MACD 副图 */}
      <div style={legendRow}>
        <span style={{ color: TXT_WEAK, fontFamily: 'inherit' }}>MACD</span>
        <span style={{ marginLeft: 'auto', color: DIF_COLOR }}>DIF:{ib.dif.toFixed(3)}</span>
        <span style={{ color: DEA_COLOR }}>DEA:{ib.dea.toFixed(3)}</span>
        <span style={{ color: UP }}>MACD:{ib.hist.toFixed(3)}</span>
      </div>
      <svg
        data-kchart="" viewBox={`0 0 ${VW} ${SUB_VH}`} preserveAspectRatio="none"
        style={{ ...svgStyle, height: subPxH }}
        onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      >
        <line x1={plotL} y1={macd.mMid} x2={plotR} y2={macd.mMid} stroke="rgba(255,255,255,.1)" strokeWidth={1} />
        <g>
          <text x={38} y={macd.my(macd.mTick) + 3.5} textAnchor="end" fontSize={10} fill={AXIS_TEXT_DIM} fontFamily={MONO}>{fmtMacdTick(macd.mTick)}</text>
          <text x={38} y={macd.mMid + 3.5} textAnchor="end" fontSize={10} fill={AXIS_TEXT_DIM} fontFamily={MONO}>0</text>
          <text x={38} y={macd.my(-macd.mTick) + 3.5} textAnchor="end" fontSize={10} fill={AXIS_TEXT_DIM} fontFamily={MONO}>-{fmtMacdTick(macd.mTick)}</text>
        </g>
        <path d={macd.up} fill={UP} opacity={0.9} />
        <path d={macd.down} fill={DOWN} opacity={0.9} />
        <polyline points={macd.difP} fill="none" stroke={DIF_COLOR} strokeWidth={1.3} strokeLinejoin="round" />
        <polyline points={macd.deaP} fill="none" stroke={DEA_COLOR} strokeWidth={1.3} strokeLinejoin="round" />
      </svg>
    </div>
  )
}
