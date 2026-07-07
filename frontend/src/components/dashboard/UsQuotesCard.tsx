import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { fmtPrice } from '@/lib/format'
import { StockLogo } from '@/components/StockLogo'
import { HOT_US } from '@/components/stock-analysis/WatchlistCpTable'
import { DotGridEmpty } from './DotGridEmpty'
import { GlassCard } from './GlassCard'
import {
  DIVIDER, DOWN, MONO, NEON, TXT_BODY, TXT_CARD_TITLE, TXT_FAINT, TXT_FAINTEST, TXT_WEAK, UP,
} from './tokens'

/** 榜单候选: 热门美股清单(与个股分析页共用), 取前 10 只兜底、展示 8 只 */
const CANDIDATES = HOT_US.slice(0, 10)

/**
 * 美股行情榜 — 热门美股 TOP8: 价格 + 当日涨跌(本地日K真实计算), 点击直达个股分析。
 * 替代原「活跃换手」榜(本地快照缺换手率数据, 无法凑满 8 行)。
 */
export function UsQuotesCard() {
  const klineBatch = useQuery({
    queryKey: ['us-quotes-board', CANDIDATES.map(c => c.symbol).join(',')],
    queryFn: () => api.klineDailyBatch(CANDIDATES.map(c => c.symbol), 2),
    staleTime: 60_000,
  })
  const data: Record<string, any[]> = klineBatch.data?.data ?? {}

  const rows = CANDIDATES
    .map(c => {
      const closes = (data[c.symbol] ?? []).map((k: any) => Number(k.close)).filter(Number.isFinite)
      const price = closes.length > 0 ? closes[closes.length - 1] : null
      const pct = closes.length > 1 ? closes[closes.length - 1] / closes[closes.length - 2] - 1 : null
      return { ...c, price, pct }
    })
    .filter(r => r.price != null)
    .slice(0, 8)

  return (
    <GlassCard style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', borderBottom: DIVIDER }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: TXT_CARD_TITLE, letterSpacing: 2 }}>美股行情</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 8, color: TXT_WEAK, letterSpacing: 1.5 }}>TOP {rows.length || 8}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 6px 8px', flex: 1 }}>
        {klineBatch.isLoading ? (
          <DotGridEmpty text="LOADING…" minHeight={180} maskStop={25} />
        ) : rows.length === 0 ? (
          <DotGridEmpty text="暂无美股日K · 请先获取数据" minHeight={180} maskStop={25} />
        ) : (
          rows.map((r, i) => {
            const up = (r.pct ?? 0) >= 0
            return (
              <Link
                key={r.symbol}
                to={`/stock-analysis?symbol=${encodeURIComponent(r.symbol)}&name=${encodeURIComponent(r.name)}`}
                className="cp-hover-row"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6.5px 6px', textDecoration: 'none' }}
              >
                <span style={{ width: 14, flex: 'none', fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: i < 3 ? NEON : TXT_FAINTEST }}>
                  {i + 1}
                </span>
                <StockLogo symbol={r.symbol} size={22} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TXT_BODY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: .5, color: TXT_FAINT }}>{r.symbol}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, fontFamily: MONO }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: TXT_BODY }}>${fmtPrice(r.price)}</span>
                  <span style={{ fontSize: 8.5, color: r.pct == null ? TXT_WEAK : up ? UP : DOWN }}>
                    {r.pct == null ? '—' : `${up ? '+' : ''}${(r.pct * 100).toFixed(2)}%`}
                  </span>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </GlassCard>
  )
}
