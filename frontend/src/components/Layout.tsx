import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useQuoteStream } from '@/lib/useQuoteStream'
import { ToastContainer } from '@/components/Toast'
import { AlertToastContainer } from '@/components/AlertToast'
import { AiAnalysisHost } from '@/components/financials/AiAnalysisHost'
import { AiReportBubble } from '@/components/financials/AiReportBubble'
import { StockAnalysisHost } from '@/components/stock-analysis/StockAnalysisHost'
import { StockAnalysisBubble } from '@/components/stock-analysis/StockAnalysisBubble'
import {
  useCapabilities,
  useSettings,
  usePreferences,
  useQuoteStatus,
  useVersion,
} from '@/lib/useSharedQueries'
import {
  useToggleRealtimeQuotes,
} from '@/lib/useSharedMutations'
import { QK } from '@/lib/queryKeys'
import { tierRank } from '@/lib/capability-labels'
import {
  ScanSearch,
  History,
  FileText,
  Settings,
  Database,
  Loader2,
  LayoutDashboard,
  Tags,
  TrendingUp,
  BarChart3,
  RadioTower,
  CheckCircle2,
  BookOpenCheck,
  ExternalLink,
  Wallet,
} from 'lucide-react'
import { api, type IndexQuote } from '@/lib/api'
import { cn } from '@/lib/cn'
import { setCurrentTotal as setAlertTotal, useUnreadAlerts } from '@/lib/monitorBadge'
import { BoltGlyph } from '@/components/dashboard/glyphs'
import {
  DOWN, GOLD, INK, MONO, NEON, TXT_TITLE, TXT_WEAK, UP, clipBR,
} from '@/components/dashboard/tokens'

const TICKFLOW_REGISTER_URL = 'https://tickflow.org/auth/register?ref=V3KDKGXPEA'

/** 页面底色: 暗红氛围(右上) + 微黄氛围(左) + 深黑 #0b0908 (design_handoff_cyberpunk) */
const PAGE_BG =
  'radial-gradient(1000px 700px at 78% -10%,rgba(120,20,30,.18),transparent 60%),' +
  'radial-gradient(800px 600px at -5% 30%,rgba(213,240,33,.05),transparent 55%),#0b0908'

const CORE_INDEXES = [
  { symbol: 'SPY.US', name: '标普500ETF' },
  { symbol: 'QQQ.US', name: '纳指100ETF' },
  { symbol: 'BTCUSDT', name: '比特币' },
  { symbol: 'ETHUSDT', name: '以太坊' },
] as const

type CoreIndex = (typeof CORE_INDEXES)[number]

const nav = [
  { to: '/',                label: '看板',     icon: LayoutDashboard },
  { to: '/stock-analysis',    label: '个股分析', icon: TrendingUp },
  { to: '/portfolio',  label: '持仓组合', icon: Wallet },
  { to: '/screener',   label: '策略',   icon: ScanSearch },
  { to: '/backtest',   label: '回测',   icon: History },
  { to: '/financials', label: '财务分析', icon: FileText },
  { to: '/monitor', label: '监控中心', icon: RadioTower },
  { to: '/review',      label: '复盘',   icon: BookOpenCheck },
  { to: '/data',       label: '数据',   icon: Database },
] as const

function fmtIndexValue(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return '--'
  return Number(v).toFixed(2)
}

function fmtIndexPct(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return '--'
  return `${Number(v) >= 0 ? '+' : ''}${Number(v).toFixed(2)}%`
}

function indexPctClass(v: number | null | undefined) {
  if (v == null || Number.isNaN(Number(v))) return 'text-muted'
  const n = Number(v)
  if (n === 0) return 'text-foreground'
  return n > 0 ? 'text-bull' : 'text-bear'
}

/** 装饰边(18px 竖条带): 双平行竖线 + 亮黄光条段 + 方块标记 + 刻度线 */
function EdgeDeco({ side }: { side: 'sidebar' | 'main' }) {
  // sidebar: 贴侧边栏右缘, 元素靠 right 定位; main: 贴主区右缘(屏幕最右), 元素靠 left 定位(镜像)
  const pos = (v: number) => (side === 'sidebar' ? { right: v } : { left: v })
  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 18, pointerEvents: 'none', zIndex: 6 }}>
      <span style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'rgba(213,240,33,.45)', ...pos(2) }} />
      <span style={{ position: 'absolute', top: 0, bottom: 0, width: 1, background: 'rgba(213,240,33,.18)', ...pos(10) }} />
      <span style={{ position: 'absolute', top: '13%', width: 3, height: 175, background: NEON, boxShadow: '0 0 9px rgba(213,240,33,.55)', ...pos(8) }} />
      <span style={{ position: 'absolute', top: 'calc(13% + 192px)', width: 4, height: 4, background: NEON, opacity: .85, ...pos(8) }} />
      <span style={{ position: 'absolute', top: '56%', width: 4, height: 4, background: NEON, opacity: .85, ...pos(8) }} />
      <span style={{ position: 'absolute', top: 'calc(56% + 15px)', width: 2, height: 46, background: NEON, opacity: .9, ...pos(8.5) }} />
      <span style={{ position: 'absolute', top: '34%', width: 5, height: 1, background: 'rgba(213,240,33,.5)', ...pos(6) }} />
      <span style={{ position: 'absolute', top: '72%', width: 5, height: 1, background: 'rgba(213,240,33,.5)', ...pos(6) }} />
      {side === 'main' && (
        <span style={{ position: 'absolute', top: '80%', width: 3, height: 110, background: NEON, opacity: .7, boxShadow: '0 0 7px rgba(213,240,33,.4)', left: 8 }} />
      )}
    </div>
  )
}

/** 监控中心未读徽标 — 红色方块(CP), 仅在非监控页且有未读时显示。 */
function MonitorBadge({ active }: { active: boolean }) {
  const unread = useUnreadAlerts()
  // 尊重用户设置: 可在菜单设置里关闭数字提示
  const badgeEnabled = (() => {
    try { return localStorage.getItem('monitor_badge_enabled') !== '0' } catch { return true }
  })()
  if (active || unread <= 0 || !badgeEnabled) return null
  return (
    <span
      className="animate-pulse shrink-0"
      style={{
        minWidth: 15, height: 15, padding: '0 3px', background: DOWN,
        color: INK, fontSize: 9.5, fontWeight: 700, display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: MONO,
      }}
    >
      {unread > 99 ? '99+' : unread}
    </span>
  )
}

/** BETA 徽章(个股分析 / 复盘) — 激活项(黄底)反色 */
function BetaBadge({ active }: { active?: boolean }) {
  return (
    <span
      className="shrink-0"
      style={{
        fontSize: 8.5, fontWeight: 700, letterSpacing: 1, fontFamily: MONO, padding: '1.5px 5px',
        ...(active
          ? { color: NEON, background: INK }
          : { color: NEON, border: '1px solid rgba(213,240,33,.4)' }),
      }}
    >
      BETA
    </span>
  )
}

function SidebarIndexQuotes({ rows, items }: { rows: IndexQuote[] | undefined; items: CoreIndex[] }) {
  if (items.length === 0) return null
  const quoteBySymbol = new Map((rows ?? []).map(q => [q.symbol, q]))
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {items.map(item => {
        const q = quoteBySymbol.get(item.symbol)
        const value = q?.last_price ?? q?.close
        const pct = q?.change_pct
        return (
          <NavLink
            key={item.symbol}
            to={`/stock-analysis?symbol=${encodeURIComponent(item.symbol)}&name=${encodeURIComponent(item.name)}`}
            className="block px-2 py-1.5 transition-colors hover:bg-[rgba(213,240,33,.08)]"
            style={{ background: 'rgba(213,240,33,.04)', border: '1px solid rgba(213,240,33,.14)' }}
            title={`${item.name} ${item.symbol}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px]" style={{ color: '#b8b4a0' }}>{item.name}</span>
              <span className={`text-[10px] font-mono ${indexPctClass(pct)}`}>{fmtIndexPct(pct)}</span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[10px]" style={{ color: '#e8e6d8' }}>
              {fmtIndexValue(value)}
            </div>
          </NavLink>
        )
      })}
    </div>
  )
}

// ===== Followin 入口卡(实时数据源) — 黄描边切角块 =====
function FollowinBadge({ enabled, hasKey }: { enabled?: boolean; hasKey?: boolean }) {
  const active = !!enabled && !!hasKey
  const desc = !hasKey
    ? '未配置 · 点此接入实时数据'
    : !enabled
      ? '已关闭 · 点此启用数据源'
      : '实时行情 · 新闻 · 信号'
  const badge = !hasKey ? '未配置' : enabled ? '已启用' : '已关闭'

  return (
    <NavLink
      to="/settings?tab=followin"
      title="Followin 实时数据源"
      className="group block"
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
        border: '1px solid rgba(213,240,33,.4)', background: 'rgba(213,240,33,.05)',
        clipPath: clipBR(9), textDecoration: 'none',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={NEON} strokeWidth="2" strokeLinecap="round" style={{ flex: 'none' }}>
        <path d="M4 11a9 9 0 0 1 9 9" />
        <path d="M4 4a16 16 0 0 1 16 16" />
        <circle cx="5" cy="19" r="1.4" fill={NEON} stroke="none" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: TXT_TITLE, letterSpacing: 1 }}>
          FOLLOWIN
          {active && (
            <span
              className="animate-pulse"
              style={{ width: 5, height: 5, background: NEON, boxShadow: '0 0 6px rgba(213,240,33,.8)' }}
            />
          )}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 8.5, color: TXT_WEAK, letterSpacing: .5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</div>
      </div>
      <span
        className="shrink-0"
        style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 700, color: active ? NEON : TXT_WEAK,
          border: `1px solid ${active ? 'rgba(213,240,33,.5)' : 'rgba(150,150,120,.35)'}`, padding: '1px 6px',
          maxWidth: 68, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {badge}
      </span>
      <Settings className="h-[13px] w-[13px] shrink-0 text-[#6a6754] group-hover:text-[#d5f021] transition-colors" />
    </NavLink>
  )
}

// ===== AI 配置入口卡 — 青描边切角块 =====
function AIConfigBadge({ configured, model }: { configured?: boolean; model?: string }) {
  return (
    <NavLink
      to="/settings?tab=ai"
      title="AI 配置"
      className="group block"
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px',
        border: '1px solid rgba(94,242,228,.3)', background: 'rgba(94,242,228,.03)',
        clipPath: clipBR(9), textDecoration: 'none',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={UP} strokeWidth="1.8" strokeLinecap="square" style={{ flex: 'none' }}>
        <path d="M12 3c.5 4.5 3 7 7 7.5-4 .5-6.5 3-7 7.5-.5-4.5-3-7-7-7.5 4-.5 6.5-3 7-7.5z" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#c9e8e4', letterSpacing: 1 }}>
          AI 配置
          <span style={{ width: 5, height: 5, background: configured ? NEON : GOLD }} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 8.5, color: TXT_WEAK, letterSpacing: .5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {configured ? (model || '已接入模型') : '接入策略生成模型'}
        </div>
      </div>
      <Settings className="h-[13px] w-[13px] shrink-0 text-[#6a6754] group-hover:text-[#5ef2e4] transition-colors" />
    </NavLink>
  )
}

export function Layout() {
  // ===== 共享 hooks (替代内联 useQuery) =====
  const { data: caps } = useCapabilities()
  const { data: settingsState } = useSettings()
  const { data: versionData } = useVersion()
  const { data: prefs } = usePreferences()
  // poll=true: 全局唯一开启条件轮询 (非交易时段 60s 兜底, 交易时段靠 SSE)
  const { data: quoteStatus } = useQuoteStatus({ poll: true })
  const { data: analysisMenus } = useQuery({
    queryKey: QK.analysisMenus,
    queryFn: api.analysisMenus,
  })

  // 数据同步状态轮询: 有活跃 job 时「数据」菜单项显示转圈
  const { data: pipelineJobs } = useQuery({
    queryKey: QK.pipelineJobs,
    queryFn: () => api.pipelineJobs(1),
    refetchInterval: (query) => (query.state.data?.active_id ? 2000 : 15000),
    refetchIntervalInBackground: true,
  })
  const isDataSyncing = !!pipelineJobs?.active_id

  // 数据同步完成的"瞬时反馈": isDataSyncing 从 true→false 时显示对勾,
  // 闪烁约 3 秒后自动消失。
  const [dataSyncJustDone, setDataSyncJustDone] = useState(false)
  const prevSyncingRef = useRef(false)
  useEffect(() => {
    // 仅在"刚结束"(true→false)且非首次挂载时触发
    if (prevSyncingRef.current && !isDataSyncing) {
      setDataSyncJustDone(true)
      const t = setTimeout(() => setDataSyncJustDone(false), 3000)
      prevSyncingRef.current = isDataSyncing
      return () => clearTimeout(t)
    }
    prevSyncingRef.current = isDataSyncing
  }, [isDataSyncing])

  const qc = useQueryClient()
  const navigate = useNavigate()
  const version = versionData?.version
  const realtimeEnabled = prefs?.realtime_quotes_enabled ?? false
  const indicesPinned = prefs?.indices_nav_pinned ?? true
  const sidebarIndexSymbols = prefs?.sidebar_index_symbols ?? CORE_INDEXES.map(p => p.symbol)
  const sidebarIndexes = CORE_INDEXES.filter(item => sidebarIndexSymbols.includes(item.symbol))
  // 卡片数据：固定显示时也拉取（即使实时行情关闭）
  const showSidebarQuotes = indicesPinned || realtimeEnabled
  const { data: sidebarIndexQuotes } = useQuery({
    queryKey: [...QK.indexQuotes, 'sidebar', sidebarIndexSymbols.join(',')] as const,
    queryFn: () => api.indexQuotes(sidebarIndexes.map(p => p.symbol)),
    enabled: showSidebarQuotes && sidebarIndexes.length > 0,
    placeholderData: (prev) => prev,
  })

  // SSE: 行情更新时自动刷新相关 queries + 告警通知
  useQuoteStream(realtimeEnabled, prefs?.sse_refresh_pages)

  const toggleQuote = useToggleRealtimeQuotes()
  const isRunning = quoteStatus?.running ?? false
  const isTrading = quoteStatus?.is_trading_hours ?? false
  const tier = tierRank(caps?.label ?? '')
  const isNoneTier = tier < 0
  const isWatchlistMode = tier === 0
  const realtimeModeLabel = isWatchlistMode ? '自选股' : '全市场'

  // 轮询触发记录总数 → 更新监控中心徽标 (每 15 秒)
  const alertsTotalQuery = useQuery({
    queryKey: ['alerts-total'],
    queryFn: () => api.alertsList({ days: 7, limit: 1 }),
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    select: (data) => data.total,
  })
  // 只在拿到真实总数时同步徽标 (避免 data=undefined 时传 0 重置 lastSeen)
  const alertsTotal = alertsTotalQuery.data
  useEffect(() => {
    if (alertsTotal != null) setAlertTotal(alertsTotal)
  }, [alertsTotal])

  // 合并内置页面 + 可见的扩展分析菜单
  const analysisNav = (analysisMenus?.items ?? [])
    .filter(m => m.visible)
    .map(m => ({ to: `/analysis/${m.id}`, label: m.label, icon: m.icon === 'tags' ? Tags : BarChart3 }))

  const allNav = [...nav, ...analysisNav]
  const savedOrder = prefs?.nav_order ?? []

  const navItems = savedOrder.length > 0
    ? (() => {
        const byTo = new Map(allNav.map(n => [n.to, n]))
        const ordered = savedOrder
          .map(id => byTo.get(id) ?? byTo.get(`/analysis/${id}`))
          .filter(Boolean)
        const seen = new Set(ordered.map(n => n!.to))
        return [...ordered as typeof allNav, ...allNav.filter(n => !seen.has(n.to))]
      })()
    : allNav

  const hiddenIds = new Set(prefs?.nav_hidden ?? [])
  const visibleNavItems = navItems.filter(n => !hiddenIds.has(n.to) && !hiddenIds.has(n.to.replace(/^\/analysis\//, '')))

  const handleToggle = async (enabled: boolean) => {
    // 开启时重新校验档位
    if (enabled) {
      const fresh = await qc.fetchQuery({
        queryKey: QK.capabilities,
        queryFn: api.capabilities,
      })
      const freshTier = tierRank(fresh.label ?? '')
      if (freshTier < 0) return
      if (freshTier === 0 && (prefs?.realtime_watchlist_symbols?.length ?? 0) === 0) {
        navigate('/watchlist')
        return
      }
    }
    await toggleQuote.mutateAsync(enabled)
    // 仅在交易时段立即获取一次行情
    if (enabled && isTrading) {
      api.intradayRefresh().catch(() => {})
    }
  }

  const quoteDotStyle = realtimeEnabled && isRunning && isTrading
    ? { background: NEON, boxShadow: '0 0 8px rgba(213,240,33,.8)' }
    : realtimeEnabled
      ? { background: GOLD }
      : { background: '#6a6754' }

  return (
    <div
      className="h-screen grid grid-cols-[244px_1fr] text-foreground overflow-hidden"
      style={{ background: PAGE_BG, position: 'relative' }}
    >
      {/* 全页背景点阵 */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'radial-gradient(rgba(213,240,33,.3) 1.1px,transparent 1.8px)',
          backgroundSize: '72px 66px', backgroundPosition: '30px 26px',
        }}
      />
      {/* 扫描光: 90px 微黄横带 9s 从上往下循环 */}
      <div
        className="cpfx"
        style={{
          position: 'absolute', left: 0, right: 0, height: 90, pointerEvents: 'none', zIndex: 29,
          background: 'linear-gradient(180deg,transparent,rgba(213,240,33,.03),transparent)',
          animation: 'cpScan 9s linear infinite',
        }}
      />
      {/* 主区右缘装饰边 */}
      <EdgeDeco side="main" />

      <aside
        className="flex h-full min-h-0 flex-col overflow-hidden"
        style={{ background: '#0d0b07', padding: '16px 22px 12px 14px', position: 'relative', zIndex: 2 }}
      >
        {/* 侧边栏右缘装饰边 */}
        <EdgeDeco side="sidebar" />

        {/* ===== 品牌区: 黄色切角闪电 logo + ALPHAFLOW ===== */}
        <div className="shrink-0">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 2px' }}>
            <div
              style={{
                width: 38, height: 38, flex: 'none', background: NEON,
                clipPath: 'polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <BoltGlyph size={20} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, fontSize: 18, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                <span style={{ color: TXT_TITLE }}>Alpha</span>
                <span style={{ color: NEON, textShadow: '0 0 10px rgba(213,240,33,.6)' }}>Flow</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: INK, background: NEON, padding: '1px 5px', letterSpacing: 1 }}>US</span>
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: UP, border: '1px solid rgba(94,242,228,.5)', padding: '0 5px', letterSpacing: 1 }}>CRYPTO</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 2px 0' }}>
            <span style={{ height: 2, flex: 1, background: 'linear-gradient(90deg,#d5f021,transparent)' }} />
            <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 3.5, color: TXT_WEAK, whiteSpace: 'nowrap' }}>QUANT TERMINAL</span>
          </div>
          <div style={{ height: 1, background: 'rgba(213,240,33,.14)', margin: '13px 0' }} />

          {/* ===== 入口卡 ×2 ===== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <FollowinBadge
              enabled={settingsState?.followin_enabled ?? true}
              hasKey={settingsState?.has_followin_key}
            />
            <AIConfigBadge
              configured={settingsState?.ai_configured ?? settingsState?.has_ai_key}
              model={settingsState?.ai_model}
            />
          </div>
        </div>

        {/* ===== 主导航 ===== */}
        <nav
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 15, paddingBottom: 8 }}
        >
          {visibleNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn('dash-nav', isActive && 'dash-nav-active')}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 11, padding: '8px 11px',
                fontSize: 13.5, letterSpacing: 1, textDecoration: 'none',
                ...(isActive
                  ? {
                      fontWeight: 700, color: INK, background: NEON,
                      clipPath: clipBR(8),
                      boxShadow: '0 0 22px rgba(213,240,33,.25)',
                    }
                  : { fontWeight: 600, color: TXT_WEAK }),
              })}
            >
              {({ isActive }) => (
                <>
                  <Icon className="h-[15px] w-[15px] shrink-0" />
                  <span className="flex-1">{label}</span>
                  {/* 个股分析 / 复盘 Beta 标识 */}
                  {(to === '/stock-analysis' || to === '/review') && <BetaBadge active={isActive} />}
                  {/* 数据同步状态: 同步中转圈, 刚完成显示对勾闪烁 3 秒 */}
                  {to === '/data' && isDataSyncing && (
                    <Loader2 className={cn('h-3.5 w-3.5 shrink-0 animate-spin', isActive ? 'text-[#0d0b07]' : 'text-[#d5f021]')} />
                  )}
                  {to === '/data' && !isDataSyncing && dataSyncJustDone && (
                    <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0 animate-pulse', isActive ? 'text-[#0d0b07]' : 'text-[#d5f021]')} />
                  )}
                  {/* 监控中心徽标: 仅非监控页且有未读时显示 */}
                  {to === '/monitor' && <MonitorBadge active={isActive} />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ===== 底部机读装饰(设计稿 RX 读数 + CUSTOM GLITCHES 微文) ===== */}
        <div className="shrink-0" style={{ display: 'flex', alignItems: 'stretch', gap: 7, padding: '0 2px 7px' }}>
          <span style={{ width: 1, background: 'rgba(213,240,33,.45)' }} />
          <div style={{ fontFamily: MONO, fontSize: 8, fontWeight: 500, color: 'rgba(213,240,33,.75)', lineHeight: 1.65, letterSpacing: 1 }}>
            <span style={{ background: 'rgba(213,240,33,.2)', padding: '0 3px' }}>▤</span> RX 4<br />43.<br />R0. PX V
          </div>
          <div style={{ flex: 1, fontFamily: MONO, fontSize: 7.5, color: '#4a4738', lineHeight: 1.7, letterSpacing: .5, alignSelf: 'flex-end' }}>
            CUSTOM GLITCHES ON UI MAY APPEAR.<br />TYPE: CYBERSPACE // DOC/0/QUANT
          </div>
        </div>

        {/* ===== 全局行情开关 ===== */}
        <div className="shrink-0" style={{ borderTop: '1px solid rgba(213,240,33,.14)', padding: '8px 4px' }}>
          {isNoneTier ? (
            <div>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 1, color: TXT_WEAK }}>实时行情</span>
                <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: NEON, border: '1px solid rgba(213,240,33,.4)', padding: '1px 6px', letterSpacing: 1 }}>
                  FREE+
                </span>
              </div>
              <div className="mt-1.5 text-[10px] leading-snug" style={{ color: TXT_WEAK }}>
                免费注册
                <a
                  href={TICKFLOW_REGISTER_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mx-1 inline-flex items-baseline gap-0.5 hover:underline"
                  style={{ color: NEON }}
                >
                  TickFlow
                  <ExternalLink className="h-2.5 w-2.5 self-center" />
                </a>
                开启个股监控
              </div>
            </div>
          ) : (
            /* Free+ — 开关 + 跳转设置 */
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className="cpfx"
                style={{
                  width: 7, height: 7, flex: 'none', ...quoteDotStyle,
                  ...(realtimeEnabled && isRunning && isTrading ? { animation: 'cpBlink 1.6s steps(1) infinite' } : {}),
                }}
              />
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: 1, color: TXT_WEAK, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                实时行情 · {realtimeModeLabel}
              </span>
              <button
                onClick={() => navigate('/settings?tab=monitoring')}
                className="shrink-0 text-[#6a6754] hover:text-[#b8b4a0] transition-colors"
                title="实时监控设置"
              >
                <Settings className="h-3 w-3" />
              </button>
              <button
                onClick={() => handleToggle(!realtimeEnabled)}
                disabled={toggleQuote.isPending}
                style={{
                  width: 32, height: 17, flex: 'none', position: 'relative',
                  background: realtimeEnabled ? 'rgba(213,240,33,.2)' : 'rgba(232,230,216,.07)',
                  border: `1px solid ${realtimeEnabled ? 'rgba(213,240,33,.5)' : 'rgba(232,230,216,.18)'}`,
                  cursor: toggleQuote.isPending ? 'default' : 'pointer',
                  opacity: toggleQuote.isPending ? 0.5 : 1,
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: 2, width: 11, height: 11,
                    left: realtimeEnabled ? 17 : 2,
                    background: realtimeEnabled ? NEON : '#6a6754',
                    boxShadow: realtimeEnabled ? '0 0 6px rgba(213,240,33,.6)' : 'none',
                    transition: 'left .2s, background .2s',
                  }}
                />
              </button>
            </div>
          )}

          {/* 状态提示 */}
          {realtimeEnabled && !isNoneTier && (
            <div className="mt-1.5 text-[10px] leading-snug" style={{ fontFamily: MONO }}>
              {isRunning && isTrading ? (
                <span style={{ color: NEON }}>{'// 行情运行中'}</span>
              ) : realtimeEnabled && !isTrading ? (
                <span className="text-warning/80">{'// 美股非交易时段(加密持续拉取)'}</span>
              ) : null}
            </div>
          )}
          {showSidebarQuotes && !isWatchlistMode && !isNoneTier && (
            <SidebarIndexQuotes rows={sidebarIndexQuotes?.rows} items={sidebarIndexes} />
          )}
        </div>

        {/* ===== 设置 + 版本号 ===== */}
        <div className="shrink-0" style={{ borderTop: '1px solid rgba(213,240,33,.14)', padding: '6px 0 0' }}>
          <NavLink
            to="/settings"
            className={({ isActive }) => cn('dash-nav', isActive && 'dash-nav-active')}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 6px',
              fontSize: 13, letterSpacing: 1, textDecoration: 'none',
              color: isActive ? NEON : TXT_WEAK, fontWeight: 600,
            })}
          >
            <Settings className="h-[15px] w-[15px] shrink-0" />
            <span className="flex-1">设置</span>
            <span className="select-none" style={{ fontSize: 9.5, color: '#4a4738', fontFamily: MONO }}>
              {version ?? ''}
            </span>
          </NavLink>
        </div>
      </aside>

      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="h-full overflow-auto scrollbar-gutter-stable"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <Outlet />
      </motion.main>
      <ToastContainer />
      <AlertToastContainer />
      <AiAnalysisHost />
      <AiReportBubble />
      <StockAnalysisHost />
      <StockAnalysisBubble />
    </div>
  )
}
