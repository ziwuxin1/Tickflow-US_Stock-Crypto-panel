import { useMemo, useState } from 'react'
import type { AiPatterns, KlineRow, LevelSeries } from '@/lib/api'
import { KLineChart } from '@/components/indices/KLineChart'
import { normalizeBars } from '@/components/indices/chartMath'
import type { CurveOverlay, LevelLine } from '@/components/indices/levelOverlays'
import { TRI_LINE, WAVE_SEQ } from '@/components/indices/tokens'
import { FORECAST_LINE } from '@/components/indices/forecastLine'

/**
 * 个股分析专用日 K 图表 — 与指数页共用 KLineChart(SVG 自绘)统一界面:
 * OHLC 信息行 / MA 图例 / 蜡烛+均线 / 成交量 / MACD / 波浪信号 / 三角区,
 * 滚轮缩放 · 拖拽平移 · 双击复位。
 *
 * 个股分析特有部分(全部保留):
 *   - 关键价位开关组(压力支撑/枢轴点/前高前低/布林带/Keltner/ATR止损/缺口位/斐波那契/整数关口)
 *   - 枢轴点档位选择器(1=P+R1/S1, 2=到R2/S2, 3=全档)
 *   - 价位统计面板(压力位/支撑位结构化列表)
 * 水平价位线与通道曲线以 levelLines/curves 叠加层传入 KLineChart。
 */

const TEXT_FALLBACK = '#A1A1AA'

// ===== 价位类型(与后端 levels.py 的 LEVEL_TYPES 对齐) =====
export type LevelType = 'sr' | 'pivot' | 'extreme' | 'boll' | 'keltner_s' | 'keltner_m' | 'keltner_l' | 'atr_stop' | 'gap' | 'fib' | 'round'

export interface PriceLevel {
  value: number
  label: string
  type: LevelType
  side: 'resistance' | 'support' | 'neutral'
  strength?: 'strong' | 'medium' | 'weak'
  /** 档位(仅 pivot 有):0=P, 1=R1/S1, 2=R2/S2, 3=R3/S3 */
  rank?: number
}

/** 价位组开关配置:label = 按钮文案,color = 价位线颜色 */
export const LEVEL_GROUPS: { key: LevelType; label: string; color: string }[] = [
  { key: 'sr',       label: '压力支撑',  color: '#F97316' },   // 橙(成交密集区,价量驱动)
  { key: 'pivot',    label: '枢轴点',    color: '#8B5CF6' },   // 紫
  { key: 'extreme',  label: '前高前低',  color: '#EAB308' },   // 黄
  { key: 'boll',     label: '布林带',    color: '#F97316' },   // 橙(MA20±2σ 曲线)
  { key: 'keltner_s',label: 'Keltner短期',  color: '#06B6D4' },   // 青(MA20±2ATR 曲线)
  { key: 'keltner_m',label: 'Keltner中期',  color: '#22D3EE' },   // 浅青(MA60±2.5ATR 曲线)
  { key: 'keltner_l',label: 'Keltner长期',  color: '#67E8F9' },   // 更浅青(MA120±3ATR 曲线)
  { key: 'atr_stop', label: 'ATR止损',  color: '#EF4444' },   // 红(警示)
  { key: 'gap',      label: '缺口位',    color: '#EC4899' },   // 粉
  { key: 'fib',      label: '斐波那契',  color: '#F59E0B' },   // 金
  { key: 'round',    label: '整数关口',  color: '#71717A' },   // 灰(心理位,弱视觉)
]

// 通道曲线元数据(单一数据源):供叠加层画线使用。
//   alignedKey: alignedSeries 中的 key(由 series.boll/keltner/atr 对齐而来)
//   group:      属于哪个价位开关组(开关该组即开关这条曲线)
const CURVE_DEFS: { alignedKey: string; group: LevelType; color: string; dashed?: boolean }[] = [
  { alignedKey: 'boll_upper',     group: 'boll',      color: '#F97316', dashed: true },
  { alignedKey: 'boll_lower',     group: 'boll',      color: '#F97316', dashed: true },
  { alignedKey: 'boll_mid',       group: 'boll',      color: '#FB923C', dashed: false },
  { alignedKey: 'keltner_s_upper',group: 'keltner_s', color: '#06B6D4', dashed: true },
  { alignedKey: 'keltner_s_lower',group: 'keltner_s', color: '#06B6D4', dashed: true },
  { alignedKey: 'keltner_m_upper',group: 'keltner_m', color: '#22D3EE', dashed: true },
  { alignedKey: 'keltner_m_lower',group: 'keltner_m', color: '#22D3EE', dashed: true },
  { alignedKey: 'keltner_l_upper',group: 'keltner_l', color: '#67E8F9', dashed: true },
  { alignedKey: 'keltner_l_lower',group: 'keltner_l', color: '#67E8F9', dashed: true },
  { alignedKey: 'atr_stop',       group: 'atr_stop',  color: '#EF4444', dashed: true },
  { alignedKey: 'atr_tp',         group: 'atr_stop',  color: '#F87171', dashed: true },
]

interface Props {
  rows: KlineRow[]
  levels?: Record<LevelType, PriceLevel[]>
  /** 带状曲线指标(布林带/Keltner/ATR)的每日序列 —— 画成跟随时间漂移的曲线 */
  series?: LevelSeries
  /** series 数据对应的日期数组(与 series 各数组对齐) */
  seriesDates?: string[]
  /** 默认开启的价位组 */
  defaultLevelTypes?: LevelType[]
  /** AI 自动预测点位(进出场/止损/目标等), 有值时显示"AI点位"开关 */
  extraLevels?: LevelLine[]
  /** AI 形态标注(三角区/预测路径/波浪拐点), 随"AI点位"开关显隐 */
  aiPatterns?: AiPatterns | null
  /** 点击某根 K 线 */
  onDateClick?: (date: string) => void
  className?: string
}

export function AnalysisKChart({
  rows,
  levels,
  series,
  seriesDates,
  defaultLevelTypes = [],
  extraLevels,
  aiPatterns,
  onDateClick,
  className,
}: Props) {
  const [activeTypes, setActiveTypes] = useState<Set<LevelType>>(new Set(defaultLevelTypes))
  /** 枢轴点显示到第几档:1=只P+R1/S1, 2=到R2/S2, 3=全档(R3/S3) */
  const [pivotRank, setPivotRank] = useState<1 | 2 | 3>(1)
  // 个股分析页默认全部关闭(用户按需开启); AI点位随预测结果默认展示
  const [showWave, setShowWave] = useState(false)
  const [showTri, setShowTri] = useState(false)
  const [showFc, setShowFc] = useState(false)
  const [showAi, setShowAi] = useState(true)

  // KlineRow → KBar(统一图表数据格式, MA/MACD 缺失时客户端回退计算)
  const bars = useMemo(() => normalizeBars(rows), [rows])

  // 带状曲线序列对齐(后端 series 的日期范围可能与 rows 不同,需映射)
  const alignedSeries = useMemo(() => {
    const dates = bars.map(b => b.date)
    const out: Record<string, (number | null)[]> = {}
    if (!series || !seriesDates || seriesDates.length === 0) return out
    const sIdx = new Map(seriesDates.map((d, i) => [d, i]))
    const align = (arr: (number | null)[] | undefined): (number | null)[] => {
      if (!arr) return dates.map(() => null)
      return dates.map(d => {
        const i = sIdx.get(d)
        return i != null ? arr[i] : null
      })
    }
    if (series.boll) {
      out['boll_upper'] = align(series.boll.upper)
      out['boll_lower'] = align(series.boll.lower)
      if (series.boll.mid) out['boll_mid'] = align(series.boll.mid)
    }
    if (series.keltner_s) {
      out['keltner_s_upper'] = align(series.keltner_s.upper)
      out['keltner_s_lower'] = align(series.keltner_s.lower)
    }
    if (series.keltner_m) {
      out['keltner_m_upper'] = align(series.keltner_m.upper)
      out['keltner_m_lower'] = align(series.keltner_m.lower)
    }
    if (series.keltner_l) {
      out['keltner_l_upper'] = align(series.keltner_l.upper)
      out['keltner_l_lower'] = align(series.keltner_l.lower)
    }
    if (series.atr) {
      out['atr_stop'] = align(series.atr.stop_loss)
      out['atr_tp'] = align(series.atr.take_profit)
    }
    return out
  }, [bars, series, seriesDates])

  // 水平价位线(按开启的组 + 档位过滤) + AI 预测点位(开关控制)
  const levelLines = useMemo<LevelLine[]>(() => {
    const base = collectPriceLines(levels, activeTypes, pivotRank)
    return showAi && extraLevels?.length ? [...base, ...extraLevels] : base
  }, [levels, activeTypes, pivotRank, showAi, extraLevels])

  // 通道曲线(开关该组即开关曲线)
  const curves = useMemo<CurveOverlay[]>(() => {
    const out: CurveOverlay[] = []
    for (const def of CURVE_DEFS) {
      if (!activeTypes.has(def.group)) continue
      const points = alignedSeries[def.alignedKey]
      if (!points || !points.some(v => v != null)) continue
      out.push({ key: def.alignedKey, points, color: def.color, dashed: def.dashed })
    }
    return out
  }, [activeTypes, alignedSeries])

  const toggleType = (t: LevelType) => {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const chipCls = (active: boolean) =>
    `inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-medium border transition-all ${
      active ? 'text-foreground' : 'text-muted bg-base/40 border-border/30 hover:border-border/60'
    }`

  return (
    <div className={className}>
      {/* 价位开关按钮组 */}
      {levels && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[10px] text-muted mr-1">关键价位</span>
          {LEVEL_GROUPS.map(g => {
            const active = activeTypes.has(g.key)
            // 枢轴点数量按当前档位过滤显示;其他组显示原始数量
            const raw = levels[g.key] ?? []
            const count = g.key === 'pivot'
              ? raw.filter(p => p.rank === undefined || p.rank <= pivotRank).length
              : raw.length
            return (
              <button
                key={g.key}
                onClick={() => toggleType(g.key)}
                disabled={raw.length === 0}
                title={`${g.label} (${count} 个)`}
                className={`${chipCls(active)} disabled:opacity-30 disabled:cursor-not-allowed`}
                style={active ? { borderColor: g.color + '66', backgroundColor: g.color + '1a' } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: active ? g.color : '#52525B' }} />
                {g.label}
                <span className="opacity-50">{count}</span>
              </button>
            )
          })}

          {/* 枢轴点档位选择器 —— 仅当枢轴点开启时显示 */}
          {activeTypes.has('pivot') && (levels.pivot?.length ?? 0) > 0 && (
            <div className="inline-flex items-center gap-0.5 ml-1 pl-2 border-l border-border/40">
              <span className="text-[10px] text-muted mr-1">档位</span>
              {([1, 2, 3] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setPivotRank(r)}
                  title={r === 1 ? 'P + R1/S1(3 个)' : r === 2 ? '到 R2/S2(5 个)' : '全档 R3/S3(7 个)'}
                  className={`h-6 px-2 rounded-md text-[10px] font-mono border transition-all ${
                    pivotRank === r
                      ? 'bg-[#8B5CF6]/15 border-[#8B5CF6]/40 text-[#c4b5fd]'
                      : 'text-muted bg-base/40 border-border/30 hover:border-border/60'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {/* 信号开关: 波浪信号 / 三角区(与指数页图层一致) */}
          <div className="inline-flex items-center gap-1.5 ml-1 pl-2 border-l border-border/40">
            <button
              onClick={() => setShowWave(v => !v)}
              title="波浪拐点 + 斐波那契标尺 + 支撑区/目标位"
              className={chipCls(showWave)}
              style={showWave ? { borderColor: WAVE_SEQ + '66', backgroundColor: WAVE_SEQ + '1a' } : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showWave ? WAVE_SEQ : '#52525B' }} />
              波浪信号
            </button>
            <button
              onClick={() => setShowTri(v => !v)}
              title="收敛三角形自动检测"
              className={chipCls(showTri)}
              style={showTri ? { borderColor: TRI_LINE + '66', backgroundColor: TRI_LINE + '1a' } : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showTri ? TRI_LINE : '#52525B' }} />
              三角区
            </button>
            <button
              onClick={() => setShowFc(v => !v)}
              title="最近 20 根收盘线性回归外推 + 置信扇面(技术外推, 非 AI 预测)"
              className={chipCls(showFc)}
              style={showFc ? { borderColor: FORECAST_LINE + '66', backgroundColor: FORECAST_LINE + '1a' } : undefined}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showFc ? FORECAST_LINE : '#52525B' }} />
              预测线
            </button>
            {((extraLevels?.length ?? 0) > 0 || aiPatterns) && (
              <button
                onClick={() => setShowAi(v => !v)}
                title="AI 自动预测的点位与形态(进出场/止损/目标/三角区/预测路径/波浪)"
                className={chipCls(showAi)}
                style={showAi ? { borderColor: '#2ecc8066', backgroundColor: '#2ecc801a' } : undefined}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: showAi ? '#2ecc80' : '#52525B' }} />
                AI点位
                <span className="opacity-50">{extraLevels?.length ?? 0}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 统一K线图(与指数页同款): OHLC行 / MA图例 / 主图 / 成交量 / MACD */}
      <KLineChart
        bars={bars}
        showSignals={showWave}
        showTriangle={showTri}
        showForecast={showFc}
        aiPatterns={showAi ? aiPatterns ?? null : null}
        levelLines={levelLines}
        curves={curves}
        defaultVisible={120}
        onDateClick={onDateClick}
      />

      {/* 价位统计面板:把当前开启的点位按"压力 / 支撑"结构化列出 */}
      {levels && (
        <LevelOverview
          levels={levels}
          activeTypes={activeTypes}
          pivotRank={pivotRank}
          close={bars.length ? bars[bars.length - 1].close : undefined}
        />
      )}
    </div>
  )
}

// ===== 价位统计面板(图表下方,结构化文本展示) =====
function LevelOverview({
  levels, activeTypes, pivotRank, close,
}: {
  levels: Record<LevelType, PriceLevel[]>
  activeTypes: Set<LevelType>
  pivotRank: 1 | 2 | 3
  close?: number
}) {
  // 收集当前显示的点位(同 collectPriceLines 的过滤逻辑)
  const visible: PriceLevel[] = []
  for (const g of LEVEL_GROUPS) {
    if (!activeTypes.has(g.key)) continue
    for (const p of levels[g.key] ?? []) {
      if (p.type === 'pivot' && p.rank !== undefined && p.rank > pivotRank) continue
      visible.push(p)
    }
  }
  if (visible.length === 0) return null

  // 按方向分两组:压力位(在当前价之上) / 支撑位(之下),各自按距当前价远近排序
  const cur = close ?? visible[0].value
  const resistances = visible
    .filter(p => p.side === 'resistance')
    .sort((a, b) => a.value - b.value)        // 由近及远(低→高)
  const supports = visible
    .filter(p => p.side === 'support')
    .sort((a, b) => b.value - a.value)         // 由近及远(高→低)
  const neutrals = visible.filter(p => p.side === 'neutral')

  const fmtPct = (v: number) => {
    if (!cur) return ''
    const pct = ((v - cur) / cur) * 100
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}%`
  }

  const Row = ({ p }: { p: PriceLevel }) => {
    const color = LEVEL_GROUPS.find(g => g.key === p.type)?.color ?? TEXT_FALLBACK
    return (
      <div className="flex items-center gap-2 py-0.5">
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[11px] text-secondary w-24 shrink-0 truncate">{p.label}</span>
        <span className="text-[11px] font-mono text-foreground">{p.value.toFixed(2)}</span>
        <span className="text-[9px] font-mono text-muted">{fmtPct(p.value)}</span>
      </div>
    )
  }

  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 rounded-lg border border-border/40 bg-base/20 px-3 py-2">
      {/* 当前价 */}
      <div className="sm:col-span-2 flex items-center gap-2 pb-1 border-b border-border/30 mb-0.5">
        <span className="text-[10px] text-muted">当前价</span>
        <span className="text-xs font-mono font-medium text-foreground">{cur.toFixed(2)}</span>
      </div>
      {/* 压力位(从近到远,即从低到高)倒序展示:最高的在最上 */}
      {resistances.length > 0 && (
        <div>
          <div className="text-[10px] font-medium text-bear mb-0.5">压力位 ↑</div>
          {[...resistances].reverse().map((p, i) => <Row key={`r-${i}`} p={p} />)}
        </div>
      )}
      {/* 支撑位 + 中性(枢轴位 P) */}
      <div>
        {supports.length > 0 && (
          <>
            <div className="text-[10px] font-medium text-bull mb-0.5">支撑位 ↓</div>
            {supports.map((p, i) => <Row key={`s-${i}`} p={p} />)}
          </>
        )}
        {neutrals.length > 0 && (
          <div className={supports.length > 0 ? 'mt-2' : ''}>
            {supports.length === 0 && <div className="text-[10px] font-medium text-muted mb-0.5">枢轴位</div>}
            {neutrals.map((p, i) => <Row key={`n-${i}`} p={p} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ===== 工具:收集要画的水平价位线(按开启的组 + 档位 + 强度配色) =====
// 注意:带状指标(布林带/Keltner/ATR)走曲线渲染,不在此画水平线,避免重复。
function collectPriceLines(
  levels: Record<LevelType, PriceLevel[]> | undefined,
  active: Set<LevelType>,
  pivotRank: 1 | 2 | 3,
): LevelLine[] {
  if (!levels) return []
  const out: LevelLine[] = []
  for (const g of LEVEL_GROUPS) {
    if (!active.has(g.key)) continue
    for (const p of levels[g.key] ?? []) {
      // 枢轴点:按档位过滤(rank>P 的,只显示到选定的档位)
      if (p.type === 'pivot' && p.rank !== undefined && p.rank > pivotRank) continue
      // 波动通道类(boll / keltner三档 / atr_stop)整组走曲线渲染,不画水平线;
      // sr 组现为成交密集区水平点,直接画线即可,无需特判。
      if (p.type === 'boll' || p.type === 'keltner_s' || p.type === 'keltner_m'
          || p.type === 'keltner_l' || p.type === 'atr_stop') continue
      out.push({ value: p.value, label: p.label, color: strengthColor(p.strength, g.color) })
    }
  }
  return out
}

function strengthColor(strength: string | undefined, base: string): string {
  // strong 用实色,medium 用 0.85,weak 用 0.55 透明
  if (strength === 'weak') return base + '8C'
  if (strength === 'medium') return base + 'D9'
  return base
}
