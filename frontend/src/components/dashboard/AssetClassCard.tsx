import { useState } from 'react'
import type { OverviewMarket } from '@/lib/api'
import { fmtBigNum } from '@/lib/format'
import { DotGridEmpty } from './DotGridEmpty'
import { GlassCard } from './GlassCard'
import {
  DIVIDER, DOWN, INK, MONO, NEON, TXT_BODY, TXT_CARD_TITLE, TXT_FAINT, TXT_WEAK, UP,
} from './tokens'

/** 6 格递增/递减斜块量表(skewX -14°, 按比例点亮) */
function NotchMeter({ pct, dir }: { pct: number; dir: 'up' | 'down' }) {
  const filled = Math.round(Math.max(0, Math.min(100, pct)) / 100 * 6)
  const isUp = dir === 'up'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 20 }}>
      {Array.from({ length: 6 }, (_, i) => {
        const h = 7 + (isUp ? i : 5 - i) * 2.6
        const on = i < filled
        return (
          <span
            key={i}
            style={{
              width: 11, height: h, transform: 'skewX(-14deg)', boxSizing: 'border-box',
              background: on
                ? (isUp ? 'linear-gradient(180deg,#8ff5e8,#2fc4b6)' : 'linear-gradient(180deg,#f8837a,#d93a30)')
                : 'transparent',
              border: `1px solid ${isUp
                ? (on ? 'rgba(94,242,228,.9)' : 'rgba(94,242,228,.35)')
                : (on ? 'rgba(247,80,73,.9)' : 'rgba(247,80,73,.35)')}`,
            }}
          />
        )
      })}
    </div>
  )
}

/** 机械端头接口(红框 + 实心块 + 引线) */
function MechEnd({ mirror }: { mirror?: boolean }) {
  return (
    <div style={{ width: 30, height: 24, position: 'relative', flex: 'none', ...(mirror ? { transform: 'scaleX(-1)' } : {}) }}>
      <span style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: 13, border: `1.5px solid ${DOWN}` }} />
      <span style={{ position: 'absolute', left: 4, top: 8, width: 8, height: 8, background: DOWN, boxShadow: '0 0 7px rgba(247,80,73,.7)' }} />
      <span style={{ position: 'absolute', left: 16, right: 0, top: 11, height: 2, background: DOWN }} />
    </div>
  )
}

const CORNER_MICRO = { fontFamily: MONO, fontSize: 6, color: 'rgba(247,80,73,.7)', letterSpacing: 2 } as const

/**
 * 资产类结构 — CP LOADING 组件(设计稿):
 * 左「▲ 上涨」青量表 | 中央 BREADTH + 机械端头夹红色斜纹流动量条 | 右「▼ 下跌」红量表
 * + MKT.PULSE 心电线 + 总数/成交额。美股/加密切换。
 */
export function AssetClassCard({ boards }: { boards: OverviewMarket['boards'] }) {
  const [selected, setSelected] = useState('美股')
  const active = boards.find(b => b.board === selected) ?? boards[0]
  const upPct = active ? Math.max(0, Math.min(100, active.up_pct)) : 0

  return (
    <GlassCard corners style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 15px', borderBottom: DIVIDER }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: TXT_CARD_TITLE, letterSpacing: 2 }}>资产类结构</span>
        <span style={{ fontFamily: MONO, fontSize: 7.5, color: TXT_FAINT, letterSpacing: 2 }}>ASSET.MIX // MARKET BREADTH</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: '1.5px solid rgba(213,240,33,.5)' }}>
          {boards.map(b => {
            const isActive = b.board === (active?.board ?? '')
            return (
              <span
                key={b.board}
                onClick={() => setSelected(b.board)}
                style={{
                  fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5,
                  padding: '2.5px 12px', cursor: 'pointer',
                  background: isActive ? NEON : 'transparent',
                  color: isActive ? INK : NEON,
                }}
              >
                {b.board}
              </span>
            )
          })}
        </div>
      </div>

      {!active ? (
        <DotGridEmpty text="暂无数据" minHeight={90} maskStop={40} />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '13px 17px 11px' }}>
          {/* 左: 上涨量表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 'none', minWidth: 96 }}>
            <span style={{ fontFamily: MONO, fontSize: 21, fontWeight: 700, color: UP, lineHeight: 1 }}>▲ {active.up}</span>
            <NotchMeter pct={upPct} dir="up" />
            <span style={{ fontFamily: MONO, fontSize: 7.5, color: TXT_WEAK, letterSpacing: 1.5 }}>上涨 // ADV {upPct.toFixed(1)}%</span>
          </div>

          {/* 中央: CP LOADING 组件 */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', gap: 4, padding: '2px 6px', minWidth: 0 }}>
            <span style={{ ...CORNER_MICRO, position: 'absolute', top: -2, left: 2 }}>▪▪ · ▪▪</span>
            <span style={{ ...CORNER_MICRO, position: 'absolute', top: -2, right: 2 }}>▪▪ · ▪▪</span>
            <span style={{ ...CORNER_MICRO, position: 'absolute', bottom: -2, left: 2 }}>▪▪ · ▪▪</span>
            <span style={{ ...CORNER_MICRO, position: 'absolute', bottom: -2, right: 2 }}>▪▪ · ▪▪</span>
            <span style={{ position: 'absolute', top: '34%', left: '22%', width: 4, height: 4, borderRadius: '50%', background: DOWN, opacity: .8 }} />
            <span style={{ position: 'absolute', top: '18%', right: '30%', width: 3, height: 3, borderRadius: '50%', background: DOWN, opacity: .6 }} />
            <span style={{ position: 'absolute', bottom: '22%', left: '44%', width: 3, height: 3, borderRadius: '50%', background: DOWN, opacity: .6 }} />
            <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 34px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: TXT_BODY, letterSpacing: 4 }}>BREADTH</span>
              <span style={{ flex: 1, textAlign: 'center', fontFamily: MONO, fontSize: 16, fontWeight: 700, color: DOWN, textShadow: '0 0 10px rgba(247,80,73,.5)' }}>
                {upPct.toFixed(1)}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: '#c9938e', letterSpacing: 1 }}>{active.up} · {active.down}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MechEnd />
              <div style={{ flex: 1, height: 17, border: '1px solid rgba(247,80,73,.6)', padding: 3, boxSizing: 'border-box' }}>
                <div style={{ width: `${upPct}%`, height: '100%', position: 'relative', overflow: 'hidden', boxShadow: '0 0 12px rgba(247,80,73,.25)' }}>
                  <span
                    className="cpfx"
                    style={{
                      position: 'absolute', top: 0, bottom: 0, left: -16, right: -16,
                      background: 'repeating-linear-gradient(135deg,#f75049 0 5px,transparent 5px 10px)',
                      animation: 'cpStripe .8s linear infinite', willChange: 'transform',
                    }}
                  />
                </div>
              </div>
              <MechEnd mirror />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <span style={{ width: 6, height: 6, border: '1px solid rgba(247,80,73,.7)', flex: 'none' }} />
              <div style={{ width: '38%', height: 9, border: '1px solid rgba(247,80,73,.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 3px', boxSizing: 'border-box' }}>
                <span style={{ width: 4, height: 4, background: DOWN }} />
                <span style={{ fontFamily: MONO, fontSize: 5.5, fontWeight: 700, color: DOWN, letterSpacing: 3 }}>C - A/FLOW.2077</span>
                <span style={{ width: 4, height: 4, background: DOWN }} />
              </div>
              <span style={{ width: 6, height: 6, border: '1px solid rgba(247,80,73,.7)', flex: 'none' }} />
            </div>
          </div>

          {/* 右: 下跌量表 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 'none', alignItems: 'flex-end', minWidth: 96 }}>
            <span style={{ fontFamily: MONO, fontSize: 21, fontWeight: 700, color: DOWN, lineHeight: 1 }}>▼ {active.down}</span>
            <NotchMeter pct={100 - upPct} dir="down" />
            <span style={{ fontFamily: MONO, fontSize: 7.5, color: TXT_WEAK, letterSpacing: 1.5 }}>下跌 // DEC {(100 - upPct).toFixed(1)}%</span>
          </div>

          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(213,240,33,.18)', flex: 'none' }} />

          {/* MKT.PULSE 心电线 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none', alignItems: 'flex-end' }}>
            <svg width="118" height="24" viewBox="0 0 118 24" style={{ display: 'block' }}>
              <path
                className="cpfx"
                d="M0 13H26L32 4L38 20L44 13H64L70 6L76 18L82 13H118"
                fill="none" stroke={DOWN} strokeWidth="1.6" strokeLinejoin="round"
                strokeDasharray="150 90"
                style={{ animation: 'cpEcg 2.6s linear infinite', filter: 'drop-shadow(0 0 4px rgba(247,80,73,.5))' }}
              />
            </svg>
            <span style={{ fontFamily: MONO, fontSize: 7.5, color: TXT_WEAK, letterSpacing: 1.5 }}>
              MKT.PULSE <b style={{ color: UP, fontSize: 11 }}>{active.count}</b> SYMS
            </span>
          </div>

          <span style={{ width: 1, alignSelf: 'stretch', background: 'rgba(213,240,33,.18)', flex: 'none' }} />

          {/* 总数 / 成交额 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 'none', alignItems: 'flex-end' }}>
            <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: NEON }}>{active.count} 只</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: TXT_WEAK }}>{fmtBigNum(active.amount)}</span>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
