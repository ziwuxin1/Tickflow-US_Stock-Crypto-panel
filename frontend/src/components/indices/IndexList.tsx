/**
 * 指数页左栏列表 — design_handoff_index_page §2。
 * 搜索框 + 置顶组/其余组(分隔线), 选中项绿色描边高亮。
 */
import { Search } from 'lucide-react'
import type { IndexInstrument, IndexQuote } from '@/lib/api'
import { fmtPrice, fmtSignedPct } from './chartMath'
import { UP, DOWN, MONO, NEON_HI, TXT_SECONDARY, TXT_WEAKER, TXT_FAINT } from './tokens'

interface IndexListProps {
  topRows: IndexInstrument[]
  listRows: IndexInstrument[]
  quoteBySymbol: Map<string, IndexQuote>
  selectedSymbol: string
  keyword: string
  onKeywordChange: (v: string) => void
  onSelect: (symbol: string) => void
  loading?: boolean
}

function IndexItem({
  item, quote, active, onSelect,
}: {
  item: IndexInstrument
  quote?: IndexQuote
  active: boolean
  onSelect: (symbol: string) => void
}) {
  const pct = quote?.change_pct ?? (quote as any)?.pct
  const price = quote?.last_price ?? (quote as any)?.price ?? quote?.close
  const pctNum = Number(pct ?? 0)
  const pctColor = pct == null ? TXT_SECONDARY : pctNum > 0 ? UP : pctNum < 0 ? DOWN : TXT_SECONDARY
  return (
    <button
      onClick={() => onSelect(item.symbol)}
      className="idx-list-item"
      data-active={active || undefined}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        padding: '10px 12px', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: active ? NEON_HI : '#e8ebf7',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.name || item.symbol}
        </span>
        <span style={{ fontSize: 10, letterSpacing: 1, color: TXT_WEAKER, fontFamily: MONO }}>{item.symbol}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, fontFamily: MONO, flex: 'none' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: pctColor }}>{fmtSignedPct(pct)}</span>
        <span style={{ fontSize: 11, color: TXT_SECONDARY }}>{fmtPrice(price)}</span>
      </div>
    </button>
  )
}

export function IndexList({
  topRows, listRows, quoteBySymbol, selectedSymbol, keyword, onKeywordChange, onSelect, loading,
}: IndexListProps) {
  return (
    <section style={{
      width: 270, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10,
      padding: '14px 12px 14px 0', borderRight: '1px solid rgba(255,255,255,.06)',
    }}>
      {/* 搜索框 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10,
        background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.08)',
      }}>
        <Search size={13} color={TXT_FAINT} style={{ flex: 'none' }} />
        <input
          value={keyword}
          onChange={e => onKeywordChange(e.target.value)}
          placeholder="搜索指数代码/名称"
          style={{
            flex: 1, minWidth: 0, fontSize: 12, color: '#e8ebf7', background: 'transparent',
            border: 'none', outline: 'none',
          }}
        />
      </div>
      {/* 列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflowY: 'auto' }}>
        {topRows.map(item => (
          <IndexItem
            key={item.symbol}
            item={item}
            quote={quoteBySymbol.get(item.symbol)}
            active={item.symbol === selectedSymbol}
            onSelect={onSelect}
          />
        ))}
        {(topRows.length > 0 && (listRows.length > 0 || loading)) && (
          <div style={{ height: 1, background: 'rgba(255,255,255,.07)', margin: '8px 4px', flex: 'none' }} />
        )}
        {loading && <div style={{ padding: '14px 0', textAlign: 'center', fontSize: 12, color: TXT_FAINT }}>加载中…</div>}
        {!loading && listRows.length === 0 && keyword.trim() && (
          <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,.04)', fontSize: 12, color: TXT_FAINT }}>
            无匹配指数。
          </div>
        )}
        {listRows.map(item => (
          <IndexItem
            key={item.symbol}
            item={item}
            quote={quoteBySymbol.get(item.symbol)}
            active={item.symbol === selectedSymbol}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  )
}
