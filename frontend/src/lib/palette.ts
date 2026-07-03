/**
 * 图表共享色板 — 美股/加密惯例：绿涨红跌。
 *
 * ECharts / canvas 图表无法读 CSS variables，硬编码 hex 统一收敛到本模块，
 * 与 index.css 的 --bull/--bear token 保持同色值。
 */

/** 上涨 / 阳线 — 绿 */
export const BULL = '#12B76A'
/** 下跌 / 阴线 — 红 */
export const BEAR = '#F04438'

/** 半透明变体（成交量柱 / 面积填充） */
export const BULL_ALPHA = 'rgba(18,183,106,0.6)'
export const BEAR_ALPHA = 'rgba(240,68,56,0.6)'

/** 弱化变体（K 线主题等低饱和场景） */
export const BULL_SOFT = '#2D9B65'
export const BEAR_SOFT = '#C74040'

/** 中性色（平盘） */
export const NEUTRAL = '#A1A1AA'

/** 情绪评分 → 颜色（强势=绿, 弱势=红, 国际惯例） */
export function scoreColor(v: number): string {
  if (v >= 70) return BULL
  if (v >= 55) return '#84CC16'
  if (v >= 45) return '#F59E0B'
  if (v >= 30) return '#FB923C'
  return BEAR
}
