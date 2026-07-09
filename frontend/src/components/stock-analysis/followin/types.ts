/**
 * Followin 智能体控制台 —— 共享类型。
 * 后端存储的 Agent / SkillDef 直接复用 @/lib/api 的类型;此处补充前端会话/UI 状态类型。
 */
import type { FollowinAgent, FollowinSkillDef, FollowinAgentDraft } from '@/lib/api'

export type { FollowinAgent, FollowinSkillDef, FollowinAgentDraft }

/** 双模式:ai=智能体综合分析(慢) / fast=快速取数(单工具原始数据)。 */
export type Mode = 'ai' | 'fast'

/** 侧栏标签。 */
export type SideTab = 'agents' | 'history'

/** 主区面板:chat=对话 / edit=智能体编辑器 overlay。 */
export type Panel = 'chat' | 'edit'

/** 快速取数的工具类目。 */
export type ToolCat = 'news' | 'metrics' | 'signal'

/** 一条对话消息(用户提问 或 智能体回复)。 */
export interface ChatMsg {
  id: string
  role: 'user' | 'agent'
  mode: Mode
  /** 用户提问文本(role=user)。 */
  q?: string
  /** 回复三态:loading→streaming→done,或 error。 */
  phase?: 'loading' | 'streaming' | 'done' | 'error'
  /** AI 模式:markdown 综合分析。 */
  answer?: string
  /** 快速模式:Followin 原始数据。 */
  data?: any
  /** 快速模式使用的工具类目。 */
  tool?: ToolCat
  /** 调用工具数(展示用)。 */
  toolsUsed?: number
  /** 耗时秒(展示用)。 */
  elapsed?: number
  error?: string
}

/** 每个智能体一条独立会话(内存态,跨开关对话框保留)。 */
export interface AgentSession {
  agentId: string
  msgs: ChatMsg[]
  input: string
  mode: Mode
  /** 最近一次提问认出的实体(BTC/NVDA…),供推荐问跟随。 */
  subject?: string
}

/** 窗口位置尺寸。 */
export interface WinRect { x: number; y: number; w: number; h: number }

/** 编辑器草稿态。skills 用 set-like 的 {id:1} 便于 toggle。 */
export interface DraftState {
  id: string | null
  name: string
  role: string
  group: string
  color: string
  desc: string
  skills: Record<string, 1>
}

/** 历史会话条目(按时间分组展示)。 */
export interface HistoryItem {
  id: string
  agentId: string
  title: string
  /** 领域 tag:加密/美股/链上/宏观/衍生品。 */
  tag: string
  ts: number
}
