import type { Budgets, CalculatedProduct, Product } from '../types'

export const KJ_PER_KCAL = 4.184

export function toNonNegativeNumber(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null
  const value = numerator / denominator
  return Number.isFinite(value) ? value : null
}

function multiply(...values: Array<number | null>): number | null {
  if (values.some((value) => value === null)) return null
  const result = (values as number[]).reduce((total, value) => total * value, 1)
  return Number.isFinite(result) ? result : null
}

function normalizeToPer100(value: number | null, product: Product): number | null {
  if (value === null) return null
  if (product.basis !== 'perServing') return value
  const servingSize = toNonNegativeNumber(product.servingSize)
  return multiply(safeDivide(value, servingSize), 100)
}

function energyToKcal(value: number | null, unit: Product['energyUnit']): number | null {
  if (value === null) return null
  return unit === 'kJ' ? value / KJ_PER_KCAL : value
}

export function calculateProduct(product: Product, budgets: Budgets): CalculatedProduct {
  const netContent = toNonNegativeNumber(product.netContent)
  const price = toNonNegativeNumber(product.price)
  const calorieBudget = toNonNegativeNumber(budgets.calories)
  const proteinTarget = toNonNegativeNumber(budgets.protein)
  const priceBudget = toNonNegativeNumber(budgets.price)

  const kcalPer100 = normalizeToPer100(
    energyToKcal(toNonNegativeNumber(product.energy), product.energyUnit),
    product,
  )
  const proteinPer100 = normalizeToPer100(toNonNegativeNumber(product.protein), product)
  const fatPer100 = normalizeToPer100(toNonNegativeNumber(product.fat), product)
  const carbsPer100 = normalizeToPer100(toNonNegativeNumber(product.carbs), product)
  const sodiumPer100 = normalizeToPer100(toNonNegativeNumber(product.sodium), product)
  const packageFactor = safeDivide(netContent, 100)
  const packageCalories = multiply(kcalPer100, packageFactor)
  const packageProtein = multiply(proteinPer100, packageFactor)
  const packageSodium = multiply(sodiumPer100, packageFactor)
  const pricePer100 = multiply(safeDivide(price, netContent), 100)
  const proteinCostPer10g = multiply(safeDivide(price, packageProtein), 10)
  const proteinPer100Kcal = multiply(safeDivide(proteinPer100, kcalPer100), 100)
  const gramsUnderCalorieBudget = multiply(safeDivide(calorieBudget, kcalPer100), 100)
  const packagesUnderCalorieBudget = safeDivide(gramsUnderCalorieBudget, netContent)
  const gramsForProteinTarget = multiply(safeDivide(proteinTarget, proteinPer100), 100)
  const caloriesForProteinTarget = multiply(
    safeDivide(gramsForProteinTarget, 100),
    kcalPer100,
  )
  const costForProteinTarget = multiply(
    safeDivide(gramsForProteinTarget, netContent),
    price,
  )
  const proteinUnderPriceBudget = multiply(
    safeDivide(priceBudget, price),
    packageProtein,
  )

  return {
    id: product.id,
    name: product.name || '未命名商品',
    kcalPer100,
    proteinPer100,
    fatPer100,
    carbsPer100,
    sodiumPer100,
    packageCalories,
    packageProtein,
    packageSodium,
    pricePer100,
    proteinCostPer10g,
    proteinPer100Kcal,
    gramsUnderCalorieBudget,
    packagesUnderCalorieBudget,
    gramsForProteinTarget,
    caloriesForProteinTarget,
    costForProteinTarget,
    proteinUnderPriceBudget,
    formulas: {
      kcalPer100:
        product.basis === 'perServing'
          ? '每份热量 ÷ 每份大小 × 100'
          : `${product.energyUnit} 数值${product.energyUnit === 'kJ' ? ' ÷ 4.184' : ''}`,
      packageCalories: '每100单位热量 × 净含量 ÷ 100',
      packageProtein: '每100单位蛋白质 × 净含量 ÷ 100',
      packageSodium: '每100单位钠 × 净含量 ÷ 100',
      pricePer100: '价格 ÷ 净含量 × 100',
      proteinCostPer10g: '价格 ÷ 每包蛋白质 × 10',
      proteinPer100Kcal: '每100单位蛋白质 ÷ 每100单位热量 × 100',
      gramsUnderCalorieBudget: '热量预算 ÷ 每100单位热量 × 100',
      packagesUnderCalorieBudget: '预算下可吃数量 ÷ 净含量',
      gramsForProteinTarget: '蛋白质目标 ÷ 每100单位蛋白质 × 100',
      caloriesForProteinTarget: '达到目标所需数量 × 每100单位热量 ÷ 100',
      costForProteinTarget: '达到目标所需数量 ÷ 净含量 × 价格',
      proteinUnderPriceBudget: '价格预算 ÷ 商品价格 × 每包蛋白质',
    },
  }
}

export function calculateAll(products: Product[], budgets: Budgets): CalculatedProduct[] {
  return products.map((product) => calculateProduct(product, budgets))
}

export function formatNumber(
  value: number | null | undefined,
  maximumFractionDigits = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value)
}

export function formatMetric(
  value: number | null | undefined,
  unit: string,
  maximumFractionDigits = 1,
): string {
  const formatted = formatNumber(value, maximumFractionDigits)
  return formatted === '—' ? formatted : `${formatted}${unit}`
}

export function formatCurrency(
  value: number | null | undefined,
  maximumFractionDigits = 2,
): string {
  const formatted = formatNumber(value, maximumFractionDigits)
  return formatted === '—' ? formatted : `¥${formatted}`
}
