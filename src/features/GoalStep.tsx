import {
  BadgeCheck,
  Blend,
  Coins,
  Flame,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import type {
  Budgets,
  ComparisonGoal,
  CustomRequirementRule,
  FormErrors,
} from '../types'
import { BottomActions } from '../components/BottomActions'
import { CustomRequirementsEditor } from '../components/CustomRequirementsEditor'
import { Disclaimer } from '../components/Disclaimer'
import { errorInputClass, FieldShell, inputClass } from '../components/FormField'
import { goalLabels } from '../lib/ranking'

const goals = [
  {
    value: 'calories' as const,
    icon: Flame,
    note: '优先比较整包热量与预算',
  },
  {
    value: 'proteinDensity' as const,
    icon: Scale,
    note: '比较每100千卡的蛋白质',
  },
  {
    value: 'proteinValue' as const,
    icon: Coins,
    note: '比较每10g蛋白质的成本',
  },
  {
    value: 'sodium' as const,
    icon: ShieldCheck,
    note: '比较统一基准下的钠',
  },
  {
    value: 'claims' as const,
    icon: BadgeCheck,
    note: '用透明规则核对包装表述',
  },
  {
    value: 'balance' as const,
    icon: Blend,
    note: '综合五项公开排名',
  },
]

interface Props {
  goal: ComparisonGoal
  budgets: Budgets
  concernWords: string
  customRequirementText: string
  customRequirementRules: CustomRequirementRule[]
  unresolvedPreferences: string[]
  budgetErrors: FormErrors
  onGoalChange: (goal: ComparisonGoal) => void
  onBudgetsChange: (budgets: Budgets) => void
  onConcernWordsChange: (value: string) => void
  onCustomRequirementTextChange: (value: string) => void
  onCustomRequirementRulesChange: (rules: CustomRequirementRule[]) => void
  onNext: () => void
}

export function GoalStep({
  goal,
  budgets,
  concernWords,
  customRequirementText,
  customRequirementRules,
  unresolvedPreferences,
  budgetErrors,
  onGoalChange,
  onBudgetsChange,
  onConcernWordsChange,
  onCustomRequirementTextChange,
  onCustomRequirementRulesChange,
  onNext,
}: Props) {
  return (
    <div>
      <section className="relative overflow-hidden rounded-[2rem] bg-ink px-5 py-9 text-white shadow-card sm:px-10 sm:py-12">
        <div
          className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[36px] border-orange/20"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-leaf/20"
          aria-hidden="true"
        />
        <div className="relative max-w-3xl">
          <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange">
            <Sparkles size={15} aria-hidden="true" />
            食品货架对比器
          </p>
          <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            看懂包装背面，
            <br className="sm:hidden" />
            再决定买哪一个
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
            把几款食品的配料、营养、份量、价格和宣传语放在同一张表里比较。
          </p>
        </div>
      </section>

      <CustomRequirementsEditor
        text={customRequirementText}
        rules={customRequirementRules}
        unresolvedPreferences={unresolvedPreferences}
        onTextChange={onCustomRequirementTextChange}
        onRulesChange={onCustomRequirementRulesChange}
      />

      <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-bold tracking-[0.15em] text-orange">步骤 1</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight">这次比较，你最在意什么？</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            必须选一个主目标。我们不会把它藏进一个不透明的“健康总分”。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {goals.map(({ value, icon: Icon, note }) => {
            const selected = goal === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => onGoalChange(value)}
                aria-pressed={selected}
                className={`flex min-h-24 items-start gap-4 rounded-2xl border p-4 text-left transition ${
                  selected
                    ? 'border-orange bg-orange/5 ring-4 ring-orange/10'
                    : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
                }`}
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    selected ? 'bg-orange text-white' : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-bold">{goalLabels[value]}</span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">{note}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-8">
        <h2 className="text-lg font-black">可选：填入你的本次预算</h2>
        <p className="mt-1 text-sm leading-6 text-stone-600">
          默认值只用于本次演示和计算，你可以修改。系统不会据此替你制定每日营养目标。
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {(
            [
              ['calories', '本次热量预算', '千卡'],
              ['protein', '本次蛋白质目标', '克'],
              ['price', '本次价格预算', '元'],
            ] as const
          ).map(([field, label, unit]) => (
            <FieldShell
              key={field}
              label={label}
              htmlFor={`budget-${field}`}
              error={budgetErrors[field]}
            >
              <div className="relative">
                <input
                  id={`budget-${field}`}
                  inputMode="decimal"
                  className={`${inputClass} pr-12 ${budgetErrors[field] ? errorInputClass : ''}`}
                  value={budgets[field]}
                  onChange={(event) =>
                    onBudgetsChange({ ...budgets, [field]: event.target.value })
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-stone-400">
                  {unit}
                </span>
              </div>
            </FieldShell>
          ))}
        </div>
        <div className="mt-4">
          <FieldShell
            label="配料表关注词"
            htmlFor="concern-words"
            hint="可用逗号或空格分隔，例如：花生、乳粉、甜味剂。这里只查找文字是否出现。"
          >
            <input
              id="concern-words"
              className={inputClass}
              value={concernWords}
              onChange={(event) => onConcernWordsChange(event.target.value)}
              placeholder="输入你想特别留意的词（可选）"
            />
          </FieldShell>
        </div>
      </section>

      <div className="mt-6">
        <Disclaimer />
      </div>
      <BottomActions onNext={onNext} nextLabel="开始录入食品" />
    </div>
  )
}
