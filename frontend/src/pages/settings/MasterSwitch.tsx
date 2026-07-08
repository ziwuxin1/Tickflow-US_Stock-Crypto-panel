/**
 * 数据源主开关 —— 面板顶部的「启用 / 关闭」总开关(Followin / TickFlow 共用)。
 *
 * 关闭后由各自后端逻辑真正停用该数据源;此组件只负责展示与切换。
 */
interface MasterSwitchProps {
  enabled: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  pending?: boolean
}

export function MasterSwitch({ enabled, onChange, label, hint, pending }: MasterSwitchProps) {
  return (
    <div className={`rounded-card border px-4 py-3 flex items-center justify-between gap-4 transition-colors ${enabled ? 'border-accent/30 bg-accent/[0.05]' : 'border-border bg-surface'}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full shrink-0 ${enabled ? 'bg-emerald-400' : 'bg-muted/40'}`} />
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className={`text-[10px] px-1.5 py-px rounded-full font-mono border ${enabled ? 'text-emerald-400 border-emerald-400/30' : 'text-muted border-border'}`}>
            {enabled ? '已启用' : '已关闭'}
          </span>
        </div>
        {hint && <div className="text-[11px] text-muted mt-1 leading-relaxed">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        disabled={pending}
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full shrink-0 transition-colors duration-200 disabled:opacity-50 ${enabled ? 'bg-accent' : 'bg-elevated'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-[24px]' : 'translate-x-[4px]'}`} />
      </button>
    </div>
  )
}
