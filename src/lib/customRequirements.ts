import { formatCurrency, formatMetric } from './calculations'
import { parseIngredients } from './claimChecks'
import type {
  Budgets,
  CalculatedProduct,
  CustomRequirementEvaluation,
  CustomRequirementKind,
  CustomRequirementRule,
  Product,
  ProductRequirementMatch,
  ProductRequirementSummary,
  RequirementRuleResult,
} from '../types'

const MAX_CUSTOM_REQUIREMENT_LENGTH = 300
const numberPattern = '(\\d+(?:\\.\\d+)?)'
const upperBound = '(?:不超过|不高于|最多|以内|以下|≤|<=)'
const lowerBound = '(?:至少|不低于|不少于|以上|≥|>=)'
const commonSugarTerms = ['白砂糖', '蔗糖', '果葡糖浆', '浓缩果汁']

interface ParseResult {
  rules: CustomRequirementRule[]
  unresolvedPreferences: string[]
}

function makeRule(
  kind: CustomRequirementKind,
  index: number,
  original: string,
  details: Omit<CustomRequirementRule, 'id' | 'kind' | 'original'>,
): CustomRequirementRule {
  return {
    id: `custom-${kind}-${index}`,
    kind,
    original,
    ...details,
  }
}

function numericMatch(segment: string, expression: RegExp): number | null {
  const match = segment.match(expression)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value >= 0 ? value : null
}

function parseSegment(segment: string, startIndex: number): CustomRequirementRule[] {
  const rules: CustomRequirementRule[] = []
  let index = startIndex
  const addNumeric = (
    kind: CustomRequirementKind,
    value: number | null,
    label: string,
    unit: string,
    basis: string,
  ) => {
    if (value === null) return
    rules.push(makeRule(kind, index++, segment, { label, value, unit, basis }))
  }

  addNumeric(
    'per100gCaloriesMax',
    numericMatch(
      segment,
      new RegExp(`每\\s*100\\s*(?:g|克).{0,8}?(?:热量)?\\s*${upperBound}\\s*${numberPattern}\\s*(?:千卡|kcal)`, 'i'),
    ),
    '每100g热量上限',
    '千卡/100g',
    '仅比较净含量单位为 g 的商品换算值',
  )
  addNumeric(
    'packageCaloriesMax',
    numericMatch(
      segment,
      new RegExp(`(?:整包|一整包|每包|一包).{0,8}?(?:热量)?\\s*(?:尽量)?\\s*${upperBound}\\s*${numberPattern}\\s*(?:千卡|kcal)`, 'i'),
    ),
    '整包热量上限',
    '千卡/包',
    '使用每包装总热量',
  )
  addNumeric(
    'per100gProteinMin',
    numericMatch(
      segment,
      new RegExp(`每\\s*100\\s*(?:g|克).{0,8}?蛋白质\\s*${lowerBound}\\s*${numberPattern}\\s*(?:g|克)`, 'i'),
    ),
    '每100g蛋白质下限',
    '克/100g',
    '仅比较净含量单位为 g 的商品换算值',
  )
  if (!/每\s*100\s*(?:g|克)/i.test(segment)) {
    addNumeric(
      'packageProteinMin',
      numericMatch(
        segment,
        new RegExp(`(?:整包|一整包|每包|一包)?\\s*蛋白质\\s*${lowerBound}\\s*${numberPattern}\\s*(?:g|克)`, 'i'),
      ),
      '整包蛋白质下限',
      '克/包',
      '未写每100g时，按每包装总蛋白质理解',
    )
  }
  addNumeric(
    'packageSodiumMax',
    numericMatch(
      segment,
      new RegExp(`钠\\s*${upperBound}\\s*${numberPattern}\\s*(?:mg|毫克)`, 'i'),
    ),
    '整包钠上限',
    '毫克/包',
    '未写每100g时，按每包装总钠理解',
  )
  addNumeric(
    'ingredientCountMax',
    numericMatch(
      segment,
      new RegExp(`配料(?:数量|总数|表)?\\s*${upperBound}\\s*${numberPattern}\\s*(?:项|种|个)`, 'i'),
    ),
    '配料数量上限',
    '项',
    '按逗号、顿号、分号等分隔后的配料项目数',
  )

  const priceValue =
    numericMatch(
      segment,
      new RegExp(`(?:价格|预算)\\s*${upperBound}\\s*${numberPattern}\\s*元`, 'i'),
    ) ??
    numericMatch(segment, new RegExp(`${numberPattern}\\s*元\\s*(?:以内|以下)`, 'i'))
  addNumeric('priceMax', priceValue, '价格上限', '元/包', '使用用户录入的每包价格')

  if (
    /(?:整包|一整包|每包|一包).{0,10}(?:接近|贴近).{0,6}(?:热量)?预算|(?:热量)?预算.{0,6}(?:接近|贴近).{0,10}(?:整包|一整包|每包|一包)/.test(
      segment,
    )
  ) {
    rules.push(
      makeRule('packageNearCalorieBudget', index++, segment, {
        label: '整包接近热量预算',
        basis: '整包热量与本次热量预算相差不超过预算的10%，且至少容许10千卡差额',
      }),
    )
  }

  if (/(?:不含|未出现|没有)\s*/.test(segment)) {
    const directTerms =
      segment
        .match(/(?:不含|未出现|没有)(?:或(?:不含|未出现|没有))?\s*(.+)$/)?.[1]
        ?.split(/[、和或/]+/)
        .map((term) =>
          term
            .replace(/^(?:不含|未出现|没有)/, '')
            .replace(/等(?:相关)?(?:配料|原料|词)?$/, '')
            .trim(),
        )
        .filter((term) => term.length > 0 && term.length <= 30) ?? []
    const terms = [...new Set([
      ...commonSugarTerms.filter((term) => segment.includes(term)),
      ...directTerms,
    ])]
    for (const term of terms) {
      rules.push(
        makeRule('excludeIngredientTerm', index++, segment, {
          label: `配料表未出现“${term}”`,
          term,
          basis: '仅检查用户录入的配料表文字是否出现该词',
        }),
      )
    }
  }

  return rules
}

export function parseCustomRequirements(text: string): ParseResult {
  const normalized = text.slice(0, MAX_CUSTOM_REQUIREMENT_LENGTH).trim()
  if (!normalized) return { rules: [], unresolvedPreferences: [] }
  const segments = normalized
    .split(/[，,。；;\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
  const rules: CustomRequirementRule[] = []
  const unresolvedPreferences: string[] = []

  for (const segment of segments) {
    const parsed = parseSegment(segment, rules.length)
    if (parsed.length) rules.push(...parsed)
    else unresolvedPreferences.push(segment)
  }
  return { rules, unresolvedPreferences }
}

function numericResult(
  product: Product,
  actual: number | null,
  rule: CustomRequirementRule,
  direction: 'max' | 'min',
  suffix: string,
): ProductRequirementMatch {
  if (actual === null || rule.value === undefined) {
    return {
      productId: product.id,
      productName: product.name,
      status: '无法判断',
      evidence: '标签信息不足，无法判断',
    }
  }
  const satisfied = direction === 'max' ? actual <= rule.value : actual >= rule.value
  const difference = Math.abs(actual - rule.value)
  const differenceEvidence =
    direction === 'min'
      ? satisfied
        ? `；达到要求并高出 ${formatMetric(difference, suffix)}`
        : `；未达到，低于要求 ${formatMetric(difference, suffix)}`
      : satisfied
        ? `；满足上限要求，低于上限 ${formatMetric(difference, suffix)}`
        : `；超过上限 ${formatMetric(difference, suffix)}`
  return {
    productId: product.id,
    productName: product.name,
    status: satisfied ? '满足' : '不满足',
    evidence: `实际 ${formatMetric(actual, suffix)}；要求${direction === 'max' ? '不超过' : '至少'} ${rule.value}${suffix}${differenceEvidence}`,
  }
}

function evaluateRule(
  rule: CustomRequirementRule,
  product: Product,
  metric: CalculatedProduct,
  budgets: Budgets,
): ProductRequirementMatch {
  if (rule.kind === 'priceMax') {
    const price = product.price.trim() ? Number(product.price) : null
    if (price === null || !Number.isFinite(price)) {
      return {
        productId: product.id,
        productName: product.name,
        status: '无法判断',
        evidence: '价格未填写，标签信息不足，无法判断',
      }
    }
    const satisfied = rule.value !== undefined && price <= rule.value
    return {
      productId: product.id,
      productName: product.name,
      status: satisfied ? '满足' : '不满足',
      evidence: `实际 ${formatCurrency(price)}；要求不超过 ${rule.value?.toFixed(2)} 元`,
    }
  }
  if (rule.kind === 'packageCaloriesMax') {
    return numericResult(product, metric.packageCalories, rule, 'max', ' 千卡/包')
  }
  if (rule.kind === 'per100gCaloriesMax') {
    return product.netUnit === 'g'
      ? numericResult(product, metric.kcalPer100, rule, 'max', ' 千卡/100g')
      : {
          productId: product.id,
          productName: product.name,
          status: '无法判断',
          evidence: '该商品使用 mL，无法按每100g口径判断',
        }
  }
  if (rule.kind === 'packageProteinMin') {
    return numericResult(product, metric.packageProtein, rule, 'min', ' 克/包')
  }
  if (rule.kind === 'per100gProteinMin') {
    return product.netUnit === 'g'
      ? numericResult(product, metric.proteinPer100, rule, 'min', ' 克/100g')
      : {
          productId: product.id,
          productName: product.name,
          status: '无法判断',
          evidence: '该商品使用 mL，无法按每100g口径判断',
        }
  }
  if (rule.kind === 'packageSodiumMax') {
    return numericResult(product, metric.packageSodium, rule, 'max', ' 毫克/包')
  }
  if (rule.kind === 'ingredientCountMax') {
    const count = product.ingredients.trim() ? parseIngredients(product.ingredients).length : null
    return numericResult(product, count, rule, 'max', ' 项')
  }
  if (rule.kind === 'excludeIngredientTerm') {
    if (!product.ingredients.trim() || !rule.term) {
      return {
        productId: product.id,
        productName: product.name,
        status: '无法判断',
        evidence: '配料表未填写，标签信息不足，无法判断',
      }
    }
    const appeared = product.ingredients.includes(rule.term)
    return {
      productId: product.id,
      productName: product.name,
      status: appeared ? '不满足' : '满足',
      evidence: appeared
        ? `配料表中出现“${rule.term}”`
        : `配料表文字中未出现“${rule.term}”`,
    }
  }

  const budget = Number(budgets.calories)
  if (
    !Number.isFinite(budget) ||
    budget <= 0 ||
    metric.packageCalories === null
  ) {
    return {
      productId: product.id,
      productName: product.name,
      status: '无法判断',
      evidence: '热量预算或整包热量不足，无法判断',
    }
  }
  const difference = Math.abs(metric.packageCalories - budget)
  const tolerance = Math.max(10, budget * 0.1)
  return {
    productId: product.id,
    productName: product.name,
    status: difference <= tolerance ? '满足' : '不满足',
    evidence: `整包 ${formatMetric(metric.packageCalories, ' 千卡')}，预算 ${formatMetric(budget, ' 千卡')}，相差 ${formatMetric(difference, ' 千卡')}；接近口径为相差不超过 ${formatMetric(tolerance, ' 千卡')}`,
  }
}

function summarizeProduct(
  product: Product,
  ruleResults: RequirementRuleResult[],
): ProductRequirementSummary {
  const statuses = ruleResults
    .map((result) => result.products.find((item) => item.productId === product.id)?.status)
    .filter(Boolean)
  const satisfiedCount = statuses.filter((status) => status === '满足').length
  const failedCount = statuses.filter((status) => status === '不满足').length
  const unknownCount = statuses.filter((status) => status === '无法判断').length
  let status: ProductRequirementSummary['status']
  if (!statuses.length || unknownCount === statuses.length) status = '无法判断'
  else if (satisfiedCount === statuses.length) status = '满足'
  else if (failedCount > 0 && satisfiedCount === 0) status = '不满足'
  else status = '部分满足'
  return {
    productId: product.id,
    productName: product.name,
    status,
    satisfiedCount,
    failedCount,
    unknownCount,
  }
}

export function evaluateCustomRequirements(
  rules: CustomRequirementRule[],
  products: Product[],
  calculated: CalculatedProduct[],
  budgets: Budgets,
): CustomRequirementEvaluation {
  const ruleResults = rules.map((rule) => ({
    rule,
    products: products.map((product) => {
      const metric = calculated.find((item) => item.id === product.id)
      return metric
        ? evaluateRule(rule, product, metric, budgets)
        : {
            productId: product.id,
            productName: product.name,
            status: '无法判断' as const,
            evidence: '标签信息不足，无法判断',
          }
    }),
  }))
  const productSummaries = products.map((product) => summarizeProduct(product, ruleResults))
  const fullyMatchedProductIds = productSummaries
    .filter((summary) => summary.status === '满足')
    .map((summary) => summary.productId)
  const noProductFullyMatches = rules.length > 0 && fullyMatchedProductIds.length === 0
  return {
    ruleResults,
    productSummaries,
    fullyMatchedProductIds,
    noProductFullyMatches,
    tradeoffs: noProductFullyMatches
      ? productSummaries.map((summary) => {
          const failedLabels = ruleResults
            .filter(
              (result) =>
                result.products.find((item) => item.productId === summary.productId)
                  ?.status === '不满足',
            )
            .map((result) => result.rule.label)
          const unknownLabels = ruleResults
            .filter(
              (result) =>
                result.products.find((item) => item.productId === summary.productId)
                  ?.status === '无法判断',
            )
            .map((result) => result.rule.label)
          return [
            `${summary.productName}：满足 ${summary.satisfiedCount}/${rules.length} 条`,
            failedLabels.length ? `未满足 ${failedLabels.join('、')}` : '',
            unknownLabels.length ? `无法判断 ${unknownLabels.join('、')}` : '',
          ]
            .filter(Boolean)
            .join('；')
        })
      : [],
  }
}

export function updateRequirementValue(
  rules: CustomRequirementRule[],
  id: string,
  value: number,
): CustomRequirementRule[] {
  return rules.map((rule) =>
    rule.id === id ? { ...rule, value: Math.max(0, value) } : rule,
  )
}
