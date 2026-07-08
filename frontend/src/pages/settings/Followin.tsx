/**
 * Followin 实时数据源设置 —— 个股 AI 预测「Followin 实时」数据源(独立 Tab)。
 *
 * 复用 AI 设置页里的 FollowinCard(x-api-key 配置 + 连通测试 + 集成的 5 项 MCP 功能)。
 */
import { FollowinCard } from './AI'
import { useSettings } from '@/lib/useSharedQueries'

export function SettingsFollowinPanel() {
  const settings = useSettings()
  return (
    <div className="space-y-5 max-w-2xl">
      <FollowinCard s={settings.data} />
    </div>
  )
}
