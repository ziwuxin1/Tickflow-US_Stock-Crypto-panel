import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import { fmtBigNum, fmtPrice } from '@/lib/format'
import { StockLogo } from '@/components/StockLogo'
import { CornerMarks } from '@/components/dashboard/GlassCard'
import {
  DOWN, INK, MONO, NEON, PANEL_BG, TXT_BODY, TXT_FAINTEST, TXT_SECONDARY, TXT_WEAK, UP, clipTL,
} from '@/components/dashboard/tokens'

type Tab = 'us' | 'crypto'

interface CpRow {
  symbol: string
  name: string
  price: number | null
  d1: number | null   // 当日涨跌(比率)
  d5: number | null   // 5 日动量(比率)
  m1: number | null   // 20 日动量(比率)
  amount: number | null
  mcap: number | null
  /** 是否在自选中(星标实心) */
  fav: boolean
}

/** 热门标的(设计稿同款清单): 自选置顶后补充展示, 行情走本地日K真实计算; 看板「美股行情」榜复用 */
export const HOT_US: { symbol: string; name: string }[] = [
  { symbol: 'NVDA.US', name: '英伟达' },
  { symbol: 'MSFT.US', name: '微软' },
  { symbol: 'TSLA.US', name: '特斯拉' },
  { symbol: 'GOOGL.US', name: '谷歌' },
  { symbol: 'AMZN.US', name: '亚马逊' },
  { symbol: 'META.US', name: 'Meta' },
  { symbol: 'AVGO.US', name: '博通' },
  { symbol: 'ORCL.US', name: '甲骨文' },
  { symbol: 'AMD.US', name: 'AMD' },
  { symbol: 'INTC.US', name: '英特尔' },
  { symbol: 'QQQ.US', name: '纳指100 ETF' },
  { symbol: 'VOO.US', name: '标普500 ETF' },
  { symbol: 'GLW.US', name: '康宁' },
  { symbol: 'BOTZ.US', name: '机器人 AI ETF' },
  { symbol: 'ROBO.US', name: '全球机器人 ETF' },
  { symbol: 'FSPTX.US', name: '富达精选科技' },
  { symbol: 'SPCX.US', name: 'SpaceX' },
]
const HOT_CRYPTO: { symbol: string; name: string }[] = [
  { symbol: 'BTCUSDT', name: '比特币' },
  { symbol: 'ETHUSDT', name: '以太坊' },
  { symbol: 'SOLUSDT', name: 'Solana' },
  { symbol: 'BNBUSDT', name: 'BNB' },
  { symbol: 'XRPUSDT', name: 'XRP' },
  { symbol: 'DOGEUSDT', name: '狗狗币' },
]

/** 需要的日K根数: 迷你线 8 根之外, 1 月动量要 21 根回看 */
const KLINE_DAYS = 23

/** 涨跌单元格: ▲/▼ + 绝对值百分比, 青涨红跌 */
function PctCell({ v, width }: { v: number | null; width: number }) {
  const has = v != null && Number.isFinite(v)
  const up = (v ?? 0) >= 0
  return (
    <span style={{ width, flex: 'none', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 12, fontWeight: 600, color: has ? (up ? UP : DOWN) : TXT_FAINTEST }}>
      {has ? (
        <>
          <span style={{ fontSize: 8 }}>{up ? '▲' : '▼'}</span>
          {Math.abs(v! * 100).toFixed(Math.abs(v! * 100) >= 10 ? 1 : 2)}%
        </>
      ) : '—'}
    </span>
  )
}

/** 近 7 日迷你走势线(150×34), 颜色按 1 月动量青/红 */
function Spark({ closes, upTrend }: { closes: number[]; upTrend: boolean }) {
  if (closes.length < 2) {
    return <span style={{ width: 150, flex: 'none', textAlign: 'right', fontFamily: MONO, fontSize: 8, color: TXT_FAINTEST }}>—</span>
  }
  const mn = Math.min(...closes)
  const mx = Math.max(...closes)
  const sp = mx - mn || 1
  const pts = closes
    .map((v, i) => `${(i / (closes.length - 1) * 148 + 1).toFixed(1)},${(30 - (v - mn) / sp * 26).toFixed(1)}`)
    .join(' ')
  return (
    <svg width="150" height="34" viewBox="0 0 150 34" style={{ flex: 'none', display: 'block' }}>
      <polyline points={pts} fill="none" stroke={upTrend ? UP : DOWN} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" opacity=".9" />
    </svg>
  )
}

/** 双层表头列标签: 中文 + 微缩英文代号 */
function HeadCell({ cn: cnLabel, en, width, align = 'right' }: { cn: string; en: string; width?: number; align?: 'left' | 'right' }) {
  return (
    <span
      style={{
        ...(width ? { width, flex: 'none' } : { flex: 1, minWidth: 200 }),
        display: 'flex', flexDirection: 'column', gap: 2,
        alignItems: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(213,240,33,.85)', letterSpacing: 3, lineHeight: 1 }}>{cnLabel}</span>
      <span style={{ fontFamily: MONO, fontSize: 6.5, color: TXT_WEAK, letterSpacing: 2, lineHeight: 1 }}>{en}</span>
    </span>
  )
}

/** 从日K序列计算行情指标(热门标的用); 本地无数据时各列显示 — */
function rowFromKline(symbol: string, name: string, bars: any[]): CpRow {
  const closes = bars.map(b => Number(b.close)).filter(Number.isFinite)
  const n = closes.length
  const last = n > 0 ? closes[n - 1] : null
  const chg = (back: number) => (n > back && last != null ? last / closes[n - 1 - back] - 1 : null)
  const lastBar = bars[bars.length - 1]
  const amount = lastBar
    ? (Number.isFinite(Number(lastBar.amount)) && Number(lastBar.amount) > 0
      ? Number(lastBar.amount)
      : (Number.isFinite(Number(lastBar.volume)) && last != null ? Number(lastBar.volume) * last : null))
    : null
  return {
    symbol, name,
    price: last,
    d1: chg(1),
    d5: chg(5),
    m1: chg(Math.min(21, Math.max(1, n - 1))),
    amount, mcap: null, fav: false,
  }
}

/**
 * 自选股行情表(design_handoff_cyberpunk 个股分析页):
 * 黄色切角题栏(矩阵格图标 + 美股/加密切换 + 右侧微文) + 双层表头
 * + 行: 星标/排名/徽标/名称/价格/当日/5日/1月/成交额/市值/近7日迷你线。
 * 展示 = 自选置顶(实心星标, enriched 实时指标) + 热门标的补充(空心星标, 本地日K计算, 自动去重)。
 * 点击行直接进入分析。
 */
export function WatchlistCpTable({ onSelect }: { onSelect: (symbol: string, name: string) => void }) {
  const [tab, setTab] = useState<Tab>('us')

  const enriched = useQuery({
    queryKey: QK.watchlistEnriched(''),
    queryFn: () => api.watchlistEnriched(),
    staleTime: 30_000,
  })
  const listQ = useQuery({
    queryKey: QK.watchlist,
    queryFn: () => api.watchlistList(),
    staleTime: 30_000,
  })

  const watchRows: CpRow[] = useMemo(() => {
    const enrichedRows: any[] = enriched.data?.rows ?? []
    const nameBySymbol = new Map((listQ.data?.symbols ?? []).map(w => [w.symbol, w.name ?? '']))
    return enrichedRows.map((r: any) => ({
      symbol: String(r.symbol ?? ''),
      name: String(r.name ?? nameBySymbol.get(r.symbol) ?? r.symbol ?? ''),
      price: r.rt_price ?? r.close ?? null,
      d1: r.rt_pct ?? r.change_pct ?? null,
      d5: r.momentum_5d ?? null,
      m1: r.momentum_20d ?? null,
      amount: r.rt_amount ?? r.amount ?? null,
      mcap: r.float_shares && (r.rt_price ?? r.close) ? r.float_shares * (r.rt_price ?? r.close) : null,
      fav: true,
    }))
  }, [enriched.data, listQ.data])

  const tabWatch = watchRows.filter(r => (tab === 'us' ? r.symbol.includes('.') : !r.symbol.includes('.')))

  // 热门补充: 去掉已在自选中的
  const watchSet = new Set(tabWatch.map(r => r.symbol))
  const hotExtras = (tab === 'us' ? HOT_US : HOT_CRYPTO).filter(h => !watchSet.has(h.symbol))

  // 批量日K: 迷你走势线(全部行) + 热门行情计算
  const allSymbols = [...tabWatch.map(r => r.symbol), ...hotExtras.map(h => h.symbol)]
  const symbolsKey = allSymbols.join(',')
  const klineBatch = useQuery({
    queryKey: QK.watchlistKlineBatch(`cp|${symbolsKey}`),
    queryFn: () => api.klineDailyBatch(allSymbols, KLINE_DAYS),
    enabled: allSymbols.length > 0,
    staleTime: 5 * 60_000,
  })
  const klineData: Record<string, any[]> = klineBatch.data?.data ?? {}

  // 最终展示: 自选在前, 热门在后(有数据的排前面, 本地无日K的沉底显示 —)
  const hotRows = hotExtras.map(h => rowFromKline(h.symbol, h.name, klineData[h.symbol] ?? []))
  const shown: CpRow[] = [
    ...tabWatch,
    ...hotRows.filter(r => r.price != null),
    ...hotRows.filter(r => r.price == null),
  ]

  const loading = enriched.isLoading || (shown.every(r => r.price == null) && klineBatch.isLoading)

  return (
    <section style={{ position: 'relative', border: '1px solid rgba(213,240,33,.35)', background: PANEL_BG }}>
      <CornerMarks size={18} />

      {/* 黄色题栏(clip 裁光晕 → 外壳承载 drop-shadow) */}
      <div style={{ filter: 'drop-shadow(0 0 9px rgba(213,240,33,.25))' }}>
        <div
          className="cpfx"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, background: NEON,
            padding: '9px 16px 9px 14px', clipPath: clipTL(13),
            animation: 'cpBlockG 9s steps(1) infinite 2.4s',
          }}
        >
          {/* 矩阵格图标 */}
          <svg width="22" height="22" viewBox="0 0 24 24" style={{ flex: 'none' }}>
            <defs>
              <pattern id="cpHatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="3" height="3" fill="#0d0b07" />
                <line x1="0" y1="0" x2="0" y2="3" stroke="#d5f021" strokeWidth="1.1" />
              </pattern>
            </defs>
            <rect x="1" y="1" width="9" height="9" fill="url(#cpHatch)" />
            <rect x="13" y="1" width="9" height="9" fill="#0d0b07" />
            <rect x="1" y="13" width="9" height="9" fill="#0d0b07" />
            <rect x="13" y="13" width="9" height="9" fill="url(#cpHatch)" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, color: INK, letterSpacing: 2.5 }}>自选股 · 点击直接分析</span>
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: NEON, background: INK, padding: '1px 7px' }}>{shown.length}</span>
          {/* 美股/加密切换 */}
          <div style={{ display: 'flex', marginLeft: 12, border: `1.5px solid ${INK}` }}>
            {(['us', 'crypto'] as Tab[]).map(t => (
              <span
                key={t}
                onClick={() => setTab(t)}
                style={{
                  fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5,
                  padding: '2.5px 12px', cursor: 'pointer',
                  background: tab === t ? INK : 'transparent',
                  color: tab === t ? NEON : INK,
                }}
              >
                {t === 'us' ? '美股' : '加密'}
              </span>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'right', fontFamily: MONO, fontSize: 6.5, fontWeight: 700, color: 'rgba(13,11,7,.75)', letterSpacing: 1, lineHeight: 1.5 }}>
            <span>MOD.NR: WLT-17.US // QUAD-VECTOR: ON</span>
            <span>SORT: MCAP.DESC // MODEL LINE 12.12AA</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '6px 14px 12px' }}>
        {/* 双层表头 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 10px', borderBottom: '1px solid rgba(213,240,33,.25)' }}>
          <span style={{ width: 20, flex: 'none' }} />
          <span style={{ width: 20, flex: 'none', fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: 'rgba(213,240,33,.8)' }}>#</span>
          <HeadCell cn="名称" en="ASSET // NAME" align="left" />
          <HeadCell cn="价格" en="PRICE" width={100} />
          <HeadCell cn="当日" en="1D.CHG" width={80} />
          <HeadCell cn="5日" en="5D.CHG" width={80} />
          <HeadCell cn="1月" en="1M.CHG" width={80} />
          <HeadCell cn="成交额" en="TURNOVER" width={100} />
          <HeadCell cn="市值" en="MKT.CAP" width={110} />
          <HeadCell cn="近7日" en="LAST.7D" width={150} />
        </div>

        {/* 分组标签行 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 6px', borderBottom: '1px solid rgba(213,240,33,.09)', fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: NEON, letterSpacing: 2, background: 'rgba(213,240,33,.04)' }}>
          <span style={{ width: 6, height: 6, background: NEON }} />
          {tab === 'us' ? '美股 // US EQUITIES' : '加密货币 // CRYPTO · 24/7'}
          {hotExtras.length > 0 && (
            <span style={{ marginLeft: 'auto', color: TXT_WEAK, fontWeight: 500 }}>
              {'// ★ 自选置顶 · ☆ 热门标的'}
            </span>
          )}
        </div>

        {/* 行 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: '26px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9.5, color: TXT_WEAK, letterSpacing: 2 }}>
              {'// LOADING WATCHLIST…'}
            </div>
          ) : shown.length === 0 ? (
            <div style={{ padding: '26px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9.5, color: TXT_WEAK, letterSpacing: 2 }}>
              {'// 本地暂无日K数据 · 请先在数据页获取行情'}
            </div>
          ) : (
            shown.map((s, i) => {
              const closes = (klineData[s.symbol] ?? []).slice(-8).map((k: any) => Number(k.close)).filter(Number.isFinite)
              return (
                <div
                  key={s.symbol}
                  className="cp-row"
                  onClick={() => onSelect(s.symbol, s.name)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 10px', borderBottom: '1px solid rgba(213,240,33,.09)', cursor: 'pointer' }}
                >
                  {/* 星标(自选=实心黄 / 热门=描边灰) */}
                  <svg
                    width="14" height="14" viewBox="0 0 24 24"
                    fill={s.fav ? NEON : 'none'}
                    stroke={s.fav ? NEON : TXT_FAINTEST}
                    strokeWidth="1.6" strokeLinejoin="round"
                    style={{ flex: 'none', width: 20 }}
                  >
                    <path d="M12 3.5l2.5 5.4 5.9.7-4.4 4 1.2 5.8-5.2-2.9-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z" />
                  </svg>
                  <span style={{ width: 20, flex: 'none', fontFamily: MONO, fontSize: 10.5, color: TXT_WEAK }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <StockLogo symbol={s.symbol} size={26} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: TXT_BODY, letterSpacing: .5, whiteSpace: 'nowrap' }}>{s.name || s.symbol}</span>
                    <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, color: TXT_WEAK }}>{s.symbol}</span>
                  </div>
                  <span style={{ width: 100, flex: 'none', textAlign: 'right', fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: TXT_BODY }}>
                    {s.price != null ? `$${fmtPrice(s.price)}` : '—'}
                  </span>
                  <PctCell v={s.d1} width={80} />
                  <PctCell v={s.d5} width={80} />
                  <PctCell v={s.m1} width={80} />
                  <span style={{ width: 100, flex: 'none', textAlign: 'right', fontFamily: MONO, fontSize: 11.5, color: TXT_SECONDARY }}>
                    {s.amount != null ? `$${fmtBigNum(s.amount)}` : '—'}
                  </span>
                  <span style={{ width: 110, flex: 'none', textAlign: 'right', fontFamily: MONO, fontSize: 11.5, color: TXT_SECONDARY }}>
                    {s.mcap != null ? `$${fmtBigNum(s.mcap)}` : '—'}
                  </span>
                  <Spark closes={closes} upTrend={(s.m1 ?? 0) >= 0} />
                </div>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}
