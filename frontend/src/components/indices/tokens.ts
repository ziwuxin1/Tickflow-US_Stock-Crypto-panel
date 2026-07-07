/**
 * 指数页设计 tokens — 来源: design_handoff_index_page(与市场看板共享全局 tokens)。
 * 仅收录指数页专属色值; 荧光绿/文字层级复用 dashboard/tokens。
 */
export {
  NEON, NEON_BRIGHT, NEON_HI, MONO,
  TXT_TITLE, TXT_BODY, TXT_SECONDARY, TXT_WEAK, TXT_WEAKER, TXT_FAINT, TXT_FAINTEST,
  ETF_BADGES, COIN_COLOR, COIN_COLOR_DEFAULT, coinBase,
} from '@/components/dashboard/tokens'

// ===== 涨跌(Cyberpunk 主题: 青涨红跌, 与 lib/palette 同值) =====
export const UP = '#5ef2e4'
export const DOWN = '#f75049'

// ===== K线均线 =====
export const MA_COLORS = {
  ma5: '#d8dce8',
  ma10: '#4d8df0',
  ma20: '#f0923c',
  ma60: '#9b6df0',
} as const

// ===== 成交量均线 =====
export const VOL5_COLOR = '#e8d44d'
export const VOL10_COLOR = '#9b6df0'

// ===== MACD =====
export const DIF_COLOR = '#e8d44d'
export const DEA_COLOR = '#9b6df0'

// ===== 信号标注 =====
export const FIB_GOLD = '#e8c84d'
export const FIB_GRAY = '#8a91a8'
export const SIG_BREAK = '#e86a8a'   // 跌破目标(品红)
export const SIG_REBOUND = '#4dd8e8' // 反弹目标(青)
export const WAVE_LINE = '#cfd6e4'
export const WAVE_DOT_BG = '#10142e'
export const WAVE_DOT_FG = '#f2f4fa'
export const WAVE_SEQ = '#5b8df0'

// ===== 三角区(收敛三角形) =====
export const TRI_LINE = '#e8a44d'
export const TRI_FILL = 'rgba(232,164,77,.09)'

// ===== 分时紫系(Gemini 风格) =====
export const I_PURPLE = '#b18cff'
export const I_LINE_STOPS = ['#a596e8', '#bfa4ff', '#e6dbff'] as const
export const I_DOT_STROKE = '#b89cff'
export const I_RIPPLE = '#a98cf5'
export const I_TAB_GRAD = 'linear-gradient(135deg,#b18cff,#8266d6)'

// ===== 图表几何(设计稿 viewBox 基准) =====
/** K 主图: 高 378px 视口 470 单位 */
export const K_VH = 470
export const K_PX_H = 378
/** K 副图(成交量/MACD): 高 96px 视口 110 单位 */
export const SUB_VH = 110
export const SUB_PX_H = 96
/** 分时主图: 高 474px 视口 440 单位 */
export const I_VH = 440
export const I_PX_H = 474
/** 分时成交量: 高 104px 视口 110 单位 */
export const IV_VH = 110
export const IV_PX_H = 104

export const GRID_STROKE = 'rgba(213,240,33,.06)'
export const AXIS_TEXT = '#8f8c7a'
export const AXIS_TEXT_DIM = '#6a6754'
