import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { DOWN, MONO, TXT_FAINT, TXT_WEAK, UP } from '@/components/dashboard/tokens'

/**
 * 周期彩虹图(Cycle Wave)— BTC 全量历史收盘线, 按「周期位置」着色:
 *   蓝(接近周期熊底) → 青 → 绿 → 黄 → 橙 → 红(接近周期牛顶)
 * 叠加:
 *   - 减半日竖线(链上事实, 静态日期)+ 牛市标签
 *   - 熊市区间红色底纹(历史顶→底静态区间 + 当前周期从高点回撤 ≥25% 时动态判定)
 *   - 「今日」虚线标记, 最后一个点为实时价格(随 30s 轮询更新)
 * 交互: 滚轮缩放(以光标为锚点) · 拖拽平移 · 双击复位;
 *   x 轴刻度随缩放自适应(年 → 月 → 日), y 轴随可见区间自动缩放。
 *
 * 周期位置算法(周期时间钟, 参照狼波指数的单调升温/降温语义):
 *   以熊市区间切分周期, 颜色主要由「周期内时间进度」决定, 价格波动不打断升温:
 *   - 牛市段: score = 时间进度(上一轮熊市结束 → 本轮熊市开始), 蓝 → 绿 → 黄 → 橙 → 红
 *     中途回调(如 2021-07)颜色继续变暖, 只有最终周期顶才到深红
 *   - 熊市段: score = 1 - 时间进度(顶 → 底), 红进框后随时间逐级降温到深蓝
 *     (进行中的熊市按历史平均时长 383 天预估终点)
 *   - 冲刺暖底: 60 日对数涨速可把颜色抬到最高 0.72(2019 式反弹变橙, 但到不了红)
 *   - 数据起点不足一轮周期的开头段(2017)用价格对数位置替代时间
 * 再做 14 日平滑 + 峰值缓释衰减。
 */

export interface CycleRow { date: string; close: number }

// ===== 周期常量(BTC 链上/历史事实) =====
const HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20']
const NEXT_HALVING = '2028-04-17'                    // 按出块速度估算
/** 历史熊市区间: 周期顶 → 周期底(收盘口径), 按币种区分(ETH 顶底与 BTC 略有错位) */
const BEAR_RANGES_BY_SYMBOL: Record<string, [string, string][]> = {
  BTCUSDT: [
    ['2011-06-08', '2011-11-18'],
    ['2013-11-30', '2015-01-14'],
    ['2017-12-17', '2018-12-15'],
    ['2021-11-10', '2022-11-21'],
  ],
  ETHUSDT: [
    ['2018-01-13', '2018-12-15'],
    ['2021-11-08', '2022-11-21'],
  ],
}
/** 回撤/时长统计只用现代周期(早期 -93% 式极端振幅参考性低) */
const MODERN_BEAR_FROM = '2016-01-01'
/** 当前周期动态熊市判定: 距最后一次减半后的最高收盘回撤超过该比例 */
const BEAR_DRAWDOWN = 0.25

const VEL_WINDOW = 60                                // 涨速窗口(日)
const VEL_REF = 0.55                                 // 涨速归一基准(ln 涨幅, ≈2021 初冲刺水平)
const VEL_CAP = 0.72                                 // 涨速暖底上限(冲刺最多到橙, 到不了红)
const AVG_BEAR_DAYS = 383                            // 历史熊市平均时长(顶→底)
const AVG_BULL_DAYS = 1065                           // 历史牛市段平均时长(底→下一轮顶)
const SMOOTH = 14                                    // 颜色平滑天数
const PEAK_DECAY = 0.012                             // 峰值缓释: 每日最大回落幅度

const DAY_MS = 86_400_000
const MIN_SPAN = 30 * DAY_MS                         // 最小缩放窗口: 30 天
const RIGHT_GAP = 45 * DAY_MS                        // 右侧留白(给「今日」标签)

// ===== 彩虹色标(score 0 → 1) =====
const STOPS: [number, string][] = [
  [0.00, '#3d6dff'],   // 深蓝 · 周期熊底
  [0.18, '#38bdf8'],   // 天蓝
  [0.34, '#2dd4bf'],   // 青
  [0.50, '#4ade80'],   // 绿
  [0.66, '#facc15'],   // 黄
  [0.80, '#fb923c'],   // 橙
  [0.94, '#f75049'],   // 红 · 周期牛顶(0.94 起饱和为红)
]

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function scoreColor(score: number): string {
  const s = Math.max(0, Math.min(1, score))
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i]
    if (s > p1 && i < STOPS.length - 1) continue
    const [p0, c0] = STOPS[i - 1]
    const t = p1 === p0 ? 0 : (s - p0) / (p1 - p0)
    const a = hexToRgb(c0)
    const b = hexToRgb(c1)
    const mix = a.map((v, k) => Math.round(v + (b[k] - v) * Math.max(0, Math.min(1, t))))
    return `rgb(${mix[0]},${mix[1]},${mix[2]})`
  }
  return STOPS[STOPS.length - 1][1]
}

/** 周期位置分数: 周期时间钟(牛段按时间升温 / 熊段按时间降温) + 冲刺暖底, 返回 0..1 数组 */
function computeScores(
  closes: number[],
  ts: number[],
  bears: { from: number; to: number; ongoing?: boolean }[],
): number[] {
  const n = closes.length
  if (n === 0) return []
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

  // 熊市区间 → 数据下标(仅保留与数据范围相交的), 用于切分周期
  const bands = bears
    .map(b => ({
      s: lowerBound(ts, b.from),
      e: Math.min(n - 1, lowerBound(ts, b.to)),
      ongoing: !!b.ongoing,
    }))
    .filter(b => b.s < n && b.e > 0 && b.s <= b.e)
    .sort((a, b) => a.s - b.s)

  const raw: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = ts[i]
    // 定位所在区段: prevEnd = 上一轮熊市结束下标, cur = 所在熊市, next = 下一轮熊市
    let prevEnd = -1
    let cur: { s: number; e: number; ongoing: boolean } | null = null
    let next: { s: number; e: number; ongoing: boolean } | null = null
    for (const b of bands) {
      if (i > b.e) { prevEnd = b.e; continue }
      if (i >= b.s) cur = b
      else next = b
      break
    }

    // 冲刺暖底: 60 日对数涨速最多把颜色抬到 VEL_CAP(橙)
    const j0 = Math.max(0, i - VEL_WINDOW)
    const velFloor = Math.min(VEL_CAP, VEL_CAP * Math.max(0, Math.log(closes[i] / closes[j0]) / VEL_REF))

    let s: number
    if (cur) {
      // 熊市段: 红 → 蓝 按时间线性降温(进行中的熊市按历史平均时长预估终点)
      const endT = cur.ongoing ? ts[cur.s] + AVG_BEAR_DAYS * DAY_MS : ts[cur.e]
      const bearTime = endT > ts[cur.s] ? clamp01((t - ts[cur.s]) / (endT - ts[cur.s])) : 1
      s = 1 - bearTime
    } else {
      const bIdx = prevEnd >= 0 ? prevEnd : 0
      const tB = ts[bIdx]
      const pB = closes[bIdx]
      if (next) {
        const timePos = clamp01((t - tB) / (ts[next.s] - tB))
        if (prevEnd < 0) {
          // 数据起点不是真实周期底(2017 开头段): 用价格对数位置替代时间
          const span = Math.log(closes[next.s] / pB)
          const cycPos = span > 0.1 ? clamp01(Math.log(closes[i] / pB) / span) : timePos
          s = Math.max(cycPos, velFloor)
        } else {
          s = Math.max(timePos, velFloor)
        }
      } else {
        // 未完成牛市段: 按历史平均牛市时长推进, 未见顶前封顶 0.95
        const timePos = clamp01((t - tB) / (AVG_BULL_DAYS * DAY_MS))
        s = Math.max(Math.min(0.95, timePos), velFloor)
      }
    }
    raw[i] = s
  }

  // 均值平滑, 颜色过渡不闪烁
  const out: number[] = new Array(n)
  let acc = 0
  for (let i = 0; i < n; i++) {
    acc += raw[i]
    if (i >= SMOOTH) acc -= raw[i - SMOOTH]
    out[i] = acc / Math.min(i + 1, SMOOTH)
  }
  // 峰值缓释衰减(颜色只能缓降, 不会瞬间跳冷)
  let prev = 0
  for (let i = 0; i < n; i++) {
    const v = Math.max(Math.max(0, Math.min(1, out[i])), prev - PEAK_DECAY)
    out[i] = v
    prev = v
  }
  return out
}

/** y 轴合适步长(1/2/2.5/5 × 10^k) */
function niceStep(span: number, target = 6): number {
  const rough = Math.max(span / target, 1e-9)
  const pow = Math.pow(10, Math.floor(Math.log10(rough)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (rough <= m * pow) return m * pow
  }
  return 10 * pow
}

/** 二分: 第一个 ts[i] >= t 的下标(找不到返回 n) */
function lowerBound(ts: number[], t: number): number {
  let lo = 0
  let hi = ts.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ts[mid] < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

interface Props {
  rows: CycleRow[]
  /** 币种(决定熊市区间常量), 默认 BTCUSDT */
  symbol?: string
  height?: number
  className?: string
}

export function CycleWaveChart({ rows, symbol = 'BTCUSDT', height = 620, className }: Props) {
  const bearRanges = BEAR_RANGES_BY_SYMBOL[symbol] ?? BEAR_RANGES_BY_SYMBOL.BTCUSDT
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const clipId = useId()
  const [width, setWidth] = useState(1200)
  const [hover, setHover] = useState<number | null>(null)
  /** 图上显示 抄底区(蓝)/ 卖出区(红) 横向色带 */
  const [showZones, setShowZones] = useState(true)
  /** 可见时间窗口(null = 全量) */
  const [view, setView] = useState<{ s: number; e: number } | null>(null)
  const dragRef = useRef<{ px: number; s: number; e: number; moved: boolean } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 300) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const model = useMemo(() => {
    if (rows.length < 30) return null
    const ts = rows.map(r => Date.parse(r.date + 'T00:00:00Z'))
    const closes = rows.map(r => r.close)

    // 熊市区间: 静态历史 + 当前周期动态判定
    const bears: { from: number; to: number; ongoing: boolean; topClose?: number }[] = bearRanges.map(([a, b]) => ({
      from: Date.parse(a + 'T00:00:00Z'),
      to: Date.parse(b + 'T00:00:00Z'),
      ongoing: false,
    }))
    const lastHalving = Date.parse(HALVINGS[HALVINGS.length - 1] + 'T00:00:00Z')
    let hiIdx = -1
    for (let i = 0; i < ts.length; i++) {
      if (ts[i] < lastHalving) continue
      if (hiIdx < 0 || closes[i] > closes[hiIdx]) hiIdx = i
    }
    if (hiIdx >= 0 && closes[closes.length - 1] < closes[hiIdx] * (1 - BEAR_DRAWDOWN)) {
      bears.push({ from: ts[hiIdx], to: ts[ts.length - 1], ongoing: true, topClose: closes[hiIdx] })
    }

    // 历史熊市回撤(仅统计数据范围内可计算的现代区间, 收盘口径)
    const bearDds: number[] = []
    for (const [a, b] of bearRanges) {
      if (a < MODERN_BEAR_FROM) continue
      const ta = Date.parse(a + 'T00:00:00Z')
      const tb = Date.parse(b + 'T00:00:00Z')
      if (ta < ts[0]) continue
      const ia = Math.min(ts.length - 1, lowerBound(ts, ta))
      const ib = Math.min(ts.length - 1, lowerBound(ts, tb))
      const dd = 1 - closes[ib] / closes[ia]
      if (dd > 0.3) bearDds.push(dd)
    }

    // 打分依赖熊市区间锚点, 须在 bears 之后计算
    const scores = computeScores(closes, ts, bears)
    return { ts, closes, scores, bears, bearDds }
  }, [rows, bearRanges])

  // ===== 比例尺(声明在 hooks 之前会用到的域值; model 为空时给占位, 渲染前会短路) =====
  const ts = model?.ts ?? []
  const closes = model?.closes ?? []
  const scores = model?.scores ?? []
  const bears = model?.bears ?? []
  const bearDds = model?.bearDds ?? []
  const n = ts.length
  const last = n - 1

  const padL = 12
  const padR = 68
  const padT = 44
  const padB = 26
  const plotW = width - padL - padR
  const plotH = height - padT - padB

  // 当前熊市统计(供 x 轴域扩展 / 预测段 / 图例共用)
  const modernBears = bearRanges.filter(([a]) => a >= MODERN_BEAR_FROM)
  const avgBearDays = Math.round(
    modernBears.reduce((acc, [a, b]) => acc + (Date.parse(b) - Date.parse(a)) / DAY_MS, 0) / Math.max(1, modernBears.length),
  )
  const curBear = bears.find(b => b.ongoing)
  const bearEndEst = curBear ? curBear.from + avgBearDays * DAY_MS : null

  const fullT0 = n ? ts[0] : 0
  // 有进行中的熊市时, 右边界扩展到预计见底日之后, 露出完整的剩余红色区域
  const fullT1 = n
    ? Math.max(ts[last] + RIGHT_GAP, bearEndEst && bearEndEst > ts[last] ? bearEndEst + 30 * DAY_MS : 0)
    : 1
  const t0 = view?.s ?? fullT0
  const t1 = view?.e ?? fullT1

  // 滚轮缩放(非 passive, 阻止页面滚动); 域值经 ref 透传避免重复绑定
  const domainRef = useRef({ t0, t1, padL, plotW, fullT0, fullT1 })
  domainRef.current = { t0, t1, padL, plotW, fullT0, fullT1 }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const d = domainRef.current
      // 横向滚动(触控板)→ 平移; 纵向滚动 → 缩放
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const dt = (e.deltaX / d.plotW) * (d.t1 - d.t0)
        let ss = d.t0 + dt
        let ee = d.t1 + dt
        const sp = ee - ss
        if (ss < d.fullT0) { ss = d.fullT0; ee = ss + sp }
        if (ee > d.fullT1) { ee = d.fullT1; ss = ee - sp }
        setView(ss <= d.fullT0 && ee >= d.fullT1 ? null : { s: ss, e: ee })
        return
      }
      if (e.deltaY === 0) return
      const rect = svg.getBoundingClientRect()
      const px = e.clientX - rect.left
      const anchor = d.t0 + ((px - d.padL) / d.plotW) * (d.t1 - d.t0)
      const factor = e.deltaY > 0 ? 1.28 : 1 / 1.28
      const span = (d.t1 - d.t0) * factor
      const ratio = (anchor - d.t0) / (d.t1 - d.t0)
      let ss = anchor - span * ratio
      const sp = Math.max(MIN_SPAN, Math.min(span, d.fullT1 - d.fullT0))
      let ee = ss + sp
      if (ss < d.fullT0) { ss = d.fullT0; ee = ss + sp }
      if (ee > d.fullT1) { ee = d.fullT1; ss = ee - sp }
      setView(ss <= d.fullT0 && ee >= d.fullT1 ? null : { s: ss, e: ee })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  if (!model || n === 0) {
    return (
      <div ref={wrapRef} className={className} style={{ height }}>
        <div className="flex items-center justify-center h-full text-xs text-muted font-mono">
          周期数据不足(至少 30 个交易日)
        </div>
      </div>
    )
  }

  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * plotW

  // ===== 可见数据切片(含左右各 1 个缓冲点) =====
  const i0 = Math.max(0, lowerBound(ts, t0) - 1)
  const i1 = Math.min(last, lowerBound(ts, t1 + 1))

  // y 轴随可见区间自适应
  let vLo = Infinity
  let vHi = -Infinity
  for (let i = i0; i <= i1; i++) {
    if (closes[i] < vLo) vLo = closes[i]
    if (closes[i] > vHi) vHi = closes[i]
  }
  if (!isFinite(vLo)) { vLo = 0; vHi = 1 }
  const vPad = (vHi - vLo) * 0.06 || vHi * 0.05
  const vMin = Math.max(0, vLo - vPad)
  const vMax = vHi + vPad
  const y = (v: number) => padT + (1 - (v - vMin) / (vMax - vMin)) * plotH

  // ===== 彩虹线: 可见切片内按量化色桶合并成 path 段(降 DOM 数量) =====
  const paths: { d: string; color: string }[] = []
  {
    let runStart = i0
    let runBucket = Math.round(scores[i0] * 28)
    const flush = (endIdx: number) => {
      const from = Math.max(i0, runStart - 1)
      const pts: string[] = []
      for (let i = from; i <= endIdx; i++) {
        pts.push(`${i === from ? 'M' : 'L'}${x(ts[i]).toFixed(1)},${y(closes[i]).toFixed(1)}`)
      }
      paths.push({ d: pts.join(''), color: scoreColor(runBucket / 28) })
    }
    for (let i = i0 + 1; i <= i1; i++) {
      const b = Math.round(scores[i] * 28)
      if (b !== runBucket) {
        flush(i - 1)
        runStart = i
        runBucket = b
      }
    }
    flush(i1)
  }

  // ===== y 轴刻度 =====
  const step = niceStep(vMax - vMin)
  const yTicks: number[] = []
  for (let v = Math.ceil(vMin / step) * step; v < vMax; v += step) yTicks.push(v)

  // ===== x 轴刻度: 随缩放自适应 年 → 月 → 日 =====
  const spanDays = (t1 - t0) / DAY_MS
  const xTicks: { t: number; label: string }[] = []
  if (spanDays > 1100) {
    // 年
    const y0 = new Date(t0).getUTCFullYear() + 1
    const y1 = new Date(t1).getUTCFullYear()
    for (let yr = y0; yr <= y1; yr++) {
      const t = Date.parse(`${yr}-01-01T00:00:00Z`)
      if (t >= t0 && t <= t1) xTicks.push({ t, label: String(yr) })
    }
  } else if (spanDays > 130) {
    // 月(按跨度抽稀到 ≤12 个左右)
    const everyM = Math.max(1, Math.ceil(spanDays / 30 / 12))
    const d0 = new Date(t0)
    let yr = d0.getUTCFullYear()
    let mo = d0.getUTCMonth() + 1
    for (let k = 0; k < 200; k++) {
      mo++
      if (mo > 12) { mo = 1; yr++ }
      if ((mo - 1) % everyM !== 0) continue
      const t = Date.parse(`${yr}-${String(mo).padStart(2, '0')}-01T00:00:00Z`)
      if (t > t1) break
      if (t >= t0) xTicks.push({ t, label: `${yr}-${String(mo).padStart(2, '0')}` })
    }
  } else {
    // 日(抽稀到 ≤10 个左右)
    const everyD = Math.max(1, Math.ceil(spanDays / 10))
    const start = Math.ceil(t0 / DAY_MS) * DAY_MS
    for (let t = start; t <= t1; t += everyD * DAY_MS) {
      const d = new Date(t)
      xTicks.push({ t, label: `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` })
    }
  }

  // ===== 减半日(在可见范围内的) + 下次减半倒计时 =====
  const halvingsInView = HALVINGS
    .map(d => Date.parse(d + 'T00:00:00Z'))
    .filter(t => t >= t0 && t <= t1)
  const nextHalvingDays = Math.max(0, Math.round((Date.parse(NEXT_HALVING + 'T00:00:00Z') - ts[last]) / DAY_MS))

  const lastScore = scores[last]
  const lastColor = scoreColor(lastScore)
  const inBear = bears.some(b => b.ongoing)

  // 预计熊市结束(modernBears / avgBearDays / curBear / bearEndEst 已在比例尺前计算)
  const bearEndDate = bearEndEst ? new Date(bearEndEst).toISOString().slice(0, 10) : null
  const bearEndDaysLeft = bearEndEst ? Math.round((bearEndEst - ts[last]) / DAY_MS) : null

  // 预计底部 / 抄底区间: 本轮顶部 × (1 - 历史回撤区间), 浅端按周期振幅衰减外推
  //   深端 = 历史回撤均值; 浅端 = 最小回撤再减去一个(最大-最小)的衰减步长
  let zoneLo: number | null = null
  let zoneHi: number | null = null
  let ddDeep = 0
  let ddShallow = 0
  if (curBear?.topClose && bearDds.length > 0) {
    // 锚定最近一轮熊市回撤 ±5pp(早期极端回撤如 ETH 2018 的 -94% 不参与, 避免区间过宽)
    const ddRecent = bearDds[bearDds.length - 1]
    ddDeep = Math.min(0.95, ddRecent + 0.05)
    ddShallow = Math.max(0.3, ddRecent - 0.05)
    zoneLo = curBear.topClose * (1 - ddDeep)
    zoneHi = curBear.topClose * (1 - ddShallow)
  }

  // 卖出区间(对应红色周期顶区): 下限 = 本轮已确认顶(历史上每轮顶都高于上轮顶),
  // 上限 = 本轮顶 × 上一次「顶对顶」倍率(顶部涨幅逐轮衰减, 用最近一次倍率作上界)
  let sellLo: number | null = null
  let sellHi: number | null = null
  let topRatio = 0
  if (curBear?.topClose) {
    const lastTopMs = Date.parse(bearRanges[bearRanges.length - 1][0] + 'T00:00:00Z')
    if (lastTopMs >= ts[0]) {
      const prevTopIdx = Math.min(last, lowerBound(ts, lastTopMs))
      const prevTop = closes[prevTopIdx]
      if (prevTop > 0 && curBear.topClose > prevTop) {
        topRatio = curBear.topClose / prevTop
        sellLo = curBear.topClose
        sellHi = curBear.topClose * topRatio
      }
    }
  }
  const fmtK = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)
  const todayInView = ts[last] >= t0 && ts[last] <= t1
  const lastPriceInView = todayInView && closes[last] >= vMin && closes[last] <= vMax

  // ===== 拖拽平移 + 悬停 =====
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    dragRef.current = { px: e.clientX - rect.left, s: t0, e: t1, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const drag = dragRef.current
    if (drag) {
      const dx = px - drag.px
      if (Math.abs(dx) > 2) drag.moved = true
      if (drag.moved) {
        const dt = -(dx / plotW) * (drag.e - drag.s)
        let s = drag.s + dt
        let ee = drag.e + dt
        const span = ee - s
        if (s < fullT0) { s = fullT0; ee = s + span }
        if (ee > fullT1) { ee = fullT1; s = ee - span }
        setView(s <= fullT0 && ee >= fullT1 ? null : { s, e: ee })
        setHover(null)
        return
      }
    }
    // 悬停: 二分找最近点
    const t = t0 + ((px - padL) / plotW) * (t1 - t0)
    let lo = Math.max(0, lowerBound(ts, t) - 1)
    const hi = Math.min(last, lo + 1)
    setHover(t - ts[lo] < ts[hi] - t ? lo : hi)
  }
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* 已释放 */ }
  }

  const hoverBear = hover != null && bears.some(b => ts[hover] >= b.from && ts[hover] <= b.to)

  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative' }}>
      {/* ===== 图例行: 色带 + 牛熊说明 + 下次减半倒计时 + 实时分数 ===== */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: '#38bdf8' }}>熊底</span>
          <span style={{
            width: 120, height: 8,
            background: `linear-gradient(90deg,${STOPS.map(([p, c]) => `${c} ${p * 100}%`).join(',')})`,
          }} />
          <span style={{ fontFamily: MONO, fontSize: 9, color: DOWN }}>牛顶</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, background: 'rgba(247,80,73,.16)', border: '1px solid rgba(247,80,73,.4)' }} />
          <span style={{ fontSize: 10, color: TXT_WEAK }}>熊市区间</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 2, height: 10, background: UP }} />
          <span style={{ fontSize: 10, color: TXT_WEAK }}>减半日(牛市起点)</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: TXT_WEAK }}>
          下次减半 <span style={{ color: UP }}>{NEXT_HALVING}</span> · 约 {nextHalvingDays} 天
        </span>
        {bearEndDate && bearEndDaysLeft != null && (
          <span
            title={`按历史三轮熊市平均时长(顶→底)${avgBearDays} 天, 从本轮顶部推算; 仅为周期参考, 非投资建议`}
            style={{ fontFamily: MONO, fontSize: 10, color: TXT_WEAK }}
          >
            预计熊市结束 <span style={{ color: DOWN }}>{bearEndDate}</span>
            {bearEndDaysLeft > 0 ? ` · 约 ${bearEndDaysLeft} 天` : ' · 已超均值, 或近底部'}
          </span>
        )}
        {zoneLo != null && zoneHi != null && (
          <span
            title={`对应图中蓝色周期底区域。本轮顶部 ${fmtK(curBear!.topClose!)} × 最近一轮熊市回撤 ±5pp: 深端 -${(ddDeep * 100).toFixed(0)}%, 浅端 -${(ddShallow * 100).toFixed(0)}%; 仅为周期参考, 非投资建议`}
            style={{ fontFamily: MONO, fontSize: 10, color: TXT_WEAK }}
          >
            抄底区间(蓝) <span style={{ color: '#38bdf8' }}>{fmtK(zoneLo)} ~ {fmtK(zoneHi)}</span>
          </span>
        )}
        {sellLo != null && sellHi != null && (
          <span
            title={`对应图中红色周期顶区域(下一轮)。下限 = 本轮已确认顶 ${fmtK(sellLo)}(历史每轮顶都高于上轮顶), 上限 = 本轮顶 × 上一次顶对顶倍率 ${topRatio.toFixed(2)}×(顶部涨幅逐轮衰减); 仅为周期参考, 非投资建议`}
            style={{ fontFamily: MONO, fontSize: 10, color: TXT_WEAK }}
          >
            卖出区间(红) <span style={{ color: DOWN }}>{fmtK(sellLo)} ~ {fmtK(sellHi)}</span>
          </span>
        )}
        {(zoneLo != null || sellLo != null) && (
          <button
            onClick={() => setShowZones(v => !v)}
            title="在图上显示/隐藏 抄底区(蓝) 与 卖出区(红) 横向价位带"
            style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '2px 8px', cursor: 'pointer',
              color: showZones ? '#0d0b07' : TXT_WEAK,
              background: showZones ? UP : 'transparent',
              border: `1px solid ${showZones ? UP : 'rgba(143,140,122,.5)'}`,
            }}
          >
            区间带 {showZones ? 'ON' : 'OFF'}
          </button>
        )}
        <span style={{ fontFamily: MONO, fontSize: 9, color: TXT_FAINT, letterSpacing: 1 }}>
          滚轮缩放 · 拖拽平移 · 双击复位
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: TXT_WEAK }}>当前周期位置</span>
          <span style={{
            fontFamily: MONO, fontSize: 12, fontWeight: 700, color: lastColor,
            textShadow: `0 0 10px ${lastColor}`,
          }}>
            {(lastScore * 100).toFixed(0)}%
          </span>
          <span style={{
            fontFamily: MONO, fontSize: 9, padding: '1px 6px', letterSpacing: 1,
            color: inBear ? DOWN : UP,
            border: `1px solid ${inBear ? 'rgba(247,80,73,.5)' : 'rgba(94,242,228,.5)'}`,
          }}>
            {inBear ? 'BEAR PHASE' : 'BULL PHASE'}
          </span>
        </span>
      </div>

      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block', cursor: dragRef.current?.moved ? 'grabbing' : 'crosshair', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={e => { onPointerUp(e); setHover(null) }}
        onDoubleClick={() => setView(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={padL} y={padT - 6} width={plotW} height={plotH + 6} />
          </clipPath>
        </defs>

        {/* 底色: 牛市淡青 */}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="rgba(45,160,130,.06)" />

        {/* 熊市红色底纹 */}
        <g clipPath={`url(#${clipId})`}>
          {bears.map((b, i) => {
            const bx0 = x(Math.max(b.from, t0))
            const bx1 = x(Math.min(b.to, t1))
            if (bx1 <= bx0) return null
            // 熊市时段标签: 带够宽显示年月(「2013/11-2015/01 熊市」), 窄则显示短年份(「2013-15 熊市」)
            const fmtYM = (ms: number) => {
              const d = new Date(ms)
              return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
            }
            const yA = new Date(b.from).getUTCFullYear()
            const yB = new Date(b.to).getUTCFullYear()
            const bandW = bx1 - bx0
            const label = bandW > 150
              ? (b.ongoing ? `${fmtYM(b.from)}~ 熊市 · 回撤中` : `${fmtYM(b.from)}-${fmtYM(b.to)} 熊市`)
              : (b.ongoing ? `${yA}~ 熊市` : `${yA === yB ? yA : `${yA}-${String(yB).slice(2)}`} 熊市`)
            // 进行中的熊市: 今日 → 预计见底 画浅色预测段, 标注剩余天数
            const fEnd = b.ongoing && bearEndEst && bearEndEst > b.to ? Math.min(bearEndEst, t1) : null
            const fx1 = fEnd != null ? x(fEnd) : null
            const remainDays = bearEndEst ? Math.max(0, Math.round((bearEndEst - ts[last]) / DAY_MS)) : 0
            return (
              <g key={`bear-${i}`}>
                <rect x={bx0} y={padT} width={bx1 - bx0} height={plotH} fill="rgba(247,80,73,.10)" />
                {bandW > 46 && (
                  <text x={(bx0 + bx1) / 2} y={padT + 14} textAnchor="middle"
                    style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, fill: 'rgba(247,120,110,.9)', letterSpacing: 1 }}>
                    {label}
                  </text>
                )}
                {fx1 != null && fx1 > bx1 && (
                  <>
                    <rect x={bx1} y={padT} width={fx1 - bx1} height={plotH} fill="rgba(247,80,73,.05)" />
                    <line x1={fx1} x2={fx1} y1={padT} y2={padT + plotH}
                      stroke="rgba(247,80,73,.55)" strokeWidth={1} strokeDasharray="4 3" />
                    {fx1 - bx1 > 60 && (
                      <text x={(bx1 + fx1) / 2} y={padT + 14} textAnchor="middle"
                        style={{ fontFamily: MONO, fontSize: 9, fill: 'rgba(247,120,110,.75)', letterSpacing: 1 }}>
                        剩余 ~{remainDays} 天
                      </text>
                    )}
                    {fx1 - bx1 > 60 && (
                      <text x={(bx1 + fx1) / 2} y={padT + 26} textAnchor="middle"
                        style={{ fontFamily: MONO, fontSize: 8, fill: 'rgba(247,120,110,.55)', letterSpacing: 1 }}>
                        预计见底 {bearEndEst ? new Date(bearEndEst).toISOString().slice(0, 10) : ''}
                      </text>
                    )}
                  </>
                )}
              </g>
            )
          })}
        </g>

        {/* 抄底(蓝)/ 卖出(红) 横向价位带(开关控制) */}
        {showZones && (() => {
          const bandRect = (lo: number, hi: number, fill: string, stroke: string, label: string, labelColor: string, key: string) => {
            const loC = Math.max(lo, vMin)
            const hiC = Math.min(hi, vMax)
            if (hiC <= loC) return null
            const yTop = y(hiC)
            return (
              <g key={key}>
                <rect x={padL} y={yTop} width={plotW} height={y(loC) - yTop} fill={fill} />
                <line x1={padL} x2={padL + plotW} y1={y(hiC)} y2={y(hiC)} stroke={stroke} strokeDasharray="4 3" strokeWidth={0.8} />
                <line x1={padL} x2={padL + plotW} y1={y(loC)} y2={y(loC)} stroke={stroke} strokeDasharray="4 3" strokeWidth={0.8} />
                <text x={padL + 8} y={yTop + 13} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, fill: labelColor, letterSpacing: 1 }}>{label}</text>
              </g>
            )
          }
          return (
            <>
              {zoneLo != null && zoneHi != null && bandRect(
                zoneLo, zoneHi, 'rgba(56,189,248,.18)', 'rgba(56,189,248,.8)',
                `▼ 抄底区 ${fmtK(zoneLo)} ~ ${fmtK(zoneHi)}`, '#7dd3fc', 'buy-zone',
              )}
              {sellLo != null && sellHi != null && bandRect(
                sellLo, sellHi, 'rgba(247,80,73,.16)', 'rgba(247,80,73,.8)',
                `▲ 卖出区 ${fmtK(sellLo)} ~ ${fmtK(sellHi)}`, '#fca5a1', 'sell-zone',
              )}
            </>
          )
        })()}

        {/* y 网格 + 右侧刻度 */}
        {yTicks.map(v => (
          <g key={v}>
            <line x1={padL} x2={padL + plotW} y1={y(v)} y2={y(v)} stroke="rgba(213,240,33,.07)" />
            <text x={padL + plotW + 8} y={y(v) + 3}
              style={{ fontFamily: MONO, fontSize: 9, fill: TXT_FAINT }}>
              {v >= 1000 ? `${Math.round(v / 1000)}k` : Math.round(v)}
            </text>
          </g>
        ))}

        {/* x 时间网格 + 刻度(年/月/日自适应) */}
        {xTicks.map(tick => (
          <g key={tick.t}>
            <line x1={x(tick.t)} x2={x(tick.t)} y1={padT} y2={padT + plotH} stroke="rgba(213,240,33,.05)" />
            <text x={x(tick.t)} y={height - 8} textAnchor="middle"
              style={{ fontFamily: MONO, fontSize: 9, fill: TXT_FAINT }}>
              {tick.label}
            </text>
          </g>
        ))}

        {/* 减半日竖线 + 标签 */}
        {halvingsInView.map(t => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={padT - 4} y2={padT + plotH} stroke="rgba(94,242,228,.5)" strokeWidth={1.2} />
            <rect x={x(t) - 24} y={padT - 26} width={48} height={14} fill="rgba(10,14,13,.9)" stroke="rgba(94,242,228,.55)" strokeWidth={1} />
            <text x={x(t)} y={padT - 15} textAnchor="middle"
              style={{ fontFamily: MONO, fontSize: 9, fill: UP }}>
              减半日
            </text>
            <rect x={x(t) - 17} y={padT - 10} width={34} height={13} fill="rgba(10,14,13,.9)" stroke="rgba(74,222,128,.5)" strokeWidth={1} />
            <text x={x(t)} y={padT} textAnchor="middle"
              style={{ fontFamily: MONO, fontSize: 9, fill: '#4ade80' }}>
              牛市
            </text>
          </g>
        ))}

        {/* 彩虹价格线 */}
        <g clipPath={`url(#${clipId})`}>
          {paths.map((p, i) => (
            <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={spanDays < 400 ? 2.2 : 1.8}
              strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </g>

        {/* 今日: 虚线 + 实时点 + 价格标签(仅当今日在可见范围内) */}
        {todayInView && (
          <>
            <line x1={x(ts[last])} x2={x(ts[last])} y1={padT - 4} y2={padT + plotH}
              stroke="rgba(247,80,73,.55)" strokeWidth={1} strokeDasharray="4 3" />
            <rect x={x(ts[last]) - 17} y={padT - 26} width={34} height={14} fill="rgba(10,14,13,.9)" stroke="rgba(247,80,73,.6)" strokeWidth={1} />
            <text x={x(ts[last])} y={padT - 15} textAnchor="middle"
              style={{ fontFamily: MONO, fontSize: 9, fill: DOWN }}>
              今日
            </text>
          </>
        )}
        {lastPriceInView && (
          <>
            <circle cx={x(ts[last])} cy={y(closes[last])} r={3.5} fill={lastColor}>
              <animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <line x1={x(ts[last])} x2={padL + plotW} y1={y(closes[last])} y2={y(closes[last])}
              stroke={lastColor} strokeWidth={0.8} strokeDasharray="2 3" opacity={0.7} />
            <rect x={padL + plotW + 2} y={y(closes[last]) - 8} width={62} height={16} fill={lastColor} />
            <text x={padL + plotW + 33} y={y(closes[last]) + 4} textAnchor="middle"
              style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, fill: '#0d0b07' }}>
              {closes[last] >= 1000 ? closes[last].toFixed(0) : closes[last].toFixed(2)}
            </text>
          </>
        )}

        {/* 悬停十字线 + 点 */}
        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(ts[hover])} x2={x(ts[hover])} y1={padT} y2={padT + plotH}
              stroke="rgba(232,230,216,.35)" strokeWidth={0.8} strokeDasharray="3 3" />
            <circle cx={x(ts[hover])} cy={y(closes[hover])} r={3.5}
              fill="none" stroke={scoreColor(scores[hover])} strokeWidth={2} />
          </g>
        )}
      </svg>

      {/* 悬停 tooltip */}
      {hover != null && (
        <div style={{
          position: 'absolute',
          left: Math.min(Math.max(x(ts[hover]) + 12, padL), width - 170),
          top: Math.max(padT, y(closes[hover]) - 64),
          pointerEvents: 'none',
          background: 'rgba(10,14,13,.95)',
          border: '1px solid rgba(213,240,33,.35)',
          padding: '6px 10px',
          fontFamily: MONO,
          fontSize: 10,
          lineHeight: 1.7,
          zIndex: 10,
        }}>
          <div style={{ color: TXT_WEAK }}>{rows[hover].date}</div>
          <div style={{ color: '#e8e6d8', fontSize: 12, fontWeight: 700 }}>
            ${closes[hover] >= 1000 ? closes[hover].toLocaleString('en-US', { maximumFractionDigits: 0 }) : closes[hover].toFixed(2)}
          </div>
          <div>
            <span style={{ color: TXT_WEAK }}>周期位置 </span>
            <span style={{ color: scoreColor(scores[hover]), fontWeight: 700 }}>{(scores[hover] * 100).toFixed(0)}%</span>
            <span style={{ color: hoverBear ? DOWN : UP, marginLeft: 8 }}>{hoverBear ? '熊市' : '牛市'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
