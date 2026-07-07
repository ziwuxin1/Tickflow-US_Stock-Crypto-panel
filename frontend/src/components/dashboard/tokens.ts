/**
 * 市场看板设计 tokens — 来源: design_handoff_cyberpunk(Cyberpunk 2077 主题)。
 * 涨跌色走 CSS variables(--up/--down 系列, 注入 index.css), 其余为设计稿定值。
 */

// ===== 酸性黄主色 =====
export const NEON = '#d5f021'
export const NEON_BRIGHT = '#eefb8a'
export const NEON_HI = '#eefb8a'
export const NEON_DIM = '#a8b830'
export const NEON_DEEP = '#6a7a1a'

// ===== 涨跌 / 语义色 =====
export const UP = '#5ef2e4'
export const DOWN = '#f75049'
export const GOLD = '#d9a531'

// ===== 文字 =====
export const TXT_TITLE = '#e8e6d8'
export const TXT_CARD_TITLE = 'rgba(213,240,33,.9)'
export const TXT_BODY = '#e8e6d8'
export const TXT_SECONDARY = '#b8b4a0'
export const TXT_WEAK = '#8f8c7a'
export const TXT_WEAKER = '#8f8c7a'
export const TXT_FAINT = '#6a6754'
export const TXT_FAINTEST = '#4a4738'

// ===== 面板 / 底色 =====
export const INK = '#0d0b07'                       // 黄底上的黑字 / 侧边栏底
export const PANEL_BG = 'rgba(16,14,9,.72)'        // 面板底
export const SUB_BG = '#0e100c'                    // 子块底(perk 卡)
export const SUB_BG2 = '#12100a'                   // 子块底(行卡)
export const ICON_BG = '#17140d'                   // 图标深底
export const PANEL_BD = '1px solid rgba(213,240,33,.22)'
export const PANEL_BD_STRONG = '1px solid rgba(213,240,33,.3)'
export const PANEL_BD_HI = '1.5px solid rgba(213,240,33,.85)'
export const DIVIDER = '1px solid rgba(213,240,33,.18)'

// ===== 切角 clip-path 助手(CP 形状语言) =====
/** 右下切角 */
export const clipBR = (n = 9) =>
  `polygon(0 0,100% 0,100% calc(100% - ${n}px),calc(100% - ${n}px) 100%,0 100%)`
/** 左上切角(黄色标题栏) */
export const clipTL = (n = 11) =>
  `polygon(${n}px 0,100% 0,100% 100%,0 100%,0 ${n}px)`
/** 左下切角(协议块) */
export const clipBL = (n = 10) =>
  `polygon(0 0,100% 0,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`

// ===== 品牌色 =====
export const BTC_ORANGE = '#f7931a'
export const BTC_ORANGE_TOP = '#ffb14d'
export const ETH_BLUE = '#627eea'
export const ETH_BLUE_TOP = '#8fa5f5'

export const MONO = "'JetBrains Mono',ui-monospace,monospace"

// ===== 阴影(CP 无玻璃投影, 保留导出兼容) =====
export const CARD_SHADOW = 'none'
export const STAT_SHADOW = 'none'

// ===== 涨跌分布热力色带(8 根柱, 红→黄→青, 来自设计稿 cols) =====
export const HEAT_BINS = [
  { grad: 'linear-gradient(180deg,#f75049,#a82018)', num: '#f75049' }, // <-5%
  { grad: 'linear-gradient(180deg,#f0704a,#c43a20)', num: '#f0704a' }, // -5~-3%
  { grad: 'linear-gradient(180deg,#e8944a,#c46a10)', num: '#e8944a' }, // -3~-1%
  { grad: 'linear-gradient(180deg,#d9b437,#a8841a)', num: '#d9b437' }, // -1~0%
  { grad: 'linear-gradient(180deg,#d5f021,#9ab410)', num: '#d5f021' }, // 0~1%
  { grad: 'linear-gradient(180deg,#a8e83a,#6aa818)', num: '#a8e83a' }, // 1~3%
  { grad: 'linear-gradient(180deg,#6ee89a,#2ea858)', num: '#6ee89a' }, // 3~5%
  { grad: 'linear-gradient(180deg,#5ef2e4,#1fa89a)', num: '#5ef2e4' }, // >5%
] as const

// ===== 液体对比条渐变(兼容保留, CP 用斜纹量条) =====
export const LIQUID_UP_GRAD = 'linear-gradient(104deg,#8ff5e8,#2fc4b6)'
export const LIQUID_DOWN_GRAD = 'linear-gradient(60deg,#f88a80,#d93a30)'

// ===== ETF 徽标(设计稿 140deg 双色渐变) =====
export const ETF_BADGES: Record<string, { tag: string; bg: string }> = {
  'SPY.US': { tag: 'SP', bg: 'linear-gradient(140deg,#6a86e8,#4258b8)' },
  'QQQ.US': { tag: 'NQ', bg: 'linear-gradient(140deg,#9a7ae8,#6a48c4)' },
  'DIA.US': { tag: 'DJ', bg: 'linear-gradient(140deg,#5fc49a,#2e8a64)' },
  'IWM.US': { tag: 'RU', bg: 'linear-gradient(140deg,#e89a5a,#b25a1a)' },
}

// ===== 币种首字母徽章底色(icon 加载失败回退) =====
export const COIN_COLOR: Record<string, string> = {
  BTC: '#f7931a', ETH: '#627eea', SOL: '#9945ff', XRP: '#3b4149', BNB: '#f3ba2f',
  ZEC: '#f4b728', USD1: '#3aa66a', UNI: '#ff007a', DOGE: '#c2a633', ADA: '#0d1e30',
  AVAX: '#e84142', DOT: '#e6007a', LINK: '#2a5ada', TRX: '#eb0029', LTC: '#345d9d',
  HYPE: '#17d3c4', ARB: '#2d374b', OP: '#ff0420', APT: '#3fc9c4', ATOM: '#6f7390',
  FIL: '#0090ff', LEO: '#f5a623',
}
export const COIN_COLOR_DEFAULT = '#3a3f2e'
/** 徽章底色偏亮 → 用深色字 */
export const COIN_DARK_TEXT = new Set(['BNB', 'ZEC', 'DOGE', 'HYPE'])

/** 加密 symbol 去除计价后缀: BTCUSDT → BTC */
export function coinBase(symbol: string): string {
  return symbol.replace(/(USDT|USDC|USD|BUSD)$/i, '') || symbol
}
