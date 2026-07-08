/**
 * AI 自动预测结果的本地持久化 —— 按标的缓存到 localStorage,
 * 使「返回列表再进来 / 刷新页面」时上次的预测不丢失(自动恢复)。
 *
 * 仅存最近一次结果 + 时间戳;超过 TTL(默认 24h)视为过期不再恢复。
 */
import type { PredictResponse } from '@/lib/api'

const PREFIX = 'ai-predict:'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 小时

interface Stored {
  data: PredictResponse
  savedAt: number
}

function keyOf(symbol: string): string {
  return `${PREFIX}${symbol.trim().toUpperCase()}`
}

/** 保存某标的的最新预测结果。 */
export function savePrediction(symbol: string, data: PredictResponse): void {
  if (!symbol) return
  try {
    const payload: Stored = { data, savedAt: Date.now() }
    localStorage.setItem(keyOf(symbol), JSON.stringify(payload))
  } catch {
    // localStorage 满/被禁用 → 静默降级(不影响功能, 只是不持久化)
  }
}

/** 读取某标的的已保存预测(过期或无则返回 null)。 */
export function loadPrediction(symbol: string): PredictResponse | null {
  if (!symbol) return null
  try {
    const raw = localStorage.getItem(keyOf(symbol))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (!parsed?.data || typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(keyOf(symbol))
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

/** 清除某标的的已保存预测。 */
export function clearPrediction(symbol: string): void {
  if (!symbol) return
  try {
    localStorage.removeItem(keyOf(symbol))
  } catch {
    // 忽略
  }
}
