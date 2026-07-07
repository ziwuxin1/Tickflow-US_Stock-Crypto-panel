/**
 * 指数页 SVG 图表数学工具 — 均线/MACD 客户端回退、轴刻度、格式化、平滑路径。
 * 算法对照 design_handoff_index_page/指数.dc.html 底部 Component._build。
 */
import type { KlineRow } from '@/lib/api'

// ===== 归一化后的 K 线 bar =====
export interface KBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  ma5: number | null
  ma10: number | null
  ma20: number | null
  ma60: number | null
  dif: number
  dea: number
  hist: number
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

/** 简单移动平均: i < n-1 时返回 null */
export function sma(arr: readonly number[], n: number, i: number): number | null {
  if (i < n - 1) return null
  let s = 0
  for (let j = i - n + 1; j <= i; j++) s += arr[j]
  return s / n
}

/** 指数移动平均序列 */
export function emaSeries(arr: readonly number[], n: number): number[] {
  const k = 2 / (n + 1)
  const out: number[] = []
  let e = arr[0] ?? 0
  arr.forEach((v, i) => {
    e = i ? v * k + e * (1 - k) : v
    out.push(e)
  })
  return out
}

/** MACD(12,26,9) 序列 */
export function macdSeries(closes: readonly number[]) {
  if (closes.length === 0) return { dif: [] as number[], dea: [] as number[], hist: [] as number[] }
  const e12 = emaSeries(closes, 12)
  const e26 = emaSeries(closes, 26)
  const dif = closes.map((_, i) => e12[i] - e26[i])
  const dea = emaSeries(dif, 9)
  const hist = dif.map((v, i) => v - dea[i])
  return { dif, dea, hist }
}

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** KlineRow → KBar: 优先用后端 MA/MACD 字段, 缺失时客户端回退计算 */
export function normalizeBars(rows: KlineRow[]): KBar[] {
  const valid = rows.filter(r => r?.date != null && num(r.open) != null && num(r.close) != null)
  const closes = valid.map(r => Number(r.close))
  const volumes = valid.map(r => Number(r.volume ?? 0))
  const needMacd = valid.some(r => num(r.macd_dif) == null)
  const fallback = needMacd ? macdSeries(closes) : null
  return valid.map((r, i) => ({
    date: typeof r.date === 'string' ? r.date.slice(0, 10) : String(r.date),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: closes[i],
    volume: volumes[i],
    ma5: num(r.ma5) ?? sma(closes, 5, i),
    ma10: num(r.ma10) ?? sma(closes, 10, i),
    ma20: num(r.ma20) ?? sma(closes, 20, i),
    ma60: num(r.ma60) ?? sma(closes, 60, i),
    dif: num(r.macd_dif) ?? fallback!.dif[i],
    dea: num(r.macd_dea) ?? fallback!.dea[i],
    hist: num(r.macd_hist) ?? fallback!.hist[i],
  }))
}

/** 轴刻度步长: 1/2/5 × 10^k, 目标约 targetTicks 档 */
export function niceStep(range: number, targetTicks: number): number {
  if (!(range > 0)) return 1
  const raw = range / targetTicks
  let step = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / step
  step *= m >= 5 ? 5 : m >= 2 ? 2 : 1
  return step
}

// ===== 格式化 =====
export function fmtPrice(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(Number(v))) return '--'
  return Number(v).toFixed(digits)
}

export function fmtSignedPct(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(Number(v))) return '--'
  const n = Number(v)
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
}

/** 量/额缩写: 1.68M / 45.1K / 1.25B */
export function fmtVol(v: number | null | undefined): string {
  if (v == null || Number.isNaN(Number(v))) return '--'
  const n = Math.abs(Number(v))
  const sign = Number(v) < 0 ? '-' : ''
  if (n >= 1e9) return `${sign}${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${sign}${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${sign}${(n / 1e3).toFixed(2)}K`
  return `${sign}${n.toFixed(0)}`
}

/** 'YYYY-MM-DD' → 'MM/DD/YYYY'(日期胶囊显示) */
export function fmtDateUS(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${m}/${d}/${y}` : iso
}

/** datetime → 'HH:mm' */
export function fmtHM(dt: string): string {
  const m = dt.match(/(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : dt
}

// ===== 平滑曲线(二次贝塞尔中点法, 对照设计稿 iSmooth) =====
export function smoothQPath(pts: ReadonlyArray<readonly [number, number]>): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  for (let k = 1; k < pts.length - 1; k++) {
    const mx = (pts[k][0] + pts[k + 1][0]) / 2
    const my = (pts[k][1] + pts[k + 1][1]) / 2
    d += `Q${pts[k][0].toFixed(1)} ${pts[k][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  d += `L${last[0].toFixed(1)} ${last[1].toFixed(1)}`
  return d
}
