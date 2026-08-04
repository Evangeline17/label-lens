import { describe, expect, it } from 'vitest'
import { calculateAll } from './calculations'
import { cloneMockProducts, createEmptyProduct } from '../data/mockProducts'
import { recognitionResultToDraft } from './labelRecognition'
import {
  applyReliableRecognitionDraft,
  classifyQuickPreference,
  comparisonGoalForQuickGoal,
  getIngredientHints,
  getMissingRecognitionFields,
  getProgressiveComparison,
  getQuickHighlights,
} from './quickComparison'
import type { Product } from '../types'

const budgets = { calories: '150', protein: '15', price: '10' }

function calculate(products: Product[]) {
  return calculateAll(products, budgets)
}

describe('progressive quick comparison', () => {
  it('compares per-100 data when net content is missing', () => {
    const products = cloneMockProducts().slice(0, 2).map((product, index) =>
      index === 1 ? { ...product, netContent: '' } : product,
    )
    const calculated = calculate(products)
    const result = getProgressiveComparison('protein', products, calculated)

    expect(result.compared).toContain('蛋白质')
    expect(result.compared).not.toContain('整包数据')
    expect(result.status).toBe('full')
    expect(calculated[1].packageCalories).toBeNull()
    expect(calculated[1].proteinPer100).toBe(3.2)
  })

  it('keeps nutrition comparison available when price is missing', () => {
    const products = cloneMockProducts().slice(0, 2).map((product) => ({
      ...product,
      price: '',
    }))
    const result = getProgressiveComparison('protein', products, calculate(products))

    expect(result.compared).toContain('能量')
    expect(result.compared).toContain('蛋白质')
    expect(result.compared).not.toContain('蛋白质性价比')
    expect(result.unavailable).toContain('价格未录入，因此暂不比较性价比')
  })

  it('omits an ingredient conclusion for a product whose ingredient list is missing', () => {
    const products = cloneMockProducts().slice(0, 2)
    products[1] = { ...products[1], ingredients: '' }
    const hints = getIngredientHints(products)

    expect(hints.map((item) => item.productId)).toEqual([products[0].id])
    expect(hints.some((item) => item.productId === products[1].id)).toBe(false)
  })

  it('returns partial and no recommendation when only one common metric exists', () => {
    const products = cloneMockProducts().slice(0, 2).map((product) => ({
      ...product,
      energy: '',
      fat: '',
      carbs: '',
      sodium: '',
      netContent: '',
      price: '',
      ingredients: '',
    }))
    const result = getProgressiveComparison('protein', products, calculate(products))

    expect(result.compared).toEqual(['蛋白质'])
    expect(result.status).toBe('partial')
    expect(result.preferredId).toBeNull()
  })

  it('returns insufficient when no metric is shared by two products', () => {
    const [first, second] = cloneMockProducts().slice(0, 2)
    const products = [
      { ...first, energy: '', fat: '', carbs: '', sodium: '', netContent: '', price: '', ingredients: '' },
      { ...second, protein: '', fat: '', carbs: '', sodium: '', netContent: '', price: '', ingredients: '' },
    ]
    const result = getProgressiveComparison('protein', products, calculate(products))

    expect(result.commonDimensionCount).toBe(0)
    expect(result.status).toBe('insufficient')
    expect(result.preferredId).toBeNull()
  })

  it('switches to a missing-data goal without changing recognition state', () => {
    const products = cloneMockProducts().slice(0, 2).map((product) => ({ ...product, energy: '' }))
    const sessions = { a: { status: 'completed' as const, taskId: 'same-task' } }

    const protein = getProgressiveComparison('protein', products, calculate(products))
    const calories = getProgressiveComparison('calories', products, calculate(products))

    expect(protein.status).toBe('full')
    expect(calories.status).toBe('partial')
    expect(calories.targetComparable).toBe(false)
    expect(sessions).toEqual({ a: { status: 'completed', taskId: 'same-task' } })
  })

  it('never turns missing basis or units into zeroes or default-backed values', () => {
    const product = createEmptyProduct(0)
    const draft = recognitionResultToDraft({
      productName: null,
      ingredientsText: null,
      netContent: 200,
      netContentUnit: null,
      nutritionBasis: 'unknown',
      energyValue: 330,
      energyUnit: null,
      protein: 9,
      fat: 3,
      carbohydrate: 5,
      sodium: 60,
    })
    const applied = applyReliableRecognitionDraft(product, draft)
    const metric = calculate([applied])[0]

    expect(applied.netContent).toBe('')
    expect(applied.energy).toBe('')
    expect(applied.protein).toBe('')
    expect(metric.packageCalories).toBeNull()
    expect(metric.proteinPer100).toBeNull()
  })

  it('keeps complete-data calculation outputs unchanged', () => {
    const products = cloneMockProducts().slice(0, 2)
    const calculated = calculate(products)
    const result = getProgressiveComparison('protein', products, calculated)

    expect(calculated[0].packageCalories).toBeCloseTo((330 / 4.184) * 2, 8)
    expect(calculated[0].packageProtein).toBe(18)
    expect(calculated[0].proteinCostPer10g).toBeCloseTo((8.9 / 18) * 10, 8)
    expect(result.status).toBe('full')
    expect(result.preferredId).toBe(products[0].id)
    expect(getQuickHighlights(products, calculated).length).toBeGreaterThanOrEqual(3)
  })

  it('does not use ingredient sugar words as a quantitative sugar ranking', () => {
    const products = cloneMockProducts().slice(0, 2)
    const result = getProgressiveComparison('sugar', products, calculate(products))

    expect(result.status).toBe('partial')
    expect(result.targetComplete).toBe(false)
    expect(result.preferredId).toBeNull()
    expect(result.unavailable).toContain('糖含量：包装未提供明确字段')
    expect(getIngredientHints(products)).toHaveLength(2)
  })

  it('classifies vague wellness as comprehensive without mapping it to calories', () => {
    const preference = classifyQuickPreference('想健康一点，整体看看')

    expect(preference).toEqual({
      explicitGoal: null,
      hasGeneralPreference: true,
      hasMedicalContext: false,
    })
    expect(comparisonGoalForQuickGoal('overall')).toBe('balance')
    expect(comparisonGoalForQuickGoal('overall')).not.toBe('calories')
  })

  it('separates medical context from an explicit food-label goal', () => {
    expect(classifyQuickPreference('最近感冒了')).toMatchObject({
      explicitGoal: null,
      hasMedicalContext: true,
    })
    expect(classifyQuickPreference('想选高蛋白的')).toMatchObject({
      explicitGoal: 'protein',
      hasMedicalContext: false,
    })
  })

  it('reports only recognition fields that are actually missing', () => {
    const draft = recognitionResultToDraft({
      productName: '原味酸奶',
      ingredientsText: null,
      netContent: null,
      netContentUnit: null,
      nutritionBasis: 'per100g',
      energyValue: 330,
      energyUnit: 'kJ',
      protein: null,
      fat: null,
      carbohydrate: null,
      sodium: 65,
    })
    expect(getMissingRecognitionFields(draft).map((field) => field.key)).toEqual([
      'netContent',
      'netContentUnit',
      'protein',
    ])
  })
})
