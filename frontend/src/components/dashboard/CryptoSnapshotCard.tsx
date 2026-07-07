import { Link } from 'react-router-dom'
import type { IndexQuote } from '@/lib/api'
import { isCrypto } from '@/lib/markets'
import { GlassCard } from './GlassCard'
import { BtcGlyph, EthGlyph } from './glyphs'
import {
  COIN_COLOR, COIN_COLOR_DEFAULT, DOWN, INK, MONO, NEON, SUB_BG2,
  TXT_BODY, TXT_SECONDARY, TXT_WEAK, UP, clipTL, coinBase,
} from './tokens'
import { fmtIndexPct, fmtPrice, n } from './utils'

const ROW_BAR: Record<string, { grad: string; glow: string; icon: string }> = {
  BTC: { grad: 'linear-gradient(180deg,#ffb14d,#f7931a)', glow: '0 0 9px rgba(247,147,26,.5)', icon: 'linear-gradient(140deg,#ffb14d,#f7931a)' },
  ETH: { grad: 'linear-gradient(180deg,#8fa5f5,#627eea)', glow: '0 0 9px rgba(98,126,234,.5)', icon: 'linear-gradient(140deg,#8fa5f5,#627eea)' },
}

function RowIcon({ base }: { base: string }) {
  const bar = ROW_BAR[base]
  const bg = bar?.icon ?? COIN_COLOR[base] ?? COIN_COLOR_DEFAULT
  return (
    <span style={{ width: 24, height: 24, flex: 'none', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', fontFamily: MONO }}>
      {base === 'BTC' ? <BtcGlyph size={18} /> : base === 'ETH' ? <EthGlyph size={17} /> : base.slice(0, 2)}
    </span>
  )
}

function SnapshotRow({ item }: { item: IndexQuote }) {
  const base = coinBase(item.symbol)
  const bar = ROW_BAR[base]
  const pct = n(item.change_pct)
  const pctColor = (pct ?? 0) >= 0 ? UP : DOWN
  return (
    <Link
      to={`/stock-analysis?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name || '')}`}
      style={{
        position: 'relative', background: SUB_BG2, border: '1px solid rgba(213,240,33,.14)',
        padding: '10px 11px 10px 17px', display: 'flex', alignItems: 'center', gap: 9,
        textDecoration: 'none',
      }}
    >
      <span
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 6,
          background: bar?.grad ?? 'linear-gradient(180deg,rgba(232,230,216,.3),rgba(232,230,216,.12))',
          ...(bar ? { boxShadow: bar.glow } : {}),
        }}
      />
      <RowIcon base={base} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TXT_BODY }}>{item.name || base}</span>
        <span style={{ fontFamily: MONO, fontSize: 8.5, color: TXT_WEAK, letterSpacing: 1 }}>{base}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontFamily: MONO }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: pctColor }}>{fmtIndexPct(pct)}</span>
        <span style={{ fontSize: 10, color: TXT_SECONDARY }}>${fmtPrice(item.last_price ?? item.close)}</span>
      </div>
    </Link>
  )
}

/** 加密快照 — 黄色切角题栏 + BTC/ETH 左色条行卡, 24/7 LIVE */
export function CryptoSnapshotCard({ indices }: { indices: IndexQuote[] }) {
  const rows = indices.filter(item => isCrypto(item.symbol))
  return (
    <GlassCard variant="strong" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: NEON, padding: '6px 12px', clipPath: clipTL(10) }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, letterSpacing: 2 }}>加密快照</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, color: 'rgba(13,11,7,.7)', letterSpacing: 1 }}>24/7 LIVE</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: 12 }}>
        {rows.length === 0 ? (
          <div style={{ padding: '18px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9.5, color: TXT_WEAK, letterSpacing: 2, border: '1px dashed rgba(213,240,33,.2)' }}>
            {'// 暂无加密行情'}
          </div>
        ) : (
          rows.map(item => <SnapshotRow key={item.symbol} item={item} />)
        )}
      </div>
    </GlassCard>
  )
}
