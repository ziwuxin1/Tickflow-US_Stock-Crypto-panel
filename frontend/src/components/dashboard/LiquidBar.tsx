import type { CSSProperties } from 'react'
import { LIQUID_DOWN_GRAD, LIQUID_UP_GRAD } from './tokens'

interface Bubble {
  top: number
  size: number
  alpha: number
  dur: number
  delay?: number
  bobDur?: number
}

/** 涨段气泡(向右流) — 设计稿两处规格 */
const UP_BUBBLES_SM: Bubble[] = [
  { top: 2, size: 3, alpha: 0.45, dur: 4.6, bobDur: 1.7 },
  { top: 4, size: 2, alpha: 0.35, dur: 6.2, delay: -2.4, bobDur: 2.3 },
  { top: 1, size: 4, alpha: 0.4, dur: 5.4, delay: -3.8 },
]
const UP_BUBBLES_LG: Bubble[] = [
  { top: 3, size: 4, alpha: 0.45, dur: 5.2, bobDur: 1.8 },
  { top: 5, size: 2.5, alpha: 0.35, dur: 7, delay: -2.8, bobDur: 2.4 },
  { top: 2, size: 5, alpha: 0.38, dur: 6, delay: -4.4 },
  { top: 4, size: 3, alpha: 0.38, dur: 5.7, delay: -1.2, bobDur: 2.1 },
]
const DOWN_BUBBLES_SM: Bubble[] = [
  { top: 2, size: 3, alpha: 0.42, dur: 4.9, bobDur: 1.9 },
  { top: 4, size: 2, alpha: 0.32, dur: 6.5, delay: -3.1 },
]
const DOWN_BUBBLES_LG: Bubble[] = [
  { top: 3, size: 4, alpha: 0.42, dur: 5.5, bobDur: 2 },
  { top: 5, size: 2.5, alpha: 0.32, dur: 7.2, delay: -3.5 },
]

function bubbleStyle(b: Bubble, reverse: boolean): CSSProperties {
  const flow = reverse ? 'lqFlowR' : 'lqFlow'
  return {
    position: 'absolute',
    top: b.top,
    width: b.size,
    height: b.size,
    borderRadius: '50%',
    background: `rgba(255,255,255,${b.alpha})`,
    animation: `${flow} ${b.dur}s linear infinite${b.bobDur ? `,lqBob ${b.bobDur}s ease-in-out infinite` : ''}`,
    ...(b.delay ? { animationDelay: `${b.delay}s` } : {}),
  }
}

interface LiquidBarProps {
  /** 涨段宽度百分比 0~100 */
  upPct: number
  /** sm: 广度卡 9px / lg: 资产结构卡 11px */
  size?: 'sm' | 'lg'
}

/** 液体对比条 — 两根圆头胶囊 + 白色小气泡流动 + 流光扫过 */
export function LiquidBar({ upPct, size = 'sm' }: LiquidBarProps) {
  const lg = size === 'lg'
  const clamped = Math.max(0, Math.min(100, upPct))
  const upBubbles = lg ? UP_BUBBLES_LG : UP_BUBBLES_SM
  const downBubbles = lg ? DOWN_BUBBLES_LG : DOWN_BUBBLES_SM
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: lg ? 11 : 9, gap: lg ? 6 : 5 }}>
      <div
        style={{
          width: `${clamped}%`, height: '100%', borderRadius: 999,
          background: LIQUID_UP_GRAD,
          boxShadow: lg ? '0 0 12px var(--upSoft)' : '0 0 10px rgba(128,255,60,.3)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {upBubbles.map((b, i) => <span key={i} style={bubbleStyle(b, false)} />)}
        <span
          style={{
            position: 'absolute', top: 0, bottom: 0, width: lg ? '30%' : '34%',
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent)',
            animation: `lqSheen ${lg ? 3.8 : 3.4}s ease-in-out infinite`,
          }}
        />
      </div>
      <div
        style={{
          flex: 1, height: '100%', borderRadius: 999,
          background: LIQUID_DOWN_GRAD,
          boxShadow: lg ? '0 0 12px var(--downSoft)' : '0 0 10px rgba(255,80,30,.3)',
          position: 'relative', overflow: 'hidden',
        }}
      >
        {downBubbles.map((b, i) => <span key={i} style={bubbleStyle(b, true)} />)}
        <span
          style={{
            position: 'absolute', top: 0, bottom: 0, width: lg ? '30%' : '34%',
            background: 'linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)',
            animation: `lqSheen ${lg ? 4.4 : 4.1}s ease-in-out infinite`,
            animationDelay: lg ? '-2s' : '-1.6s',
          }}
        />
      </div>
    </div>
  )
}
