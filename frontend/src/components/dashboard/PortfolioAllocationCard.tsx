import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from './GlassCard'
import { DotGridEmpty } from './DotGridEmpty'
import { INK, MONO, NEON, TXT_BODY, TXT_SECONDARY, TXT_WEAK, clipTL } from './tokens'
import { portfolioApi } from '@/lib/api'

/** 分段配色(赛博朋克盘: 酸黄→青→蓝→紫→橙→粉→绿, 循环) */
const SEG_COLORS = ['#d5f021', '#5ef2e4', '#627eea', '#9945ff', '#f7931a', '#ff5f9e', '#6ee89a', '#e8944a']

function compact(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(0)}`
}

interface Seg { label: string; value: number; pct: number; color: string }

/**
 * 看板 · 持仓分布环形图 —— 按各持仓市值占比绘制甜甜圈 + 图例。
 * 数据复用 /api/portfolio/summary(与持仓页共享 queryKey); 无行情持仓不计入占比。
 * 超过 7 项时其余合并为「其他」。点击进入持仓组合页。
 */
export function PortfolioAllocationCard() {
  const navigate = useNavigate()
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
            <div style={{ position: 'relative', width: 132, height: 132, flex: 'none' }}>
              <svg viewBox="0 0 100 100" width="132" height="132" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(213,240,33,.08)" strokeWidth="14" />
                {segs.map((s, i) => {
                  const len = (s.pct / 100) * C
                  const el = (
                    <circle
                      key={i}
                      cx="50" cy="50" r={R} fill="none"
                      stroke={s.color} strokeWidth="14"
                      strokeDasharray={`${len} ${C - len}`}
                      strokeDashoffset={-acc}
                    />
                  )
                  acc += len
                  return el
                })}
              </svg>
              {/* 圆心: 总市值 */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: MONO, fontSize: 6.5, color: TXT_WEAK, letterSpacing: 1.5 }}>总市值</span>
                <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: TXT_BODY }}>{compact(total)}</span>
              </div>
            </div>

            {/* 图例 */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {segs.map((s, i) => (
                <div
                  key={i}
                  onClick={() => navigate('/portfolio')}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}
                >
                  <span style={{ width: 8, height: 8, background: s.color, flex: 'none' }} />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: TXT_BODY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>{s.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: TXT_SECONDARY, flex: 'none' }}>{s.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}
