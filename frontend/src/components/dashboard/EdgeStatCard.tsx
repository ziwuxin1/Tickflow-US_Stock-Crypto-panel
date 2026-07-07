import type { CSSProperties, ReactNode } from 'react'
import { GOLD, MONO, SUB_BG, TXT_BODY, TXT_WEAK, UP, DOWN, NEON } from './tokens'

/** 左侧 10px 实心色条的语义变体(CP perk 卡) */
export type EdgeTone = 'neon' | 'dim' | 'gray' | 'up' | 'down' | 'btc' | 'eth'

interface ToneConf {
  bar: string
  glow?: string
  bd: string
  vc: string
  tag: string
  hot?: boolean
}

const TONES: Record<EdgeTone, ToneConf> = {
  neon: { bar: 'linear-gradient(180deg,#eefb8a,#d5f021)', glow: '0 0 9px rgba(213,240,33,.5)', bd: 'rgba(213,240,33,.45)', vc: NEON, tag: 'SIGNAL', hot: true },
  up: { bar: 'linear-gradient(180deg,#8ff5e8,#5ef2e4)', glow: '0 0 9px rgba(94,242,228,.45)', bd: 'rgba(94,242,228,.45)', vc: UP, tag: 'LONG' },
  down: { bar: 'linear-gradient(180deg,#f88a80,#f75049)', glow: '0 0 9px rgba(247,80,73,.45)', bd: 'rgba(247,80,73,.45)', vc: DOWN, tag: 'SHORT' },
  dim: { bar: 'linear-gradient(180deg,#a8b830,#6a7a1a)', bd: 'rgba(168,184,48,.3)', vc: TXT_BODY, tag: 'DATA' },
  gray: { bar: 'linear-gradient(180deg,rgba(232,230,216,.3),rgba(232,230,216,.12))', bd: 'rgba(232,230,216,.18)', vc: TXT_WEAK, tag: 'NULL' },
  btc: { bar: 'linear-gradient(180deg,#ffb14d,#f7931a)', glow: '0 0 9px rgba(247,147,26,.5)', bd: 'rgba(247,147,26,.45)', vc: TXT_BODY, tag: 'DATA' },
  eth: { bar: 'linear-gradient(180deg,#8fa5f5,#627eea)', glow: '0 0 9px rgba(98,126,234,.5)', bd: 'rgba(98,126,234,.45)', vc: TXT_BODY, tag: 'DATA' },
}

interface EdgeStatCardProps {
  label: ReactNode
  value: ReactNode
  tone: EdgeTone
  /** 数字字号 — perk 卡 17 */
  valueSize?: number
  padding?: string
  style?: CSSProperties
}

/**
 * CP perk 卡: #0e100c 底 + 语义色边框 + 左 10px 实心色条(深色小方块 + 竖排微缩标签),
 * 高亮(neon)项右上金色 HOT 角标。
 */
export function EdgeStatCard({ label, value, tone, valueSize = 17, padding = '10px 11px 8px', style }: EdgeStatCardProps) {
  const t = TONES[tone]
  return (
    <div
      style={{
        display: 'flex', alignItems: 'stretch', position: 'relative',
        background: SUB_BG, border: `1px solid ${t.bd}`,
        ...style,
      }}
    >
      <div
        style={{
          width: 10, flex: 'none', background: t.bar,
          ...(t.glow ? { boxShadow: t.glow } : {}),
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 0 5px',
        }}
      >
        <span style={{ width: 4, height: 4, background: 'rgba(13,11,7,.85)' }} />
        <span style={{ writingMode: 'vertical-rl', fontFamily: MONO, fontSize: 5, fontWeight: 700, color: '#10120a', letterSpacing: 1 }}>
          {t.tag}
        </span>
      </div>
      <div style={{ flex: 1, padding, minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: TXT_WEAK, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>
          {label}
        </div>
        <div style={{ fontFamily: MONO, fontSize: valueSize, fontWeight: 700, color: t.vc, marginTop: 4, lineHeight: 1 }}>
          {value}
        </div>
      </div>
      {t.hot && (
        <span
          style={{
            position: 'absolute', top: -1, right: -1, background: GOLD, color: '#241b04',
            fontFamily: MONO, fontSize: 7, fontWeight: 700, padding: '1.5px 6px', letterSpacing: 1.5,
          }}
        >
          HOT
        </span>
      )}
    </div>
  )
}
