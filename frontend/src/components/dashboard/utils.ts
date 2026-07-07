/** 看板数值格式化助手 — 从旧 Dashboard.tsx 抽出供各卡片组件共用。 */

export function n(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function fmtPrice(v: number | null | undefined, digits = 2): string {
  const x = n(v)
  return x == null ? '—' : x.toFixed(digits)
}

/** 指数/加密涨跌幅 — 已是百分数 */
export function fmtIndexPct(v: number | null | undefined): string {
  const x = n(v)
  if (x == null) return '—'
  return `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`
}

/** 个股涨跌幅 — 小数比率 ×100 */
export function fmtStockPct(v: number | null | undefined): string {
  const x = n(v)
  if (x == null) return '—'
  return `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)}%`
}

/** 涨跌配色 — 走全局 CSS variables(--up/--down) */
export function pctColor(v: number | null | undefined): string {
  const x = n(v)
  if (x == null || x === 0) return '#757c9a'
  return x > 0 ? 'var(--up)' : 'var(--down)'
}

export function quoteAge(ms?: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}

export function compactCount(v: number | null | undefined): string {
  const x = n(v)
  if (x == null) return '—'
  if (x >= 1000) return `${(x / 1000).toFixed(1)}k`
  return x.toFixed(0)
}
