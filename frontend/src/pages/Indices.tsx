/**
 * 指数页 — design_handoff_index_page(AlphaFlow 量化终端)。
 * 三栏开放式布局(无卡片外壳): 左列表 270px | 中日K(flex 1.18) | 右分时(flex .82)。
 */
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, Loader2, RefreshCw } from 'lucide-react'
import { api, type IndexInstrument, type IndexQuote, type MinuteKlineRow } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import { useCapabilities } from '@/lib/useSharedQueries'
import { isCrypto } from '@/lib/markets'
import { CoinIcon } from '@/components/dashboard/CoinIcon'
import { normalizeBars, fmtPrice, fmtSignedPct } from '@/components/indices/chartMath'
import { GlobalResearchButton } from '@/components/indices/GlobalResearchButton'
import { IndexList } from '@/components/indices/IndexList'
import { KLineChart } from '@/components/indices/KLineChart'
import { IntradayPanel } from '@/components/indices/IntradayPanel'
import {
  MONO, NEON, TXT_TITLE, TXT_SECONDARY, TXT_WEAK, TXT_WEAKER, TXT_FAINT,
  UP, DOWN, COIN_COLOR, COIN_COLOR_DEFAULT, coinBase,
} from '@/components/indices/tokens'

function defaultRange() {
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const s = new Date(now)
  s.setMonth(s.getMonth() - 6)
  return { start: s.toISOString().slice(0, 10), end }
}

const PINNED_INDEXES = [
  { symbol: 'SPY.US', name: '标普500ETF' },
  { symbol: 'QQQ.US', name: '纳指100ETF' },
  { symbol: 'BTCUSDT', name: '比特币' },
  { symbol: 'ETHUSDT', name: '以太坊' },
]

function pinnedRank(item: IndexInstrument) {
  return PINNED_INDEXES.findIndex(p => item.symbol === p.symbol || item.name === p.name)
}

/** 品牌徽标: ETF 双字母渐变底 / 加密货币符号色底 / 默认取 symbol 前两位 */
const BADGE_STYLES: Record<string, { tag: string; grad: string; shadow: string; fontSize?: number }> = {
  'SPY.US': { tag: 'SP', grad: 'linear-gradient(140deg,#6a86e8,#4258b8)', shadow: 'rgba(84,112,214,.35)' },
  'QQQ.US': { tag: 'NQ', grad: 'linear-gradient(140deg,#9a7ce8,#6a4fc8)', shadow: 'rgba(122,92,214,.35)' },
  'DIA.US': { tag: 'DJ', grad: 'linear-gradient(140deg,#5cc39a,#2f7e60)', shadow: 'rgba(63,158,122,.35)' },
  'IWM.US': { tag: 'RU', grad: 'linear-gradient(140deg,#e09055,#a85a30)', shadow: 'rgba(201,113,63,.35)' },
}
const COIN_GLYPH: Record<string, string> = { BTC: '₿', ETH: 'Ξ' }

function symbolBadge(symbol: string) {
  const known = BADGE_STYLES[symbol]
  if (known) return known
  const base = coinBase(symbol)
  if (base !== symbol || /USDT$/i.test(symbol)) {
    const bg = COIN_COLOR[base] ?? COIN_COLOR_DEFAULT
    const glyph = COIN_GLYPH[base]
    // 单字符币种符号(₿/Ξ)比双字母大一档才撑得起 46px 徽标
    return { tag: glyph ?? base.slice(0, 2), grad: bg, shadow: `${bg}59`, fontSize: glyph ? 26 : 17 }
  }
  return { tag: symbol.replace(/\..*$/, '').slice(0, 2).toUpperCase(), grad: 'linear-gradient(140deg,#5a6284,#3a3f5e)', shadow: 'rgba(58,63,94,.4)' }
}

/** 日期胶囊(原生 date input, 样式对齐设计稿) */
function DateCapsule({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: TXT_SECONDARY,
      background: 'rgba(0,0,0,.3)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
      padding: '6px 11px', fontFamily: MONO, cursor: 'pointer',
    }}>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: 'transparent', border: 'none', outline: 'none', color: 'inherit',
          fontFamily: 'inherit', fontSize: 'inherit', colorScheme: 'dark', cursor: 'pointer',
        }}
      />
      <Calendar size={12} color={TXT_FAINT} />
    </label>
  )
}

export function Indices() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [keyword, setKeyword] = useState('')
  const symbolParam = searchParams.get('symbol') ?? ''
  const [selected, setSelected] = useState<string>(symbolParam)
  const [range, setRange] = useState(defaultRange)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 分时数据能力: 按标的分钟K(kline.minute.by_symbol)或分时(intraday)任一即可。
  const caps = useCapabilities()
  const capMap = caps.data?.capabilities
  const hasMinuteCap = !!(capMap?.['kline.minute.by_symbol'] || capMap?.['intraday'])

  const list = useQuery({ queryKey: QK.indexList, queryFn: api.indexList })
  const search = useQuery({
    queryKey: ['index-search', keyword],
    queryFn: () => api.indexSearch(keyword, 50),
    enabled: keyword.trim().length > 0,
  })

  const rows: IndexInstrument[] = keyword.trim()
    ? (search.data?.results ?? [])
    : (list.data?.results ?? [])
  const topRows = useMemo(() => {
    const all = list.data?.results ?? []
    return PINNED_INDEXES.map(p => (
      all.find(item => item.symbol === p.symbol || item.name === p.name)
        ?? { symbol: p.symbol, name: p.name, asset_type: 'index' as const }
    ))
  }, [list.data?.results])
  const listRows = useMemo(() => rows.filter(item => pinnedRank(item) < 0), [rows])

  const selectedSymbol = selected || topRows[0]?.symbol || listRows[0]?.symbol || ''

  useEffect(() => {
    if (symbolParam && symbolParam !== selected) setSelected(symbolParam)
  }, [selected, symbolParam])

  const selectIndex = (symbol: string) => {
    setSelected(symbol)
    setSearchParams({ symbol })
  }

  const quotes = useQuery({
    queryKey: QK.indexQuotes,
    queryFn: () => api.indexQuotes(),
    placeholderData: prev => prev,
  })

  const daily = useQuery({
    queryKey: QK.indexDaily(selectedSymbol, range.start, range.end),
    queryFn: () => api.indexDaily(selectedSymbol, 180, range),
    enabled: !!selectedSymbol,
    placeholderData: prev => prev,
  })

  // selectedDate 为空 = 实时模式(后端返回当天最新分时); 点击K线选中某日则看该日历史分时
  const minute = useQuery({
    queryKey: QK.indexMinute(selectedSymbol, selectedDate ?? 'live'),
    queryFn: () => api.indexMinute(selectedSymbol, selectedDate ?? undefined),
    enabled: !!selectedSymbol && hasMinuteCap,
    placeholderData: prev => prev,
  })

  const syncInstruments = useMutation({
    mutationFn: api.syncIndexInstruments,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.indexList })
      qc.invalidateQueries({ queryKey: QK.indexQuotes })
    },
  })

  const syncDaily = useMutation({
    mutationFn: () => api.syncIndexDaily(365),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.indexList })
      qc.invalidateQueries({ queryKey: QK.indexQuotes })
      qc.invalidateQueries({ queryKey: ['index-daily'] })
    },
  })

  const quoteBySymbol = useMemo(() => {
    const m = new Map<string, IndexQuote>()
    for (const q of quotes.data?.rows ?? []) m.set(q.symbol, q)
    return m
  }, [quotes.data?.rows])
  const selectedQuote = selectedSymbol ? quoteBySymbol.get(selectedSymbol) : undefined
  const selectedQuoteValue = selectedQuote?.last_price ?? (selectedQuote as any)?.price ?? selectedQuote?.close
  const selectedQuotePct = selectedQuote?.change_pct ?? (selectedQuote as any)?.pct

  const bars = useMemo(() => normalizeBars(daily.data?.rows ?? []), [daily.data?.rows])
  const selectedInfo = [...topRows, ...listRows].find(r => r.symbol === selectedSymbol) || daily.data?.index_info
  const minuteRows: MinuteKlineRow[] = minute.data?.rows ?? []
  const isCryptoSel = /(USDT|USDC|BUSD)$/i.test(selectedSymbol)
  // 涨跌基线:
  //  历史日期 → 该日前一根日K收盘(加密即前一 UTC 日界价);
  //  实时模式 → 美股用最后一根日K收盘(昨收), 加密 7×24 无收盘 → 传 undefined,
  //             面板回退用当日首根分钟开盘(= UTC 0 点日界价)。
  const minuteDate = minute.data?.date ?? selectedDate
  const minuteIdx = minuteDate ? bars.findIndex(r => r.date === minuteDate) : -1
  const prevClose = minuteIdx > 0
    ? bars[minuteIdx - 1].close
    : minuteIdx === -1 && !isCryptoSel && bars.length > 0
      ? bars[bars.length - 1].close
      : undefined

  useEffect(() => {
    setSelectedDate(null)
  }, [selectedSymbol])

  // 实时模式下头部价格/涨跌与分时面板对齐:
  // 行情快照(实时开关关闭时由日K缓存兜底)可能滞后, 分时 live 数据才是最新价。
  const lastMinuteClose = !selectedDate && minuteRows.length
    ? Number(minuteRows[minuteRows.length - 1].close)
    : null
  const liveBase = prevClose ?? (minuteRows.length ? Number(minuteRows[0].open) : null)
  const headerPrice = lastMinuteClose ?? selectedQuoteValue
  const headerPct = lastMinuteClose != null && liveBase
    ? (lastMinuteClose / liveBase - 1) * 100
    : selectedQuotePct

  const badge = symbolBadge(selectedSymbol)
  const pctNum = Number(headerPct ?? 0)

  return (
    <div style={{
      minWidth: 1280, minHeight: '100%', position: 'relative', overflow: 'hidden',
      padding: '22px 28px 40px', display: 'flex', flexDirection: 'column', gap: 18,
    }}>
      {/* 右上辉光 */}
      <div style={{
        position: 'absolute', top: -260, right: -120, width: 820, height: 820, borderRadius: '50%',
        background: 'radial-gradient(circle,rgba(126,92,255,.22),transparent 62%)', filter: 'blur(10px)', pointerEvents: 'none',
      }} />

      {/* 顶栏 */}
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TXT_TITLE, letterSpacing: 0.5 }}>指数</h1>
          <div style={{ fontSize: 12, color: TXT_WEAK }}>指数使用独立 kline_index_* parquet，不进入股票选股和策略链路。</div>
        </div>
        <div style={{ flex: 1 }} />
        <GlobalResearchButton
          symbol={selectedSymbol}
          name={selectedInfo?.name || selectedSymbol}
        />
        <button
          onClick={() => syncInstruments.mutate()}
          disabled={syncInstruments.isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: TXT_SECONDARY,
            background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 9,
            padding: '8px 15px', cursor: 'pointer', opacity: syncInstruments.isPending ? 0.6 : 1,
          }}
        >
          {syncInstruments.isPending
            ? <Loader2 size={13} className="animate-spin" />
            : <RefreshCw size={13} />}
          同步指数列表
        </button>
        <button
          onClick={() => syncDaily.mutate()}
          disabled={syncDaily.isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: '#10160a',
            background: 'linear-gradient(135deg,#eaff8a,#cdf321)', border: '1px solid rgba(205,243,33,.5)',
            borderRadius: 9, padding: '8px 15px', cursor: 'pointer',
            boxShadow: '0 3px 16px rgba(205,243,33,.25)', opacity: syncDaily.isPending ? 0.7 : 1,
          }}
        >
          {syncDaily.isPending
            ? <Loader2 size={13} className="animate-spin" />
            : <RefreshCw size={13} strokeWidth={2.2} />}
          同步指数日K
        </button>
      </header>

      {/* 三栏 */}
      <div style={{ display: 'flex', gap: 18, alignItems: 'stretch', position: 'relative', minHeight: 860 }}>
        {/* 左栏列表 */}
        <IndexList
          topRows={topRows}
          listRows={listRows}
          quoteBySymbol={quoteBySymbol}
          selectedSymbol={selectedSymbol}
          keyword={keyword}
          onKeywordChange={setKeyword}
          onSelect={selectIndex}
          loading={list.isLoading || search.isLoading}
        />

        {/* 中栏 K 线区 */}
        <section style={{ flex: 1.18, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '16px 6px' }}>
          {/* 头部: 品牌徽标 + 名称/代码/现价/涨跌 + 日期胶囊 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {isCrypto(selectedSymbol) ? (
              <span style={{ flex: 'none', borderRadius: '50%', boxShadow: `0 4px 16px ${badge.shadow}` }}>
                <CoinIcon symbol={selectedSymbol} size={46} />
              </span>
            ) : (
              <div style={{
                width: 46, height: 46, flex: 'none', borderRadius: 13, background: badge.grad,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: badge.fontSize ?? 17, fontWeight: 800, color: '#fff', fontFamily: MONO,
                boxShadow: `0 4px 16px ${badge.shadow}`,
              }}>
                {badge.tag}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, whiteSpace: 'nowrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: TXT_TITLE, whiteSpace: 'nowrap' }}>
                  {selectedInfo?.name || selectedSymbol || '未选择指数'}
                </span>
                <span style={{ fontSize: 11.5, letterSpacing: 1, color: TXT_WEAKER, fontFamily: MONO }}>{selectedSymbol}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: TXT_TITLE, fontFamily: MONO }}>{fmtPrice(headerPrice)}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: pctNum >= 0 ? UP : DOWN, fontFamily: MONO }}>
                  {fmtSignedPct(headerPct)}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: TXT_WEAK }}>
                实时缓存 {quotes.data?.count ?? 0} 只指数 · 日K来源{' '}
                <span style={{ color: TXT_SECONDARY, fontFamily: MONO }}>{daily.data?.source ?? '--'}</span>
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DateCapsule value={range.start} onChange={v => setRange(r => ({ ...r, start: v }))} />
              <span style={{ fontSize: 11.5, color: TXT_WEAKER }}>至</span>
              <DateCapsule value={range.end} onChange={v => setRange(r => ({ ...r, end: v }))} />
            </div>
          </div>

          {/* K线区 */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginTop: 12, minHeight: 0 }}>
            {daily.isLoading && (
              <div style={{ padding: '80px 0', textAlign: 'center', fontSize: 13, color: TXT_FAINT }}>日K加载中…</div>
            )}
            {daily.isError && (
              <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: DOWN }}>指数日K加载失败</div>
            )}
            {!daily.isLoading && !daily.isError && bars.length === 0 && (
              <div style={{
                padding: 24, borderRadius: 12, background: 'rgba(255,255,255,.04)',
                textAlign: 'center', fontSize: 13, color: TXT_FAINT,
              }}>
                暂无日K数据。可以先<span style={{ color: NEON }}>同步指数日K</span>，或选择其他指数。
              </div>
            )}
            {bars.length > 0 && (
              <KLineChart key={selectedSymbol} bars={bars} onDateClick={setSelectedDate} />
            )}
          </div>
        </section>

        {/* 右栏分时 */}
        <section style={{ flex: 0.82, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '16px 6px' }}>
          <IntradayPanel
            key={selectedSymbol}
            minuteRows={minuteRows}
            dailyBars={bars}
            prevClose={prevClose}
            quoteVolume={!selectedDate ? selectedQuote?.volume : null}
            quoteAmount={!selectedDate ? selectedQuote?.amount : null}
            minuteLocked={!hasMinuteCap}
            minuteLoading={minute.isLoading}
            dateLabel={minute.data?.date ?? null}
            crypto={isCryptoSel}
            live={!selectedDate}
            onBackToLive={() => setSelectedDate(null)}
          />
        </section>
      </div>
    </div>
  )
}
