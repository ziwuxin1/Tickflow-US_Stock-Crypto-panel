/**
 * Followin 智能体控制台 —— 「智能体编辑器」覆盖层(Cyberpunk 2077 风格)。
 * 覆盖主区,分「身份」「擅长技能」两段:左侧头像+配色,右侧表单;技能卡按 news/decision 分组渲染。
 * 纯受控组件:所有状态改动都经由 onChange / onToggleSkill 回传给父组件,自身不持有草稿状态。
 */
import type { ReactNode } from 'react'
import { X, Check } from 'lucide-react'
import { Avatar } from './Decor'
import { AGENT_COLORS, chamfer, hexA, firstChar, CYAN, YELLOW } from './theme'
import type { DraftState, FollowinSkillDef } from './types'

interface AgentEditorProps {
  draft: DraftState
  editingId: string | null
  catalog: FollowinSkillDef[]
  groups: string[]
  saving: boolean
  onChange: (patch: Partial<DraftState>) => void
  onToggleSkill: (id: string) => void
  onCancel: () => void
  onSave: () => void
}

/** 表单输入框统一样式(黄描边,直角,聚焦变亮)。 */
const inputCls =
  'w-full border bg-[rgba(16,14,9,.5)] px-3 py-2 font-sans text-[13px] text-[#e8e6d8] outline-none placeholder:text-[#6a6754] border-[rgba(213,240,33,.25)] focus:border-[#d5f021] transition-colors'

/** 段标题:黄底黑字 mono 序号徽标 + 中文标题 + mono 英文小字。 */
function SectionHead({ no, title, en, right }: { no: string; title: string; en: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center bg-[#d5f021] font-mono text-[10px] font-bold text-[#0d0b07]"
        style={{ clipPath: chamfer(4) }}
      >
        {no}
      </span>
      <span className="font-sans text-[13px] font-bold text-[#e8e6d8]">{title}</span>
      <span className="font-mono text-[9px] tracking-widest text-[#6a6754]">{en}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
  )
}

/** 一个「BREACH 面板」风格的技能卡:青色描边/实边,点击整卡切换选中。 */
function SkillCard({ skill, selected, onToggle }: { skill: FollowinSkillDef; selected: boolean; onToggle: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() }
      }}
      className="group relative cursor-pointer border transition-colors"
      style={{
        clipPath: chamfer(13),
        borderColor: selected ? CYAN : hexA(CYAN, 0.18),
        background: selected ? '#0b1512' : 'rgba(16,14,9,.4)',
        boxShadow: selected ? `inset 0 0 24px ${hexA(CYAN, 0.08)}` : 'none',
      }}
    >
      {/* 选中时左侧青光脊 */}
      {selected && (
        <span
          className="pointer-events-none absolute left-0 top-0 h-full w-[3px]"
          style={{ background: CYAN, boxShadow: `0 0 8px ${hexA(CYAN, 0.7)}` }}
        />
      )}
      {/* 标题栏 */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{
          borderColor: selected ? hexA(CYAN, 0.3) : 'rgba(213,240,33,.1)',
          background: selected ? `linear-gradient(90deg, ${hexA(CYAN, 0.14)}, transparent 82%)` : 'transparent',
        }}
      >
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center border"
          style={{
            clipPath: chamfer(3),
            borderColor: selected ? CYAN : hexA(CYAN, 0.4),
            background: selected ? CYAN : 'transparent',
          }}
        >
          {selected && <Check size={11} strokeWidth={3} className="text-[#0d0b07]" />}
        </span>
        <span className="flex-1 truncate font-sans text-[13.5px] font-bold text-[#e8e6d8]">{skill.title}</span>
        {selected && (
          <span
            className="shrink-0 border px-1.5 py-0.5 font-mono text-[8px] tracking-widest"
            style={{ borderColor: hexA(CYAN, 0.5), color: CYAN }}
          >
            ON
          </span>
        )}
      </div>
      {/* 描述 */}
      <div className="px-3 py-2">
        <p
          className="font-sans text-[12px] leading-relaxed"
          style={{ color: selected ? '#fff' : '#dfe3df' }}
        >
          {skill.desc}
        </p>
      </div>
      {/* tag 行 */}
      <div className="flex items-center gap-1.5 px-3 pb-2.5">
        {skill.tags.map(t => (
          <span
            key={t}
            className="font-mono text-[9px] tracking-wide text-[#5ef2e4]"
            style={{ background: hexA(CYAN, 0.12), padding: '1px 5px' }}
          >
            {t}
          </span>
        ))}
        <span className="ml-auto font-mono text-[9px] text-[#6a6754]">{skill.id.slice(0, 1).toUpperCase()}</span>
      </div>
    </div>
  )
}

/** 智能体编辑器覆盖层(新建 / 编辑共用)。z-[7],覆盖主区。 */
export function AgentEditor(props: AgentEditorProps) {
  const { draft, editingId, catalog, groups, saving, onChange, onToggleSkill, onCancel, onSave } = props
  const skillCount = Object.keys(draft.skills).length
  const newsSkills = catalog.filter(c => c.group === 'news')
  const decisionSkills = catalog.filter(c => c.group === 'decision')

  return (
    <div
      className="absolute inset-0 z-[7] flex flex-col"
      style={{ background: 'linear-gradient(180deg, rgba(18,16,10,.99), rgba(11,9,8,.99))' }}
    >
      {/* 顶栏 */}
      <div className="flex flex-none items-center gap-3 border-b border-[rgba(213,240,33,.14)] px-5 py-3.5">
        <Avatar color={draft.color} char={firstChar(draft.name || 'A')} size={26} />
        <div className="flex flex-col leading-tight">
          <span className="font-sans text-[15px] font-bold text-[#e8e6d8]">
            {editingId ? '编辑智能体' : '新建智能体'}
          </span>
          <span className="font-mono text-[9px] tracking-widest text-[#6a6754]">
            CUSTOM AGENT · 身份 + 擅长技能
          </span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto flex h-7 w-7 items-center justify-center border border-[rgba(213,240,33,.25)] text-[#c8c5b4] transition-colors hover:border-[#d5f021] hover:text-[#d5f021]"
          style={{ clipPath: chamfer(5) }}
          aria-label="关闭"
        >
          <X size={14} />
        </button>
      </div>

      {/* 中部可滚动内容 */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8">
          {/* 01 身份 */}
          <section>
            <SectionHead no="01" title="身份" en="IDENTITY" />
            <div className="flex flex-col gap-5 sm:flex-row">
              {/* 左:头像预览 + 色板 */}
              <div className="flex shrink-0 flex-col items-center gap-3 sm:items-start">
                <Avatar color={draft.color} char={firstChar(draft.name || 'A')} size={76} />
                <div className="flex gap-2">
                  {AGENT_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`选择颜色 ${c}`}
                      onClick={() => onChange({ color: c })}
                      className="h-5 w-5 shrink-0"
                      style={{
                        background: c,
                        clipPath: chamfer(4),
                        boxShadow: draft.color === c ? `0 0 0 2px #0b0908, 0 0 0 3px ${c}` : 'none',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* 右:表单 */}
              <div className="flex flex-1 flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] tracking-widest text-[#8f8c7a]">名称 · NAME</span>
                  <input
                    className={inputCls}
                    value={draft.name}
                    onChange={e => onChange({ name: e.target.value })}
                    placeholder="如 Mike / Candy"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] tracking-widest text-[#8f8c7a]">角色头衔 · ROLE</span>
                  <input
                    className={inputCls}
                    value={draft.role}
                    onChange={e => onChange({ role: e.target.value })}
                    placeholder="如 美股分析师 / 加密货币分析师"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] tracking-widest text-[#8f8c7a]">分组 · GROUP</span>
                  <input
                    className={inputCls}
                    value={draft.group}
                    onChange={e => onChange({ group: e.target.value })}
                    placeholder="如 美股 / 加密 / 新闻"
                  />
                  {groups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {groups.map(g => {
                        const active = draft.group === g
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => onChange({ group: g })}
                            className="border px-2 py-0.5 font-mono text-[10px] transition-colors"
                            style={{
                              clipPath: chamfer(4),
                              borderColor: active ? YELLOW : 'rgba(213,240,33,.25)',
                              background: active ? YELLOW : 'transparent',
                              color: active ? '#0d0b07' : '#c8c5b4',
                            }}
                          >
                            {g}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] tracking-widest text-[#8f8c7a]">一句话简介 · BIO</span>
                  <textarea
                    className={`${inputCls} min-h-[64px] resize-none`}
                    value={draft.desc}
                    onChange={e => onChange({ desc: e.target.value })}
                    placeholder="这个智能体擅长什么、关注什么"
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 02 擅长技能 */}
          <section>
            <SectionHead
              no="02"
              title="擅长技能"
              en="SKILLS"
              right={
                <span
                  className="border px-2 py-0.5 font-mono text-[10px] text-[#d5f021]"
                  style={{ borderColor: 'rgba(213,240,33,.4)', clipPath: chamfer(4) }}
                >
                  {skillCount} 项已选
                </span>
              }
            />
            <p className="mb-4 font-sans text-[12px] leading-relaxed text-[#8f8c7a]">
              勾选该智能体可调用的工具 —— 决定它的检索范围与分析行为。全部工具 Free 到 Pro 共享,区别只在额度与深度。
            </p>

            {/* 新闻检索 */}
            <div className="mb-6">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-sans text-[12.5px] font-bold text-[#e8e6d8]">新闻检索</span>
                <span
                  className="border px-1.5 py-0.5 font-mono text-[9px] tracking-wide"
                  style={{ borderColor: hexA('#4fd08a', 0.5), color: '#4fd08a' }}
                >
                  永久免费 · 无限使用
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {newsSkills.map(c => (
                  <SkillCard key={c.id} skill={c} selected={!!draft.skills[c.id]} onToggle={() => onToggleSkill(c.id)} />
                ))}
              </div>
            </div>

            {/* 决策工具 */}
            <div>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="font-sans text-[12.5px] font-bold text-[#e8e6d8]">决策工具</span>
                <span
                  className="border px-1.5 py-0.5 font-mono text-[9px] tracking-wide"
                  style={{ borderColor: hexA('#d9a531', 0.5), color: '#d9a531' }}
                >
                  按额度计费
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {decisionSkills.map(c => (
                  <SkillCard key={c.id} skill={c} selected={!!draft.skills[c.id]} onToggle={() => onToggleSkill(c.id)} />
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* 底栏 */}
      <div className="flex flex-none items-center gap-3 border-t border-[rgba(213,240,33,.14)] px-5 py-3.5">
        <span className="font-sans text-[11px] text-[#6a6754]">身份 + 技能 = 该智能体的检索与分析行为</span>
        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="border border-[rgba(213,240,33,.25)] px-4 py-1.5 font-sans text-[12.5px] text-[#c8c5b4] transition-colors hover:border-[#d5f021] hover:text-[#d5f021]"
            style={{ clipPath: chamfer(6) }}
          >
            取消
          </button>
          <button
            type="button"
            disabled={saving || !draft.name.trim()}
            onClick={onSave}
            className="flex items-center gap-1.5 bg-[#d5f021] px-4 py-1.5 font-sans text-[12.5px] font-bold text-[#0d0b07] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ clipPath: chamfer(6) }}
          >
            <Check size={14} strokeWidth={2.5} />
            {saving ? '保存中…' : '保存智能体'}
          </button>
        </div>
      </div>
    </div>
  )
}
