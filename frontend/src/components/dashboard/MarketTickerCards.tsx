import { Link } from 'react-router-dom'
import type { IndexQuote } from '@/lib/api'
import { isCrypto } from '@/lib/markets'
import { StockLogo } from '@/components/StockLogo'
import { GlassCard } from './GlassCard'
import { BtcGlyph, EthGlyph } from './glyphs'
import {
  COIN_COLOR, COIN_COLOR_DEFAULT, DOWN, MONO,
  TXT_TITLE, TXT_WEAK, UP, clipBR, coinBase,
} from './tokens'
import { fmtIndexPct, fmtPrice, n } from './utils'

/** 34px 切角方徽 — ETF 双字母渐变 / BTC·ETH 品牌渐变 + 官方图形 */
function TickerIcon({ item }: { item: IndexQuote }) {
  const base = coinBase(item.symbol)
  const boxStyle = {
    width: 34, height: 34, flex: 'none' as const,
    clipPath: clipBR(8),
    display: 'flex', alignItems: 'center' as const, justifyContent: 'center' as const,
    fontFamily: MONO, fontWeight: 700, fontSize: 11, color: '#fff',
  }
  if (isCrypto(item.symbol)) {
    if (base === 'BTC') {
      return <div style={{ ...boxStyle, background: 'linear-gradient(140deg,#ffb14d,#f7931a)' }}><BtcGlyph size={24} /></div>
    }
    if (base === 'ETH') {
      return <div style={{ ...boxStyle, background: 'linear-gradient(140deg,#8fa5f5,#627eea)' }}><EthGlyph size={23} /></div>
    }
    return <div style={{ ...boxStyle, background: COIN_COLOR[base] ?? COIN_COLOR_DEFAULT }}>{base.slice(0, 2)}</div>
  }
  // 美股/ETF: 真实 logo(CDN, 失败自动降级字母徽章), 外层保留切角外形
  return (
    <div style={{ width: 34, height: 34, flex: 'none', clipPath: clipBR(8), overflow: 'hidden', display: 'flex' }}>
      <StockLogo symbol={item.symbol} size={34} />
    </div>
  )
}

function TickerCard({ item }: { item: IndexQuote }) {
  const crypto = isCrypto(item.symbol)
  const pct = n(item.change_pct)
  const isUp = (pct ?? 0) >= 0
  const color = isUp ? UP : DOWN
  const price = item.last_price ?? item.close
  return (
    <Link to={`/stock-analysis?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name || '')}`} style={{ textDecoration: 'none', minWidth: 0 }}>
      <GlassCard
        as="div"
        variant={crypto ? 'highlight' : 'ticker'}
        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', cursor: 'pointer' }}
      >
        <TickerIcon item={item} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: TXT_TITLE, letterSpacing: .5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name || item.symbol}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: TXT_WEAK }}>
            {crypto ? coinBase(item.symbol) : item.symbol}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, fontFamily: MONO }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color }}>{fmtIndexPct(pct)}</span>
          <span style={{ fontSize: 11, color, opacity: .75 }}>
            {isUp ? '↗' : '↘'} {fmtPrice(price)}
          </span>
        </div>
      </GlassCard>
    </Link>
  )
}

/** 行情卡 ×6 — 4 列网格, ETF 在前、BTC/ETH 高亮卡(1.5px 亮黄描边)换行占前两格 */
export function MarketTickerCards({ indices }: { indices: IndexQuote[] }) {
  const sorted = [...indices.filter(i => !isCrypto(i.symbol)), ...indices.filter(i => isCrypto(i.symbol))]
  if (sorted.length === 0) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, position: 'relative' }}>
      {sorted.map(item => <TickerCard key={item.symbol} item={item} />)}
    </div>
  )
}
