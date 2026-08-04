import { ArrowLeft, RotateCcw, Share2, TableProperties } from 'lucide-react'
import { AiAnalysisSection } from '../components/AiAnalysisSection'
import { QuickFlowProgress } from '../components/QuickFlowProgress'
import { RequirementMatchSection } from '../components/RequirementMatchSection'
import { buildAiAnalyzePayload } from '../lib/aiAnalysis'
import { formatCurrency, formatMetric } from '../lib/calculations'
import { getInsufficientItems } from '../lib/dataQuality'
import {
  classifyQuickPreference,
  comparisonGoalForQuickGoal,
  getProgressiveComparison,
  quickGoalLabels,
  type QuickGoal,
} from '../lib/quickComparison'
import { getPreferredProduct } from '../lib/ranking'
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
  customRequirementText: string
  customRequirementRules: CustomRequirementRule[]
  unresolvedPreferences: string[]
  customRequirementEvaluation: CustomRequirementEvaluation
  onBack: () => void
  onRestart: () => void
}

const detailRows: Array<{
  label: string
  value: (metric: CalculatedProduct, product: Product) => string
}> = [
  { label: '每100单位热量', value: (metric) => formatMetric(metric.kcalPer100, ' kcal') },
  { label: '每包热量', value: (metric) => formatMetric(metric.packageCalories, ' kcal') },
  { label: '每100单位蛋白质', value: (metric) => formatMetric(metric.proteinPer100, 'g') },
  { label: '每100单位脂肪', value: (metric) => formatMetric(metric.fatPer100, 'g') },
  { label: '每100单位钠', value: (metric) => formatMetric(metric.sodiumPer100, 'mg') },
  { label: '每10g蛋白质成本', value: (metric) => formatCurrency(metric.proteinCostPer10g) },
  {
    label: '价格',
    value: (_metric, product) =>
      product.price.trim() ? formatCurrency(Number(product.price)) : '—',
  },
]

export function QuickFullAnalysis({
  products,
  calculated,
  claimChecks,
  rankings,
  quickGoal,
  budgets,
  customRequirementText,
  customRequirementRules,
  unresolvedPreferences,
  customRequirementEvaluation,
  onBack,
  onRestart,
}: Props) {
  const preference = classifyQuickPreference(customRequirementText)
  const effectiveQuickGoal = preference.explicitGoal ?? quickGoal ?? 'overall'
  const goal = comparisonGoalForQuickGoal(effectiveQuickGoal)
  const assessment = getProgressiveComparison(effectiveQuickGoal, products, calculated)
  const insufficient = [
    ...new Set([...getInsufficientItems(products), ...assessment.unavailable]),
  ]
  const preferred =
    products.find((product) => product.id === assessment.preferredId) ??
    getPreferredProduct(goal, products, rankings, claimChecks)
  const payload = buildAiAnalyzePayload({
    quickGoal,
    availableDimensions: assessment.compared,
    missingDimensions: assessment.unavailable,
    localComparison: {
      status: assessment.status,
      preferredId: assessment.preferredId,
      compared: assessment.compared,
      summary:
        assessment.status === 'insufficient'
          ? '当前没有共同可比较指标。'
          : assessment.preferredId
            ? `${products.find((product) => product.id === assessment.preferredId)?.name ?? '当前商品'}更符合本地确定性目标。`
            : `已完成${assessment.compared.length}项本地确定性比较，当前没有唯一首选。`,
    },
    goal,
    budgets,
    products,
    calculated,
    rankings,
    claimChecks,
    insufficient,
    preferred,
    customRequirementText,
    customRequirementRules,
    customRequirementEvaluation,
    unresolvedPreferences,
  })
  const preferredMetric = calculated.find((metric) => metric.id === preferred?.id)

  return (
    <>
      <QuickFlowProgress current="full-analysis" />
      <main className="mx-auto max-w-5xl space-y-5 pb-32">
        <header>
          <p className="text-xs font-bold tracking-[0.15em] text-orange">完整分析</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            从你的目标出发，看看两款差在哪里
          </h1>
          <p className="mt-2 text-sm font-bold text-stone-600">
            {effectiveQuickGoal === 'overall'
              ? '本次按综合差异进行比较'
              : `本次重点：${quickGoalLabels[effectiveQuickGoal]}`}
          </p>
          {preference.hasMedicalContext && (
            <p className="mt-2 text-xs leading-5 text-stone-500">
              你提到的身体状况不会被用于生成医疗或治疗建议。
            </p>
          )}
          {preference.explicitGoal && quickGoal && preference.explicitGoal !== quickGoal && (
            <p className="mt-2 text-xs font-semibold leading-5 text-orange">
              自由要求与快捷目标存在冲突；本次保留两者，并优先采用最新填写的明确要求。
            </p>
          )}
        </header>

        {customRequirementRules.length > 0 && (
          <RequirementMatchSection
            text={customRequirementText}
            rules={customRequirementRules}
            unresolvedPreferences={unresolvedPreferences}
            evaluation={customRequirementEvaluation}
          />
        )}

        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-orange/10 text-orange">
              <TableProperties size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-xl font-black">详细数据对比</h2>
              <p className="mt-1 text-sm text-stone-600">只展示可核查的计算结果，缺失项保留为“—”。</p>
            </div>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr>
                  <th className="border-b border-stone-200 p-3 text-xs text-stone-500">指标</th>
                  {products.map((product, index) => (
                    <th key={product.id} className="border-b border-stone-200 p-3 font-black">
                      {String.fromCharCode(65 + index)} · {product.name || '未命名商品'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row) => (
                  <tr key={row.label}>
                    <th className="border-b border-stone-100 p-3 text-xs font-bold text-stone-500">
                      {row.label}
                    </th>
                    {products.map((product) => {
                      const metric = calculated.find((item) => item.id === product.id)!
                      return (
                        <td key={product.id} className="border-b border-stone-100 p-3 font-semibold">
                          {row.value(metric, product)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {assessment.status === 'insufficient' ? (
          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-7">
            <h2 className="text-xl font-black">InfiniSynapse 综合建议</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              两款商品还没有共同可比较指标，补充最需要的标签照片后即可生成分析。
            </p>
          </section>
        ) : (
          <AiAnalysisSection payload={payload} autoStart />
        )}

        <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-7">
          <div className="flex items-center gap-3">
            <Share2 className="text-orange" size={20} aria-hidden="true" />
            <h2 className="text-xl font-black">分享卡</h2>
          </div>
          <div className="mx-auto mt-5 max-w-md rounded-[2rem] bg-ink p-6 text-white shadow-xl">
            <p className="text-xs font-bold tracking-[0.18em] text-orange">标签真相局 · LabelLens</p>
            <p className="mt-4 text-xs text-stone-400">本次目标</p>
            <p className="mt-1 font-black">
              {quickGoalLabels[effectiveQuickGoal]}
            </p>
            <p className="mt-5 text-xs text-stone-400">本次更匹配</p>
            <p className="mt-1 text-2xl font-black">{preferred?.name || '目前没有唯一首选'}</p>
            <p className="mt-4 rounded-xl bg-white/10 p-3 text-xs leading-5 text-stone-200">
              {preferred
                ? `整包热量 ${formatMetric(preferredMetric?.packageCalories, ' kcal')}；整包蛋白质 ${formatMetric(preferredMetric?.packageProtein, 'g')}。`
                : '请结合上方详细数据查看不同商品的取舍。'}
            </p>
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-3 text-sm font-black text-stone-700"
          >
            <ArrowLeft size={17} aria-hidden="true" />返回快速结果
          </button>
          <button
            type="button"
            data-primary-action="true"
            onClick={onRestart}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange px-3 text-sm font-black text-white"
          >
            <RotateCcw size={17} aria-hidden="true" />重新比较
          </button>
        </div>
      </div>
    </>
  )
}
