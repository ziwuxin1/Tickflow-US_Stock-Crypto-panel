import { INK, MONO, NEON, TXT_WEAK } from '@/components/dashboard/tokens'

interface CpFooterProps {
  /** 键位提示行(可选), 如 [{ k: '/', label: '搜索标的' }] */
  keys?: { k: string; label: string }[]
}

/**
 * 页脚状态条(design_handoff_cyberpunk 两页共用):
 * 细线(两段亮黄) + 一行微缩状态 + 可选黄底键位提示行。纯装饰性机读文案。
 */
export function CpFooter({ keys }: CpFooterProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 0' }}>
      <div style={{ position: 'relative', height: 1, background: 'rgba(213,240,33,.22)' }}>
        <span style={{ position: 'absolute', left: '36%', width: 130, height: 2, top: -1, background: NEON }} />
        <span style={{ position: 'absolute', right: 64, width: 40, height: 2, top: -1, background: NEON, opacity: .7 }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: MONO, fontSize: 8, letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: NEON, fontWeight: 700 }}>
          <span style={{ width: 7, height: 7, background: NEON }} />000.00
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(213,240,33,.7)' }}>
          <span style={{ width: 5, height: 5, background: 'rgba(213,240,33,.7)' }} />MIRRORING IMG FROM SERV. 230045.2452.234
        </span>
        <span style={{ background: NEON, color: INK, fontWeight: 700, padding: '1.5px 7px' }}>POWERED BY ALPHAFLOW.DD GENERATION.V</span>
        <span style={{ color: 'rgba(213,240,33,.55)' }}>DYNAMIC LINK CONNECTION:ENABLED://PRE-ALPHA BUILD-3498234.2346.5B</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: NEON, fontWeight: 700 }}>F008-358305-2000QU05.RTM</span>
        <span style={{ background: NEON, color: INK, fontWeight: 700, padding: '1.5px 6px' }}>▮ 84.35</span>
      </div>
      {keys && keys.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 22, fontFamily: MONO, fontSize: 9.5, color: TXT_WEAK, letterSpacing: 1 }}>
          {keys.map(({ k, label }) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: INK, background: NEON, padding: '0 5px', fontWeight: 700 }}>{k}</span>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
