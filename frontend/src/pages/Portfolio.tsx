import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { CpTopBar } from '@/components/cyberpunk/CpTopBar'
import { CpFooter } from '@/components/cyberpunk/CpFooter'
import { CornerMarks } from '@/components/dashboard/GlassCard'
import { DotGridEmpty } from '@/components/dashboard/DotGridEmpty'
import { SettingsModal } from '@/components/data/SettingsModal'
import { StockFinancialSearch } from '@/components/financials/StockFinancialSearch'
import { StockLogo } from '@/components/StockLogo'
import {
  DOWN, INK, MONO, NEON, PANEL_BG, TXT_BODY, TXT_FAINTEST, TXT_SECONDARY, TXT_WEAK, UP, clipTL,
} from '@/components/dashboard/tokens'
import { portfolioApi, type EquityPoint, type PortfolioPosition, type PortfolioTrade, type PortfolioTradeIn } from '@/lib/api'
import { fmtPrice } from '@/lib/format'

/** 金额: 千分位, 2 位小数, 可选强制符号 */
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

/** 顶部统计单元 */
function StatCell({ label, en, value, color }: { label: string; en: string; value: string; color?: string }) {
  return (
    <div style={{ position: 'relative', border: '1px solid rgba(213,240,33,.22)', background: PANEL_BG, padding: '11px 14px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(213,240,33,.85)', letterSpacing: 2 }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 6.5, color: TXT_WEAK, letterSpacing: 1.5 }}>{en}</span>
      </span>
      <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: color ?? TXT_BODY, letterSpacing: .5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </span>
    </div>
  )
}

/** 净值/盈亏曲线 — SVG 面积折线(沿用 BalanceChart 视觉语言) */
function EquityChart({ curve }: { curve: EquityPoint[] }) {
  const VW = 960
  const VH = 240
  if (curve.length < 2) {
    return <DotGridEmpty text="暂无净值数据 · 先记一笔交易" minHeight={200} maskStop={40} />
  }
  const vals = curve.map(p => p.pnl)
  const rawMin = Math.min(...vals, 0)
  const rawMax = Math.max(...vals, 0)
  const pad = (rawMax - rawMin) * 0.08 || Math.abs(rawMax) * 0.1 || 1
  const lo = rawMin - pad
  const hi = rawMax + pad
  const px = (i: number) => (i / (curve.length - 1)) * VW
  const py = (v: number) => VH - ((v - lo) / (hi - lo)) * VH
  const last = curve[curve.length - 1].pnl
  const stroke = last >= 0 ? UP : DOWN
  const line = curve.map((p, i) => `${px(i).toFixed(1)},${py(p.pnl).toFixed(1)}`).join(' ')
  const area = `M0 ${VH} L${curve.map((p, i) => `${px(i).toFixed(1)} ${py(p.pnl).toFixed(1)}`).join(' L')} L${VW} ${VH} Z`
  const zeroY = py(0)
  const yTicks = Array.from({ length: 5 }, (_, i) => hi - ((hi - lo) * i) / 4)
  const xCount = Math.min(6, curve.length)
  const xLabels = Array.from({ length: xCount }, (_, i) => {
    const idx = Math.round((i / (xCount - 1)) * (curve.length - 1))
    return curve[idx].date.slice(5)
  })
  const fmtAxis = (v: number) => Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 200, padding: '2px 0', fontFamily: MONO, fontSize: 8.5, color: TXT_FAINTEST, textAlign: 'right', flex: 'none', width: 42 }}>
        {yTicks.map((v, i) => <span key={i}>{fmtAxis(v)}</span>)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ position: 'relative', height: 200 }}>
          <svg width="100%" height="100%" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, display: 'block' }}>
            <defs>
              <linearGradient id="pfEqFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity=".28" />
                <stop offset="100%" stopColor={stroke} stopOpacity=".02" />
              </linearGradient>
            </defs>
            {/* 零轴基准线 */}
            <line x1="0" y1={zeroY} x2={VW} y2={zeroY} stroke="rgba(213,240,33,.25)" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            <path d={area} fill="url(#pfEqFade)" />
            <polyline points={line} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ filter: `drop-shadow(0 0 5px ${stroke}66)` }} />
          </svg>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 8.5, color: TXT_FAINTEST, letterSpacing: 1, marginTop: 4 }}>
          {xLabels.map((l, i) => <span key={`${l}-${i}`}>{l}</span>)}
        </div>
      </div>
    </div>
  )
}

/** 黄色切角题栏 */
function CardTitle({ title, en, right }: { title: string; en: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: NEON, padding: '7px 14px', clipPath: clipTL(12) }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, letterSpacing: 2 }}>{title}</span>
      <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, color: 'rgba(13,11,7,.7)', letterSpacing: 1.5 }}>{en}</span>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  )
}

const HEAD: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: 'rgba(213,240,33,.8)', letterSpacing: 1.5 }
const cellR: React.CSSProperties = { fontFamily: MONO, fontSize: 12, textAlign: 'right' }

export function Portfolio() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PortfolioTrade | null>(null)

  const summary = useQuery({ queryKey: ['portfolio', 'summary'], queryFn: portfolioApi.summary, refetchInterval: 30_000 })
  const tradesQ = useQuery({ queryKey: ['portfolio', 'trades'], queryFn: portfolioApi.trades })
  const curveQ = useQuery({ queryKey: ['portfolio', 'curve'], queryFn: portfolioApi.equityCurve, refetchInterval: 60_000 })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['portfolio'] })
  const delMut = useMutation({ mutationFn: portfolioApi.deleteTrade, onSuccess: invalidate })

  const totals = summary.data?.totals
  const positions = summary.data?.positions ?? []
  const trades = tradesQ.data?.trades ?? []
  const curve = curveQ.data?.curve ?? []

  const totalPnl = useMemo(() => {
    if (!totals) return null
    return (totals.unrealized_pnl ?? 0) + (totals.realized_pnl ?? 0)
  }, [totals])

  return (
    <div style={{ minWidth: 1180, minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <CpTopBar protocol="PORTFOLIO PROTOCOL // POSITION & P&L TRACKER" live={false} />

      <div style={{ padding: '16px 28px 40px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 页头 */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <h1 className="cpfx" style={{ margin: 0, fontSize: 24, fontWeight: 700, color: NEON, letterSpacing: 3, textShadow: '0 0 16px rgba(213,240,33,.4)' }}>
            持仓组合
          </h1>
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: NEON, border: '1px solid rgba(213,240,33,.5)', padding: '2px 8px' }}>
            {positions.length} 只持仓
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setEditing(null); setShowForm(true) }}
            className="cp-btn-solid inline-flex items-center gap-1.5 px-4 h-8 text-xs font-bold tracking-wider"
            style={{ background: NEON, color: INK, clipPath: 'polygon(0 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%)' }}
          >
            <Plus className="h-3.5 w-3.5" />记一笔
          </button>
        </header>

        {/* 统计条 ×5 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
          <StatCell label="总市值" en="MARKET.VALUE" value={money(totals?.market_value)} />
          <StatCell label="持仓成本" en="COST.BASIS" value={money(totals?.cost_basis)} />
          <StatCell label="浮动盈亏" en="UNREALIZED" value={money(totals?.unrealized_pnl, true)} color={pnlColor(totals?.unrealized_pnl)} />
          <StatCell label="已实现盈亏" en="REALIZED" value={money(totals?.realized_pnl, true)} color={pnlColor(totals?.realized_pnl)} />
          <StatCell label="今日盈亏" en="TODAY.P&L" value={money(totals?.today_pnl, true)} color={pnlColor(totals?.today_pnl)} />
        </div>

        {/* 净值曲线 */}
        <section style={{ position: 'relative', border: '1px solid rgba(213,240,33,.3)', background: PANEL_BG }}>
          <CornerMarks size={16} />
          <CardTitle
            title="累计盈亏曲线"
            en="EQUITY CURVE"
            right={totalPnl != null && (
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: INK }}>
                {money(totalPnl, true)}
              </span>
            )}
          />
          <div style={{ padding: '16px 16px 12px' }}>
            <EquityChart curve={curve} />
          </div>
        </section>

        {/* 持仓表 */}
        <section style={{ position: 'relative', border: '1px solid rgba(213,240,33,.3)', background: PANEL_BG }}>
          <CornerMarks size={16} />
          <CardTitle title="当前持仓" en="POSITIONS" />
          <div style={{ padding: '4px 14px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderBottom: '1px solid rgba(213,240,33,.25)' }}>
              <span style={{ ...HEAD, flex: 1, minWidth: 180 }}>标的 / NAME</span>
              <span style={{ ...HEAD, width: 90, textAlign: 'right' }}>数量</span>
              <span style={{ ...HEAD, width: 100, textAlign: 'right' }}>均价</span>
              <span style={{ ...HEAD, width: 100, textAlign: 'right' }}>现价</span>
              <span style={{ ...HEAD, width: 120, textAlign: 'right' }}>市值</span>
              <span style={{ ...HEAD, width: 140, textAlign: 'right' }}>浮动盈亏</span>
              <span style={{ ...HEAD, width: 120, textAlign: 'right' }}>今日盈亏</span>
            </div>
            {summary.isLoading ? (
              <div style={{ padding: '26px 0', textAlign: 'center', fontFamily: MONO, fontSize: 9.5, color: TXT_WEAK, letterSpacing: 2 }}>{'// LOADING POSITIONS…'}</div>
            ) : positions.length === 0 ? (
              <div style={{ padding: '8px 0' }}>
                <DotGridEmpty text="暂无持仓 · 点击「记一笔」录入交易" minHeight={120} maskStop={35} />
              </div>
            ) : positions.map((p: PortfolioPosition) => (
              <div
                key={p.symbol}
                className="cp-row"
                onClick={() => navigate(`/stock-analysis?symbol=${encodeURIComponent(p.symbol)}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px', borderBottom: '1px solid rgba(213,240,33,.09)', cursor: 'pointer' }}
              >
                <div style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StockLogo symbol={p.symbol} size={26} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: TXT_BODY, whiteSpace: 'nowrap' }}>{p.name || p.symbol}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, color: TXT_WEAK }}>{p.symbol}</span>
                </div>
                <span style={{ ...cellR, width: 90, color: TXT_SECONDARY }}>{p.qty}</span>
                <span style={{ ...cellR, width: 100, color: TXT_SECONDARY }}>${fmtPrice(p.avg_cost)}</span>
                <span style={{ ...cellR, width: 100, color: TXT_BODY, fontWeight: 700 }}>{p.close != null ? `$${fmtPrice(p.close)}` : '—'}</span>
                <span style={{ ...cellR, width: 120, color: TXT_BODY }}>{money(p.market_value)}</span>
                <span style={{ ...cellR, width: 140, color: pnlColor(p.unrealized_pnl), fontWeight: 700 }}>
                  {money(p.unrealized_pnl, true)}
                  {p.unrealized_pct != null && <span style={{ fontSize: 9.5, marginLeft: 5 }}>{p.unrealized_pct >= 0 ? '+' : ''}{p.unrealized_pct.toFixed(1)}%</span>}
                </span>
                <span style={{ ...cellR, width: 120, color: pnlColor(p.today_pnl) }}>{money(p.today_pnl, true)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 交易流水 */}
        <section style={{ position: 'relative', border: '1px solid rgba(213,240,33,.3)', background: PANEL_BG }}>
          <CornerMarks size={16} />
          <CardTitle title="交易流水" en="TRADE LOG" right={<span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: INK }}>{trades.length}</span>} />
          <div style={{ padding: '4px 14px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderBottom: '1px solid rgba(213,240,33,.25)' }}>
              <span style={{ ...HEAD, width: 100 }}>日期</span>
              <span style={{ ...HEAD, flex: 1, minWidth: 140 }}>标的</span>
              <span style={{ ...HEAD, width: 60, textAlign: 'right' }}>方向</span>
              <span style={{ ...HEAD, width: 100, textAlign: 'right' }}>价格</span>
              <span style={{ ...HEAD, width: 90, textAlign: 'right' }}>数量</span>
              <span style={{ ...HEAD, width: 80, textAlign: 'right' }}>手续费</span>
              <span style={{ ...HEAD, flex: 1, minWidth: 100 }}>备注</span>
              <span style={{ ...HEAD, width: 68, textAlign: 'right' }} />
            </div>
            {trades.length === 0 ? (
              <div style={{ padding: '8px 0' }}>
                <DotGridEmpty text="暂无交易记录" minHeight={100} maskStop={35} />
              </div>
            ) : trades.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderBottom: '1px solid rgba(213,240,33,.09)' }}>
                <span style={{ width: 100, fontFamily: MONO, fontSize: 11, color: TXT_SECONDARY }}>{t.traded_at}</span>
                <span style={{ flex: 1, minWidth: 140, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: TXT_BODY }}>{t.symbol}</span>
                </span>
                <span style={{ width: 60, textAlign: 'right', fontFamily: MONO, fontSize: 11, fontWeight: 700, color: t.side === 'buy' ? UP : DOWN }}>
                  {t.side === 'buy' ? '买入' : '卖出'}
                </span>
                <span style={{ ...cellR, width: 100, color: TXT_SECONDARY }}>${fmtPrice(t.price)}</span>
                <span style={{ ...cellR, width: 90, color: TXT_SECONDARY }}>{t.qty}</span>
                <span style={{ ...cellR, width: 80, color: TXT_WEAK }}>{t.fee ? `$${fmtPrice(t.fee)}` : '—'}</span>
                <span style={{ flex: 1, minWidth: 100, fontSize: 11.5, color: TXT_WEAK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.note || '—'}</span>
                <div style={{ width: 68, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    onClick={() => { setEditing(t); setShowForm(true) }}
                    style={{ color: TXT_FAINTEST, cursor: 'pointer', background: 'none', border: 'none' }}
                    title="编辑"
                  >
                    <Pencil className="h-3.5 w-3.5 hover:text-[#d5f021]" />
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`删除这笔 ${t.symbol} ${t.side === 'buy' ? '买入' : '卖出'} 记录?`)) delMut.mutate(t.id) }}
                    style={{ color: TXT_FAINTEST, cursor: 'pointer', background: 'none', border: 'none' }}
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5 hover:text-[#f75049]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <CpFooter />
      </div>

      {showForm && (
        <TradeFormDialog
          editing={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); invalidate() }}
        />
      )}
    </div>
  )
}

/** 录入 / 编辑弹窗 */
function TradeFormDialog({ editing, onClose, onSaved }: { editing: PortfolioTrade | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!editing
  const [symbol, setSymbol] = useState(editing?.symbol ?? '')
  const [symbolName, setSymbolName] = useState(editing?.symbol ?? '')
  const [side, setSide] = useState<'buy' | 'sell'>(editing?.side ?? 'buy')
  const [price, setPrice] = useState(editing ? String(editing.price) : '')
  const [qty, setQty] = useState(editing ? String(editing.qty) : '')
  const [fee, setFee] = useState(editing?.fee ? String(editing.fee) : '')
  const today = new Date()
  const [tradedAt, setTradedAt] = useState(
    editing?.traded_at
    ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
  )
  const [note, setNote] = useState(editing?.note ?? '')

  const addMut = useMutation({
    mutationFn: (body: PortfolioTradeIn) =>
      isEdit ? portfolioApi.updateTrade(editing!.id, body) : portfolioApi.addTrade(body),
    onSuccess: onSaved,
  })

  const priceNum = parseFloat(price)
  const qtyNum = parseFloat(qty)
  const valid = symbol.trim() && Number.isFinite(priceNum) && priceNum > 0 && Number.isFinite(qtyNum) && qtyNum > 0

  const submit = () => {
    if (!valid) return
    addMut.mutate({
      symbol: symbol.trim().toUpperCase(),
      side,
      price: priceNum,
      qty: qtyNum,
      fee: fee ? parseFloat(fee) || 0 : 0,
      traded_at: tradedAt,
      note: note.trim(),
    })
  }

  const inputCls = 'w-full h-9 px-3 bg-[#0e100c] border border-[rgba(213,240,33,.22)] text-sm text-foreground focus:outline-none focus:border-[rgba(213,240,33,.5)] font-mono'
  const labelCls = 'text-[11px] font-bold tracking-wider text-[rgba(213,240,33,.8)]'

  return (
    <SettingsModal title={isEdit ? '编辑交易' : '记一笔交易'} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        {/* 标的搜索 */}
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>标的</span>
          {symbol ? (
            <div className="flex items-center gap-2 h-9 px-3 bg-[#0e100c] border border-[rgba(213,240,33,.4)]">
              <span className="font-mono text-sm font-bold text-[#d5f021]">{symbol}</span>
              <span className="text-sm text-secondary truncate">{symbolName}</span>
              <div className="flex-1" />
              <button onClick={() => { setSymbol(''); setSymbolName('') }} className="text-xs text-muted hover:text-foreground">更换</button>
            </div>
          ) : (
            <StockFinancialSearch
              onSelect={(s, n) => { setSymbol(s); setSymbolName(n) }}
              placeholder="搜索股票/加密代码，如 AAPL / BTCUSDT"
            />
          )}
        </div>

        {/* 方向 */}
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>方向</span>
          <div className="flex border border-[rgba(213,240,33,.3)]">
            {(['buy', 'sell'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className="flex-1 h-9 text-sm font-bold tracking-wider transition-colors"
                style={{
                  background: side === s ? (s === 'buy' ? 'rgba(94,242,228,.15)' : 'rgba(247,80,73,.15)') : 'transparent',
                  color: side === s ? (s === 'buy' ? UP : DOWN) : TXT_WEAK,
                }}
              >
                {s === 'buy' ? '买入' : '卖出'}
              </button>
            ))}
          </div>
        </div>

        {/* 价格 / 数量 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>价格</span>
            <input type="number" step="any" min="0" value={price} onChange={e => setPrice(e.target.value)} className={inputCls} placeholder="0.00" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>数量</span>
            <input type="number" step="any" min="0" value={qty} onChange={e => setQty(e.target.value)} className={inputCls} placeholder="0" />
          </div>
        </div>

        {/* 手续费 / 日期 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>手续费(可选)</span>
            <input type="number" step="any" min="0" value={fee} onChange={e => setFee(e.target.value)} className={inputCls} placeholder="0" />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>成交日期</span>
            <input type="date" value={tradedAt} onChange={e => setTradedAt(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* 备注 */}
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>备注(可选)</span>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} className={inputCls} placeholder="加仓 / 止盈 …" />
        </div>

        <div className="mt-1 flex items-center justify-end gap-2.5">
          <button onClick={onClose} className="px-4 h-9 text-sm text-secondary hover:text-foreground transition-colors">取消</button>
          <button
            onClick={submit}
            disabled={!valid || addMut.isPending}
            className="cp-btn-solid inline-flex items-center gap-1.5 px-5 h-9 text-sm font-bold tracking-wider disabled:opacity-40"
            style={{ background: NEON, color: INK, clipPath: 'polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)' }}
          >
            {addMut.isPending ? (isEdit ? '保存中…' : '记录中…') : (isEdit ? '保存修改' : '确认记录')}
          </button>
        </div>
      </div>
    </SettingsModal>
  )
}
