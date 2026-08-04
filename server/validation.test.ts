import { describe, expect, it } from 'vitest'
import type { AnalyzeInput } from './types'
import { ValidationError, validateAnalyzeInput } from './validation'

export function validAnalyzeInput(): AnalyzeInput {
  const products = ['A', 'B'].map((name, index) => ({
    id: `product-${index + 1}`,
    name,
    category: '酸奶/乳制品',
    claims: index === 0 ? '高蛋白、0蔗糖' : '轻盈口感',
    ingredients: index === 0 ? '生牛乳、乳清蛋白粉、乳酸菌' : '生牛乳、白砂糖、乳酸菌',
    netContent: '200',
    netUnit: 'g' as const,
    price: index === 0 ? '8.9' : '5.5',
    basis: 'per100g' as const,
    servingSize: '',
    energy: index === 0 ? '330' : '410',
    energyUnit: 'kJ' as const,
    protein: index === 0 ? '9' : '3.2',
    fat: '3',
    carbs: '5.5',
    sodium: '65',
  }))
  const calculated = products.map((product) => ({
    id: product.id,
    name: product.name,
    kcalPer100: 78.87,
    proteinPer100: 9,
    fatPer100: 3,
    carbsPer100: 5.5,
    sodiumPer100: 65,
    packageCalories: 157.74,
    packageProtein: 18,
    packageSodium: 130,
    pricePer100: 4.45,
    proteinCostPer10g: 4.94,
    proteinPer100Kcal: 11.41,
    gramsUnderCalorieBudget: 190.19,
    packagesUnderCalorieBudget: 0.95,
    gramsForProteinTarget: 166.67,
    caloriesForProteinTarget: 131.45,
    costForProteinTarget: 7.42,
    proteinUnderPriceBudget: 20.22,
    formulas: { packageCalories: '78.87 × 200 ÷ 100' },
  }))
  const rankings = [
    {
      key: 'proteinDensity',
      label: '蛋白质密度',
      note: '按每100千卡蛋白质由高到低',
      items: calculated.map((product, index) => ({
        productId: product.id,
        productName: product.name,
        value: product.proteinPer100Kcal,
        displayValue: `${product.proteinPer100Kcal}g/100 kcal`,
        rank: index + 1,
      })),
    },
  ]
  const claimChecks = products.map((product) => ({
    productId: product.id,
    productName: product.name,
    status: '支持有限',
    observations: [
      {
        claim: product.claims,
        status: '支持有限',
        detail: '这里只进行当前商品间的相对比较。',
      },
    ],
  }))
  return {
    rawPreference: '',
    quickGoal: 'protein',
    confirmedProducts: products,
    deterministicMetrics: calculated,
    availableDimensions: ['能量', '蛋白质', '脂肪', '碳水化合物', '钠'],
    missingDimensions: [],
    localComparison: {
      status: 'full',
      preferredId: products[0].id,
      compared: ['能量', '蛋白质', '脂肪', '碳水化合物', '钠'],
      summary: 'A更符合本地确定性目标。',
    },
    safetyBoundary: '不得提供医疗诊断、治疗方案或个性化医疗营养建议。',
    requestFingerprint: 'v1-test-request',
    goal: 'proteinDensity',
    budgets: { calories: '150', protein: '15', price: '10' },
    products,
    calculated,
    rankings,
    claimChecks,
    insufficient: [],
    preferred: { id: products[0].id, name: products[0].name },
    customRequirementText: '',
    customRequirementRules: [],
    customRequirementEvaluation: {
      ruleResults: [],
      productSummaries: [],
      fullyMatchedProductIds: [],
      noProductFullyMatches: false,
      tradeoffs: [],
    },
    unresolvedPreferences: [],
  }
}

describe('validateAnalyzeInput', () => {
  it('accepts a complete 2-product request', () => {
    const input = validAnalyzeInput()
    expect(validateAnalyzeInput(input)).toEqual(input)
  })

  it('rejects more than 4 products', () => {
    const input = validAnalyzeInput()
    input.products = Array.from({ length: 5 }, (_, index) => ({
      ...input.products[0],
      id: `product-${index}`,
    }))
    expect(() => validateAnalyzeInput(input)).toThrowError(ValidationError)
  })

  it('rejects photos, base64 data, and excessive label text', () => {
    const input = validAnalyzeInput() as AnalyzeInput & {
      products: Array<AnalyzeInput['products'][number] & { ingredientPhoto?: unknown }>
    }
    input.products[0].ingredientPhoto = { dataUrl: 'data:image/png;base64,AAAA' }
    input.products[0].claims = '宣'.repeat(301)
    input.products[1].ingredients = '配'.repeat(2001)
    expect(() => validateAnalyzeInput(input)).toThrowError(/图片|Base64|300|2000/)
  })

  it('rejects invalid numeric strings and per-serving zero size', () => {
    const input = validAnalyzeInput()
    input.products[0].energy = 'not-a-number'
    input.products[1].basis = 'perServing'
    input.products[1].servingSize = '0'
    expect(() => validateAnalyzeInput(input)).toThrowError(/非负数字|每份/)
  })

  it('rejects oversized custom requirements and unsupported local constraint kinds', () => {
    const input = validAnalyzeInput()
    input.customRequirementText = '要求'.repeat(151)
    input.customRequirementRules = [
      {
        id: 'custom-invalid-0',
        kind: 'priceMax',
        original: '价格不超过10元',
        label: '价格上限',
        value: 10,
        unit: '元/包',
        basis: '使用用户录入的每包价格',
      },
    ]
    ;(input.customRequirementRules[0] as { kind: string }).kind = 'inventedMetric'

    expect(() => validateAnalyzeInput(input)).toThrowError(/300|不是支持的本地约束/)
  })
})
