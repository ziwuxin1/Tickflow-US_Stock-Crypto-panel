/**
 * Followin 智能体控制台 —— 对话区(Cyberpunk 2077 主题)。
 *
 * 空态:居中身份牌(智能体头像/无智能体用品牌方块)+ 2×2 领域建议卡。
 * 有消息:逐条渲染——
 *   - role=user:右对齐提问气泡(青色光脊 + 左下切角)。
 *   - role=agent, phase=loading:AI 模式=工具调用轨迹卡(逐行淡入 + 扫描进度条);
 *     fast 模式=青色 spinner 取数提示。
 *   - role=agent, phase=error:红色错误卡。
 *   - role=agent, 有 answer:AI 报告卡(署名 + Markdown 正文 + 复制/重新生成 + 快捷问 chips)。
 *   - role=agent, 有 data:快速取数结果卡(署名 + <FastResult>)。
 *
 * 设计交接稿 §4 对齐:全直角 + 局部切角(chamfer),酸性黄主色 + 青色信息色,数字/标签用 mono。
 */
import { useEffect, useRef } from 'react'
import { Radio, Copy, RefreshCw, Loader2 } from 'lucide-react'
import { ReportMarkdown } from './ReportMarkdown'
import { Avatar } from './Decor'
import { chamfer, avatarClip, hexA, firstChar, TOOL_CN, YELLOW, CYAN, suggestFor, suggestCards, type SuggestCard } from './theme'
import { FastResult } from './FastResult'
import type { ChatMsg, FollowinAgent } from './types'

interface ChatAreaProps {
  /** 当前智能体 */
  agent: FollowinAgent | undefined
  /** 该智能体会话的消息列表 */
  msgs: ChatMsg[]
  /** 当前标的显示名(如 BTC / 英伟达) */
  disp: string
  /** 阅读区缩放 0.8~1.15 */
  fontScale: number
  /** 点建议卡 / 快捷问 chip → 直接发送该问题 */
  onPick: (q: string) => void
}

/** 从消息列表里向前找离 idx 最近的一条用户提问文本(供「重新生成」使用)。 */
function findPrevUserQ(msgs: ChatMsg[], idx: number): string | undefined {
  for (let i = idx - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') return msgs[i].q
  }
  return undefined
}

export function ChatArea({ agent, msgs, disp, fontScale, onPick }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 消息变化时滚到底部
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight })
  }, [msgs])

  const suggestions = suggestFor(agent, disp)
  const cards = suggestCards(agent)

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
      {/* 阅读区缩放包裹层 + 居中留白 */}
      <div className="mx-auto w-full" style={{ maxWidth: 760, zoom: fontScale }}>
        {msgs.length === 0 ? (
          <EmptyState agent={agent} cards={cards} onPick={onPick} />
        ) : (
          <div className="flex flex-col gap-5">
            {msgs.map((m, i) => (
              <MsgRow
                key={m.id}
                msg={m}
                agent={agent}
                suggestions={suggestions}
                regenQ={findPrevUserQ(msgs, i) || disp}
                onPick={onPick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ============================== 空态 ============================== */

/** 空态:大身份头像 + 标题(glitch)+ 角色行 + 简介 + 2×2 领域建议卡。 */
function EmptyState({ agent, cards, onPick }: {
  agent: FollowinAgent | undefined
  cards: SuggestCard[]
  onPick: (q: string) => void
}) {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      {agent ? (
        <Avatar color={agent.color} char={firstChar(agent.name)} size={72} />
      ) : (
        <span
          className="flex items-center justify-center bg-[#d5f021]"
          style={{ width: 72, height: 72, clipPath: chamfer(14) }}
        >
          <Radio className="h-8 w-8 text-[#0d0b07]" />
        </span>
      )}

      <div className="mt-4 text-[26px] font-bold text-[#e8e6d8]" style={{ animation: 'cpGlitch 7s infinite' }}>
        {agent?.name ?? 'FOLLOWIN 数据检索'}
      </div>

      {agent && (
        <div className="mt-1 font-mono text-[11px] tracking-wide" style={{ color: agent.color }}>
          {agent.role} · {agent.skills.length} 项技能
        </div>
      )}

      {agent && (
        <div className="mt-2 max-w-[460px] text-[12.5px] leading-relaxed text-[#8f8c7a]">
          {agent.desc ? `${agent.desc} ` : ''}直接向 {agent.name} 提问,自动调用 TA 擅长的工具综合分析。
        </div>
      )}

      {/* 2×2 领域建议卡:图标 + 标题 + 副标分类(设计稿 suggMap) */}
      <div className="mt-7 grid w-full grid-cols-2 gap-3">
        {cards.map(card => (
          <button
            key={card.label}
            onClick={() => onPick(card.label)}
            className="group flex items-center gap-3 border border-[rgba(213,240,33,.14)] bg-[rgba(16,14,9,.4)] px-4 py-3 text-left transition-colors hover:border-[rgba(213,240,33,.4)] hover:bg-[rgba(213,240,33,.05)]"
            style={{ clipPath: chamfer(8) }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center text-[15px] font-bold leading-none"
              style={{ background: hexA(card.color, 0.14), color: card.color, border: `1px solid ${hexA(card.color, 0.5)}`, clipPath: chamfer(6) }}
            >
              {card.glyph}
            </span>
            <span className="min-w-0">
              <div className="truncate text-[13px] font-bold text-[#e8e6d8] group-hover:text-[#eafefb]">{card.label}</div>
              <div className="mt-0.5 font-mono text-[9px] tracking-[1.5px] text-[#8f8c7a]">{card.sub}</div>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ============================== 单条消息分发 ============================== */

function MsgRow({ msg, agent, suggestions, regenQ, onPick }: {
  msg: ChatMsg
  agent: FollowinAgent | undefined
  suggestions: string[]
  regenQ: string
  onPick: (q: string) => void
}) {
  if (msg.role === 'user') return <UserBubble msg={msg} />

  if (msg.phase === 'loading') {
    return msg.mode === 'ai' ? <ToolTraceCard /> : <FastLoadingRow />
  }
  if (msg.phase === 'error') {
    return (
      <div
        className="border border-[rgba(247,80,73,.4)] bg-[rgba(247,80,73,.06)] px-3.5 py-2.5 text-[12px] text-[#f75049]"
        style={{ clipPath: chamfer(6) }}
      >
        {msg.error || '查询失败'}
      </div>
    )
  }
  // phase === 'done' | 'streaming'
  if (msg.answer !== undefined) {
    return <ReportCard msg={msg} agent={agent} suggestions={suggestions} regenQ={regenQ} onPick={onPick} />
  }
  if (msg.data !== undefined) {
    return <FastCard msg={msg} agent={agent} />
  }
  return null
}

/* ============================== 用户提问气泡 ============================== */

function UserBubble({ msg }: { msg: ChatMsg }) {
  const modeLabel = msg.mode === 'fast' ? `${TOOL_CN[msg.tool || 'metrics']}·QUERY` : 'QUERY'
  return (
    <div className="flex justify-end">
      <div className="relative max-w-[82%] pl-3">
        {/* 左侧青色发光光脊 */}
        <span
          className="absolute bottom-0 left-0 top-0 w-[3px]"
          style={{ background: CYAN, boxShadow: `0 0 8px ${hexA(CYAN, 0.65)}` }}
        />
        <div
          className="relative border border-[rgba(94,242,228,.35)] px-4 py-3"
          style={{
            background: 'linear-gradient(135deg, rgba(94,242,228,.13), rgba(94,242,228,.02))',
            clipPath: 'polygon(0 0, 100% 0, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
          }}
        >
          {/* 右上角青色 L 角标 */}
          <span className="absolute right-0 top-0 h-3 w-3 border-r-2 border-t-2" style={{ borderColor: CYAN }} />

          <div className="mb-1.5 flex items-center gap-2">
            <span className="bg-[#5ef2e4] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#0d0b07]">YOU</span>
            <span className="font-mono text-[9px] tracking-wide" style={{ color: hexA(CYAN, 0.7) }}>{modeLabel}</span>
          </div>
          <div className="break-words text-[15px] font-bold text-[#eafefb]">{msg.q}</div>
        </div>
      </div>
    </div>
  )
}

/* ============================== 加载态 ============================== */

/** AI 模式加载态:工具调用轨迹卡,逐行淡入 + 底部扫描进度条。 */
function ToolTraceCard() {
  const lines: { text: string; done: boolean }[] = [
    { text: '连接 Followin 数据网关', done: true },
    { text: '调用 行情/K线 工具', done: true },
    { text: '聚合 新闻/链上/信号数据', done: false },
  ]
  return (
    <div
      className="border border-[rgba(213,240,33,.3)] bg-[rgba(14,16,12,.5)] px-4 py-3.5"
      style={{ clipPath: chamfer(12) }}
    >
      <div className="mb-2.5 flex items-baseline gap-2">
        <span className="text-[13px] font-bold text-[#d5f021]">AI 正在综合分析</span>
        <span className="font-mono text-[10px] text-[#8f8c7a]">自动调度 Followin 工具</span>
      </div>
      <div className="flex flex-col gap-1.5 font-mono text-[11px] text-[#c8c5b4]">
        {lines.map((ln, i) => (
          <div key={ln.text} style={{ animation: 'cpTrace .4s ease both', animationDelay: `${i * 0.25}s` }}>
            {'⟩ '}{ln.text}{'  '}
            <span style={{ color: ln.done ? CYAN : '#6a6754' }}>{ln.done ? 'DONE' : '···'}</span>
          </div>
        ))}
      </div>
      {/* 扫描进度条:40% 宽黄光条来回扫 */}
      <div className="relative mt-3 h-[3px] overflow-hidden bg-[rgba(213,240,33,.08)]">
        <div
          className="absolute inset-y-0 w-[40%]"
          style={{ background: YELLOW, boxShadow: `0 0 8px ${hexA(YELLOW, 0.6)}`, animation: 'cpBar 1.1s linear infinite' }}
        />
      </div>
    </div>
  )
}

/** 快速取数加载态:青色 slim spinner。 */
function FastLoadingRow() {
  return (
    <div className="flex items-center gap-2 px-1 py-2 text-[#5ef2e4]">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="font-mono text-[11px]">直连原始数据 · 取数中…</span>
    </div>
  )
}

/* ============================== 完成态 ============================== */

/** 署名行:28px 黄色切角品牌头像(内放 Radio)+ 智能体名 + 模式徽标 + 可选 mono 元信息。 */
function Signature({ agent, badge, badgeColor, meta }: {
  agent: FollowinAgent | undefined
  badge: string
  badgeColor: string
  meta?: string
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span
        className="flex items-center justify-center bg-[#d5f021]"
        style={{ width: 28, height: 28, clipPath: avatarClip }}
      >
        <Radio className="h-3.5 w-3.5 text-[#0d0b07]" />
      </span>
      <span className="text-[13px] font-bold text-[#e8e6d8]">{agent?.name ?? 'Followin AI'}</span>
      <span
        className="border px-1.5 py-0.5 font-mono text-[9px] font-bold"
        style={{ borderColor: hexA(badgeColor, 0.4), color: badgeColor, clipPath: chamfer(5) }}
      >
        {badge}
      </span>
      {meta && <span className="font-mono text-[10px] text-[#6a6754]">{meta}</span>}
    </div>
  )
}

/** AI 报告卡:署名 + 黄描边正文卡(Markdown)+ 复制/重新生成操作条 + 快捷问 chips。 */
function ReportCard({ msg, agent, suggestions, regenQ, onPick }: {
  msg: ChatMsg
  agent: FollowinAgent | undefined
  suggestions: string[]
  regenQ: string
  onPick: (q: string) => void
}) {
  const streaming = msg.phase === 'streaming'
  const elapsedTxt = typeof msg.elapsed === 'number' ? msg.elapsed.toFixed(1) : '—'

  return (
    <div>
      <Signature agent={agent} badge="AI 分析" badgeColor={YELLOW} meta={`调用 ${msg.toolsUsed ?? '多'} 个工具 · ${elapsedTxt}s`} />

      <div
        className="relative border border-[rgba(213,240,33,.22)] bg-[rgba(14,16,12,.6)] px-4 py-3.5"
        style={{ clipPath: chamfer(12) }}
      >
        {/* 左上黄色 L 角标 */}
        <span className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-[#d5f021]" />

        <ReportMarkdown>{msg.answer ?? ''}</ReportMarkdown>
        {streaming && (
          <span
            className="ml-0.5 inline-block h-3.5 w-[7px] align-middle bg-[#5ef2e4]"
            style={{ animation: 'cpCaret .9s step-end infinite' }}
          />
        )}

        {!streaming && (
          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[rgba(213,240,33,.1)] pt-2.5">
            <button
              onClick={() => navigator.clipboard.writeText(msg.answer ?? '')}
              className="flex items-center gap-1 font-mono text-[10px] text-[#8f8c7a] hover:text-[#d5f021]"
            >
              <Copy className="h-3 w-3" /> 复制
            </button>
            <button
              onClick={() => onPick(regenQ)}
              className="flex items-center gap-1 font-mono text-[10px] text-[#8f8c7a] hover:text-[#d5f021]"
            >
              <RefreshCw className="h-3 w-3" /> 重新生成
            </button>
            <span className="ml-auto font-mono text-[9px] text-[#6a6754]">SRC: FOLLOWIN · QUOTE / NEWS / ONCHAIN</span>
          </div>
        )}
      </div>

      {!streaming && <SuggestChips suggestions={suggestions} onPick={onPick} />}
    </div>
  )
}

/** 快捷问 chips:青描边切角胶囊,点击直接发送。 */
function SuggestChips({ suggestions, onPick }: { suggestions: string[]; onPick: (q: string) => void }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-2">
      {suggestions.map(q => (
        <button
          key={q}
          onClick={() => onPick(q)}
          className="border border-[rgba(94,242,228,.32)] bg-[rgba(94,242,228,.03)] px-3 py-1.5 font-mono text-[11px] text-[#5ef2e4] transition-colors hover:border-[rgba(94,242,228,.6)] hover:bg-[rgba(94,242,228,.1)]"
          style={{ clipPath: chamfer(6) }}
        >
          › {q}
        </button>
      ))}
    </div>
  )
}

/** 快速取数结果卡:署名(青色徽标)+ <FastResult>。 */
function FastCard({ msg, agent }: { msg: ChatMsg; agent: FollowinAgent | undefined }) {
  return (
    <div>
      <Signature agent={agent} badge="快速取数" badgeColor={CYAN} />
      <FastResult tool={msg.tool || 'metrics'} data={msg.data} />
    </div>
  )
}
