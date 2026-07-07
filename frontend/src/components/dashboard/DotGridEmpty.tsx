import { MONO, TXT_WEAK } from './tokens'

/** 空态 — 黄色点阵网格 + 径向遮罩渐隐 + 「// 」注释风提示 */
export function DotGridEmpty({ text, minHeight = 96, maskStop = 30 }: { text: string; minHeight?: number; maskStop?: number }) {
  const mask = `radial-gradient(closest-side,#000 ${maskStop}%,transparent)`
  return (
    <div
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight, position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute', inset: 6,
          backgroundImage: 'radial-gradient(rgba(213,240,33,.28) 1px,transparent 1.5px)',
          backgroundSize: '15px 15px',
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
      <span style={{ position: 'relative', fontSize: 9.5, color: TXT_WEAK, letterSpacing: 2, fontFamily: MONO }}>
        {`// ${text}`}
      </span>
    </div>
  )
}
