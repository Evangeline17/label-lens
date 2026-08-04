import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Target,
} from 'lucide-react'
import { useState } from 'react'
import { AiAnalysisSection } from '../components/AiAnalysisSection'
import { CustomRequirementsEditor } from '../components/CustomRequirementsEditor'
import { buildAiAnalyzePayload } from '../lib/aiAnalysis'
import { getInsufficientItems } from '../lib/dataQuality'
import {
  getQuickHighlights,
  getIngredientHints,
  getProgressiveComparison,
  getQuickReason,
  quickGoalLabels,
  type QuickGoal,
} from '../lib/quickComparison'
import { ResultsStep } from './ResultsStep'
import type {
  Budgets,
  CalculatedProduct,
  ClaimCheckResult,
  ComparisonGoal,
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
  quickGoal: QuickGoal
  goal: ComparisonGoal
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
  onRestart: () => void
}

const goals = Object.entries(quickGoalLabels) as Array<[QuickGoal, string]>

export function QuickResults({
  products,
  calculated,
  claimChecks,
  rankings,
  quickGoal,
  goal,
  budgets,
  concernWords,
  customRequirementText,
  customRequirementRules,
  unresolvedPreferences,
  customRequirementEvaluation,
  onQuickGoalChange,
  onCustomRequirementTextChange,
  onCustomRequirementRulesChange,
  onEdit,
  onRestart,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false)
  const assessment = getProgressiveComparison(quickGoal, products, calculated)
  const preferredId = assessment.preferredId
  const preferred = products.find((product) => product.id === preferredId) ?? null
  const preferredIndex = products.findIndex((product) => product.id === preferredId)
  const highlights = getQuickHighlights(products, calculated)
  const ingredientHints = getIngredientHints(products)
  const insufficient = getInsufficientItems(products)
  const rankedDetailPreferred = products.find(
      (product) =>
        product.id ===
        rankings
          .find((group) =>
            group.key ===
            ({
              calories: 'calories',
              proteinDensity: 'proteinDensity',
              proteinValue: 'proteinValue',
              sodium: 'sodium',
              claims: 'balance',
              balance: 'balance',
            } as const)[goal],
          )
          ?.items.find((item) => item.rank === 1)?.productId,
    ) ?? preferred
  const detailPreferred = assessment.status === 'full' ? rankedDetailPreferred : null
  const aiPayload = buildAiAnalyzePayload({
    goal,
    budgets,
    products,
    calculated,
    rankings,
    claimChecks,
    insufficient,
    preferred: detailPreferred,
    customRequirementText,
    customRequirementRules,
    customRequirementEvaluation,
    unresolvedPreferences,
  })

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.15em] text-orange">快速比较结果</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">先看结论，再按需展开</h1>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-sm font-bold text-stone-600"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">修改识别结果</span>
          <span className="sm:hidden">修改</span>
        </button>
      </div>

      <section className="relative overflow-hidden rounded-[2rem] bg-ink p-6 text-white shadow-card sm:p-9">
        <div className="absolute -right-14 -top-16 h-48 w-48 rounded-full border-[30px] border-orange/20" aria-hidden="true" />
        <div className="relative">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-orange">
            <Sparkles size={15} aria-hidden="true" />
            {assessment.status === 'full'
              ? preferred ? '这次更推荐' : '本次没有唯一首选'
              : assessment.status === 'partial' ? '局部比较' : '数据不足'}
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
                  : '没有唯一首选'
                : assessment.status === 'partial'
                  ? '先看现有数据的差别'
                  : '暂时无法生成比较'}
            </h2>
          </div>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-stone-200 sm:text-base">
            {getQuickReason(quickGoal, preferred, assessment)}
          </p>
        </div>
      </section>

      <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-7">
        <h2 className="text-lg font-black">关键差别</h2>
        {highlights.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {highlights.map((item) => (
              <article key={item.label} className="rounded-2xl bg-stone-50 p-4">
                <p className="text-xs font-bold text-stone-500">{item.label}</p>
                <p className="mt-2 text-sm font-black leading-6 text-ink">{item.value}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-2xl bg-stone-50 p-4 text-sm font-semibold text-stone-600">
            还没有两款商品共同具备的可靠指标。
          </p>
        )}
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-leaf/10 px-3 py-2 text-xs font-semibold leading-5 text-leaf">
          <Check className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
          结果来自包装标签与现有确定性计算；切换目标不会重新识别图片。
        </p>
      </section>

      <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-7">
        <h2 className="text-lg font-black">本次可比较信息</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-leaf/5 p-4">
            <p className="text-xs font-black text-leaf">已比较</p>
            {assessment.compared.length ? (
              <ul className="mt-2 space-y-1.5 text-sm font-semibold text-stone-700">
                {assessment.compared.map((item) => <li key={item}>✓ {item}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-stone-600">暂无共同指标</p>
            )}
          </div>
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-black text-stone-500">暂未比较</p>
            {assessment.unavailable.length ? (
              <ul className="mt-2 space-y-1.5 text-sm text-stone-600">
                {assessment.unavailable.slice(0, 5).map((item) => <li key={item}>— {item}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-stone-600">主要字段均可比较</p>
            )}
          </div>
        </div>

        {(quickGoal === 'sugar' || assessment.compared.includes('配料')) && ingredientHints.length > 0 && (
          <div className="mt-4 rounded-2xl border border-orange/15 bg-orange/5 p-4">
            <p className="text-xs font-black text-orange">配料提示（不等于糖含量）</p>
            <ul className="mt-2 space-y-1.5 text-sm leading-6 text-stone-700">
              {ingredientHints.map((item) => <li key={item.productId}>{item.text}</li>)}
            </ul>
          </div>
        )}

        {assessment.unavailable.length > 0 && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-orange/20 bg-orange/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-stone-700">
              <AlertCircle className="mt-1 shrink-0 text-orange" size={17} aria-hidden="true" />
              {assessment.nextAction}
            </p>
            <button
              type="button"
              onClick={onEdit}
              className="min-h-10 shrink-0 rounded-xl bg-orange px-4 text-sm font-black text-white"
            >
              补充照片/数据
            </button>
          </div>
        )}
      </section>

      <section className="mt-5 rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-leaf/10 text-leaf">
            <Target size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-black">这次你更在意什么？</h2>
            <p className="mt-1 text-sm text-stone-500">点选后立即重新排序，不需要重新识别。</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {goals.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={quickGoal === value}
              onClick={() => onQuickGoalChange(value)}
              className={`min-h-11 rounded-full border px-4 text-sm font-black transition ${
                quickGoal === value
                  ? 'border-orange bg-orange text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-orange/50'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className="min-h-11 rounded-full border border-stone-200 bg-white px-4 text-sm font-black text-stone-600 transition hover:border-orange/50"
          >
            自己输入
          </button>
        </div>

        <details
          open={customOpen}
          onToggle={(event) => setCustomOpen(event.currentTarget.open)}
          className="group mt-5 rounded-2xl border border-stone-200 p-4"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-black">
            <span className="flex items-center gap-2">
              <SlidersHorizontal size={17} className="text-orange" aria-hidden="true" />
              添加自己的购买要求
            </span>
            <ChevronDown size={17} className="transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-4">
            <CustomRequirementsEditor
              text={customRequirementText}
              rules={customRequirementRules}
              unresolvedPreferences={unresolvedPreferences}
              onTextChange={onCustomRequirementTextChange}
              onRulesChange={onCustomRequirementRulesChange}
            />
          </div>
        </details>
      </section>

      <details className="group mt-5 rounded-3xl border border-stone-200 bg-white p-4 shadow-card sm:p-5">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-black">
          查看详细对比
          <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-6 border-t border-stone-100 pt-6">
          <ResultsStep
            products={products}
            calculated={calculated}
            claimChecks={claimChecks}
            rankings={rankings}
            preferred={detailPreferred}
            goal={goal}
            budgets={budgets}
            concernWords={concernWords}
            customRequirementText={customRequirementText}
            customRequirementRules={customRequirementRules}
            unresolvedPreferences={unresolvedPreferences}
            customRequirementEvaluation={customRequirementEvaluation}
            onEdit={onEdit}
            onRestart={onRestart}
            showAiAnalysis={false}
          />
        </div>
      </details>

      <details className="group mt-5 rounded-3xl border border-orange/20 bg-[#fff8ee] p-4 shadow-card sm:p-5">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-black">
          <span className="flex items-center gap-2">
            <Sparkles size={18} className="text-orange" aria-hidden="true" />查看完整AI分析
          </span>
          <ChevronDown size={18} className="transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-4">
          {assessment.status === 'insufficient' ? (
            <p className="rounded-2xl bg-white p-4 text-sm font-semibold leading-6 text-stone-600">
              没有共同可比较维度，暂不生成 AI 分析。补充标签数据后再试。
            </p>
          ) : (
            <AiAnalysisSection payload={aiPayload} />
          )}
        </div>
      </details>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 font-bold text-stone-700"
        >
          <ArrowLeft size={18} aria-hidden="true" />修改识别结果
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-5 font-bold text-white"
        >
          <RotateCcw size={18} aria-hidden="true" />重新比较
        </button>
      </div>
    </div>
  )
}
