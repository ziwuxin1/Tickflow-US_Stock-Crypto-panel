import type { CSSProperties, ReactNode } from 'react'
import { NEON, PANEL_BD, PANEL_BD_HI, PANEL_BD_STRONG, PANEL_BG } from './tokens'

type Variant = 'panel' | 'stat' | 'ticker' | 'highlight' | 'strong'

/** CP 面板样式 — 全直角: 半透深底 + 酸性黄描边; highlight 为 BTC/ETH 高亮 1.5px 亮黄边 */
const VARIANT_STYLE: Record<Variant, CSSProperties> = {
  panel: { background: PANEL_BG, border: PANEL_BD },
  stat: { background: PANEL_BG, border: PANEL_BD },
  ticker: { background: PANEL_BG, border: PANEL_BD },
  strong: { background: PANEL_BG, border: PANEL_BD_STRONG },
  highlight: { background: PANEL_BG, border: PANEL_BD_HI },
}

interface GlassCardProps {
  variant?: Variant
  as?: 'div' | 'section'
  children: ReactNode
  style?: CSSProperties
  className?: string
  /** 卡片外角黄色 L 形角标记(重要卡): 左上 + 右下 */
  corners?: boolean
}

/** 黄色 L 形角标记 */
export function CornerMarks({ size = 16 }: { size?: number }) {
  return (
    <>
      <span style={{ position: 'absolute', top: -5, left: -5, width: size, height: size, borderTop: `2px solid ${NEON}`, borderLeft: `2px solid ${NEON}`, pointerEvents: 'none' }} />
      <span style={{ position: 'absolute', bottom: -5, right: -5, width: size, height: size, borderBottom: `2px solid ${NEON}`, borderRight: `2px solid ${NEON}`, pointerEvents: 'none' }} />
    </>
  )
}

/** 带 data-mq 的 CP 面板 — hover 双光带跑马灯描边(见 index.css) */
export function GlassCard({ variant = 'panel', as = 'section', children, style, className, corners }: GlassCardProps) {
  const Tag = as
  return (
    <Tag data-mq="" className={className} style={{ position: 'relative', ...VARIANT_STYLE[variant], ...style }}>
      {corners && <CornerMarks />}
      {children}
    </Tag>
  )
}
