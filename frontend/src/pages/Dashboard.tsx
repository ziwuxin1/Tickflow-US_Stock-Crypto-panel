import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, Database, Loader2, Play, Sparkles } from 'lucide-react'
import { DatePicker } from '@/components/DatePicker'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'
import { useDataStatus, useSettings } from '@/lib/useSharedQueries'
import { SettingsModal } from '@/components/data/SettingsModal'
import { STAGE_LABELS } from '@/components/data/ActiveJobCard'
import { CpFooter } from '@/components/cyberpunk/CpFooter'
import { CpTopBar } from '@/components/cyberpunk/CpTopBar'
import { AssetClassCard } from '@/components/dashboard/AssetClassCard'
import { BalanceChart } from '@/components/dashboard/BalanceChart'
import { CryptoSnapshotCard } from '@/components/dashboard/CryptoSnapshotCard'
import { LeaderboardCard } from '@/components/dashboard/LeaderboardCard'
import { MarketTickerCards } from '@/components/dashboard/MarketTickerCards'
import { MonitorCenterCard } from '@/components/dashboard/MonitorCenterCard'
import { PortfolioCard } from '@/components/dashboard/PortfolioCard'
import { PortfolioAllocationCard } from '@/components/dashboard/PortfolioAllocationCard'
import { RadarCard } from '@/components/dashboard/RadarCard'
import { StatCards } from '@/components/dashboard/StatCards'
import { TrendMonitorCard } from '@/components/dashboard/TrendMonitorCard'
import { UsQuotesCard } from '@/components/dashboard/UsQuotesCard'
import {
  DOWN, MONO, NEON, TXT_FAINTEST, TXT_SECONDARY, UP,
} from '@/components/dashboard/tokens'
import { quoteAge } from '@/components/dashboard/utils'

export function Dashboard() {
  const qc = useQueryClient()
  const [selectedDate, setSelectedDate] = useState<string | undefined>()
  const [manualFetching, setManualFetching] = useState(false)
  // 首次使用(无数据 + 未完成引导)自动弹窗: 同一会话只弹一次
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const dataStatus = useDataStatus({ staleTime: 60_000 })
  const overview = useQuery({
    queryKey: QK.overviewMarket(selectedDate),
    queryFn: () => api.overviewMarket(selectedDate),
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  })
  const data = overview.data
  const settings = useSettings()
  // none 档(无 key / 无效 key): 不再阻断功能, 仅实时行情等扩展能力受限
  const isNoKey = settings.data?.mode === 'none'
  // 无本地数据(enriched/daily 都没有)→ 常驻引导卡片
  // 注: 后端 status 的 rows 为性能刻意返回 0, 用 trading_days 判断是否有数据
  const ds = dataStatus.data
  const hasNoData = !!ds
    && (ds.enriched?.trading_days ?? 0) === 0
    && (ds.daily?.trading_days ?? 0) === 0

  // ===== 盘后管道触发(看板内一键获取数据) =====
  const [fetchJobId, setFetchJobId] = useState<string | null>(null)
  const fetchStatus = useQuery({
    queryKey: QK.pipelineJob(fetchJobId ?? ''),
    queryFn: () => api.pipelineJob(fetchJobId!),
    enabled: !!fetchJobId,
    retry: false,
    refetchInterval: (q: any) => {
      // 请求本身出错(如后端重启后 job 已丢失 → 404)时停止轮询, 避免每秒无限重试
      if (q.state.status === 'error') return false
      const j = q.state.data
      return j && (j.status === 'succeeded' || j.status === 'failed') ? false : 1_000
    },
  })
  const startFetch = useMutation({
    mutationFn: api.pipelineRun,
    onSuccess: ({ job_id }) => setFetchJobId(job_id),
  })
  const isFetching = startFetch.isPending
    || fetchStatus.data?.status === 'running'
    || fetchStatus.data?.status === 'pending'
  const fetchFailed = fetchStatus.data?.status === 'failed'
  const fetchSucceeded = fetchStatus.data?.status === 'succeeded'

  // 首次使用且无数据 → 自动弹一次引导弹窗(同会话只弹一次)
  useEffect(() => {
    if (!hasNoData) return
    if (settings.data?.onboarding_completed === false) return  // 还在引导流程中,不重复弹
    if (sessionStorage.getItem('tf_welcome_shown')) return
    sessionStorage.setItem('tf_welcome_shown', '1')
    setShowWelcomeModal(true)
  }, [hasNoData, settings.data?.onboarding_completed])

  // 轮询出错(job 已不存在)→ 放弃跟踪, UI 回到空闲态, 用户可重新触发
  useEffect(() => {
    if (fetchStatus.isError) setFetchJobId(null)
  }, [fetchStatus.isError])

  // 同步完成后刷新看板数据
  useEffect(() => {
    if (fetchSucceeded) {
      qc.invalidateQueries({ queryKey: QK.dataStatus })
      qc.invalidateQueries({ queryKey: QK.overviewMarket(undefined) })
    }
  }, [fetchSucceeded, qc])

  // 组件重新挂载时(从其他页面切回)恢复正在运行的同步任务进度。
  // 原因: fetchJobId 是组件内状态, 切走页面时组件卸载、状态丢失, 切回后进度卡片消失。
  // 修复: 挂载时若无本地数据且未跟踪任何 job, 查一次后端是否有 active job, 有则接管。
  const resumeTriedRef = useRef(false)
  useEffect(() => {
    if (resumeTriedRef.current) return
    if (!hasNoData) return
    if (fetchJobId) return
    resumeTriedRef.current = true
    api.pipelineJobs(1).then(({ active_id }) => {
      if (active_id) setFetchJobId(active_id)
    }).catch(() => { /* 查询失败不阻塞, 用户仍可手动点击获取 */ })
  }, [hasNoData, fetchJobId])

  // 手动刷新: 显示旋转动画; SSE 自动刷新: 静默, 无体感
  const handleRefresh = () => {
    setManualFetching(true)
    overview.refetch().finally(() => setManualFetching(false))
  }

  if (overview.isLoading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted" style={{ fontFamily: MONO, letterSpacing: 2 }}>
          <Loader2 className="h-4 w-4 animate-spin" /> {'// LOADING MARKET DASHBOARD…'}
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="border border-[rgba(247,80,73,.4)] bg-[rgba(16,14,9,.72)] p-6 text-center">
          <div className="text-sm text-danger" style={{ fontFamily: MONO, letterSpacing: 1 }}>{'// 看板加载失败'}</div>
          <button onClick={() => overview.refetch()} className="dash-refresh mt-3 mx-auto">重试</button>
        </div>
      </div>
    )
  }

  const score = data.emotion?.score ?? 50
  const latestDate = dataStatus.data?.enriched?.latest_date ?? null
  const currentDate = selectedDate ?? data.as_of ?? ''
  const quoteRunning = (!selectedDate || selectedDate === latestDate) && data.quote_status?.running
  // 实时模式: none / watchlist / full_market。
  // watchlist (Free 档) 仅自选 ≤5 只实时, 看板呈现的大盘数据实为盘后快照, 需提示避免误读。
  const quoteMode = data.quote_status?.mode as ('none' | 'watchlist' | 'full_market') | undefined

  return (
    <div style={{ minWidth: 1680, minHeight: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* ===== NET_TECH 顶栏 ===== */}
      <CpTopBar protocol="MARKET DASHBOARD PROTOCOL // FULL-SPECTRUM SCAN" live={!!quoteRunning} />

      <div style={{ padding: '16px 28px 40px', display: 'flex', flexDirection: 'column', gap: 18, position: 'relative' }}>
        {/* 随机故障线 ×3 */}
        <span className="cpfx" style={{ position: 'absolute', top: 150, left: '8%', width: 180, height: 2, background: UP, opacity: 0, pointerEvents: 'none', zIndex: 20, animation: 'cpBarG 7s steps(1) infinite 1s' }} />
        <span className="cpfx" style={{ position: 'absolute', top: 420, right: '12%', width: 260, height: 3, background: NEON, opacity: 0, pointerEvents: 'none', zIndex: 20, animation: 'cpBarG 9s steps(1) infinite 4.2s' }} />
        <span className="cpfx" style={{ position: 'absolute', top: 760, left: '34%', width: 120, height: 2, background: DOWN, opacity: 0, pointerEvents: 'none', zIndex: 20, animation: 'cpBarG 11s steps(1) infinite 6.8s' }} />

        {/* 无本地数据常驻引导卡片 —— 一键触发盘后管道获取数据(无 Key 也可) */}
        {hasNoData && (
          <FetchDataCard
            isFetching={isFetching}
            isStarting={startFetch.isPending}
            fetchFailed={fetchFailed}
            stage={fetchStatus.data?.stage}
            fetchPct={fetchStatus.data?.progress}
            onStart={() => startFetch.mutate()}
            isNoKey={isNoKey}
          />
        )}
        {/* 首次使用自动弹窗(同会话仅一次) */}
        <AnimatePresence>
          {showWelcomeModal && (
            <WelcomeFetchModal
              isNoKey={isNoKey}
              onClose={() => setShowWelcomeModal(false)}
              onStart={() => {
                startFetch.mutate()
                setShowWelcomeModal(false)
              }}
            />
          )}
        </AnimatePresence>

        {/* ===== 页头 ===== */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 13, position: 'relative' }}>
          <h1
            className="cpfx"
            style={{
              margin: 0, fontSize: 24, fontWeight: 700, color: NEON, letterSpacing: 3,
              textShadow: '0 0 16px rgba(213,240,33,.4)',
              animation: 'cpGlitch 7s steps(1) infinite, cpRGB 4.6s steps(1) infinite',
            }}
          >
            市场看板
          </h1>
          <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: NEON, border: '1px solid rgba(213,240,33,.5)', padding: '2px 8px' }}>
            {data.emotion.label} · {score}
          </span>
          {/* 日期胶囊 */}
          <div style={{ display: 'flex', alignItems: 'center', fontFamily: MONO, fontSize: 10, color: TXT_SECONDARY, border: '1px solid rgba(213,240,33,.2)', padding: '0 6px', letterSpacing: 1 }}>
            {currentDate ? (
              <DatePicker
                value={currentDate}
                onChange={setSelectedDate}
                min={dataStatus.data?.enriched?.earliest_date ?? undefined}
                max={latestDate ?? undefined}
                buttonClassName="!h-auto !border-0 !bg-transparent !px-1 !py-1 !text-[11px] !text-[#b8b4a0] [&_svg]:!text-[#d5f021]"
              />
            ) : (
              <span style={{ color: TXT_FAINTEST, padding: '3px 4px' }}>—</span>
            )}
          </div>
          {/* 行情时效 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: TXT_FAINTEST, fontFamily: MONO }}>{quoteAge(data.quote_status?.quote_age_ms)}</span>
            <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: quoteRunning ? NEON : DOWN }}>
              {quoteRunning ? '实时' : '非实时'}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          {/* 刷新 — 黄色实心切角块 */}
          <button onClick={handleRefresh} disabled={manualFetching} className="dash-refresh">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" className={manualFetching ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 4v5h-5" />
            </svg>
            刷新
          </button>
        </header>

        {/* ===== 提示条: Free 档大盘为盘后快照 ===== */}
        {quoteMode === 'watchlist' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid rgba(213,240,33,.3)', background: 'rgba(213,240,33,.04)', padding: '8px 13px' }}>
            <span style={{ width: 6, height: 6, background: NEON, flex: 'none' }} />
            <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, fontWeight: 600, color: TXT_SECONDARY, letterSpacing: .5 }}>
              当前为「自选实时」模式，看板展示的大盘数据为<b style={{ color: NEON, fontWeight: 700 }}>盘后快照</b>（最新有数据日），并非盘中实时；
              仅自选股({data.quote_status?.watchlist_symbol_count ?? 0} 只)支持实时监控。
            </span>
            <Link to="/settings?tab=account" style={{ color: UP, textDecoration: 'underline', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 600 }}>
              全市场实时需 Starter+
            </Link>
          </div>
        )}

        {/* ===== 行情卡 ×6 ===== */}
        <MarketTickerCards indices={data.indices} />

        {/* ===== 市场统计卡 ×6 ===== */}
        <StatCards data={data} />

        {/* ===== 中部五栏: 大盘基准图表(收窄) | 持仓分布环形 | 情绪雷达 | 趋势/监控 perk | 加密快照+监控中心 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr .66fr .82fr 1.05fr .8fr', gap: 14, alignItems: 'stretch', position: 'relative' }}>
          <BalanceChart />
          <PortfolioAllocationCard />
          <RadarCard radar={data.radar} score={score} />
          <TrendMonitorCard data={data} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <PortfolioCard />
            <CryptoSnapshotCard indices={data.indices} />
            <MonitorCenterCard />
          </div>
        </div>

        {/* ===== 资产类结构(CP LOADING 组件) ===== */}
        <AssetClassCard boards={data.boards} />

        {/* ===== 榜单 ×4 ===== */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, alignItems: 'stretch', position: 'relative' }}>
          <LeaderboardCard title="涨幅榜" rows={data.top_gainers} mode="gain" />
          <LeaderboardCard title="跌幅榜" rows={data.top_losers} mode="loss" />
          <LeaderboardCard title="成交额榜" rows={data.turnover_leaders} mode="amount" />
          <UsQuotesCard />
        </div>

        {/* ===== 页脚状态条 ===== */}
        <CpFooter />
      </div>
    </div>
  )
}

// ===== 无数据常驻引导卡片: 一键触发盘后管道获取行情数据(无 Key 也可) =====
function FetchDataCard({
  isFetching, isStarting, fetchFailed, stage, fetchPct, onStart, isNoKey,
}: {
  isFetching: boolean
  isStarting: boolean
  fetchFailed: boolean
  stage?: string
  fetchPct?: number
  onStart: () => void
  isNoKey: boolean
}) {
  const stageText = stage ? (STAGE_LABELS[stage] ?? stage) : '正在同步行情数据…'
  return (
    <div className="relative border border-[rgba(213,240,33,.3)] bg-[rgba(16,14,9,.72)] p-3.5">
      <div className="flex items-start gap-3">
        <div className="bg-[rgba(213,240,33,.1)] p-2 shrink-0">
          <Database className="h-4 w-4 text-[#d5f021]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-wider text-foreground">当前暂无数据</div>
          <p className="mt-1 text-xs text-secondary leading-relaxed">
            首次使用需获取行情数据后才能查看看板。系统将拉取近 1 年美股全市场日K(约 1.2 万只)与主流加密货币日K,预计 1-3 分钟,期间可继续浏览其他页面。
          </p>
          {isNoKey && (
            <p className="mt-1 text-[11px] text-warning/80 leading-relaxed">
              ⓘ 无需 API Key,当前为 None 档即可获取历史日K,可制定策略+回测。配置免费 Key 可解锁实时行情监控能力。
            </p>
          )}

          {isFetching ? (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-muted mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {isStarting ? '正在启动同步任务…' : stageText}
                </span>
                <span className="font-mono tabular">
                  {typeof fetchPct === 'number' ? `${Math.round(fetchPct)}%` : ''}
                </span>
              </div>
              <div className="h-1.5 bg-white/[.08] overflow-hidden">
                <motion.div
                  className="h-full bg-[#d5f021]"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(2, Math.min(100, fetchPct ?? 0))}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
            </div>
          ) : fetchFailed ? (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-danger">同步失败,请重试</span>
              <button
                onClick={onStart}
                className="cp-btn-solid inline-flex items-center gap-1.5 px-3 h-8 bg-[#d5f021] text-[#0d0b07] text-xs font-bold tracking-wider"
                style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%)' }}
              >
                <Play className="h-3.5 w-3.5" />重新获取
              </button>
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={onStart}
                className="cp-btn-solid inline-flex items-center gap-1.5 px-4 h-8 bg-[#d5f021] text-[#0d0b07] text-xs font-bold tracking-wider"
                style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 7px),calc(100% - 7px) 100%,0 100%)' }}
              >
                <Play className="h-3.5 w-3.5" />立即获取数据
              </button>
              <Link
                to="/data"
                className="inline-flex items-center gap-0.5 text-xs text-secondary hover:text-[#d5f021] transition-colors"
              >
                前往数据页
                <ArrowUpRight className="h-3 w-3 self-center" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== 首次使用自动弹窗: 询问用户后触发盘后管道 =====
function WelcomeFetchModal({
  isNoKey, onClose, onStart,
}: {
  isNoKey: boolean
  onClose: () => void
  onStart: () => void
}) {
  return (
    <SettingsModal title="欢迎首次使用 · 获取行情数据" onClose={onClose}>
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-fit bg-[rgba(213,240,33,.1)] p-3.5"
        >
          <Sparkles className="h-7 w-7 text-[#d5f021]" />
        </motion.div>
        <h3 className="mt-4 text-base font-semibold text-foreground">首次使用,需先获取行情数据</h3>
        <p className="mt-2 text-xs text-secondary leading-relaxed">
          系统将从免费数据源拉取近 1 年美股全市场日K与主流加密货币日K,预计 1-3 分钟。
          同步期间可继续浏览其他页面,完成后看板自动刷新。
        </p>
        {isNoKey && (
          <div className="mt-3 bg-white/[.06] px-3 py-2 text-[11px] text-muted leading-relaxed">
            ⓘ 当前无需 API Key,None 档即可获取历史日K数据。
          </div>
        )}
        <div className="mt-5 flex items-center justify-center gap-2.5">
          <button
            onClick={onClose}
            className="px-4 h-9 text-sm text-secondary hover:text-foreground hover:bg-white/[.06] transition-colors"
          >
            稍后再说
          </button>
          <button
            onClick={onStart}
            className="cp-btn-solid inline-flex items-center gap-2 px-5 h-9 bg-[#d5f021] text-[#0d0b07] text-sm font-bold tracking-wider"
            style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)' }}
          >
            <Play className="h-4 w-4" />开始获取
          </button>
        </div>
      </div>
    </SettingsModal>
  )
}
