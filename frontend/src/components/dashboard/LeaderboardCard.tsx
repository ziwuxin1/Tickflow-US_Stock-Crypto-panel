import { Link } from 'react-router-dom'
import type { MarketSnapshotRow } from '@/lib/api'
import { fmtBigNum } from '@/lib/format'
import { StockLogo } from '@/components/StockLogo'
import { DotGridEmpty } from './DotGridEmpty'
import { GlassCard } from './GlassCard'
import {
  DIVIDER, DOWN, MONO, NEON, TXT_BODY, TXT_CARD_TITLE, TXT_FAINT, TXT_FAINTEST, TXT_WEAK, UP, coinBase,
} from './tokens'
import { fmtPrice, fmtStockPct, pctColor } from './utils'

type Mode = 'gain' | 'loss' | 'amount' | 'active'

/** 榜单标题色: 涨幅榜青 / 跌幅榜红 / 其余黄 */
const TITLE_COLOR: Record<Mode, string> = {
  gain: UP, loss: DOWN, amount: TXT_CARD_TITLE, active: TXT_CARD_TITLE,
}

function rowValues(r: MarketSnapshotRow, mode: Mode): { main: string; mainColor: string; sub: string; subColor: string } {
  switch (mode) {
    case 'gain':
      return { main: fmtStockPct(r.change_pct), mainColor: UP, sub: fmtPrice(r.close), subColor: TXT_WEAK }
    case 'loss':
      return { main: fmtStockPct(r.change_pct), mainColor: DOWN, sub: fmtPrice(r.close), subColor: TXT_WEAK }
    case 'amount':
      return { main: fmtBigNum(r.amount), mainColor: NEON, sub: fmtStockPct(r.change_pct), subColor: pctColor(r.change_pct) }
    case 'active':
      // overview 的 turnover_rate 已是百分数; 数据源缺换手率时后端按成交额兜底 → 主值展示成交额
      return {
        main: r.turnover_rate != null ? `${fmtPrice(r.turnover_rate, 1)}%` : fmtBigNum(r.amount),
        mainColor: TXT_BODY,
        sub: fmtStockPct(r.change_pct),
        subColor: pctColor(r.change_pct),
      }
  }
}

/** 榜单卡 — TOP8: 排名(前三黄) + 方徽 + 名称/代码 + 主/副值 */
export function LeaderboardCard({ title, rows, mode }: { title: string; rows: MarketSnapshotRow[]; mode: Mode }) {
  const top = rows.slice(0, 8)
  return (
    <GlassCard style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', borderBottom: DIVIDER }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: TITLE_COLOR[mode], letterSpacing: 2 }}>{title}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 8, color: TXT_WEAK, letterSpacing: 1.5 }}>TOP {top.length || 8}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 6px 8px', flex: 1 }}>
        {top.length === 0 ? (
          <DotGridEmpty text="暂无数据" minHeight={180} maskStop={25} />
        ) : (
          top.map((r, i) => {
            const v = rowValues(r, mode)
            return (
              <Link
                key={`${r.symbol}-${i}`}
                to={`/stock-analysis?symbol=${encodeURIComponent(r.symbol)}&name=${encodeURIComponent(r.name ?? '')}`}
                className="cp-hover-row"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6.5px 6px', textDecoration: 'none' }}
              >
                <span style={{ width: 14, flex: 'none', fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: i < 3 ? NEON : TXT_FAINTEST }}>
                  {i + 1}
                </span>
                <StockLogo symbol={r.symbol} size={22} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: TXT_BODY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name || coinBase(r.symbol)}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: .5, color: TXT_FAINT }}>{r.symbol}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, fontFamily: MONO }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: v.mainColor }}>{v.main}</span>
                  <span style={{ fontSize: 8.5, color: v.subColor }}>{v.sub}</span>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </GlassCard>
  )
}
