import { useEffect, useMemo, useState } from 'react'
import { isCrypto } from '@/lib/markets'
import { COIN_COLOR, COIN_COLOR_DEFAULT, COIN_DARK_TEXT, ICON_BG, MONO, coinBase } from './tokens'

interface CoinIconProps {
  symbol: string
  size?: number
}

/**
 * 币种方徽(CP 直角) — 优先加载真实 logo(coincap → spothq CDN), 失败回退彩色字母徽章。
 * 美股 symbol(带 . 后缀)不请求 CDN, 直接字母徽章。
 */
export function CoinIcon({ symbol, size = 24 }: CoinIconProps) {
  const base = coinBase(symbol)
  const sources = useMemo(() => {
    if (!isCrypto(symbol)) return []
    const s = base.toLowerCase()
    // 三级回退: coincap(主流币) → binance-icons(币安上市币, 覆盖冷门交易对) → spothq
    return [
      `https://assets.coincap.io/assets/icons/${s}@2x.png`,
      `https://cdn.jsdelivr.net/gh/vadimmalykhin/binance-icons/crypto/${encodeURIComponent(s)}.svg`,
      `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@0.18.1/svg/color/${encodeURIComponent(s)}.svg`,
    ]
  }, [symbol, base])
  const [srcIdx, setSrcIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
  // 行复用/切换标的时重置回退进度(设计稿 README 警告的图标错位问题)
  useEffect(() => { setSrcIdx(0); setLoaded(false) }, [symbol])
  const src = srcIdx < sources.length ? sources[srcIdx] : null

  return (
    <span
      style={{
        width: size, height: size, flex: 'none',
        background: COIN_COLOR[base] ?? COIN_COLOR_DEFAULT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.max(8, Math.round(size / 3)), fontWeight: 700, fontFamily: MONO,
        color: COIN_DARK_TEXT.has(base) ? '#241b04' : '#fff',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {base.slice(0, 2)}
      {src && (
        <img
          src={src}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(false); setSrcIdx(i => i + 1) }}
          style={{
            position: 'absolute', top: 0, left: 0, width: size, height: size,
            objectFit: 'contain', padding: Math.max(1, Math.round(size / 12)),
            boxSizing: 'border-box', background: ICON_BG,
            opacity: loaded ? 1 : 0, transition: 'opacity .25s',
          }}
        />
      )}
    </span>
  )
}
