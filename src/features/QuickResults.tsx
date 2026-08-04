import { AlertCircle, ArrowLeft, ArrowRight, RotateCcw, Sparkles } from 'lucide-react'
import { QuickFlowProgress } from '../components/QuickFlowProgress'
import { loadAiSession } from '../lib/sessionState'
import {
  classifyQuickPreference,
  getIngredientHints,
  getProgressiveComparison,
  getQuickHighlights,
  getQuickReason,
  quickGoalLabels,
  type QuickGoal,
} from '../lib/quickComparison'
import type {
  Budgets,
  CalculatedProduct,
  ClaimCheckResult,
  CustomRequirementEvaluation,
  CustomRequirementRule,
  Product,
  RankingGroup,
} from '../types'

interface Props {
  products: Product[]
  calculated: CalculatedProduct[]
  claimChecks: ClaimCheckResult[]
  rankings: RankingGroup[]
  quickGoal: QuickGoal | null
  budgets: Budgets
  concernWords: string
  customRequirementText: string
  customRequirementRules: CustomRequirementRule[]
  unresolvedPreferences: string[]
  customRequirementEvaluation: CustomRequirementEvaluation
  onQuickGoalChange: (goal: QuickGoal) => void
  onCustomRequirementTextChange: (value: string) => void
  onCustomRequirementRulesChange: (rules: CustomRequirementRule[]) => void
  onEdit: () => void
  onSupplement: () => void
  onContinue: () => void
  onRestart: () => void
  aiTaskExists?: boolean
}

const goals = Object.entries(quickGoalLabels) as Array<[QuickGoal, string]>

export function QuickResults({
  products,
  calculated,
  quickGoal,
  customRequirementText,
  unresolvedPreferences,
  onQuickGoalChange,
  onCustomRequirementTextChange,
  onEdit,
  onSupplement,
  onContinue,
  onRestart,
  aiTaskExists,
}: Props) {
  const preference = classifyQuickPreference(customRequirementText)
  const effectiveQuickGoal = preference.explicitGoal ?? quickGoal ?? 'overall'
  const assessment = getProgressiveComparison(effectiveQuickGoal, products, calculated)
  const preferred = products.find((product) => product.id === assessment.preferredId) ?? null
  const preferredIndex = products.findIndex((product) => product.id === preferred?.id)
  const highlights = getQuickHighlights(products, calculated).slice(0, 5)
  const ingredientHints = getIngredientHints(products)
  const hasAiTask = aiTaskExists ?? Boolean(loadAiSession()?.taskId)
  const hasUnresolvedPreference = unresolvedPreferences.length > 0
  const useComprehensivePreferenceNotice =
    (preference.hasGeneralPreference ||
      preference.hasMedicalContext ||
      hasUnresolvedPreference)
  const hasGoalConflict = Boolean(
    preference.explicitGoal && quickGoal && preference.explicitGoal !== quickGoal,
  )

  const primaryLabel =
    assessment.status === 'insufficient'
      ? '补拍最需要的标签照片'
      : assessment.status === 'partial'
        ? '继续查看现有完整分析'
        : hasAiTask
          ? '继续查看完整分析'
          : '生成并查看完整分析'

  return (
    <>
      <QuickFlowProgress current="quick-result" />
      <main className="mx-auto max-w-5xl pb-36" data-result-status={assessment.status}>
        <header>
          <p className="text-xs font-bold tracking-[0.15em] text-orange">快速比较结果</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">先回答这一次最关心的问题</h1>
        </header>

        <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-7">
          <p className="text-xs font-black text-stone-500">当前目标</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {goals.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={quickGoal === value}
                onClick={() => onQuickGoalChange(value)}
                className={`min-h-10 rounded-full border px-3 text-xs font-black ${
                  quickGoal === value
                    ? 'border-ink bg-ink text-white'
                    : 'border-stone-200 text-stone-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="mt-4 block" htmlFor="quick-preference">
            <span className="text-xs font-bold text-stone-500">补充偏好（可选）</span>
            <input
              id="quick-preference"
              value={customRequirementText}
              maxLength={300}
              onChange={(event) => onCustomRequirementTextChange(event.target.value)}
              placeholder="例如：想健康一点，我最近感冒了"
              className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-orange focus:ring-4 focus:ring-orange/10"
            />
          </label>
          {useComprehensivePreferenceNotice && (
            <div className="mt-3 rounded-2xl bg-leaf/5 p-4">
              <p className="font-black text-leaf">
                {effectiveQuickGoal === 'overall'
                  ? '已按综合差异进行比较。'
                  : `已按“${quickGoalLabels[effectiveQuickGoal]}”比较现有标签。`}
              </p>
              <p className="mt-1 text-xs leading-5 text-stone-600">
                {preference.hasMedicalContext
                  ? '你提到的身体状况不会被用于生成医疗或治疗建议。'
                  : '我们会继续比较现有标签中的能量、蛋白质、脂肪、碳水、钠、配料和整包数据。'}
              </p>
            </div>
          )}
          {hasGoalConflict && (
            <p className="mt-3 text-xs font-semibold leading-5 text-orange">
              补充要求与快捷目标不同；完整分析会保留两者，并以最新填写的明确要求为先。
            </p>
          )}
        </section>

        <section className="relative mt-5 overflow-hidden rounded-[2rem] bg-ink p-6 text-white shadow-card sm:p-9">
          <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full border-[30px] border-orange/20" aria-hidden="true" />
          <div className="relative">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-orange">
              <Sparkles size={15} aria-hidden="true" />
              {assessment.status === 'full'
                ? preferred ? '本次更匹配' : '目前没有唯一首选'
                : assessment.status === 'partial' ? '现有信息下的比较结果' : '需要补充共同指标'}
            </p>
            <div className="mt-4 flex items-center gap-3">
              {preferred && (
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange text-xl font-black">
                  {String.fromCharCode(65 + preferredIndex)}
                </span>
              )}
              <h2 className="text-2xl font-black sm:text-4xl">
                {assessment.status === 'full'
                  ? preferred
                    ? preferred.name || `商品${String.fromCharCode(65 + preferredIndex)}`
                    : '目前没有唯一首选'
                  : assessment.status === 'partial'
                    ? '可以比较部分差异'
                    : '补充一项共同标签数据即可开始'}
              </h2>
            </div>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-stone-200 sm:text-base">
              {getQuickReason(effectiveQuickGoal, preferred, assessment)}
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-7">
          <h2 className="text-lg font-black">关键比较</h2>
          {highlights.length ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {highlights.map((item) => (
                <article key={item.label} className="rounded-2xl bg-stone-50 p-4">
                  <p className="text-xs font-bold text-stone-500">{item.label}</p>
                  <p className="mt-2 text-sm font-black leading-6">{item.value}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
              还没有两款商品共同具备的可靠指标。
            </p>
          )}
          {effectiveQuickGoal === 'sugar' && ingredientHints.length > 0 && (
            <p className="mt-3 text-xs leading-5 text-stone-500">
              配料表只能提示糖类配料，不能代替明确糖含量。
            </p>
          )}
        </section>

        <section className="mt-5 grid gap-4 rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:grid-cols-2 sm:p-7">
          <div>
            <h2 className="font-black text-leaf">
              本次已比较 {assessment.compared.length} 项
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {assessment.compared.length ? assessment.compared.join('、') : '暂无共同指标'}
            </p>
          </div>
          <div>
            <h2 className="text-sm font-black text-stone-400">还可补充（可选）</h2>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              {assessment.unavailable.length
                ? assessment.unavailable.slice(0, 5).join('；')
                : '主要比较字段已具备'}
            </p>
          </div>
          {assessment.status === 'partial' && (
            <button
              type="button"
              onClick={onSupplement}
              className="text-left text-sm font-black text-orange sm:col-span-2"
            >
              补充数据
            </button>
          )}
        </section>

        <button
          type="button"
          onClick={onRestart}
          className="mx-auto mt-5 flex items-center gap-2 px-3 py-2 text-xs font-bold text-stone-400"
        >
          <RotateCcw size={14} aria-hidden="true" />重新开始
        </button>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-3 text-sm font-black text-stone-700"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            {assessment.status === 'insufficient' ? '返回修改' : '修改识别结果'}
          </button>
          <button
            type="button"
            data-primary-action="true"
            onClick={assessment.status === 'insufficient' ? onSupplement : onContinue}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange px-3 text-sm font-black text-white"
          >
            {assessment.status === 'insufficient' && <AlertCircle size={17} aria-hidden="true" />}
            {primaryLabel}
            {assessment.status !== 'insufficient' && <ArrowRight size={17} aria-hidden="true" />}
          </button>
        </div>
      </div>
    </>
  )
}
