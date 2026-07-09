/**
 * Followin 智能体控制台 —— Cyberpunk 装饰件与展示原子。
 * 装饰边框(四边双线+发光光条+刻度)/ 四角 L 标 / 底部状态条 / 身份头像 / LIVE 徽标。
 * 全部 pointer-events:none 或纯展示,不参与交互。
 */
import type { CSSProperties } from 'react'
import { avatarClip, chamfer, hexA } from './theme'

/** 四边装饰边框:双平行线 + 一段发光黄光条 + 方块/刻度标记 + 右侧竖排读数。z-index 6。 */
export function DecorBorders() {
  const line = 'absolute bg-[rgba(213,240,33,.5)]'
  const lineDim = 'absolute bg-[rgba(213,240,33,.18)]'
  const glow: CSSProperties = {
    background: '#d5f021',
    boxShadow: '0 0 10px rgba(213,240,33,.6)',
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden">
      {/* 上边:双横线 + 发光光条 */}
      <div className={`${line} left-0 right-0 top-[6px] h-px`} />
      <div className={`${lineDim} left-0 right-0 top-3 h-px`} />
      <div className="absolute top-[6px] left-[16%] h-[3px] w-[170px]" style={glow} />
      {/* 下边 */}
      <div className={`${line} left-0 right-0 bottom-[6px] h-px`} />
      <div className={`${lineDim} left-0 right-0 bottom-3 h-px`} />
      <div className="absolute bottom-[6px] right-[18%] h-[3px] w-[150px]" style={glow} />
      {/* 左边:双竖线 */}
      <div className={`${line} top-0 bottom-0 left-[6px] w-px`} />
      <div className={`${lineDim} top-0 bottom-0 left-3 w-px`} />
      <div className="absolute left-[6px] top-[22%] w-[3px] h-[140px]" style={glow} />
      {/* 右边:双竖线 + 竖排读数 */}
      <div className={`${line} top-0 bottom-0 right-[6px] w-px`} />
      <div className={`${lineDim} top-0 bottom-0 right-3 w-px`} />
      {/* 方块/刻度标记 */}
      <div className="absolute left-[6px] top-[46%] h-1 w-1 bg-[#d5f021]" />
      <div className="absolute left-[10px] top-[52%] h-px w-1.5 bg-[rgba(213,240,33,.5)]" />
      <div className="absolute right-[6px] top-[38%] h-1 w-1 bg-[#5ef2e4]" />
      <div className="absolute right-[10px] top-[44%] h-px w-1.5 bg-[rgba(94,242,228,.5)]" />
      <div
        className="absolute right-[2px] top-1/2 -translate-y-1/2 font-mono text-[8px] tracking-[3px] text-[rgba(213,240,33,.4)]"
        style={{ writingMode: 'vertical-rl' }}
      >
        CUSTOM GLITCHES · PX·V
      </div>
    </div>
  )
}

/** 四角 L 形角标。z-index 9。 */
export function LCorners() {
  const s = 'absolute h-3.5 w-3.5 border-[#d5f021]'
  return (
    <div className="pointer-events-none absolute inset-0 z-[9]">
      <div className={`${s} left-[3px] top-[3px] border-l-2 border-t-2`} />
      <div className={`${s} right-[3px] top-[3px] border-r-2 border-t-2`} />
      <div className={`${s} left-[3px] bottom-[3px] border-l-2 border-b-2`} />
      <div className={`${s} right-[3px] bottom-[3px] border-r-2 border-b-2`} />
    </div>
  )
}

/** 底部全宽状态条。 */
export function StatusBar() {
  const Key = ({ k, label }: { k: string; label: string }) => (
    <span className="flex items-center gap-1">
      <span className="border border-[rgba(213,240,33,.4)] px-1 text-[#d5f021]">{k}</span>
      <span className="text-[#6a6754]">{label}</span>
    </span>
  )
  return (
    <div className="flex shrink-0 items-center gap-4 border-t border-[rgba(213,240,33,.14)] bg-[rgba(9,7,6,.6)] px-4 py-1.5 font-mono text-[10px] text-[#6a6754]">
      <span className="text-[#8f8c7a]">■ 000.00</span>
      <span className="hidden sm:inline">MIRRORING IMG FROM SERV · 208040.2432.224</span>
      <span className="hidden md:inline text-[#4a4738]">POWERED BY MILITEEN</span>
      <span className="hidden lg:inline text-[#4a4738]">DYN·LINK: ENABLED · F008-92AF-RTM · MILITEEN.OS GEN V</span>
      <div className="ml-auto flex items-center gap-2.5">
        <Key k="↑↓" label="NAVIGATION" />
        <Key k="↵ F" label="SELECT" />
        <Key k="H" label="HELP" />
        <Key k="ESC" label="CLOSE" />
      </div>
    </div>
  )
}

/** 身份切角头像方块(颜色=智能体身份色,黑字首字母)。 */
export function Avatar({ color, char, size = 22, dim = false }: { color: string; char: string; size?: number; dim?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-bold text-[#0d0b07]"
      style={{
        width: size,
        height: size,
        background: dim ? hexA(color, 0.85) : color,
        clipPath: avatarClip,
        fontSize: Math.round(size * 0.5),
        boxShadow: dim ? 'none' : `0 0 ${Math.round(size * 0.6)}px ${hexA(color, 0.35)}`,
      }}
    >
      {char}
    </span>
  )
}

/** LIVE 徽标(红点闪 + 红描边)。 */
export function LiveBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 border border-[rgba(247,80,73,.5)] px-2 py-0.5 font-mono text-[9px] tracking-widest text-[#f75049]"
      style={{ clipPath: chamfer(5) }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#f75049]" style={{ animation: 'cpBlink 1.4s step-end infinite' }} />
      LIVE
    </span>
  )
}
