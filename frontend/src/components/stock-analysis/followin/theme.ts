/**
 * Followin 智能体控制台 —— 样式助手与领域常量(纯函数/常量,无 JSX)。
 * 颜色/切角/工具名与设计交接稿 docs/design-handoff/followin-agent 对齐。
 */
import type { FollowinAgent } from '@/lib/api'

/** 智能体身份 6 色板(与后端 AGENT_COLORS 一致)。 */
export const AGENT_COLORS = ['#d5f021', '#5ef2e4', '#f75049', '#d9a531', '#c98af0', '#4fd08a'] as const

/** 主色。 */
export const YELLOW = '#d5f021'
export const CYAN = '#5ef2e4'

/** 右下切角 clip-path(N=切角像素)。 */
export const chamfer = (n = 10): string =>
  `polygon(0 0, 100% 0, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, 0 100%)`

/** 头像切角(右下大切)。 */
export const avatarClip = 'polygon(0 0, 100% 0, 100% 66%, 66% 100%, 0 100%)'

/** hex(#rrggbb) + alpha → rgba() 字符串,用于按身份色生成描边/泛光。 */
export function hexA(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 名称首字符(智能体头像)。 */
export const firstChar = (name: string): string => (name || '?').trim().charAt(0).toUpperCase() || '?'

/** Followin 工具 → 中文短名(报告 SRC / 技能摘要展示用)。 */
export const TOOL_CN: Record<string, string> = {
  news: '新闻',
  metrics: '行情',
  signal: '信号',
  twitter: 'X情报',
  subscription: '订阅',
}

/** 历史领域 tag → 颜色。 */
export const TAG_COLOR: Record<string, string> = {
  加密: '#d5f021',
  美股: '#5ef2e4',
  链上: '#c98af0',
  宏观: '#d9a531',
  衍生品: '#f75049',
  新闻: '#4fd08a',
}

const CRYPTO_SYMS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'TON', 'TRX', 'LTC', 'BCH', 'SHIB', 'PEPE', 'USDT', 'USDC', 'WIF']

/** 是否加密标的名。 */
export function isCryptoName(s: string): boolean {
  const up = (s || '').toUpperCase()
  return CRYPTO_SYMS.some(c => up.includes(c)) || /比特币|以太坊|加密|狗狗/.test(s || '')
}

/** 从提问里认出实体:优先大写 ticker(BTC/NVDA),认不出返回 undefined。 */
export function subjectOf(text: string): string | undefined {
  const m = (text || '').match(/(?<![A-Za-z])[A-Z]{2,6}(?![A-Za-z])/)
  return m ? m[0] : undefined
}

/** 空态领域建议卡(设计稿 suggMap):图标字 + 标题 + 副标分类 + 身份色。点击发送 label。 */
export interface SuggestCard { label: string; sub: string; glyph: string; color: string }

const SUGG_MAP: Record<string, SuggestCard[]> = {
  美股组: [
    { label: '英伟达财报前瞻', sub: 'US · NVDA', glyph: 'N', color: '#5ef2e4' },
    { label: '美股三大指数今日', sub: 'INDEX', glyph: '▲', color: '#f75049' },
    { label: '特斯拉周度交付量', sub: 'US · TSLA', glyph: 'T', color: '#d9a531' },
    { label: '苹果估值与目标价', sub: 'PE · 目标价', glyph: 'A', color: '#5ef2e4' },
  ],
  加密货币组: [
    { label: 'BTC 现在多少钱?', sub: 'REALTIME · QUOTE', glyph: '$', color: '#d9a531' },
    { label: '今日加密市场情绪', sub: 'SENTIMENT', glyph: '◈', color: '#d5f021' },
    { label: 'ETH 质押收益率', sub: 'ONCHAIN', glyph: 'E', color: '#5ef2e4' },
    { label: 'SOL 生态热门代币', sub: 'CRYPTO', glyph: 'S', color: '#c98af0' },
  ],
  新闻组: [
    { label: '全市场实时快讯', sub: 'REALTIME', glyph: '⚡', color: '#f75049' },
    { label: '今日热点话题聚合', sub: 'TOPICS', glyph: '◆', color: '#d5f021' },
    { label: '美联储最新表态', sub: 'MACRO · NEWS', glyph: 'F', color: '#5ef2e4' },
    { label: '加密圈 KOL 观点', sub: 'KOL', glyph: 'K', color: '#d9a531' },
  ],
  信号策略组: [
    { label: '内部人交易信号', sub: 'FORM 4 · SENATE', glyph: '▚', color: '#4fd08a' },
    { label: '顶级交易员实盘', sub: 'LIVE POSITION', glyph: '⚑', color: '#d5f021' },
    { label: '本周高胜率策略', sub: 'STRATEGY', glyph: '◭', color: '#5ef2e4' },
    { label: '链上巨鲸持仓变动', sub: 'ONCHAIN', glyph: '◇', color: '#c98af0' },
  ],
}

const SUGG_FALLBACK: SuggestCard[] = [
  { label: '今日市场概览', sub: 'OVERVIEW', glyph: '◎', color: '#d5f021' },
  { label: '热点新闻聚合', sub: 'NEWS', glyph: '◆', color: '#5ef2e4' },
  { label: '关键数据日历', sub: 'CALENDAR', glyph: '▤', color: '#d9a531' },
  { label: '异动信号扫描', sub: 'SIGNAL', glyph: '▚', color: '#f75049' },
]

/** 按智能体分组取空态建议卡;未知分组用 fallback。 */
export function suggestCards(agent: FollowinAgent | undefined): SuggestCard[] {
  return SUGG_MAP[agent?.group || ''] || SUGG_FALLBACK
}

/**
 * 按智能体所属分组 + 当前标的,生成「点了就搜」的领域相关快捷问(4 条)。
 * 用于报告卡底部的快捷问 chips(与空态结构卡区分)。
 */
export function suggestFor(agent: FollowinAgent | undefined, subject: string): string[] {
  const disp = subject || '当前标的'
  const group = agent?.group || ''
  const crypto = isCryptoName(disp) || group.includes('加密')
  if (group.includes('新闻')) return [
    `${disp} 最新消息`,
    '今天市场有什么大新闻?',
    '当前热点话题有哪些?',
    crypto ? '加密市场有什么热点?' : '美联储 / 宏观 最新动态',
  ]
  if (group.includes('信号')) return [
    `${disp} 谁在买 / 谁在喊单?`,
    crypto ? `${disp} 交易员多空仓位` : `${disp} 内部人最近有买卖吗?`,
    crypto ? `${disp} 大户和 KOL 怎么看?` : `${disp} 机构(13F)持仓变化`,
    `${disp} 市场情绪如何?`,
  ]
  if (crypto) return [
    `${disp} 现在多少钱?`,
    `${disp} 技术面怎么样?`,
    `${disp} 最近走势`,
    `${disp} 关键支撑压力`,
  ]
  // 美股组 / 默认
  return [
    `${disp} 现在多少钱?`,
    `${disp} 估值贵不贵?`,
    `${disp} 最新财报怎么样?`,
    `${disp} 分析师目标价`,
  ]
}
