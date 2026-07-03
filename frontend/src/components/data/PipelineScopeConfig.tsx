import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { QK } from '@/lib/queryKeys'

type PullKey = 'pipeline_pull_us_equity' | 'pipeline_pull_crypto' | 'pipeline_pull_etf' | 'pipeline_pull_index'

interface ScopeItem {
  key: PullKey
  label: string
  desc: string
  defaultOn: boolean
}

const ITEMS: ScopeItem[] = [
  { key: 'pipeline_pull_us_equity', label: '美股', desc: '美股全市场日K(约 1.2 万只, 含 ETF)', defaultOn: true },
  { key: 'pipeline_pull_crypto', label: '加密货币', desc: 'Binance USDT 现货主流币种日K(免 Key)', defaultOn: true },
  { key: 'pipeline_pull_index', label: '基准指数', desc: 'SPY/QQQ 等大盘基准 + BTC/ETH', defaultOn: true },
  { key: 'pipeline_pull_etf', label: 'ETF(独立通道)', desc: '美股 ETF 已含在主市场,一般无需开启', defaultOn: false },
]

export function PipelineScopeConfig() {
  const qc = useQueryClient()
  const prefs = useQuery({ queryKey: QK.preferences, queryFn: api.preferences })

  const updateToggle = useMutation({
    mutationFn: (cfg: Partial<Record<PullKey, boolean>>) => api.updatePipelinePullTypes(cfg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.preferences })
      qc.invalidateQueries({ queryKey: QK.dataStatus })
    },
  })

  const getValue = (key: PullKey, def: boolean) => prefs.data?.[key] ?? def

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-secondary leading-relaxed">
        勾选每日管道自动拉取的数据类型。仅影响后续同步,已存储的历史数据不受影响。
      </p>
      <div className="space-y-1.5">
        {ITEMS.map((item) => {
          const locked = item.key === 'pipeline_pull_us_equity'
          const on = locked || getValue(item.key, item.defaultOn)
          return (
            <div key={item.key}>
              <label
                className={`flex items-start gap-2.5 rounded-card border px-3 py-2.5 transition-colors ${
                  locked ? 'cursor-default' : 'cursor-pointer'
                } ${on ? 'border-accent/40 bg-accent/[0.05]' : 'border-border bg-base/30 hover:border-border/70'}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!locked) updateToggle.mutate({ [item.key]: !on } as never)
                  }}
                  disabled={locked || updateToggle.isPending}
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    on ? 'bg-accent border-accent' : 'bg-base border-border'
                  } ${locked ? 'opacity-80' : ''}`}
                  role="checkbox"
                  aria-checked={on}
                >
                  {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground">{item.label}</span>
                  </div>
                  <div className="text-[10px] text-muted leading-snug mt-0.5">{item.desc}</div>
                </div>
              </label>
            </div>
          )
        })}
      </div>
      {updateToggle.isPending && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          <Loader2 className="h-3 w-3 animate-spin" />保存中…
        </div>
      )}
      <div className="text-[10px] text-muted leading-relaxed pt-1">
        数据通道基于免费接口,所有档位均可拉取。
      </div>
    </div>
  )
}
