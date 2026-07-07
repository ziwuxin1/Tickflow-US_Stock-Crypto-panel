/**
 * 通用标的 LOGO — 美股拉真实公司 logo(CDN), 失败降级为渐变字母徽章;
 * 加密标的复用 CoinIcon。徽章风格对齐指数页 ETF badge(圆角渐变 + 等宽字)。
 */
import { useEffect, useState } from 'react'
import { CoinIcon } from '@/components/dashboard/CoinIcon'
import { MONO } from '@/components/dashboard/tokens'

/** 渐变配色池: 按 symbol 哈希稳定取色 */
const GRADS = [
  'linear-gradient(135deg,#5b8df0,#3454b4)',
  'linear-gradient(135deg,#9b6df0,#6a3fc0)',
  'linear-gradient(135deg,#2ecc80,#1a8a52)',
  'linear-gradient(135deg,#f0923c,#c05f1a)',
  'linear-gradient(135deg,#4dd8e8,#2591a8)',
  'linear-gradient(135deg,#e86a8a,#b03a5a)',
  'linear-gradient(135deg,#e8c84d,#b8922a)',
] as const

function hashPick(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return GRADS[Math.abs(h) % GRADS.length]
}

function isCryptoSymbol(symbol: string) {
  return !symbol.includes('.')
}

interface StockLogoProps {
  symbol: string
  size?: number
  className?: string
}

export function StockLogo({ symbol, size = 32, className }: StockLogoProps) {
  // 美股 logo 两级回退: parqet → nvstly(设计稿同款源), 全部失败降级字母徽章
  const [srcIdx, setSrcIdx] = useState(0)
  const base = (symbol || '').split('.')[0].toUpperCase()
  // 行复用/换标的时重置回退进度, 避免新标的直接显示字母徽章
  useEffect(() => { setSrcIdx(0) }, [symbol])
  if (!symbol) return null

  // 加密: 复用现有币种图标
  if (isCryptoSymbol(symbol)) {
    return (
      <span className={className} style={{ display: 'inline-flex', flex: 'none' }}>
        <CoinIcon symbol={symbol} size={size} />
      </span>
    )
  }

  const sources = [
    `https://assets.parqet.com/logos/symbol/${encodeURIComponent(base)}?format=png&size=${size * 2}`,
    `https://cdn.jsdelivr.net/gh/nvstly/icons@main/ticker_icons/${encodeURIComponent(base)}.png`,
  ]

  if (srcIdx < sources.length) {
    return (
      <img
        src={sources[srcIdx]}
        alt={base}
        width={size}
        height={size}
        className={className}
        style={{
          flex: 'none', borderRadius: 0, objectFit: 'cover',
          background: '#17140d', border: '1px solid rgba(213,240,33,.14)',
        }}
        onError={() => setSrcIdx(i => i + 1)}
        loading="lazy"
      />
    )
  }

  // 降级: 渐变字母徽章(对齐指数页 ETF badge 风格)
  return (
    <span
      className={className}
      style={{
        width: size, height: size, flex: 'none', borderRadius: 0,
        background: hashPick(base),
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(9, Math.round(size * 0.34)), fontWeight: 800, color: '#fff',
        fontFamily: MONO, letterSpacing: 0.5,
      }}
    >
      {base.slice(0, 2)}
    </span>
  )
}
