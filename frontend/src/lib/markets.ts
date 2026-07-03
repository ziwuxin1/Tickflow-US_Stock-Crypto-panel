/**
 * 资产类别判别 — 与后端 app/markets.py 契约对齐。
 *
 * symbol 全局唯一：美股 `AAPL.US`（带交易所后缀），加密 `BTCUSDT`（无后缀）。
 */

/** 加密货币 symbol 无 `.` 后缀（如 BTCUSDT）；美股带后缀（如 AAPL.US） */
export function isCrypto(symbol: string | null | undefined): boolean {
  if (!symbol) return false
  return !symbol.includes('.')
}

/** 资产类别："crypto" | "stock" */
export function assetClass(symbol: string | null | undefined): 'crypto' | 'stock' {
  return isCrypto(symbol) ? 'crypto' : 'stock'
}
