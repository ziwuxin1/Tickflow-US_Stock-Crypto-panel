import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BrainCircuit, Sparkles, Star, LineChart, History as HistoryIcon, Loader2, ExternalLink, Bell, ChevronDown, Globe, Radio } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { StockFinancialSearch } from '@/components/financials/StockFinancialSearch'
import { StockPreviewDialog } from '@/components/StockPreviewDialog'
import { AnalysisKChart, type PriceLevel, type LevelType } from '@/components/stock-analysis/AnalysisKChart'
import { AiPredictPanel, predictionToLevels } from '@/components/stock-analysis/AiPredictPanel'
import { WatchlistCpTable } from '@/components/stock-analysis/WatchlistCpTable'
import { CpFooter } from '@/components/cyberpunk/CpFooter'
import { CpTopBar } from '@/components/cyberpunk/CpTopBar'
import { StockLogo } from '@/components/StockLogo'
import { api, type PredictResponse } from '@/lib/api'
import { useLastStock } from '@/lib/useLastStock'
import { useQuoteStatus } from '@/lib/useSharedQueries'
import { QK } from '@/lib/queryKeys'
import { toast } from '@/components/Toast'
import {
  DOWN, MONO, NEON, TXT_FAINTEST, TXT_WEAK, UP,
} from '@/components/dashboard/tokens'
import {
  startAnalysis, findTodayReport, useHistoryReports,
  deleteReport, openHistoryReport,
} from '@/lib/stockAnalysisStore'

const SEARCH_INPUT_ID = 'cp-stock-search'

/** 青色四角括号(搜索框) */
function CyanBrackets() {
  const c = '2px solid #5ef2e4'
  return (
    <>
      <span style={{ position: 'absolute', top: -6, left: -6, width: 16, height: 16, borderTop: c, borderLeft: c, pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderTop: c, borderRight: c, pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', bottom: -6, left: -6, width: 16, height: 16, borderBottom: c, borderLeft: c, pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', bottom: -6, right: -6, width: 16, height: 16, borderBottom: c, borderRight: c, pointerEvents: 'none' }} />
    </>
  )
}

/**
 * 个股分析页 —— 日 K + 关键价位(压力/支撑/密集区/枢轴/前高前低)+ AI 四维分析。
 * Cyberpunk 主题(design_handoff_cyberpunk 个股分析页)。
 */
export function StockAnalysis() {
  const [symbol, setSymbol] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [checking, setChecking] = useState(false)
  const [confirmReport, setConfirmReport] = useState<{ id: string; created_at: string; focus: string } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [previewSymbol, setPreviewSymbol] = useState<string | null>(null)
  const { last: lastStock, remember: rememberStock } = useLastStock('stock-analysis')
  const { data: quoteStatus } = useQuoteStatus()

  // 自选股: 一键加自选
  const qc = useQueryClient()
  const watchQ = useQuery({
    queryKey: QK.watchlist,
    queryFn: () => api.watchlistList(),
    staleTime: 30_000,
  })
  const watchSymbols = watchQ.data?.symbols ?? []
  const inWatchlist = !!symbol && watchSymbols.some(w => w.symbol === symbol)
  const toggleWatchlist = async () => {
    if (!symbol) return
    try {
      if (inWatchlist) {
        await api.watchlistRemove(symbol)
        toast('已从自选移除', 'success')
      } else {
        await api.watchlistAdd(symbol)
        toast('已加入自选,下次在本页直接点击进入', 'success')
      }
      qc.invalidateQueries({ queryKey: QK.watchlist })
      qc.invalidateQueries({ queryKey: QK.watchlistEnriched() })
    } catch (e: any) {
      toast(String(e?.message ?? '操作失败'), 'error')
    }
  }

  const onSelect = (sym: string, nm: string) => {
    setSymbol(sym)
    setName(nm)
    setShowHistory(false)
    setConfirmReport(null)
    rememberStock(sym, nm)
  }

  // 支持外部入口带参直达: /stock-analysis?symbol=SPY.US&name=标普500ETF(看板行情卡等)
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const sym = searchParams.get('symbol')
    if (!sym) return
    onSelect(sym, searchParams.get('name') ?? sym)
    // 消费后清掉参数, 避免「返回」列表后再被重复带入
    setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // 「/」快捷键聚焦搜索框(设计稿键位提示)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const el = document.getElementById(SEARCH_INPUT_ID) as HTMLInputElement | null
      if (el) { e.preventDefault(); el.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleAnalyze = async () => {
    if (!symbol || checking) return
    setChecking(true)
    try {
      // 当日已分析过 → 二次确认(查看今日报告 / 重新分析)
      const today = await findTodayReport(symbol)
      if (today) {
        setConfirmReport({ id: today.id, created_at: today.created_at, focus: today.focus })
      } else {
        await doAnalysis()
      }
    } catch {
      await doAnalysis()
    } finally {
      setChecking(false)
    }
  }

  const doAnalysis = async () => {
    const r = await startAnalysis(symbol, name)
    if (r.error) toast(r.error, 'error')
  }

  const cpSearchInputClass =
    'w-full h-11 pl-11 pr-14 bg-[rgba(18,16,10,.85)] border border-[rgba(213,240,33,.45)] '
    + 'text-sm text-foreground font-mono tracking-wide caret-[#d5f021] '
    + 'focus:outline-none focus:border-[#d5f021] transition-colors'

  return (
    <div style={{ minWidth: 1400, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ===== NET_TECH 顶栏 ===== */}
      <CpTopBar protocol="EQUITY ANALYSIS PROTOCOL // AI QUAD-VECTOR SCAN" live={!!quoteStatus?.running} />

      <div style={{ padding: '20px 28px 40px', display: 'flex', flexDirection: 'column', gap: 20, position: 'relative' }}>
        {/* 随机故障线 ×3 */}
        <span className="cpfx" style={{ position: 'absolute', top: 120, left: '8%', width: 180, height: 2, background: UP, opacity: 0, pointerEvents: 'none', zIndex: 20, animation: 'cpBarG 7s steps(1) infinite 1s' }} />
        <span className="cpfx" style={{ position: 'absolute', top: 300, right: '12%', width: 260, height: 3, background: NEON, opacity: 0, pointerEvents: 'none', zIndex: 20, animation: 'cpBarG 9s steps(1) infinite 4.2s' }} />
        <span className="cpfx" style={{ position: 'absolute', top: 520, left: '34%', width: 120, height: 2, background: DOWN, opacity: 0, pointerEvents: 'none', zIndex: 20, animation: 'cpBarG 11s steps(1) infinite 6.8s' }} />

        {/* ===== 页头 ===== */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <h1
            className="cpfx"
            style={{
              margin: 0, fontSize: 24, fontWeight: 700, color: NEON, letterSpacing: 3,
              textShadow: '0 0 16px rgba(213,240,33,.4)',
              animation: 'cpGlitch 7s steps(1) infinite, cpRGB 4.6s steps(1) infinite',
            }}
          >
            个股分析
          </h1>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: DOWN, border: '1px solid rgba(247,80,73,.6)', padding: '2px 6px' }}>BETA</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TXT_WEAK, letterSpacing: 1 }}>
            日 K · 关键价位 · AI 四维分析（技术 / 基本面 / 财务 / 消息面）
          </span>
          <div style={{ flex: 1 }} />
          {symbol && (
            <button
              onClick={() => setShowHistory(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: MONO, fontSize: 10,
                color: showHistory ? '#0d0b07' : TXT_WEAK, letterSpacing: 1, padding: '6px 12px', cursor: 'pointer',
                border: '1px solid rgba(213,240,33,.35)', background: showHistory ? NEON : 'transparent',
              }}
            >
              <HistoryIcon className="h-3.5 w-3.5" />
              历史报告
            </button>
          )}
          {/* LAST_SCAN 胶囊 */}
          {lastStock && (
            <button
              onClick={() => onSelect(lastStock.symbol, lastStock.name)}
              title="继续上次分析"
              style={{
                display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, fontSize: 10,
                color: TXT_WEAK, border: '1px solid rgba(213,240,33,.25)', padding: '6px 12px',
                letterSpacing: .5, cursor: 'pointer', background: 'transparent',
              }}
            >
              <span style={{ color: UP }}>LAST_SCAN:</span>
              <span style={{ color: '#e8e6d8' }}>{lastStock.name || lastStock.symbol}</span>
              <span style={{ color: TXT_FAINTEST }}>{lastStock.symbol}</span>
            </button>
          )}
        </header>

        {/* ===== 主体 ===== */}
        {!symbol ? (
          <>
            {/* 居中搜索框: 青色四角括号 + 黄描边 + / 键提示 */}
            <div style={{ display: 'flex', justifyContent: 'center', position: 'relative', marginTop: 4 }}>
              <div style={{ position: 'relative', width: 640 }}>
                <CyanBrackets />
                <StockFinancialSearch
                  onSelect={onSelect}
                  inputId={SEARCH_INPUT_ID}
                  placeholder="输入股票代码或名称，如 AAPL / 英伟达"
                  inputClassName={cpSearchInputClass}
                  cpPlaceholder
                />
                <span
                  style={{
                    position: 'absolute', right: 12, top: 22, transform: 'translateY(-50%)',
                    fontFamily: MONO, fontSize: 10, color: UP, border: '1px solid rgba(94,242,228,.5)',
                    padding: '1px 7px', pointerEvents: 'none',
                  }}
                >
                  /
                </span>
              </div>
            </div>

            {/* 自选股行情表: 点击直接分析 */}
            <WatchlistCpTable onSelect={onSelect} />
          </>
        ) : (
          <>
            {/* 操作行 */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setSymbol(''); setName(''); setShowHistory(false); setConfirmReport(null) }}
                title="返回自选股列表"
                className={
                  'group inline-flex items-center gap-2 px-4 py-2 text-xs font-bold tracking-widest shrink-0 '
                  + 'text-[#5ef2e4] bg-[rgba(94,242,228,.08)] border-[1.5px] border-[rgba(94,242,228,.65)] '
                  + 'shadow-[0_0_12px_rgba(94,242,228,.15)] transition-all duration-150 '
                  + 'hover:bg-[rgba(94,242,228,.22)] hover:border-[rgba(94,242,228,.9)] '
                  + 'hover:shadow-[0_0_20px_rgba(94,242,228,.4)] hover:text-[#8ff5e8]'
                }
              >
                <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" strokeWidth={2.6} />
                返回
              </button>
              <div style={{ position: 'relative', width: 430 }}>
                <CyanBrackets />
                <StockFinancialSearch
                  onSelect={onSelect}
                  inputId={SEARCH_INPUT_ID}
                  placeholder="输入股票代码或名称，如 AAPL / 英伟达"
                  inputClassName={cpSearchInputClass}
                  cpPlaceholder
                />
                <span
                  style={{
                    position: 'absolute', right: 12, top: 22, transform: 'translateY(-50%)',
                    fontFamily: MONO, fontSize: 10, color: UP, border: '1px solid rgba(94,242,228,.5)',
                    padding: '1px 7px', pointerEvents: 'none',
                  }}
                >
                  /
                </span>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={checking}
                className="cp-btn-solid inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#d5f021] text-[#0d0b07] text-xs font-bold tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%)' }}
              >
                {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                AI 个股分析
              </button>
              <button
                onClick={() => toast('点位提醒功能开发中,敬请期待', 'error')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(213,240,33,.18)] text-muted text-xs font-medium hover:border-[rgba(213,240,33,.4)] hover:text-secondary transition-all"
                title="当价格触及关键价位时提醒(开发中)"
              >
                <Bell className="h-3.5 w-3.5" />
                点位提醒
                <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: 1, color: '#d9a531', border: '1px solid rgba(217,165,49,.5)', padding: '1px 5px' }}>
                  开发中
                </span>
              </button>
              <button
                onClick={toggleWatchlist}
                title={inWatchlist ? '从自选移除' : '加入自选,以后在本页自选表直接点击进入'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-all ${
                  inWatchlist
                    ? 'border-[rgba(213,240,33,.5)] bg-[rgba(213,240,33,.1)] text-[#d5f021] hover:bg-[rgba(213,240,33,.18)]'
                    : 'border-[rgba(213,240,33,.18)] text-muted hover:border-[rgba(213,240,33,.4)] hover:text-secondary'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${inWatchlist ? 'fill-[#d5f021]' : ''}`} />
                {inWatchlist ? '已自选' : '加自选'}
              </button>
            </div>

            {showHistory ? (
              <HistoryList symbol={symbol} />
            ) : (
              <StockAnalysisBoard symbol={symbol} name={name} onOpenPreview={() => setPreviewSymbol(symbol)} />
            )}
          </>
        )}

        {/* ===== 页脚状态条 + 键位提示 ===== */}
        <CpFooter keys={[{ k: '/', label: '搜索标的' }, { k: 'ESC', label: 'CLOSE' }]} />
      </div>

      {/* 二次确认:已有历史报告 */}
      {confirmReport && (
        <ConfirmModal
          report={confirmReport}
          onView={() => { openHistoryReport(confirmReport.id); setConfirmReport(null) }}
          onRedo={async () => { setConfirmReport(null); await doAnalysis() }}
          onClose={() => setConfirmReport(null)}
        />
      )}

      {/* 个股日 K 详情对话框(点击名称/代码打开) */}
      <StockPreviewDialog
        symbol={previewSymbol}
        name={previewSymbol === symbol ? name : undefined}
        triggerInfo={null}
        onClose={() => setPreviewSymbol(null)}
      />
    </div>
  )
}

// ===== 分析看板:日 K + 关键价位 =====
function StockAnalysisBoard({ symbol, name, onOpenPreview }: {
  symbol: string
  name?: string
  onOpenPreview?: () => void
}) {
  // AI 自动预测: 结构化点位(画线) + 可视化报告面板
  const [pred, setPred] = useState<PredictResponse | null>(null)
  const [predLoading, setPredLoading] = useState(false)

  // 切换标的时清空上一只的预测
  useEffect(() => {
    setPred(null)
    setPredLoading(false)
  }, [symbol])

  const runPredict = async (source: 'global' | 'followin' = 'global') => {
    if (predLoading) return
    setPredLoading(true)
    try {
      setPred(await api.stockPredict(symbol, name ?? '', source))
    } catch (e: any) {
      const msg = String(e?.message ?? 'AI 预测失败')
      toast(msg.includes('API Key') || msg.includes('api_key')
        ? 'AI 未配置或无效,请在「设置 → AI」中检查当前 AI 提供方'
        : msg, 'error')
    } finally {
      setPredLoading(false)
    }
  }

  const aiLevels = useMemo(() => predictionToLevels(pred?.prediction ?? null), [pred])

  const kline = useQuery({
    // 拉后端上限的 2000 个交易日(约 8 年), Max 档可看全本地历史;
    // 实际返回受限于本地已同步范围, 更早历史需在数据页扩展
    queryKey: ['kline', symbol, '2000'],
    queryFn: () => api.klineDaily(symbol, 2000),
    enabled: !!symbol,
    staleTime: 25_000,
    // 轮询刷新: 后端会把今日实时蜡烛注入最后一根(需实时行情开启且标的在覆盖范围内)
    refetchInterval: 30_000,
  })

  const levelsQ = useQuery({
    queryKey: QK.stockLevels(symbol),
    queryFn: () => api.stockAnalysisLevels(symbol, 250),
    enabled: !!symbol,
    staleTime: 60_000,
  })

  if (kline.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
  }

  const rows = kline.data?.rows ?? []
  if (rows.length === 0) {
    return <EmptyState icon={LineChart} title="暂无日 K 数据" hint="该标的尚未同步日 K,请先在数据页或自选页同步。" />
  }

  const levels = (levelsQ.data?.levels ?? {}) as Record<LevelType, PriceLevel[]>

  // 涨跌色:最后一根 K 线收 vs 前一根收(无前日则按开收判断)
  const last = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const isUp = prev ? (last.close >= prev.close) : (last.close >= last.open)

  return (
    <div className="border border-[rgba(213,240,33,.25)] bg-[rgba(16,14,9,.72)] overflow-hidden relative">
      <div className="px-4 py-3 border-b border-[rgba(213,240,33,.15)] space-y-2">
        {/* 第一行: 标的 LOGO + 大价格块 | AI 自动预测 + 交易日数 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={onOpenPreview}
            title="查看个股日 K 详情"
            className="group flex items-center gap-3 px-2 py-1 -my-1 hover:bg-[rgba(213,240,33,.05)] transition-colors"
          >
            <StockLogo key={symbol} symbol={symbol} size={34} />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-sm font-bold tracking-wide text-foreground group-hover:text-[#5ef2e4] transition-colors">
                {name || symbol}
              </span>
              <span className="text-[10px] font-mono text-muted">{symbol}</span>
            </span>
            <span className="text-3xl font-mono font-extrabold tracking-tight text-foreground leading-none">
              {last.close.toFixed(2)}
            </span>
            <span className="text-xs font-medium text-muted self-end pb-0.5">
              {symbol.includes('.') ? 'USD' : 'USDT'}
            </span>
            {prev && (
              <>
                <span className={`inline-flex items-center gap-0.5 px-2 py-1 text-sm font-bold leading-none font-mono ${
                  isUp ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear'
                }`}>
                  {isUp ? '▲' : '▼'} {Math.abs((last.close / prev.close - 1) * 100).toFixed(2)}%
                </span>
                <span className={`text-sm font-mono font-semibold ${isUp ? 'text-bull' : 'text-bear'}`}>
                  {(last.close - prev.close >= 0 ? '+' : '') + (last.close - prev.close).toFixed(2)} 今日
                </span>
              </>
            )}
            <ExternalLink className="h-3 w-3 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {/* AI 自动预测: 悬停弹出数据源下拉(全网数据 / Followin 实时) */}
            <div className="group relative">
              <button
                type="button"
                disabled={predLoading}
                title="AI 基于最新行情与关键价位自动计算进出场/止损/目标点位, 画到K线上并生成可视化报告(悬停选择数据源)"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[rgba(94,242,228,.4)] bg-[rgba(94,242,228,.06)] text-[#5ef2e4] text-xs font-medium hover:bg-[rgba(94,242,228,.12)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {predLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                {predLoading ? '预测中…' : 'AI 自动预测'}
                {!predLoading && <ChevronDown className="h-3 w-3 opacity-70 transition-transform group-hover:rotate-180" />}
              </button>
              {!predLoading && (
                <div className="absolute right-0 top-full z-30 hidden w-56 pt-1 group-hover:block">
                  <div className="border border-[rgba(94,242,228,.4)] bg-[rgba(10,14,13,.97)] shadow-[0_0_20px_rgba(94,242,228,.18)] backdrop-blur-sm">
                    <button
                      type="button"
                      onClick={() => runPredict('global')}
                      className="w-full flex items-start gap-2 px-3 py-2 text-left border-b border-[rgba(94,242,228,.15)] hover:bg-[rgba(94,242,228,.1)] transition-colors"
                    >
                      <Globe className="h-3.5 w-3.5 text-[#5ef2e4] mt-0.5 shrink-0" />
                      <span className="flex flex-col">
                        <span className="text-xs font-medium text-[#5ef2e4]">全网数据</span>
                        <span className="text-[10px] text-muted leading-tight">global-stock-data 技能自带抓取(新浪/Yahoo/东财/SEC)</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => runPredict('followin')}
                      className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-[rgba(213,240,33,.1)] transition-colors"
                    >
                      <Radio className="h-3.5 w-3.5 text-[#d5f021] mt-0.5 shrink-0" />
                      <span className="flex flex-col">
                        <span className="text-xs font-medium text-[#d5f021]">Followin 实时</span>
                        <span className="text-[10px] text-muted leading-tight">同套提示词, 数据由 Followin MCP 实时抓取</span>
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="text-[10px] text-muted font-mono">{rows.length} 个交易日</span>
          </div>
        </div>
        {/* 第二行: 模块标题 */}
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-[#5ef2e4] shrink-0" />
          <span className="text-sm font-bold tracking-widest" style={{ color: 'rgba(213,240,33,.9)' }}>关键价位分析</span>
        </div>
      </div>
      <div className="p-3">
        <AnalysisKChart
          rows={rows}
          levels={levels}
          series={levelsQ.data?.series}
          seriesDates={levelsQ.data?.dates}
          extraLevels={aiLevels}
          aiPatterns={pred?.prediction.patterns ?? null}
        />
        {/* AI 自动预测可视化报告(生成中显示骨架屏) */}
        <AiPredictPanel data={pred} loading={predLoading} />
      </div>
    </div>
  )
}

// ===== 历史报告列表 =====
function HistoryList({ symbol }: { symbol: string }) {
  const { reports, loaded } = useHistoryReports()
  const mine = reports.filter(r => r.symbol === symbol)

  if (!loaded) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
  }
  if (mine.length === 0) {
    return <EmptyState icon={HistoryIcon} title="暂无历史报告" hint={`还没有 ${symbol} 的个股分析报告,点击「AI 个股分析」生成第一份。`} />
  }

  return (
    <div className="space-y-2">
      {mine.map(r => (
        <div key={r.id} className="border border-[rgba(213,240,33,.18)] bg-[rgba(16,14,9,.72)] p-3 hover:border-[rgba(213,240,33,.4)] transition-colors">
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => openHistoryReport(r.id)} className="flex-1 text-left min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-secondary">{fmtRelative(r.created_at)}</span>
                {r.close && <span className="text-[10px] font-mono text-muted">价 {r.close.toFixed(2)}</span>}
                {r.focus && <span className="text-[10px] text-[#5ef2e4]/70 truncate">关注: {r.focus}</span>}
              </div>
              <div className="mt-1 text-xs text-muted truncate">{r.summary || '点击查看完整报告'}</div>
            </button>
            <button
              onClick={() => { deleteReport(r.id); toast('已删除', 'success') }}
              className="shrink-0 text-[10px] text-muted hover:text-danger transition-colors px-2 py-1"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===== 二次确认弹窗 =====
function ConfirmModal({ report, onView, onRedo, onClose }: {
  report: { id: string; created_at: string; focus: string }
  onView: () => void
  onRedo: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-[#100e09] border border-[rgba(213,240,33,.35)] p-5 relative"
        onClick={e => e.stopPropagation()}
      >
        <span style={{ position: 'absolute', top: -5, left: -5, width: 14, height: 14, borderTop: `2px solid ${NEON}`, borderLeft: `2px solid ${NEON}` }} />
        <span style={{ position: 'absolute', bottom: -5, right: -5, width: 14, height: 14, borderBottom: `2px solid ${NEON}`, borderRight: `2px solid ${NEON}` }} />
        <div className="flex items-center gap-2 mb-2">
          <HistoryIcon className="h-4 w-4 text-[#5ef2e4]" />
          <span className="text-sm font-bold tracking-wide text-foreground">该个股已有分析报告</span>
        </div>
        <p className="text-xs text-secondary leading-relaxed mb-1">
          最近一次报告生成于 <span className="text-foreground">{fmtRelative(report.created_at)}</span>。
        </p>
        {report.focus && <p className="text-xs text-muted mb-1">关注点: {report.focus}</p>}
        <p className="text-xs text-muted mb-4">可直接查看历史,或重新生成一份新报告。</p>
        <div className="flex gap-2">
          <button onClick={onView}
            className="flex-1 h-8 border border-[rgba(213,240,33,.25)] text-xs text-secondary hover:text-foreground hover:bg-[rgba(213,240,33,.06)] transition-colors">
            查看历史
          </button>
          <button onClick={onRedo}
            className="cp-btn-solid flex-1 h-8 bg-[#d5f021] text-[#0d0b07] text-xs font-bold tracking-wider"
            style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%)' }}>
            重新分析
          </button>
        </div>
      </div>
    </div>
  )
}

function fmtRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime()
    const diff = Date.now() - t
    if (diff < 60_000) return '刚刚'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
    if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`
    return new Date(iso).toLocaleDateString('zh-CN')
  } catch { return iso }
}
