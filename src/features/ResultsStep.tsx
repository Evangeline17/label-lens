import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  Calculator,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  ClipboardCheck,
  Coins,
  Flame,
  Layers3,
  Package,
  RotateCcw,
  SearchCheck,
  Share2,
  Sparkles,
  Tags,
  Wheat,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { AiAnalysisSection } from '../components/AiAnalysisSection'
import { Disclaimer } from '../components/Disclaimer'
import { RequirementMatchSection } from '../components/RequirementMatchSection'
import {
  formatCurrency,
  formatMetric,
  formatNumber,
} from '../lib/calculations'
import { observeIngredients } from '../lib/claimChecks'
import { buildAiAnalyzePayload } from '../lib/aiAnalysis'
import { getInsufficientItems } from '../lib/dataQuality'
import { goalLabels } from '../lib/ranking'
import type {
  Budgets,
  CalculatedProduct,
  ClaimCheckResult,
  ClaimSupportStatus,
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
  preferred: Product | null
  goal: ComparisonGoal
  budgets: Budgets
  concernWords: string
  customRequirementText: string
  customRequirementRules: CustomRequirementRule[]
  unresolvedPreferences: string[]
  customRequirementEvaluation: CustomRequirementEvaluation
  onEdit: () => void
  onRestart: () => void
  showAiAnalysis?: boolean
}

function ResultSection({
  icon: Icon,
  title,
  description,
  children,
  tone = 'white',
}: {
  icon: typeof Sparkles
  title: string
  description?: string
  children: ReactNode
  tone?: 'white' | 'warm'
}) {
  return (
    <section
      className={`rounded-3xl border p-5 shadow-card sm:p-7 ${
        tone === 'warm' ? 'border-orange/20 bg-[#fff8ee]' : 'border-stone-200 bg-white'
      }`}
    >
      <div className="mb-5 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange/10 text-orange">
          <Icon size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
          {description && <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function productLetter(products: Product[], id: string) {
  const index = products.findIndex((product) => product.id === id)
  return index >= 0 ? String.fromCharCode(65 + index) : '—'
}

function statusClass(status: ClaimSupportStatus) {
  if (status === '标签数据较支持') return 'bg-leaf/10 text-leaf'
  if (status === '支持有限') return 'bg-orange/10 text-orange'
  return 'bg-stone-100 text-stone-600'
}

function buildEvidence(
  goal: ComparisonGoal,
  product: Product | null,
  metric: CalculatedProduct | undefined,
  check: ClaimCheckResult | undefined,
  ranking: RankingGroup | undefined,
): string[] {
  if (!metric) return ['标签信息不足，无法判断。']
  const evidence: Record<ComparisonGoal, string[]> = {
    calories: [
      `整包约 ${formatMetric(metric.packageCalories, ' kcal')}`,
      `每100单位约 ${formatMetric(metric.kcalPer100, ' kcal')}`,
      `热量预算下可吃约 ${formatMetric(metric.gramsUnderCalorieBudget, product?.netUnit ?? '单位')}`,
    ],
    proteinDensity: [
      `每100千卡可获得 ${formatMetric(metric.proteinPer100Kcal, 'g 蛋白质')}`,
      `每100单位含 ${formatMetric(metric.proteinPer100, 'g 蛋白质')}`,
      `整包约含 ${formatMetric(metric.packageProtein, 'g 蛋白质')}`,
    ],
    proteinValue: [
      `每10g蛋白质成本约 ${formatCurrency(metric.proteinCostPer10g)}`,
      `本次价格预算内约可获得 ${formatMetric(metric.proteinUnderPriceBudget, 'g 蛋白质')}`,
      `整包约含 ${formatMetric(metric.packageProtein, 'g 蛋白质')}`,
    ],
    sodium: [
      `每100单位约含钠 ${formatMetric(metric.sodiumPer100, 'mg')}`,
      `整包约含钠 ${formatMetric(metric.packageSodium, 'mg')}`,
      '这里只做当前商品间的相对比较',
    ],
    claims: [
      check ? `宣传核对状态：${check.status}` : '标签信息不足，无法判断。',
      check?.observations[0]?.detail ?? '标签信息不足，无法判断。',
      '本地规则不作法律合规结论',
    ],
    balance: [
      ranking?.items.find((item) => item.productId === metric.id)?.displayValue ??
        '综合排名数据不足',
      `整包约 ${formatMetric(metric.packageCalories, ' kcal')}，蛋白质 ${formatMetric(metric.packageProtein, 'g')}`,
      `每10g蛋白质成本约 ${formatCurrency(metric.proteinCostPer10g)}`,
    ],
  }
  return evidence[goal]
}

const comparisonRows: Array<{
  label: string
  value: (metric: CalculatedProduct, product: Product) => string
}> = [
  { label: '每100单位热量', value: (metric) => formatMetric(metric.kcalPer100, ' kcal') },
  { label: '每包热量', value: (metric) => formatMetric(metric.packageCalories, ' kcal') },
  { label: '每100单位蛋白质', value: (metric) => formatMetric(metric.proteinPer100, 'g') },
  {
    label: '每100千卡蛋白质',
    value: (metric) => formatMetric(metric.proteinPer100Kcal, 'g'),
  },
  {
    label: '每10g蛋白质成本',
    value: (metric) => formatCurrency(metric.proteinCostPer10g),
  },
  {
    label: '每100单位价格',
    value: (metric) => formatCurrency(metric.pricePer100),
  },
  { label: '每包钠', value: (metric) => formatMetric(metric.packageSodium, 'mg') },
  {
    label: '价格',
    value: (_metric, product) =>
      product.price.trim() ? formatCurrency(Number(product.price)) : '—',
  },
  {
    label: '净含量',
    value: (_metric, product) => `${product.netContent}${product.netUnit}`,
  },
]

export function ResultsStep({
  products,
  calculated,
  claimChecks,
  rankings,
  preferred,
  goal,
  budgets,
  concernWords,
  customRequirementText,
  customRequirementRules,
  unresolvedPreferences,
  customRequirementEvaluation,
  onEdit,
  onRestart,
  showAiAnalysis = true,
}: Props) {
  const preferredMetric = calculated.find((item) => item.id === preferred?.id)
  const preferredCheck = claimChecks.find((item) => item.productId === preferred?.id)
  const balanceRanking = rankings.find((item) => item.key === 'balance')
  const evidence = buildEvidence(
    goal,
    preferred,
    preferredMetric,
    preferredCheck,
    balanceRanking,
  )
  const insufficient = getInsufficientItems(products)
  const aiPayload = buildAiAnalyzePayload({
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

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-orange">步骤 4 · 比较结果</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">同一张标签桌，答案更清楚</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">不同目标下排名可能变化。</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-bold text-stone-700"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          返回修改
        </button>
      </div>

      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] bg-ink p-6 text-white shadow-card sm:p-9">
          <div
            className="absolute -right-10 -top-14 h-44 w-44 rounded-full border-[28px] border-orange/20"
            aria-hidden="true"
          />
          <div className="relative">
            <p className="flex items-center gap-2 text-xs font-bold tracking-[0.16em] text-orange">
              <Sparkles size={15} aria-hidden="true" />
              本次首选
            </p>
            {preferred ? (
              <>
                <div className="mt-4 flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange text-xl font-black">
                    {productLetter(products, preferred.id)}
                  </span>
                  <div>
                    <h2 className="text-2xl font-black sm:text-3xl">{preferred.name}</h2>
                    <p className="mt-1 text-sm leading-6 text-stone-300">
                      在你选择的“{goalLabels[goal]}”目标下，{productLetter(products, preferred.id)}
                      更匹配。
                    </p>
                  </div>
                </div>
                <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                  {evidence.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-6 text-stone-200"
                    >
                      <Check className="mt-1 shrink-0 text-orange" size={15} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-4 text-stone-300">标签信息不足，无法判断。</p>
            )}
            <p className="mt-5 text-xs text-stone-400">这里说“更匹配”，不代表“最健康”。</p>
          </div>
        </section>

        <RequirementMatchSection
          text={customRequirementText}
          rules={customRequirementRules}
          unresolvedPreferences={unresolvedPreferences}
          evaluation={customRequirementEvaluation}
        />

        <ResultSection
          icon={ChartNoAxesColumnIncreasing}
          title="多目标排名"
          description="每项使用单独、可解释的指标；综合平衡只取五项名次的平均。"
        >
          <div className="grid gap-3 md:grid-cols-2">
            {rankings.map((group) => (
              <article key={group.key} className="rounded-2xl border border-stone-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-black">{group.label}</h3>
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-stone-500">
                    独立排名
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-stone-500">{group.note}</p>
                <ol className="mt-4 space-y-2">
                  {group.items.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5"
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                          item.rank === 1 ? 'bg-leaf text-white' : 'bg-white text-stone-500'
                        }`}
                      >
                        {item.rank ?? '—'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">
                        {productLetter(products, item.productId)} · {item.productName}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-stone-500">
                        {item.displayValue}
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
          <p className="mt-4 rounded-xl bg-orange/10 px-3 py-2 text-xs font-semibold text-orange">
            不同目标下排名可能变化。
          </p>
        </ResultSection>

        <ResultSection
          icon={Layers3}
          title="横向比较表"
          description="能量已统一换算为 kcal；“每100单位”随商品使用 g 或 mL。"
        >
          <div className="hidden overflow-hidden rounded-2xl border border-stone-200 md:block">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-stone-100">
                <tr>
                  <th className="w-[25%] px-4 py-3 font-black">指标</th>
                  {products.map((product, index) => (
                    <th key={product.id} className="px-3 py-3 font-black">
                      {String.fromCharCode(65 + index)} · {product.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {comparisonRows.map((row) => (
                  <tr key={row.label}>
                    <th className="px-4 py-3 text-xs font-bold text-stone-500">{row.label}</th>
                    {products.map((product) => {
                      const metric = calculated.find((item) => item.id === product.id)!
                      return (
                        <td key={product.id} className="px-3 py-3 font-semibold">
                          {row.value(metric, product)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 md:hidden">
            {products.map((product, index) => {
              const metric = calculated.find((item) => item.id === product.id)!
              return (
                <article key={product.id} className="rounded-2xl border border-stone-200 p-4">
                  <h3 className="font-black">
                    {String.fromCharCode(65 + index)} · {product.name}
                  </h3>
                  <dl className="mt-3 divide-y divide-stone-100">
                    {comparisonRows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
                        <dt className="text-xs font-semibold text-stone-500">{row.label}</dt>
                        <dd className="text-right text-sm font-bold">
                          {row.value(metric, product)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              )
            })}
          </div>

          <details className="group mt-4 rounded-2xl bg-stone-50 p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black">
              <span className="flex items-center gap-2">
                <Calculator size={17} className="text-orange" aria-hidden="true" />
                查看简化计算依据
              </span>
              <ChevronDown
                size={17}
                className="transition group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <ul className="mt-3 grid gap-2 text-xs leading-5 text-stone-600 sm:grid-cols-2">
              <li>1 kcal = 4.184 kJ</li>
              <li>每包热量 = 每100单位热量 × 净含量 ÷ 100</li>
              <li>每10g蛋白质成本 = 价格 ÷ 每包蛋白质 × 10</li>
              <li>每100千卡蛋白质 = 每100单位蛋白质 ÷ 热量 × 100</li>
              <li>按每份标示时，先用每份数值 ÷ 每份大小 × 100</li>
              <li>空值、非法数字和除以0均不推测，统一显示“—”</li>
            </ul>
          </details>
        </ResultSection>

        <ResultSection
          icon={Flame}
          title="本次预算下能吃多少"
          description={`${budgets.calories || '—'} 千卡预算下的等热量对比；结果只表示数学换算。`}
          tone="warm"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product, index) => {
              const metric = calculated.find((item) => item.id === product.id)!
              return (
                <article key={product.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-stone-500">
                    {String.fromCharCode(65 + index)} · {product.name}
                  </p>
                  {metric.gramsUnderCalorieBudget === null ? (
                    <p className="mt-3 text-sm font-semibold text-stone-600">
                      标签信息不足，无法判断。
                    </p>
                  ) : (
                    <>
                      <p className="mt-3 text-2xl font-black text-orange">
                        约 {formatMetric(metric.gramsUnderCalorieBudget, product.netUnit)}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        约 {formatNumber(metric.packagesUnderCalorieBudget, 2)} 包
                      </p>
                    </>
                  )}
                </article>
              )
            })}
          </div>
          {preferred && preferredMetric?.gramsUnderCalorieBudget !== null && (
            <p className="mt-4 text-sm font-semibold leading-6">
              {budgets.calories} 千卡预算下，{productLetter(products, preferred.id)}
              可吃约 {formatMetric(preferredMetric?.gramsUnderCalorieBudget, preferred.netUnit)}，约{' '}
              {formatNumber(preferredMetric?.packagesUnderCalorieBudget, 2)} 包。
            </p>
          )}
        </ResultSection>

        <ResultSection
          icon={Tags}
          title="包装宣传核对"
          description="使用简单、透明的本地规则，只提供标签内信息的相对观察，不做法律结论。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {claimChecks.map((check) => (
              <article key={check.productId} className="rounded-2xl border border-stone-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-black">
                    {productLetter(products, check.productId)} · {check.productName}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${statusClass(check.status)}`}
                  >
                    {check.status}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {check.observations.map((observation, index) => (
                    <div key={`${observation.claim}-${index}`} className="rounded-xl bg-stone-50 p-3">
                      <div className="flex items-center gap-2">
                        <BadgeCheck size={15} className="text-orange" aria-hidden="true" />
                        <p className="text-sm font-black">{observation.claim}</p>
                      </div>
                      <p className="mt-1.5 text-xs leading-5 text-stone-600">
                        {observation.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </ResultSection>

        <ResultSection
          icon={Wheat}
          title="配料表观察"
          description="配料顺序通常反映使用量的相对顺序，但无法据此计算准确添加量。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {products.map((product, index) => {
              const observation = observeIngredients(product, concernWords)
              return (
                <article key={product.id} className="rounded-2xl border border-stone-200 p-4">
                  <h3 className="font-black">
                    {String.fromCharCode(65 + index)} · {product.name}
                  </h3>
                  {observation.count === null ? (
                    <p className="mt-3 text-sm text-stone-600">标签信息不足，无法判断。</p>
                  ) : (
                    <dl className="mt-4 space-y-3 text-sm">
                      <div>
                        <dt className="text-xs font-bold text-stone-500">前3项</dt>
                        <dd className="mt-1 font-semibold">
                          {observation.firstThree.join('、') || '—'}
                        </dd>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-stone-50 p-3">
                          <dt className="text-xs font-bold text-stone-500">配料总数</dt>
                          <dd className="mt-1 font-black">{observation.count} 项</dd>
                        </div>
                        <div className="rounded-xl bg-stone-50 p-3">
                          <dt className="text-xs font-bold text-stone-500">糖类相关词</dt>
                          <dd className="mt-1 font-black">
                            {observation.sugarTerms.length
                              ? observation.sugarTerms.join('、')
                              : '未见常见词'}
                          </dd>
                        </div>
                      </div>
                      <div>
                        <dt className="text-xs font-bold text-stone-500">你的关注词</dt>
                        <dd className="mt-1 font-semibold">
                          {!concernWords.trim()
                            ? '未设置'
                            : observation.concernTerms.length
                              ? `出现：${observation.concernTerms.join('、')}`
                              : '未出现'}
                        </dd>
                      </div>
                    </dl>
                  )}
                </article>
              )
            })}
          </div>
        </ResultSection>

        <ResultSection
          icon={Coins}
          title="目标与预算换算"
          description="把蛋白质目标和价格预算换成更直观的数量；缺失数据不参与推算。"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {products.map((product, index) => {
              const metric = calculated.find((item) => item.id === product.id)!
              return (
                <article key={product.id} className="rounded-2xl border border-stone-200 p-4">
                  <h3 className="font-black">
                    {String.fromCharCode(65 + index)} · {product.name}
                  </h3>
                  <dl className="mt-4 space-y-3">
                    <div className="rounded-xl bg-stone-50 p-3">
                      <dt className="text-xs font-bold text-stone-500">
                        达到 {budgets.protein || '—'}g 蛋白质目标
                      </dt>
                      <dd className="mt-1 text-sm font-bold leading-6">
                        约需 {formatMetric(metric.gramsForProteinTarget, product.netUnit)} · 同时约{' '}
                        {formatMetric(metric.caloriesForProteinTarget, ' kcal')} · 预计{' '}
                        {formatCurrency(metric.costForProteinTarget)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-stone-50 p-3">
                      <dt className="text-xs font-bold text-stone-500">
                        {budgets.price || '—'} 元预算内
                      </dt>
                      <dd className="mt-1 text-sm font-bold">
                        约可买到 {formatMetric(metric.proteinUnderPriceBudget, 'g 蛋白质')}
                      </dd>
                    </div>
                  </dl>
                </article>
              )
            })}
          </div>
        </ResultSection>

        <ResultSection
          icon={AlertCircle}
          title="数据不足提醒"
          description="系统不会用相似商品或常识替你补全包装标签。"
        >
          {insufficient.length ? (
            <ul className="space-y-2">
              {insufficient.map((item) => (
                <li
                  key={item}
                  className="flex gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-sm leading-6"
                >
                  <AlertCircle className="mt-1 shrink-0 text-orange" size={15} aria-hidden="true" />
                  <span>
                    {item} 未填写。<strong>标签信息不足，无法判断。</strong>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 rounded-xl bg-leaf/10 px-3 py-2.5 text-sm font-semibold text-leaf">
              <ClipboardCheck size={17} aria-hidden="true" />
              当前主要标签字段已填写；仍请以包装原文为准。
            </p>
          )}
        </ResultSection>

        {showAiAnalysis && (
          <details className="group rounded-3xl border border-orange/20 bg-[#fff8ee] p-4 shadow-card sm:p-5">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-black text-ink">
              <span className="flex items-center gap-2">
                <Sparkles size={18} className="text-orange" aria-hidden="true" />
                查看完整AI分析
              </span>
              <ChevronDown
                size={18}
                className="transition group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="mt-4">
              <AiAnalysisSection payload={aiPayload} />
            </div>
          </details>
        )}

        <ResultSection
          icon={Share2}
          title="分享结果卡"
          description="下面区域已按手机截图阅读设计；当前不导出图片。"
        >
          <div className="mx-auto max-w-md overflow-hidden rounded-[2rem] bg-ink text-white shadow-xl shadow-stone-900/20">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-xs font-bold tracking-[0.18em] text-orange">标签真相局</p>
              <p className="mt-1 text-xs text-stone-400">LabelLens · 食品货架对比器</p>
            </div>
            <div className="p-6">
              <p className="text-xs font-bold text-stone-400">比较商品</p>
              <p className="mt-2 text-sm font-semibold leading-6">
                {products.map((product) => product.name).join(' · ')}
              </p>
              <div className="my-5 h-px bg-white/10" />
              <p className="text-xs font-bold text-stone-400">本次目标</p>
              <p className="mt-1 font-bold">{goalLabels[goal]}</p>
              <div className="mt-5 rounded-2xl bg-white/10 p-4">
                <p className="text-xs font-bold text-orange">本次首选</p>
                <p className="mt-1 text-2xl font-black">
                  {preferred
                    ? `${productLetter(products, preferred.id)} · ${preferred.name}`
                    : '信息不足'}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-stone-400">整包热量</p>
                  <p className="mt-1 text-sm font-black">
                    {formatMetric(preferredMetric?.packageCalories, ' kcal')}
                  </p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-stone-400">整包蛋白质</p>
                  <p className="mt-1 text-sm font-black">
                    {formatMetric(preferredMetric?.packageProtein, 'g')}
                  </p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[10px] text-stone-400">10g蛋白成本</p>
                  <p className="mt-1 text-sm font-black">
                    {formatCurrency(preferredMetric?.proteinCostPer10g)}
                  </p>
                </div>
              </div>
              <p className="mt-5 rounded-xl border border-orange/20 bg-orange/10 p-3 text-xs leading-5 text-stone-200">
                <SearchCheck
                  className="mr-1 inline text-orange"
                  size={14}
                  aria-hidden="true"
                />
                {preferredCheck?.observations[0]?.detail ?? '标签信息不足，无法判断。'}
              </p>
              <p className="mt-6 text-center text-sm font-black">
                看懂包装背面，再决定买哪一个
              </p>
            </div>
          </div>
        </ResultSection>

        <Disclaimer />

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 font-bold text-stone-700"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            返回修改
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink px-5 font-bold text-white"
          >
            <RotateCcw size={18} aria-hidden="true" />
            重新开始
          </button>
        </div>
      </div>
    </div>
  )
}
