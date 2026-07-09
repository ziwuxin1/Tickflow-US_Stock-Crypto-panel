/**
 * Followin 智能体控制台 —— 窗口机制 hook。
 * 顶栏拖动 + 四边四角八向缩放(夹取视口内,最小 620×460)+ 阅读区字号缩放(80%–115%)。
 * 拖动/缩放用 ref 记录起点,全局 pointer 事件驱动;位置/字号持久化到 localStorage。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { loadUI, saveUI } from './store'
import type { WinRect } from './types'

export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_W = 620
const MIN_H = 460
const MARGIN = 4
const FONT_MIN = 0.8
const FONT_MAX = 1.15
const FONT_STEP = 0.1

const vw = () => window.innerWidth
const vh = () => window.innerHeight

function clampRect(r: WinRect): WinRect {
  const w = Math.max(MIN_W, Math.min(r.w, vw() - MARGIN * 2))
  const h = Math.max(MIN_H, Math.min(r.h, vh() - MARGIN * 2))
  const x = Math.max(MARGIN, Math.min(r.x, vw() - MARGIN - w))
  const y = Math.max(MARGIN, Math.min(r.y, vh() - MARGIN - h))
  return { x, y, w, h }
}

function centered(): WinRect {
  const w = Math.min(1720, vw() - 8)
  const h = Math.min(1180, vh() - 8)
  return clampRect({ w, h, x: (vw() - w) / 2, y: (vh() - h) / 2 })
}

export interface WindowCtl {
  win: WinRect
  fontScale: number
  startDrag: (e: ReactPointerEvent) => void
  startResize: (dir: ResizeDir) => (e: ReactPointerEvent) => void
  incFont: () => void
  decFont: () => void
  resetFont: () => void
}

export function useWindow(open: boolean): WindowCtl {
  const [win, setWin] = useState<WinRect>(() => {
    const saved = loadUI().win
    return saved ? clampRect(saved) : centered()
  })
  const [fontScale, setFontScale] = useState<number>(() => loadUI().fontScale || 1)

  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const rz = useRef<{ sx: number; sy: number; dir: ResizeDir; rect: WinRect } | null>(null)

  // 打开时若窗口跑到视口外(改过分辨率),重新夹取
  useEffect(() => {
    if (open) setWin(w => clampRect(w))
  }, [open])

  // 全局 pointer 监听:拖动 / 缩放
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (drag.current) {
        const d = drag.current
        setWin(prev => clampRect({ ...prev, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
      } else if (rz.current) {
        const r = rz.current
        const dx = e.clientX - r.sx
        const dy = e.clientY - r.sy
        let { x, y, w, h } = r.rect
        if (r.dir.includes('e')) w = r.rect.w + dx
        if (r.dir.includes('s')) h = r.rect.h + dy
        if (r.dir.includes('w')) { w = r.rect.w - dx; x = r.rect.x + dx }
        if (r.dir.includes('n')) { h = r.rect.h - dy; y = r.rect.y + dy }
        // 左/上缩到最小时保持右/下边不动
        if (w < MIN_W && r.dir.includes('w')) x = r.rect.x + (r.rect.w - MIN_W)
        if (h < MIN_H && r.dir.includes('n')) y = r.rect.y + (r.rect.h - MIN_H)
        setWin(clampRect({ x, y, w, h }))
      }
    }
    const up = () => {
      if (drag.current || rz.current) {
        drag.current = null
        rz.current = null
        setWin(prev => { saveUI({ win: prev }); return prev })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const startDrag = useCallback((e: ReactPointerEvent) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: win.x, oy: win.y }
  }, [win.x, win.y])

  const startResize = useCallback((dir: ResizeDir) => (e: ReactPointerEvent) => {
    e.stopPropagation()
    rz.current = { sx: e.clientX, sy: e.clientY, dir, rect: { ...win } }
  }, [win])

  const setFont = useCallback((v: number) => {
    const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(v * 100) / 100))
    setFontScale(clamped)
    saveUI({ fontScale: clamped })
  }, [])
  const incFont = useCallback(() => setFont(fontScale + FONT_STEP), [fontScale, setFont])
  const decFont = useCallback(() => setFont(fontScale - FONT_STEP), [fontScale, setFont])
  const resetFont = useCallback(() => setFont(1), [setFont])

  return { win, fontScale, startDrag, startResize, incFont, decFont, resetFont }
}
