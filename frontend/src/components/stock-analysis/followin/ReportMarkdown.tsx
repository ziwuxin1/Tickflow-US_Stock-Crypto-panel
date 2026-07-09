/**
 * Followin 智能体控制台 —— 报告卡专用 Markdown 渲染(Cyberpunk 报告样式)。
 * 与通用 @/components/Markdown 区别:
 *   - 章节头 h2 = 「01/02」黄底序号徽标 + 黄色标题 + 渐隐横线
 *   - 子节 h3 = mono 小标签(如 2.1 现价与近期走势)
 *   - 数据表 = 黄描边 + mono 表头 + 数值列 mono 700,涨绿(青)跌红
 *   - 结论加粗 = 酸性黄
 * 设计交接稿 §4「报告卡」对齐。
 */
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chamfer } from './theme'

/** 递归抽取子节点纯文本(用于解析章节序号 / 判断数值单元格)。 */
function toText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(toText).join('')
  const anyNode = node as { props?: { children?: ReactNode } }
  if (anyNode.props) return toText(anyNode.props.children)
  return ''
}

/** 从「1. 一句话结论 / 01 一句话结论」提取零填充序号徽标 + 纯标题。 */
function splitHeading(children: ReactNode): { badge?: string; title: ReactNode } {
  const text = toText(children)
  const m = text.match(/^\s*(\d{1,2})[.、)\s]\s*(.+)$/)
  if (m) return { badge: m[1].padStart(2, '0'), title: m[2] }
  return { title: children }
}

/** 单元格方向着色:跌红 / 涨青,中性返回 null。 */
function directionColor(t: string): string | null {
  if (/[-−]\s*[\d.]+\s*%/.test(t) || /^\s*[-−][\d.]/.test(t) || /(下跌|回落|领跌)/.test(t)) return '#f75049'
  if (/\+\s*[\d.]+\s*%/.test(t) || /^\s*\+[\d.]/.test(t) || /(上涨|走高|领涨|↑)/.test(t)) return '#5ef2e4'
  return null
}

export function ReportMarkdown({ children }: { children: string }) {
  return (
    <div
      className="text-[14px] leading-[1.9] text-[#c8c5b4]"
      style={{ fontFamily: "'Microsoft YaHei','微软雅黑','PingFang SC',sans-serif" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 text-[19px] font-bold text-[#e8e6d8]">{children}</h1>,
          h2: ({ children }) => {
            const { badge, title } = splitHeading(children)
            return (
              <div className="mb-2 mt-5 flex items-center gap-2.5">
                {badge && (
                  <span
                    className="shrink-0 bg-[#d5f021] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#0d0b07]"
                    style={{ clipPath: chamfer(3) }}
                  >
                    {badge}
                  </span>
                )}
                <span className="text-[15px] font-bold text-[#d5f021]">{title}</span>
                <span className="h-px flex-1" style={{ background: 'linear-gradient(90deg, rgba(213,240,33,.4), transparent)' }} />
              </div>
            )
          },
          h3: ({ children }) => (
            <div className="mb-1.5 mt-3.5 font-mono text-[11px] tracking-wide text-[#a8b830]">{children}</div>
          ),
          h4: ({ children }) => <div className="mb-1 mt-2 text-[13px] font-semibold text-[#c8c5b4]">{children}</div>,
          p: ({ children }) => <p className="my-2">{children}</p>,
          strong: ({ children }) => {
            // 只有【短关键词】才上酸黄;AI 常把整句/整段也加粗——那样一坨黄很刺眼,
            // 改成正常奶白粗体(可读、不喧宾夺主)。
            const t = toText(children)
            const isKeyword = t.length <= 16 && !/[。；;,,]/.test(t)
            return <strong className="font-bold" style={{ color: isKeyword ? '#d5f021' : '#e8e6d8' }}>{children}</strong>
          },
          em: ({ children }) => <em className="not-italic text-[#8f8c7a]">{children}</em>,
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="marker:text-[#6a6754]">{children}</li>,
          a: ({ children, href }) => (
            <a className="text-[#5ef2e4] underline decoration-[rgba(94,242,228,.5)] hover:text-[#8ff5e8]" target="_blank" rel="noreferrer" href={href}>{children}</a>
          ),
          code: ({ children }) => (
            <code className="bg-[rgba(213,240,33,.1)] px-1 py-0.5 font-mono text-[12px] text-[#eefb8a]">{children}</code>
          ),
          hr: () => <hr className="my-3.5 border-[rgba(213,240,33,.14)]" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-[rgba(213,240,33,.4)] bg-[rgba(213,240,33,.03)] py-1 pl-3 text-[#8f8c7a]">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto border border-[rgba(213,240,33,.22)]">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead style={{ background: 'rgba(213,240,33,.07)' }}>{children}</thead>,
          th: ({ children }) => (
            <th className="whitespace-nowrap border-b border-[rgba(213,240,33,.22)] px-3 py-1.5 text-left font-mono text-[10px] font-semibold tracking-wide text-[#a8b830]">{children}</th>
          ),
          td: ({ children }) => {
            const raw = toText(children).trim()
            const dir = directionColor(raw)
            const isNumeric = /\d/.test(raw) && (/[$%]/.test(raw) || /^[+\-−]?[\d,.]+/.test(raw))
            const color = dir ?? (isNumeric ? '#e8e6d8' : '#b8b4a0')
            const mono = isNumeric || !!dir
            // 拆出末尾括号注(如「现价 (2026-…)」「-1.77% (63,363→…)」),用 mono 弱色小字
            const m = raw.match(/^(.+?)\s*([（(][^（(]*[)）])\s*$/)
            return (
              <td
                className="border-b border-[rgba(213,240,33,.08)] px-3 py-1.5 align-top text-[13px]"
                style={{ color, fontFamily: mono ? "'JetBrains Mono', monospace" : "'Microsoft YaHei','微软雅黑',sans-serif", fontWeight: mono ? 700 : 400 }}
              >
                {m ? (
                  <>
                    {m[1]}
                    <span className="ml-1 font-mono text-[11px] font-normal text-[#6a6754]">{m[2]}</span>
                  </>
                ) : children}
              </td>
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
