import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { GlassCard } from './GlassCard'
import { DOWN, INK, MONO, NEON, TXT_BODY, TXT_SECONDARY, TXT_WEAK, UP, clipTL } from './tokens'
import { portfolioApi } from '@/lib/api'

/** 金额: 千分位 2 位小数, 可选强制符号 */
function money(v: number | null | undefined, signed = false): string {
  if (v == null || !Number.isFinite(v)) return '—'
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sign = v < 0 ? '-' : signed ? '+' : ''
  return `${sign}$${s}`
}

function pnlColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return TXT_SECONDARY
  return v > 0 ? UP : DOWN
}

/**
 * 看板 · 持仓组合概览卡片 —— 总市值 + 今日/累计盈亏, 点击进入持仓组合页。
 * 无持仓时引导录入。数据复用 /api/portfolio/summary(与独立页共享 queryKey)。
 */
export function PortfolioCard() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['portfolio', 'summary'],
    queryFn: portfolioApi.summary,
    refetchInterval: 60_000,
  })
  const t = data?.totals
  const count = data?.positions.length ?? 0
  const totalPnl = t ? (t.unrealized_pnl ?? 0) + (t.realized_pnl ?? 0) : null
  const empty = !isLoading && count === 0

  return (
    <GlassCard variant="stat" corners style={{ minWidth: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
      <div onClick={() => navigate('/portfolio')} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* 黄色切角题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: NEON, padding: '6px 12px', clipPath: clipTL(10) }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, letterSpacing: 2 }}>持仓组合</span>
          <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, color: 'rgba(13,11,7,.7)', letterSpacing: 1.5 }}>PORTFOLIO</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: INK }}>{count} 只</span>
        </div>

        <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
          {empty ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'center', flex: 1 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: TXT_BODY }}>暂无持仓</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: NEON, letterSpacing: 1 }}>{'// 点击记一笔 →'}</span>
            </div>
          ) : (
            <>
              {/* 总市值 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontFamily: MONO, fontSize: 7.5, color: TXT_WEAK, letterSpacing: 2 }}>MARKET.VALUE // 总市值</span>
                <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: TXT_BODY, letterSpacing: .5, lineHeight: 1 }}>
                  {money(t?.market_value)}
                </span>
              </div>
              {/* 今日 / 累计盈亏 */}
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontFamily: MONO, fontSize: 7, color: TXT_WEAK, letterSpacing: 1.5 }}>今日盈亏</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: pnlColor(t?.today_pnl) }}>{money(t?.today_pnl, true)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontFamily: MONO, fontSize: 7, color: TXT_WEAK, letterSpacing: 1.5 }}>累计盈亏</span>
                  <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: pnlColor(totalPnl) }}>{money(totalPnl, true)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </GlassCard>
  )
}
