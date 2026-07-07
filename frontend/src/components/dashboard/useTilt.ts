import { useEffect } from 'react'

/**
 * 3D 倾斜交互 — document 级 mousemove 委托到 [data-mq] 卡片:
 * 按光标相对卡片中心位置 rotateX/rotateY ±10°, 移出回弹。
 * prefers-reduced-motion 时不启用。
 */
export function useTilt() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let tiltCard: HTMLElement | null = null

    const resetTilt = () => {
      if (!tiltCard) return
      tiltCard.style.transition = 'transform .55s cubic-bezier(.22,1,.36,1)'
      tiltCard.style.transform = ''
      tiltCard.style.zIndex = ''
      tiltCard = null
    }

    const onMove = (e: MouseEvent) => {
      const target = e.target as Element | null
      const card = target?.closest?.('[data-mq]') as HTMLElement | null
      if (tiltCard && tiltCard !== card) resetTilt()
      if (!card) return
      tiltCard = card
      const r = card.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      card.style.transition = 'transform .16s ease-out'
      card.style.willChange = 'transform'
      card.style.zIndex = '5'
      card.style.transform =
        `perspective(900px) rotateX(${(-py * 10).toFixed(2)}deg) rotateY(${(px * 10).toFixed(2)}deg) translateY(-4px) scale(1.012)`
    }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.documentElement.addEventListener('mouseleave', resetTilt)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.documentElement.removeEventListener('mouseleave', resetTilt)
      resetTilt()
    }
  }, [])
}
