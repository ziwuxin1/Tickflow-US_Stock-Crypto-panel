import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from './GlassCard'
import { DotGridEmpty } from './DotGridEmpty'
import { INK, MONO, NEON, TXT_BODY, TXT_SECONDARY, TXT_WEAK, clipTL } from './tokens'
import { portfolioApi } from '@/lib/api'

/** 分段配色(赛博朋克盘: 酸黄→青→蓝→紫→橙→粉→绿, 循环) */
const SEG_COLORS = ['#d5f021', '#5ef2e4', '#627eea', '#9945ff', '#f7931a', '#ff5f9e', '#6ee89a', '#e8944a']

/** 精确金额:带千分位、2 位小数(count-up 滚动到准确值)。 */
function exact(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 数字滚动动画:从当前显示值平滑过渡到 target(easeOutCubic)。加载/hover 切换时都会跳动。 */
function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(0)
  const valRef = useRef(0)
  useEffect(() => {
    const from = valRef.current
    if (from === target) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const cur = from + (target - from) * eased
      valRef.current = cur
      setVal(cur)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

interface Seg { label: string; value: number; pct: number; color: string }

/**
 * 看板 · 持仓分布环形图 —— 按各持仓市值占比绘制甜甜圈 + 图例。
 * 交互:hover 扇区/图例双向联动高亮(变粗+泛光,其余变暗),中心数字滚动跳动为该扇区市值;
 * 移出恢复总市值。数据复用 /api/portfolio/summary。超过 7 项其余合并为「其他」。
 */
export function PortfolioAllocationCard() {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState<number | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['portfolio', 'summary'],
    queryFn: portfolioApi.summary,
    refetchInterval: 60_000,
  })

  const { segs, total } = useMemo(() => {
    const priced = (data?.positions ?? []).filter(p => p.market_value != null && p.market_value > 0)
    const tot = priced.reduce((s, p) => s + (p.market_value ?? 0), 0)
    if (tot <= 0) return { segs: [] as Seg[], total: 0 }
    const sorted = [...priced].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
    const top = sorted.slice(0, 7)
    const rest = sorted.slice(7)
    const items: Seg[] = top.map((p, i) => ({
      label: p.symbol.replace(/\.US$/, ''),
      value: p.market_value ?? 0,
      pct: (p.market_value ?? 0) / tot * 100,
      color: SEG_COLORS[i % SEG_COLORS.length],
    }))
    if (rest.length) {
      const rv = rest.reduce((s, p) => s + (p.market_value ?? 0), 0)
      items.push({ label: '其他', value: rv, pct: rv / tot * 100, color: '#4a4738' })
    }
    return { segs: items, total: tot }
  }, [data])

  // 中心显示的目标值:hover 某扇区 → 该扇区市值;否则总市值。经 count-up 滚动。
  const active = hovered != null ? segs[hovered] : undefined
  const shown = useCountUp(active ? active.value : total)

  // 甜甜圈几何: r=38, 描边 14, 周长 C; 各段用 dasharray + 累积 offset 绘制
  const R = 38
  const C = 2 * Math.PI * R
  let acc = 0

  return (
    <GlassCard variant="strong" corners style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      {/* 黄色题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: NEON, padding: '6px 13px', clipPath: clipTL(11) }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: INK, letterSpacing: 2 }}>持仓分布</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, color: 'rgba(13,11,7,.7)', letterSpacing: 1.5 }}>ALLOCATION</span>
      </div>

      <div style={{ padding: '14px 14px 12px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        {isLoading ? (
          <DotGridEmpty text="LOADING…" minHeight={180} maskStop={40} />
        ) : segs.length === 0 ? (
          <div onClick={() => navigate('/portfolio')} style={{ cursor: 'pointer', flex: 1 }}>
            <DotGridEmpty text="暂无持仓 · 点击记一笔" minHeight={180} maskStop={40} />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
            {/* 甜甜圈 */}
            <div style={{ position: 'relative', width: 168, height: 168, flex: 'none' }}>
              <svg viewBox="0 0 100 100" width="168" height="168" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
                <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(213,240,33,.08)" strokeWidth="14" />
                {segs.map((s, i) => {
                  const len = (s.pct / 100) * C
                  const isActive = hovered === i
                  const dim = hovered != null && !isActive
                  const el = (
                    <circle
                      key={i}
                      cx="50" cy="50" r={R} fill="none"
                      stroke={s.color}
                      strokeWidth={isActive ? 16.5 : 14}
                      strokeDasharray={`${len} ${C - len}`}
                      strokeDashoffset={-acc}
                      opacity={dim ? 0.28 : 1}
                      onMouseEnter={() => setHovered(i)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => navigate('/portfolio')}
                      style={{
                        cursor: 'pointer',
                        transition: 'stroke-width .2s ease, opacity .2s ease',
                        filter: isActive ? `drop-shadow(0 0 5px ${s.color})` : 'none',
                      }}
                    />
                  )
                  acc += len
                  return el
                })}
              </svg>
              {/* 圆心: 总市值 / hover 时该扇区 */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: active ? active.color : TXT_WEAK, transition: 'color .2s' }}>
                  {active ? active.label : '总市值'}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: TXT_BODY, whiteSpace: 'nowrap' }}>{exact(shown)}</span>
                {active && (
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: active.color }}>{active.pct.toFixed(1)}%</span>
                )}
              </div>
            </div>

            {/* 图例 */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {segs.map((s, i) => {
                const isActive = hovered === i
                const dim = hovered != null && !isActive
                return (
                  <div
                    key={i}
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => navigate('/portfolio')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', padding: '3px 5px',
                      background: isActive ? 'rgba(213,240,33,.06)' : 'transparent',
                      opacity: dim ? 0.5 : 1,
                      transition: 'opacity .2s, background .2s',
                    }}
                  >
                    <span style={{ width: 8, height: 8, background: s.color, flex: 'none', transform: isActive ? 'scale(1.35)' : 'none', transition: 'transform .2s', boxShadow: isActive ? `0 0 6px ${s.color}` : 'none' }} />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: TXT_BODY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{s.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: isActive ? s.color : TXT_SECONDARY, flex: 'none', transition: 'color .2s' }}>{s.pct.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}
