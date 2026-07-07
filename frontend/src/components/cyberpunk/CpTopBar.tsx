import { INK, MONO, NEON, UP, DOWN, clipBL } from '@/components/dashboard/tokens'

interface CpTopBarProps {
  /** 黄色协议块居中黑字标题, 如 MARKET DASHBOARD PROTOCOL // FULL-SPECTRUM SCAN */
  protocol: string
  /** 设备编号(右下行) */
  deviceId?: string
  /** 实时行情是否运行中 → LIVE·ON(青) / LIVE·OFF(红) */
  live?: boolean
}

const DASH_LINE = 'repeating-linear-gradient(90deg,rgba(213,240,33,.6) 0 5px,transparent 5px 34px)'
const DASH_LINE_DIM = 'repeating-linear-gradient(90deg,rgba(213,240,33,.45) 0 5px,transparent 5px 34px)'

/**
 * NET_TECH 顶栏(design_handoff_cyberpunk 两页共用):
 * ALPHA≡FLOW 线条字标 → 三行点划虚线 → 黄色协议块(左下斜切 + 弱泛光 + 偶发 glitch) → 条码块;
 * 下行右对齐设备编号 + LIVE 徽章。
 */
export function CpTopBar({ protocol, deviceId = 'EKUMER 62UZ-FFLH-9YLT-E3Z7', live = false }: CpTopBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 18px 0' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 26 }}>
        {/* ALPHA≡FLOW 线条字标 */}
        <div style={{ flex: 'none', width: 320, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3.5 }}>
          <span style={{ height: 1, background: NEON, opacity: .75 }} />
          <span style={{ height: 1, background: NEON, opacity: .55, width: '86%' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 23, fontWeight: 700, letterSpacing: 3, color: NEON, lineHeight: 1 }}>
            <span>ALPHA</span>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ height: 2, background: NEON }} />
              <span style={{ height: 2, background: NEON }} />
              <span style={{ height: 2, background: NEON }} />
            </span>
            <span>FLOW</span>
          </div>
          <span style={{ height: 1, background: NEON, opacity: .55, width: '93%' }} />
          <span style={{ height: 1, background: NEON, opacity: .75 }} />
        </div>
        {/* 三行点划虚线 */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '6px 0', opacity: .65 }}>
          <span style={{ height: 2, backgroundImage: DASH_LINE }} />
          <span style={{ height: 2, backgroundImage: DASH_LINE_DIM, backgroundPosition: '14px 0' }} />
          <span style={{ height: 2, backgroundImage: DASH_LINE }} />
        </div>
        {/* 黄色协议块(clip-path 裁 filter 光晕 → 外壳 div 承载 drop-shadow) */}
        <div style={{ flex: 'none', width: 600, filter: 'drop-shadow(0 0 9px rgba(213,240,33,.28))' }}>
          <div
            className="cpfx"
            style={{
              height: '100%', position: 'relative', background: NEON,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              clipPath: clipBL(10), animation: 'cpBlockG 6.5s steps(1) infinite',
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: INK, letterSpacing: 3 }}>{protocol}</span>
            <span style={{ position: 'absolute', left: 12, bottom: 4, fontFamily: MONO, fontSize: 5.5, fontWeight: 700, color: 'rgba(13,11,7,.7)', letterSpacing: .5 }}>
              ONLY CERTIFIED QUANT OFFICERS ARE ALLOWED TO MANIPULATE, ACCESS OR DISABLE THIS DEVICE.
            </span>
          </div>
        </div>
        {/* 条码块 */}
        <div style={{ flex: 'none', width: 64, background: 'repeating-linear-gradient(90deg,#d5f021 0 2px,transparent 2px 5px)', opacity: .9 }} />
      </div>
      {/* 下行: 设备编号 + LIVE 徽章 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '2px 2px 0' }}>
        <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, color: NEON, letterSpacing: 1.5, opacity: .85 }}>{deviceId}</span>
        <span
          className="cpfx"
          style={{
            fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: '0 5px',
            color: live ? UP : DOWN,
            background: live ? 'rgba(94,242,228,.12)' : 'rgba(247,80,73,.14)',
            border: live ? '1px solid rgba(94,242,228,.5)' : '1px solid rgba(247,80,73,.5)',
            animation: 'cpGlitch 5s steps(1) infinite 1.2s',
          }}
        >
          {live ? 'LIVE·ON' : 'LIVE·OFF'}
        </span>
      </div>
    </div>
  )
}
