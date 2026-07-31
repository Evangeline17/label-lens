import type {
  CalculatedProduct,
  ClaimCheckResult,
  ClaimObservation,
  ClaimSupportStatus,
  IngredientObservation,
  Product,
} from '../types'

const sugarKeywords = ['白砂糖', '蔗糖', '果葡糖浆', '高果糖浆', '浓缩果汁']

export function parseIngredients(text: string): string[] {
  return text
    .split(/[、，,；;。]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function observeIngredients(product: Product, concernWords: string): IngredientObservation {
  const ingredients = parseIngredients(product.ingredients)
  const concernList = concernWords
    .split(/[、，,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (!product.ingredients.trim()) {
    return { firstThree: [], count: null, sugarTerms: [], concernTerms: [] }
  }

  return {
    firstThree: ingredients.slice(0, 3),
    count: ingredients.length,
    sugarTerms: sugarKeywords.filter((keyword) => product.ingredients.includes(keyword)),
    concernTerms: concernList.filter((keyword) => product.ingredients.includes(keyword)),
  }
}

function relativePosition(
  value: number | null,
  values: Array<number | null>,
  direction: 'high' | 'low',
): string | null {
  if (value === null) return null
  const valid = values.filter((item): item is number => item !== null)
  if (!valid.length) return null
  const sorted = [...valid].sort((a, b) => (direction === 'high' ? b - a : a - b))
  const position = sorted.findIndex((item) => Math.abs(item - value) < 1e-8) + 1
  return `当前 ${valid.length} 款中排第 ${position}`
}

function overallStatus(observations: ClaimObservation[]): ClaimSupportStatus {
  if (!observations.length || observations.every((item) => item.status === '信息不足')) {
    return '信息不足'
  }
  return observations.some((item) => item.status === '标签数据较支持')
    ? '标签数据较支持'
    : '支持有限'
}

export function checkProductClaims(
  product: Product,
  calculated: CalculatedProduct,
  allCalculated: CalculatedProduct[],
): ClaimCheckResult {
  const observations: ClaimObservation[] = []
  const claims = product.claims.trim()

  if (/0\s*蔗糖|零蔗糖/i.test(claims)) {
    if (!product.ingredients.trim()) {
      observations.push({
        claim: '0蔗糖',
        status: '信息不足',
        detail: '未录入配料表，标签信息不足，无法判断。',
      })
    } else if (/白砂糖|蔗糖/.test(product.ingredients)) {
      observations.push({
        claim: '0蔗糖',
        status: '支持有限',
        detail: '配料表出现了“白砂糖”或“蔗糖”，建议重新核对包装原文。',
      })
    } else {
      observations.push({
        claim: '0蔗糖',
        status: '标签数据较支持',
        detail: '配料表未见蔗糖类原料，但不等于无糖或低碳水。',
      })
    }
  }

  if (/高蛋白/i.test(claims)) {
    const position = relativePosition(
      calculated.proteinPer100,
      allCalculated.map((item) => item.proteinPer100),
      'high',
    )
    observations.push({
      claim: '高蛋白',
      status: position?.endsWith('第 1') ? '标签数据较支持' : position ? '支持有限' : '信息不足',
      detail: position
        ? `每100单位蛋白质为 ${calculated.proteinPer100?.toFixed(1)}g，${position}。这里只比较相对位置，不判断是否符合法定“高蛋白”标准。`
        : '缺少可比较的蛋白质数据，标签信息不足，无法判断。',
    })
  }

  if (/低脂/i.test(claims)) {
    const position = relativePosition(
      calculated.fatPer100,
      allCalculated.map((item) => item.fatPer100),
      'low',
    )
    observations.push({
      claim: '低脂',
      status: position?.endsWith('第 1') ? '标签数据较支持' : position ? '支持有限' : '信息不足',
      detail: position
        ? `每100单位脂肪为 ${calculated.fatPer100?.toFixed(1)}g，${position}。这里只展示当前商品间的相对比较，不做法律合规判定。`
        : '缺少脂肪数据，标签信息不足，无法判断。',
    })
  }

  if (/简单配方|配方简单/i.test(claims)) {
    const count = parseIngredients(product.ingredients).length
    observations.push({
      claim: '简单配方',
      status: count ? '支持有限' : '信息不足',
      detail: count
        ? `配料表共识别到 ${count} 项。配料数量少不等于一定更健康。`
        : '未录入配料表，标签信息不足，无法判断。',
    })
  }

  if (!observations.length) {
    observations.push({
      claim: claims || '未填写宣传语',
      status: '信息不足',
      detail: claims
        ? '当前本地规则未覆盖这条宣传语，仅保留原文供你核对。'
        : '没有包装宣传语可供核对。',
    })
  }

  return {
    productId: product.id,
    productName: product.name || '未命名商品',
    status: overallStatus(observations),
    observations,
  }
}

export function checkAllClaims(
  products: Product[],
  calculated: CalculatedProduct[],
): ClaimCheckResult[] {
  return products.map((product) => {
    const metrics = calculated.find((item) => item.id === product.id)!
    return checkProductClaims(product, metrics, calculated)
  })
}
