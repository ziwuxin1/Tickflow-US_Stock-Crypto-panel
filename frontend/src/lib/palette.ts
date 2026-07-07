/**
 * 图表共享色板 — Cyberpunk 主题(design_handoff_cyberpunk):青涨红跌。
 *
 * ECharts / canvas 图表无法读 CSS variables,硬编码 hex 统一收敛到本模块,
 * 与 index.css 的 --bull/--bear token 保持同色值。
 */

/** 上涨 / 阳线 — 青 */
export const BULL = '#5EF2E4'
/** 下跌 / 阴线 — 警示红 */
export const BEAR = '#F75049'

/** 半透明变体(成交量柱 / 面积填充) */
export const BULL_ALPHA = 'rgba(94,242,228,0.6)'
export const BEAR_ALPHA = 'rgba(247,80,73,0.6)'

/** 弱化变体(K 线主题等低饱和场景) */
export const BULL_SOFT = '#2FC4B6'
export const BEAR_SOFT = '#D93A30'

/** 中性色(平盘) */
export const NEUTRAL = '#8F8C7A'

/** 情绪评分 → 颜色(强势=青, 中性=酸性黄/金, 弱势=红) */
export function scoreColor(v: number): string {
  if (v >= 70) return BULL
  if (v >= 55) return '#D5F021'
  if (v >= 45) return '#D9B437'
  if (v >= 30) return '#E8944A'
  return BEAR
}
