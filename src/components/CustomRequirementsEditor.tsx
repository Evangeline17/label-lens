import { CircleHelp, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { CustomRequirementRule } from '../types'

interface Props {
  text: string
  rules: CustomRequirementRule[]
  unresolvedPreferences: string[]
  onTextChange: (value: string) => void
  onRulesChange: (rules: CustomRequirementRule[]) => void
}

export function CustomRequirementsEditor({
  text,
  rules,
  unresolvedPreferences,
  onTextChange,
  onRulesChange,
}: Props) {
  const updateRule = (id: string, patch: Partial<CustomRequirementRule>) => {
    onRulesChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)))
  }

  return (
    <section className="mt-6 rounded-3xl border border-orange/20 bg-[#fffaf3] p-5 shadow-card sm:p-8">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange/10 text-orange">
          <SlidersHorizontal size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-black">我有自己的要求</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            主目标仍然有效。这里的文字会先用透明本地规则提取，无法识别的内容不会被强行数字化。
          </p>
        </div>
      </div>

      <label className="mt-5 block" htmlFor="custom-purchase-requirement">
        <span className="text-sm font-bold">自定义购买要求（可选）</span>
        <textarea
          id="custom-purchase-requirement"
          rows={5}
          maxLength={300}
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="预算10元以内，整包尽量不超过150千卡，蛋白质至少15克，不想买白砂糖排在配料前面的产品，最好一包适合一次吃完。"
          className="mt-2 w-full resize-y rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-stone-400 focus:border-orange focus:ring-4 focus:ring-orange/10"
        />
        <span className="mt-1 block text-right text-xs text-stone-400">{text.length}/300</span>
      </label>

      <p className="mt-3 flex gap-2 rounded-xl bg-white px-3 py-2.5 text-xs leading-5 text-stone-600">
        <CircleHelp className="mt-0.5 shrink-0 text-orange" size={15} aria-hidden="true" />
        系统只能根据包装标签和用户录入的数据判断，无法从标签确认口感、饱腹感或长期健康效果。
      </p>

      {rules.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-black">已识别的确定性要求</h3>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            请确认识别口径。数值可以修改，不需要的规则可以删除。
          </p>
          <div className="mt-3 space-y-3">
            {rules.map((rule) => (
              <article key={rule.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-black">{rule.label}</p>
                    <p className="mt-1 text-xs leading-5 text-stone-500">
                      识别口径：{rule.basis}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRulesChange(rules.filter((item) => item.id !== rule.id))}
                    aria-label={`删除${rule.label}`}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
                {rule.value !== undefined && (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <span className="shrink-0 font-bold">阈值</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      value={rule.value}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        if (Number.isFinite(value) && value >= 0) updateRule(rule.id, { value })
                      }}
                      className="min-h-10 min-w-0 flex-1 rounded-xl border border-stone-300 px-3 outline-none focus:border-orange focus:ring-4 focus:ring-orange/10"
                    />
                    <span className="shrink-0 text-xs font-bold text-stone-500">
                      {rule.unit}
                    </span>
                  </label>
                )}
                {rule.term && (
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <span className="shrink-0 font-bold">关注词</span>
                    <input
                      value={rule.term}
                      maxLength={30}
                      onChange={(event) => {
                        const term = event.target.value
                        updateRule(rule.id, {
                          term,
                          label: `配料表未出现“${term}”`,
                        })
                      }}
                      className="min-h-10 min-w-0 flex-1 rounded-xl border border-stone-300 px-3 outline-none focus:border-orange focus:ring-4 focus:ring-orange/10"
                    />
                  </label>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {unresolvedPreferences.length > 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-orange/30 bg-white p-4">
          <h3 className="text-sm font-black">需要 AI 解释的偏好</h3>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            这项偏好暂时无法直接转换为确定的比较指标。身体状态不会被解释为医疗或营养结论，请从明确目标中另行选择。
          </p>
          <ul className="mt-3 space-y-2">
            {unresolvedPreferences.map((preference) => (
              <li key={preference} className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
                {preference}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
