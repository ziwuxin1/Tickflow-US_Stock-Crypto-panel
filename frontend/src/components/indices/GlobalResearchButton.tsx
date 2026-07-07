/**
 * Global 研究按钮 — 组装当前标的的 /global-stock-data 完整研究提示词并复制到剪贴板,
 * 粘贴到 Claude Code 即可运行 global-stock-data 技能拉取全量数据(行情/财务/评级/持仓/资金/新闻/SEC/期权)。
 */
import { useRef, useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { toast } from '@/components/Toast'
import { coinBase, MONO } from './tokens'

interface GlobalResearchButtonProps {
  symbol: string
  name: string
}

function isCryptoSymbol(symbol: string) {
  return /(USDT|USDC|BUSD)$/i.test(symbol)
}

/** 组装 global-stock-data 研究提示词(9 项数据 + 中文总结与操作建议) */
export function buildResearchPrompt(symbol: string, name: string): string {
  const crypto = isCryptoSymbol(symbol)
  const market = crypto ? '加密货币' : '美股'
  const tag = crypto ? coinBase(symbol) : `$${symbol.replace(/\..*$/, '')}`
  const cryptoNote = crypto
    ? '\n（加密标的：跳过财务三表/机构持仓/SEC/期权等股票专属部分，重点分析行情结构、链上/衍生品数据与资金流。）\n'
    : ''
  return `/global-stock-data 我要研究 [${name} ${tag}]（[市场：${market}]），
请用 global-stock-data 技能给我一份完整研究报告。
${cryptoNote}
需要包含：
1. 公司基本信息（当前股价、涨跌幅、市值、52周高低）
2. 近期 K 线（最近 6 个月日线）+ 技术指标判断
   - MACD 金叉/死叉
   - RSI 超买/超卖
   - KDJ 交叉
   - 布林带突破/收窄
3. 关键财务指标（最近 4 期）：营收、净利、毛利率、ROE、资产负债率
4. 财务三表摘要：利润表 / 资产负债表 / 现金流量表
5. 分析师评级 + 目标价（buy/hold/sell + 目标价区间）
6. 机构持仓（前 10 大机构 + 内部人持股比例）
7. 资金流向（最近 30 天主力净流入/流出趋势）
8. 新闻 + SEC 文件（最近 10 条新闻、近期 10-K/10-Q/8-K 摘要）
9. 期权链（美股才有，港股跳过）

最后给 1-2 段中文总结：
- 一句话观点（看多/看空/中性）
- 主要风险点
- 主要机会点
- 操作建议（给出具体价格区间，例如：
  现有持仓：建议在什么区间分批减仓/加仓、是否保留底仓；
  未持仓：不要在什么价位追入，建议等到什么区间或出现什么信号再操作）`
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 非安全上下文回退(局域网 IP 访问时 clipboard API 不可用)
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export function GlobalResearchButton({ symbol, name }: GlobalResearchButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number>()

  const onClick = async () => {
    if (!symbol) {
      toast('请先选择一个标的', 'error')
      return
    }
    const ok = await copyText(buildResearchPrompt(symbol, name))
    if (!ok) {
      toast('复制失败,请手动复制', 'error')
      return
    }
    toast(`已复制 ${name} 的 global-stock-data 研究提示词,粘贴到 Claude Code 运行即可`, 'success')
    setCopied(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), 2200)
  }

  return (
    <button
      onClick={onClick}
      title="复制 global-stock-data 深度研究提示词(行情/财务/评级/持仓/资金/新闻/SEC/期权),粘贴到 Claude Code 运行"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600,
        color: '#e6dbff', background: 'rgba(140,100,240,.14)', border: '1px solid rgba(177,140,255,.35)',
        borderRadius: 9, padding: '8px 15px', cursor: 'pointer', fontFamily: 'inherit',
        boxShadow: '0 3px 14px rgba(140,100,240,.18)',
      }}
    >
      {copied ? <Check size={13} color="#b18cff" /> : <Sparkles size={13} color="#b18cff" />}
      {copied ? '已复制提示词' : 'Global 研究'}
      <span style={{ fontSize: 9.5, color: '#9a86d8', fontFamily: MONO, letterSpacing: 0.5 }}>SKILL</span>
    </button>
  )
}
