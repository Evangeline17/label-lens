import { observeIngredients } from './claimChecks'
import { formatCurrency, formatMetric, toNonNegativeNumber } from './calculations'
import type {
  CalculatedProduct,
  LabelRecognitionDraft,
  Product,
} from '../types'

export type QuickGoal =
  | 'protein'
  | 'calories'
  | 'sugar'
  | 'fat'
  | 'sodium'
  | 'value'

export type ProgressiveResultStatus = 'full' | 'partial' | 'insufficient'

export const quickGoalLabels: Record<QuickGoal, string> = {
  protein: '高蛋白',
  calories: '低热量',
  sugar: '少糖',
  fat: '低脂',
  sodium: '低钠',
  value: '价格划算',
}

export interface MissingRecognitionField {
  key: keyof LabelRecognitionDraft
  label: string
}

const recognitionFields: MissingRecognitionField[] = [
  { key: 'nutritionBasis', label: '营养标示基准' },
  { key: 'energyValue', label: '能量' },
  { key: 'energyUnit', label: '能量单位' },
  { key: 'netContent', label: '净含量' },
  { key: 'netContentUnit', label: '净含量单位' },
  { key: 'protein', label: '蛋白质' },
  { key: 'sodium', label: '钠' },
]

export function getMissingRecognitionFields(
  draft: LabelRecognitionDraft | undefined,
): MissingRecognitionField[] {
  if (!draft) return [...recognitionFields]
  return recognitionFields.filter(({ key }) => {
    const value = draft[key]
    return value === '' || value === 'unknown'
  })
}

function validNumberText(value: string): string | null {
  const parsed = toNonNegativeNumber(value)
  return parsed === null ? null : String(parsed)
}

/**
 * Applies only fields whose basis/unit is known. This is intentionally stricter
 * than the advanced-mode confirmation helper so empty-form defaults never turn
 * unknown recognition data into apparently reliable quick-comparison values.
 */
export function applyReliableRecognitionDraft(
  product: Product,
  draft: LabelRecognitionDraft,
): Product {
  const next = { ...product }
  if (draft.productName.trim()) next.name = draft.productName.trim()
  if (draft.ingredientsText.trim()) next.ingredients = draft.ingredientsText.trim()

  const netContent = validNumberText(draft.netContent)
  if (netContent !== null && draft.netContentUnit) {
    next.netContent = netContent
    next.netUnit = draft.netContentUnit
  }

  if (draft.nutritionBasis === 'unknown') {
    return next
  }

  next.basis = draft.nutritionBasis
  const servingSize = validNumberText(draft.servingSize)
  if (servingSize !== null) next.servingSize = servingSize
  const energy = validNumberText(draft.energyValue)
  if (energy !== null && draft.energyUnit) {
    next.energy = energy
    next.energyUnit = draft.energyUnit
  }
  const protein = validNumberText(draft.protein)
  const fat = validNumberText(draft.fat)
  const carbs = validNumberText(draft.carbohydrate)
  const sodium = validNumberText(draft.sodium)
  if (protein !== null) next.protein = protein
  if (fat !== null) next.fat = fat
  if (carbs !== null) next.carbs = carbs
  if (sodium !== null) next.sodium = sodium
  return next
}

type MetricGetter = (item: CalculatedProduct) => number | null

interface ComparableMetricDefinition {
  key: 'energy' | 'protein' | 'fat' | 'carbs' | 'sodium' | 'package' | 'value'
  label: string
  metric: MetricGetter
  requiresSameUnit: boolean
}

const metricDefinitions: ComparableMetricDefinition[] = [
  { key: 'energy', label: '能量', metric: (item) => item.kcalPer100, requiresSameUnit: true },
  { key: 'protein', label: '蛋白质', metric: (item) => item.proteinPer100, requiresSameUnit: true },
  { key: 'fat', label: '脂肪', metric: (item) => item.fatPer100, requiresSameUnit: true },
  { key: 'carbs', label: '碳水化合物', metric: (item) => item.carbsPer100, requiresSameUnit: true },
  { key: 'sodium', label: '钠', metric: (item) => item.sodiumPer100, requiresSameUnit: true },
  { key: 'package', label: '整包数据', metric: (item) => item.packageCalories, requiresSameUnit: false },
  { key: 'value', label: '蛋白质性价比', metric: (item) => item.proteinCostPer10g, requiresSameUnit: false },
]

function metricEntries(
  definition: ComparableMetricDefinition,
  products: Product[],
  calculated: CalculatedProduct[],
): Array<{ product: Product; metric: CalculatedProduct; value: number }> {
  const entries = calculated.flatMap((metric) => {
    const product = products.find((item) => item.id === metric.id)
    const value = definition.metric(metric)
    return product && value !== null ? [{ product, metric, value }] : []
  })
  if (!definition.requiresSameUnit) return entries

  const groups = new Map<Product['netUnit'], typeof entries>()
  entries.forEach((entry) => {
    groups.set(entry.product.netUnit, [...(groups.get(entry.product.netUnit) ?? []), entry])
  })
  return [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? []
}

function definitionForGoal(goal: QuickGoal): ComparableMetricDefinition | null {
  const keyByGoal: Partial<Record<QuickGoal, ComparableMetricDefinition['key']>> = {
    protein: 'protein',
    calories: 'energy',
    fat: 'fat',
    sodium: 'sodium',
    value: 'value',
  }
  const key = keyByGoal[goal]
  return key ? metricDefinitions.find((item) => item.key === key) ?? null : null
}

export interface ProgressiveComparison {
  status: ProgressiveResultStatus
  preferredId: string | null
  targetComparable: boolean
  targetComplete: boolean
  compared: string[]
  unavailable: string[]
  commonDimensionCount: number
  nextAction: string
}

function fallbackName(product: Product, index: number): string {
  return product.name.trim() || `商品${String.fromCharCode(65 + index)}`
}

function missingProductNames(
  products: Product[],
  calculated: CalculatedProduct[],
  metric: MetricGetter,
): string[] {
  return products
    .filter((product) => metric(calculated.find((item) => item.id === product.id)!) === null)
    .map((product) => fallbackName(product, products.indexOf(product)))
}

function uniqueWinner(
  entries: Array<{ product: Product; value: number }>,
  direction: 'min' | 'max',
): string | null {
  const sorted = [...entries].sort((a, b) =>
    direction === 'min' ? a.value - b.value : b.value - a.value,
  )
  if (!sorted.length || (sorted[1] && Math.abs(sorted[0].value - sorted[1].value) < 1e-8)) {
    return null
  }
  return sorted[0].product.id
}

function nextActionFor(goal: QuickGoal, products: Product[], calculated: CalculatedProduct[]): string {
  if (goal === 'sugar') {
    return '包装若提供糖含量，请补拍对应营养成分表；配料表只能用于发现相关配料。'
  }
  const target = definitionForGoal(goal)
  if (target) {
    const missing = missingProductNames(products, calculated, target.metric)
    if (missing.length) {
      const field = goal === 'value' ? '价格、净含量和蛋白质' : target.label
      return `补充${missing.join('、')}的${field}，即可按“${quickGoalLabels[goal]}”排序。`
    }
  }
  const nutritionMissing = products.find((product) => {
    const metric = calculated.find((item) => item.id === product.id)!
    return [metric.kcalPer100, metric.proteinPer100, metric.fatPer100, metric.sodiumPer100]
      .filter((value) => value !== null).length === 0
  })
  if (nutritionMissing) {
    const index = products.indexOf(nutritionMissing)
    return `补拍${fallbackName(nutritionMissing, index)}的营养成分表，可增加能量、蛋白质和钠的比较。`
  }
  const ingredientsMissing = products.find((product) => !product.ingredients.trim())
  if (ingredientsMissing) {
    const index = products.indexOf(ingredientsMissing)
    return `补拍${fallbackName(ingredientsMissing, index)}的配料表，可增加配料提示。`
  }
  return '可以先看现有结果，也可以补拍更清晰的标签照片。'
}

export function getProgressiveComparison(
  goal: QuickGoal,
  products: Product[],
  calculated: CalculatedProduct[],
): ProgressiveComparison {
  const baseCompared = metricDefinitions.slice(0, 5)
    .filter((definition) => metricEntries(definition, products, calculated).length >= 2)
    .map((definition) => definition.label)
  const derivedCompared = metricDefinitions.slice(5)
    .filter((definition) => metricEntries(definition, products, calculated).length >= 2)
    .map((definition) => definition.label)
  const compared = [...baseCompared]
  const priceComparable = products.filter((product) => toNonNegativeNumber(product.price) !== null).length >= 2
  if (priceComparable) compared.push('价格')
  const ingredientCount = products.filter((product) => product.ingredients.trim()).length
  if (ingredientCount >= 2) compared.push('配料')
  compared.push(...derivedCompared)
  const commonDimensionCount =
    baseCompared.length + (priceComparable ? 1 : 0) + (ingredientCount >= 2 ? 1 : 0)

  const unavailable: string[] = []
  const packageMissing = products.filter((product) => !product.netContent.trim())
  if (packageMissing.length) unavailable.push('整包数据：缺少净含量')
  const priceMissing = products.filter((product) => !product.price.trim())
  if (priceMissing.length) unavailable.push('价格：未录入')
  const ingredientsMissing = products.filter((product) => !product.ingredients.trim())
  if (ingredientsMissing.length) {
    unavailable.push(
      `配料：${ingredientsMissing.map((product) => fallbackName(product, products.indexOf(product))).join('、')}未拍到配料表`,
    )
  }
  metricDefinitions.slice(0, 5).forEach((definition) => {
    const missing = missingProductNames(products, calculated, definition.metric)
    if (missing.length && !compared.includes(definition.label)) {
      unavailable.push(`${definition.label}：${missing.join('、')}未识别`)
    }
  })

  const target = definitionForGoal(goal)
  const targetEntries = target ? metricEntries(target, products, calculated) : []
  const targetComparable = targetEntries.length >= 2
  const targetComplete = Boolean(target && targetEntries.length === products.length)
  if (goal === 'sugar') {
    unavailable.unshift('糖含量：包装未提供明确字段')
  } else if (target && !targetComplete) {
    const missing = missingProductNames(products, calculated, target.metric)
    if (missing.length) unavailable.unshift(`${target.label}：${missing.join('、')}未识别`)
  }
  let status: ProgressiveResultStatus = 'full'
  if (commonDimensionCount === 0) status = 'insufficient'
  else if (commonDimensionCount === 1 || !targetComplete) status = 'partial'

  const direction: 'min' | 'max' = goal === 'protein' ? 'max' : 'min'
  const preferredId =
    status === 'full' ? uniqueWinner(targetEntries, direction) : null

  return {
    status,
    preferredId,
    targetComparable,
    targetComplete,
    compared,
    unavailable: [...new Set(unavailable)],
    commonDimensionCount,
    nextAction: nextActionFor(goal, products, calculated),
  }
}

export function getQuickReason(
  goal: QuickGoal,
  preferred: Product | null,
  assessment: ProgressiveComparison,
): string {
  if (assessment.status === 'insufficient') {
    return '目前没有任何共同可比较维度，先补拍最关键的标签信息。'
  }
  if (!assessment.targetComplete) {
    if (goal === 'sugar') {
      return '当前无法按少糖排序：配料表只能提示糖类配料，不能代替明确糖含量。'
    }
    return `当前无法按“${quickGoalLabels[goal]}”排序；已识别的数据仍保留在下方局部比较中。`
  }
  if (assessment.status === 'partial') {
    return '目前只有一个共同指标，先展示局部差异，不强行给出综合推荐。'
  }
  if (!preferred) return '当前目标数据完整，但数值接近，因此没有唯一首选。'
  const name = preferred.name.trim() || '该商品'
  const reasons: Record<QuickGoal, string> = {
    protein: `${name} 的每100单位蛋白质更高。`,
    calories: `${name} 的每100单位热量更低。`,
    sugar: '包装未提供可用于排序的明确糖含量。',
    fat: `${name} 的每100单位脂肪更低。`,
    sodium: `${name} 的每100单位钠更低。`,
    value: `${name} 获得同等蛋白质所需花费更少。`,
  }
  return reasons[goal]
}

export interface QuickHighlight {
  label: string
  value: string
  winnerId: string | null
}

function highlight(
  definition: ComparableMetricDefinition,
  products: Product[],
  calculated: CalculatedProduct[],
  format: (item: CalculatedProduct) => string,
  direction: 'min' | 'max',
): QuickHighlight | null {
  const entries = metricEntries(definition, products, calculated)
  if (entries.length < 2) return null
  const winnerId = uniqueWinner(entries, direction)
  const winner = entries.find((entry) => entry.product.id === winnerId)
  return {
    label: definition.label,
    winnerId,
    value: winner
      ? `${fallbackName(winner.product, products.indexOf(winner.product))}更优 · ${format(winner.metric)}`
      : '表现接近',
  }
}

export function getQuickHighlights(
  products: Product[],
  calculated: CalculatedProduct[],
): QuickHighlight[] {
  const byKey = Object.fromEntries(metricDefinitions.map((item) => [item.key, item])) as Record<
    ComparableMetricDefinition['key'],
    ComparableMetricDefinition
  >
  return [
    highlight(byKey.energy, products, calculated, (item) => formatMetric(item.kcalPer100, ' kcal/100单位'), 'min'),
    highlight(byKey.protein, products, calculated, (item) => formatMetric(item.proteinPer100, 'g/100单位'), 'max'),
    highlight(byKey.fat, products, calculated, (item) => formatMetric(item.fatPer100, 'g/100单位'), 'min'),
    highlight(byKey.sodium, products, calculated, (item) => formatMetric(item.sodiumPer100, 'mg/100单位'), 'min'),
    highlight(byKey.package, products, calculated, (item) => formatMetric(item.packageCalories, ' kcal/包'), 'min'),
    highlight(byKey.value, products, calculated, (item) => `${formatCurrency(item.proteinCostPer10g)}/10g蛋白质`, 'min'),
  ].filter((item): item is QuickHighlight => item !== null).slice(0, 5)
}

export function getIngredientHints(products: Product[]): Array<{ productId: string; text: string }> {
  return products.flatMap((product, index) => {
    if (!product.ingredients.trim()) return []
    const terms = observeIngredients(product, '').sugarTerms
    return [{
      productId: product.id,
      text: `${fallbackName(product, index)}：${
        terms.length ? `发现糖类相关配料词 ${terms.join('、')}` : '未发现常见糖类配料词'
      }（仅作配料提示）`,
    }]
  })
}
