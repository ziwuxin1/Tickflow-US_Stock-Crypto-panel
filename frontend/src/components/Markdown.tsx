/**
 * Markdown 渲染 —— 用于 AI 生成的报告(表格 / 标题 / 加粗 / 列表 / 链接)。
 * 主题化各元素样式(暗色 + cyberpunk 青),表格支持横向滚动。
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`text-[12.5px] leading-relaxed text-secondary ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="text-base font-bold text-foreground mt-3 mb-1.5" {...p} />,
          h2: (p) => <h2 className="text-sm font-bold text-[#5ef2e4] mt-3 mb-1.5 pb-0.5 border-b border-[#5ef2e4]/15" {...p} />,
          h3: (p) => <h3 className="text-[13px] font-semibold text-foreground mt-2.5 mb-1" {...p} />,
          p: (p) => <p className="my-1.5" {...p} />,
          strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
          em: (p) => <em className="text-muted" {...p} />,
          ul: (p) => <ul className="list-disc pl-5 my-1.5 space-y-1" {...p} />,
          ol: (p) => <ol className="list-decimal pl-5 my-1.5 space-y-1" {...p} />,
          li: (p) => <li className="marker:text-muted/60" {...p} />,
          a: (p) => <a className="text-[#5ef2e4] hover:underline break-all" target="_blank" rel="noreferrer" {...p} />,
          code: (p) => <code className="px-1 py-0.5 rounded bg-white/10 font-mono text-[11px] text-[#8ff5e8]" {...p} />,
          hr: () => <hr className="border-border/40 my-3" />,
          blockquote: (p) => <blockquote className="border-l-2 border-[#5ef2e4]/40 pl-3 text-muted my-1.5" {...p} />,
          table: (p) => (
            <div className="overflow-x-auto my-2 rounded-lg border border-border/40">
              <table className="w-full text-[11px] border-collapse" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-[rgba(94,242,228,.08)]" {...p} />,
          th: (p) => <th className="border-b border-border/40 px-2.5 py-1.5 text-left font-semibold text-foreground whitespace-nowrap" {...p} />,
          td: (p) => <td className="border-b border-border/20 px-2.5 py-1.5 align-top" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
