/**
 * Followin 智能体控制台 —— 输入区(composer)。
 * 行内双模式分段(⚡快速 / ✦AI)+ 青色四角括号输入行 + 黄色发送按钮。
 */
import { Zap, Sparkles, Search, ArrowRight, Loader2 } from 'lucide-react'
import { chamfer } from './theme'
import type { FollowinAgent, Mode } from './types'

interface ComposerProps {
  mode: Mode
  onMode: (m: Mode) => void
  input: string
  onInput: (v: string) => void
  onSend: () => void
  agent: FollowinAgent | undefined
  busy: boolean
}

export function Composer({ mode, onMode, input, onInput, onSend, agent, busy }: ComposerProps) {
  const placeholder = mode === 'ai'
    ? `与 ${agent?.name ?? '智能体'}${agent?.role ? `(${agent.role})` : ''} 对话,自动调用其 ${agent?.skills.length ?? 0} 项技能综合分析…`
    : '快速取数 · 直连原始数据 — 例如:现价 / 最新消息 / 谁在买'

  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-[rgba(213,240,33,.14)] px-4 py-3">
      {/* 双模式分段 */}
      <div className="flex items-center border border-[rgba(213,240,33,.2)]" title="切换取数模式" style={{ clipPath: chamfer(6) }}>
        <ModeCell active={mode === 'fast'} onClick={() => onMode('fast')} icon={Zap} label="快速" color="#5ef2e4" />
        <ModeCell active={mode === 'ai'} onClick={() => onMode('ai')} icon={Sparkles} label="AI" color="#d5f021" />
      </div>

      {/* 输入行 */}
      <div className="relative flex flex-1 items-center gap-2 border border-[rgba(213,240,33,.25)] bg-[rgba(16,14,9,.5)] px-3 py-2" style={{ clipPath: chamfer(8) }}>
        {/* 四角青色 L 括号 */}
        <Bracket className="left-1 top-1 border-l border-t" />
        <Bracket className="right-1 top-1 border-r border-t" />
        <Bracket className="left-1 bottom-1 border-l border-b" />
        <Bracket className="right-1 bottom-1 border-r border-b" />
        <Search className="h-3.5 w-3.5 shrink-0 text-[#8f8c7a]" />
        <input
          value={input}
          onChange={e => onInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !busy) onSend() }}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[#e8e6d8] placeholder:text-[#6a6754] focus:outline-none"
        />
        <span className="hidden shrink-0 font-mono text-[10px] text-[#6a6754] sm:inline">↵ 发送</span>
      </div>

      {/* 发送按钮 */}
      <button
        onClick={onSend}
        disabled={busy}
        className="cp-btn-solid flex shrink-0 items-center gap-1.5 bg-[#d5f021] px-4 py-2 text-[13px] font-bold tracking-wide text-[#0d0b07] disabled:opacity-50"
        style={{ clipPath: chamfer(7), boxShadow: '0 0 18px rgba(213,240,33,.28)' }}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        发送
      </button>
    </div>
  )
}

function ModeCell({ active, onClick, icon: Icon, label, color }: {
  active: boolean; onClick: () => void; icon: any; label: string; color: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-2 text-[12px] font-semibold transition-colors"
      style={active
        ? { background: color, color: '#0d0b07' }
        : { color: '#8f8c7a', background: 'transparent' }}
    >
      <Icon className="h-3.5 w-3.5" style={{ color: active ? '#0d0b07' : '#8f8c7a' }} />
      {label}
    </button>
  )
}

function Bracket({ className }: { className: string }) {
  return <span className={`pointer-events-none absolute h-2 w-2 border-[#5ef2e4] ${className}`} />
}
