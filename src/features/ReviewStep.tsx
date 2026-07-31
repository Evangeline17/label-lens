import { AlertTriangle, CheckCircle2, Edit3 } from 'lucide-react'
import { BottomActions } from '../components/BottomActions'
import { SectionHeading } from '../components/SectionHeading'
import { formatCurrency, formatMetric } from '../lib/calculations'
import { goalLabels } from '../lib/ranking'
import type {
  Budgets,
  CalculatedProduct,
  ComparisonGoal,
  CustomRequirementRule,
  Product,
} from '../types'

interface Props {
  products: Product[]
  calculated: CalculatedProduct[]
  goal: ComparisonGoal
  budgets: Budgets
  customRequirementText: string
  customRequirementRules: CustomRequirementRule[]
  unresolvedPreferences: string[]
  onBack: () => void
  onEditRequirements: () => void
  onNext: () => void
}

const basisLabels = {
  per100g: '每100g',
  per100ml: '每100mL',
  perServing: '每份',
}

export function ReviewStep({
  products,
  calculated,
  goal,
  budgets,
  customRequirementText,
  customRequirementRules,
  unresolvedPreferences,
  onBack,
  onEditRequirements,
  onNext,
}: Props) {
  return (
    <div>
      <SectionHeading
        eyebrow="步骤 3"
        title="检查并确认标签数据"
        description="换算会严格使用下面的数据。看到空白或录入错误，请返回修改。"
        icon={CheckCircle2}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-bold text-stone-500">本次主目标</p>
          <p className="mt-1 font-black">{goalLabels[goal]}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-bold text-stone-500">本次预算</p>
          <p className="mt-1 text-sm font-bold">
            {budgets.calories || '—'} 千卡 · {budgets.protein || '—'}g 蛋白质 ·{' '}
            {budgets.price || '—'} 元
          </p>
        </div>
      </div>

      {customRequirementText.trim() && (
        <section className="mb-6 rounded-2xl border border-orange/20 bg-[#fffaf3] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-orange">我的自定义购买要求</p>
              <p className="mt-1 text-sm leading-6">{customRequirementText}</p>
            </div>
            <button
              type="button"
              onClick={onEditRequirements}
              className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-bold text-stone-700"
            >
              修改要求
            </button>
          </div>
          <p className="mt-3 text-xs leading-5 text-stone-500">
            已确认 {customRequirementRules.length} 条确定性要求
            {unresolvedPreferences.length
              ? `；另有 ${unresolvedPreferences.length} 条需要 AI 解释的偏好`
              : '。'}
          </p>
        </section>
      )}

      <div className="space-y-4">
        {products.map((product, index) => {
          const metrics = calculated.find((item) => item.id === product.id)!
          const missingNutrition = [
            product.energy,
            product.protein,
            product.fat,
            product.carbs,
            product.sodium,
          ].filter((value) => !String(value).trim()).length
          return (
            <article
              key={product.id}
              className="rounded-3xl border border-stone-200 bg-white p-5 shadow-card sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-leaf/10 font-black text-leaf">
                  {String.fromCharCode(65 + index)}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-black">{product.name}</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    {product.category} · {product.netContent}
                    {product.netUnit} ·{' '}
                    {product.price.trim() ? formatCurrency(Number(product.price)) : '价格未填写'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-700"
                >
                  <Edit3 size={14} aria-hidden="true" />
                  修改
                </button>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl bg-stone-50 p-4 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-stone-500">标示基准</dt>
                  <dd className="mt-1 text-sm font-bold">{basisLabels[product.basis]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">换算后热量</dt>
                  <dd className="mt-1 text-sm font-bold">
                    {formatMetric(metrics.kcalPer100, ' kcal/100')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">蛋白质</dt>
                  <dd className="mt-1 text-sm font-bold">
                    {formatMetric(metrics.proteinPer100, 'g/100')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">钠</dt>
                  <dd className="mt-1 text-sm font-bold">
                    {formatMetric(metrics.sodiumPer100, 'mg/100')}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-stone-200 p-3">
                  <p className="text-xs font-bold text-stone-500">包装宣传语</p>
                  <p className="mt-1 text-sm leading-6">{product.claims || '未填写'}</p>
                </div>
                <div className="rounded-xl border border-stone-200 p-3">
                  <p className="text-xs font-bold text-stone-500">配料表</p>
                  <p className="mt-1 line-clamp-3 text-sm leading-6">
                    {product.ingredients || '未填写'}
                  </p>
                </div>
              </div>

              {missingNutrition > 0 && (
                <p className="mt-4 flex items-center gap-2 rounded-xl bg-orange/10 px-3 py-2 text-xs font-semibold leading-5 text-orange">
                  <AlertTriangle size={15} className="shrink-0" aria-hidden="true" />
                  有 {missingNutrition} 项营养数据未填写，相关结论将显示“标签信息不足，无法判断”。
                </p>
              )}
            </article>
          )
        })}
      </div>

      <BottomActions onBack={onBack} onNext={onNext} nextLabel="确认并查看结果" />
    </div>
  )
}
