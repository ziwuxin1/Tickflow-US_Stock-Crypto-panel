import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { ECharts, EChartsOption } from 'echarts'
import type { MinuteKlineRow } from '@/lib/api'
import { isCrypto } from '@/lib/markets'
import { BULL_ALPHA, BEAR_ALPHA, BULL_SOFT, BEAR_SOFT, NEUTRAL } from '@/lib/palette'
import { fmtPrice, fmtBigNum, fmtVolume } from '@/lib/format'

const THEME = {
  line: '#3B82F6',
  areaFill: 'rgba(59,130,246,0.40)',
  avgLine: '#F59E0B',
  refLine: 'rgba(255,255,255,0.25)',
  volUp: BULL_ALPHA,
  volDown: BEAR_ALPHA,
  text: '#A1A1AA',
  grid: 'rgba(255,255,255,0.04)',
  border: '#27272A',
}

interface Props {
  data: MinuteKlineRow[]
  height?: number
  prevClose?: number
  date?: string
  symbol?: string
  onPriceHover?: (price: number | null) => void
  showAvgLine?: boolean
}

/** 从 datetime 提取 HH:MM 展示标签（美股为交易所时段、加密为 UTC，均由后端口径决定，不做时区偏移） */
function fmtTime(dt: string): string {
  const match = dt.match(/(\d{2}):(\d{2})/)
  if (!match) return dt.slice(11, 16)
  return `${match[1]}:${match[2]}`
}

function computeAvgPrice(data: MinuteKlineRow[]): number[] {
  // 分时均线 = 累计成交额 / 累计成交量(股/币)
  const result: number[] = []
  let sumAmt = 0
  let sumVol = 0
  for (const d of data) {
    sumAmt += d.amount
    sumVol += d.volume
    result.push(sumVol > 0 ? sumAmt / sumVol : d.close)
  }
  return result
}

function isValidPrice(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

function buildOption(
  data: MinuteKlineRow[],
  prevClose: number | undefined,
  avgPrices: number[],
  lineColor: string,
  areaColor: string,
  symbol?: string,
  showAvgLine = true,
): EChartsOption {
  // 低风险会话模型：直接用实际数据点做 category 轴（美股 390 bar/日、加密 24h 均适用）
  const times = data.map(d => fmtTime(d.datetime))
  const closes = data.map(d => d.close)
  const avgData = showAvgLine ? avgPrices.slice(0, data.length) : []
  const volNeutral = 'rgba(161,161,170,0.5)'
  const volumes = data.map(d => ({
    value: d.volume,
    itemStyle: {
      color: d.close > d.open ? THEME.volUp : d.close < d.open ? THEME.volDown : volNeutral,
    },
  }))

  // 加密价格可能 <1，坐标/十字线用自适应精度；美股固定 2 位
  const crypto = isCrypto(symbol)
  const fmtAxisPrice = (v: number) => (crypto ? fmtPrice(v) : v.toFixed(2))

  const areaStyle: any = {
    color: {
      type: 'linear',
      x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: areaColor },
        { offset: 1, color: 'rgba(0,0,0,0)' },
      ],
    },
  }

  const markLineData: any[] = []
  if (prevClose != null) {
    markLineData.push({
      yAxis: prevClose,
      lineStyle: { color: THEME.refLine, type: 'dashed', width: 1 },
      label: { show: false },
      symbol: 'none',
    })
  }

  // Y 轴自适应：围绕昨收对称，保证最小可视范围
  let yMin: number | undefined
  let yMax: number | undefined
  let maxDiff = 0
  if (isValidPrice(prevClose) && data.length > 0) {
    for (const d of data) {
      for (const v of showAvgLine ? [d.close, d.high, d.low] : [d.close, d.high, d.low]) {
        if (!isValidPrice(v)) continue
        const diff = Math.abs(v - prevClose)
        if (diff > maxDiff) maxDiff = diff
      }
    }
    if (showAvgLine) {
      for (const v of avgPrices) {
        if (!isValidPrice(v)) continue
        const diff = Math.abs(v - prevClose)
        if (diff > maxDiff) maxDiff = diff
      }
    }
    maxDiff *= 1.1
    // 至少保证一个可视范围 (防止低波动被压成横线)
    const minDiff = prevClose * 0.002
    if (maxDiff < minDiff) maxDiff = minDiff
    yMin = prevClose - maxDiff
    yMax = prevClose + maxDiff
  }

  // x 轴稀疏标签：首尾 + 中间均匀取 3 个
  const n = times.length
  const labelIdxSet = new Set<number>()
  if (n > 0) {
    const ticks = Math.min(5, n)
    for (let i = 0; i < ticks; i++) {
      labelIdxSet.add(Math.round(i * (n - 1) / Math.max(1, ticks - 1)))
    }
  }
  const xAxisLabelFormatter = (value: string, idx: number) => {
    return labelIdxSet.has(idx) ? value : ''
  }

  return {
    animation: false,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'transparent',
      borderWidth: 0,
      textStyle: { fontSize: 0 },
      formatter: () => '',
      axisPointer: {
        type: 'cross',
        label: {
          show: true,
          backgroundColor: 'rgba(39,39,42,0.9)',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: [2, 5],
          color: '#A1A1AA',
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
        },
        crossStyle: { color: 'rgba(255,255,255,0.2)', type: 'dashed', width: 1 },
        lineStyle: { color: 'rgba(255,255,255,0.2)', type: 'dashed', width: 1 },
      },
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
    },
    grid: [
      { left: 60, right: 55, top: 24, bottom: '28%' },
      { left: 60, right: 55, top: '74%', bottom: 20 },
    ],
    xAxis: [
      {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisPointer: {
          show: true,
          lineStyle: { color: 'rgba(255,255,255,0.2)', type: 'dashed', width: 1 },
          label: {
            show: true,
            backgroundColor: 'rgba(39,39,42,0.9)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: [2, 4],
            color: '#A1A1AA',
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            formatter: (params: any) => {
              return params.value ?? ''
            },
          },
        },
        axisLine: { show: false },
        axisLabel: {
          color: THEME.text,
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: xAxisLabelFormatter,
          interval: 0,
        },
        axisTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: 'rgba(255,255,255,0.04)' },
        },
      },
      {
        type: 'category',
        gridIndex: 1,
        data: times,
        boundaryGap: false,
        axisLine: { show: false },
        axisLabel: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value',
        min: yMin,
        max: yMax,
        interval: maxDiff || undefined,
        scale: yMin == null,
        splitArea: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: THEME.grid } },
        axisPointer: {
          label: {
            formatter: (params: any) => {
              const v = params.value
              return typeof v === 'number' ? fmtAxisPrice(v) : ''
            },
          },
        },
        axisLabel: {
          color: THEME.text,
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: (v: number) => fmtAxisPrice(v),
        },
      },
      {
        scale: true,
        gridIndex: 1,
        splitNumber: 2,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
      },
      ...(isValidPrice(prevClose) && yMin != null && yMax != null ? [{
        type: 'value' as const,
        position: 'right' as const,
        gridIndex: 0,
        min: yMin,
        max: yMax,
        interval: maxDiff || undefined,
        splitArea: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisPointer: {
          label: {
            formatter: (params: any) => {
              const v = params.value
              if (typeof v !== 'number') return ''
              const pct = (v - prevClose) / prevClose * 100
              if (Math.abs(pct) < 0.01) return '0.00%'
              return (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'
            },
          },
        },
        axisLabel: {
          color: THEME.text,
          fontSize: 10,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: (v: number) => {
            const pct = (v - prevClose) / prevClose * 100
            if (Math.abs(pct) < 0.01) return '0.00%'
            return (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'
          },
        },
      }] : []),
    ],
    series: [
      {
        name: '价格',
        type: 'line',
        data: closes,
        smooth: false,
        symbol: 'none',
        cursor: 'crosshair',
        lineStyle: { width: 1.2, color: lineColor },
        areaStyle,
        connectNulls: true,
        markLine: markLineData.length > 0 ? { symbol: 'none', data: markLineData, animation: false, silent: true } : undefined,
      },
      ...(showAvgLine ? [{
        name: '均价',
        type: 'line' as const,
        data: avgData,
        smooth: false,
        symbol: 'none',
        cursor: 'crosshair',
        lineStyle: { width: 1, color: THEME.avgLine },
        connectNulls: true,
      }] : []),
      {
        name: '成交量',
        type: 'bar',
        data: volumes,
        xAxisIndex: 1,
        yAxisIndex: 1,
        cursor: 'crosshair',
      },
    ],
  }
}

export function EChartsIntraday({ data, height = 320, prevClose, date, symbol, onPriceHover, showAvgLine = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ECharts | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const moRef = useRef<MutationObserver | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data
  const onPriceHoverRef = useRef(onPriceHover)
  onPriceHoverRef.current = onPriceHover

  const [infoIdx, setInfoIdx] = useState(data.length - 1)
  const avgPrices = useMemo(() => computeAvgPrice(data), [data])

  // 分时线颜色：基于最新价 vs 昨收（绿涨红跌）
  const lastClose = data.length > 0 ? data[data.length - 1].close : null
  const lineIsUp = lastClose != null && prevClose != null ? lastClose > prevClose : true
  const lineIsFlat = lastClose != null && prevClose != null ? lastClose === prevClose : false
  const lineColor = lineIsFlat ? NEUTRAL : lineIsUp ? BULL_SOFT : BEAR_SOFT
  const areaFill = lineIsFlat ? 'rgba(180,180,190,0.40)' : lineIsUp ? 'rgba(58,173,114,0.40)' : 'rgba(204,90,74,0.40)'

  useEffect(() => {
    setInfoIdx(data.length - 1)
  }, [data.length])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let chart = chartRef.current
    if (!chart) {
      chart = echarts.init(el, undefined, { renderer: 'canvas' })
      chartRef.current = chart
      // 强制 canvas 使用十字光标，覆盖 ECharts 默认的 pointer
      const forceCursor = () => {
        const canvases = el.querySelectorAll('canvas')
        canvases.forEach(c => { c.style.setProperty('cursor', 'crosshair', 'important') })
      }
      forceCursor()
      // MutationObserver: ECharts 内部可能重建/修改 canvas 属性，持续强制 cursor
      const mo = new MutationObserver(forceCursor)
      mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] })
      moRef.current = mo
      roRef.current = new ResizeObserver(() => {
        chart!.resize()
        forceCursor()
      })
      roRef.current.observe(el)

      chart.on('updateAxisPointer', (event: any) => {
        const axesInfo = event.axesInfo
        if (!axesInfo) return
        for (const info of Object.values(axesInfo)) {
          const val = (info as any)?.value
          if (val == null) continue
          const dataIdx = typeof val === 'number' ? val : -1
          if (dataIdx >= 0) {
            setInfoIdx(dataIdx)
            const d = dataRef.current
            if (dataIdx < d.length) {
              onPriceHoverRef.current?.(d[dataIdx].close)
            }
            return
          }
        }
      })

      chart.on('globalout', () => {
        onPriceHoverRef.current?.(null)
      })
    }

    if (data.length > 0) {
      chart.setOption(buildOption(data, prevClose, avgPrices, lineColor, areaFill, symbol, showAvgLine), true)
    } else {
      chart.clear()
    }
  }, [data, prevClose, height, lineColor, areaFill, symbol, showAvgLine, avgPrices])

  useEffect(() => {
    return () => {
      chartRef.current?.off('updateAxisPointer')
      chartRef.current?.off('globalout')
      moRef.current?.disconnect()
      roRef.current?.disconnect()
      chartRef.current?.dispose()
      chartRef.current = null
      moRef.current = null
      roRef.current = null
    }
  }, [])

  const d = infoIdx >= 0 && infoIdx < data.length ? data[infoIdx] : null
  const avg = d != null ? avgPrices[infoIdx] : null
  const chg = d && prevClose != null ? d.close - prevClose : null
  const isUp = chg != null ? chg > 0 : true
  const isFlat = chg != null ? chg === 0 : false
  const priceClr = isFlat ? NEUTRAL : isUp ? BULL_SOFT : BEAR_SOFT

  return (
    <div className="w-full">
      <div style={{ backgroundColor: 'rgba(39,39,42,0.6)' }}>
        {/* 第一行: 日期 + OHLC */}
        <div className="flex items-center gap-x-2 px-2 font-mono text-[11px] select-none flex-wrap" style={{ height: 20 }}>
          {!d && <span className="text-muted">—</span>}
          {d && (
            <>
              {date && <span className="text-muted">{date}</span>}
              <span className="text-muted">开</span>
              <span style={{ color: priceClr }}>{fmtPrice(d.open)}</span>
              <span className="text-muted">高</span>
              <span style={{ color: priceClr }}>{fmtPrice(d.high)}</span>
              <span className="text-muted">低</span>
              <span style={{ color: priceClr }}>{fmtPrice(d.low)}</span>
              <span className="text-muted">收</span>
              <span style={{ color: priceClr }} className="font-semibold">{fmtPrice(d.close)}</span>
            </>
          )}
        </div>
        {/* 第二行: 价格+均价+量+额 */}
        <div className="flex items-center gap-x-4 px-2 font-mono text-[11px] select-none" style={{ height: 20 }}>
          {d && (
            <>
              <span className="flex items-center gap-x-1">
                <span style={{ display: 'inline-block', width: 14, height: 2, background: priceClr }} />
                <span style={{ color: priceClr }}>{fmtPrice(d.close)}</span>
              </span>
              {showAvgLine && <span className="flex items-center gap-x-1">
                <span style={{ display: 'inline-block', width: 14, height: 2, background: THEME.avgLine }} />
                <span style={{ color: THEME.avgLine }}>{avg != null ? fmtPrice(avg) : '—'}</span>
              </span>}
              <span className="text-muted">量</span>
              <span className="text-secondary">{fmtVolume(d.volume)}</span>
              <span className="text-muted">额</span>
              <span className="text-secondary">{fmtBigNum(d.amount)}</span>
            </>
          )}
        </div>
      </div>
      <div ref={containerRef} className="w-full" style={{ height: height - 42, cursor: 'crosshair' }} />
    </div>
  )
}
