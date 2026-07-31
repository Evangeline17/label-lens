import { describe, expect, it } from 'vitest'
import { mockProducts } from '../data/mockProducts'
import { calculateAll } from './calculations'
import {
  evaluateCustomRequirements,
  parseCustomRequirements,
} from './customRequirements'

const budgets = { calories: '150', protein: '15', price: '10' }
const calculated = calculateAll(mockProducts, budgets)

describe('custom requirement rules', () => {
  it('recognizes price, calorie, protein, sodium, ingredient, and package constraints', () => {
    const parsed = parseCustomRequirements(
      '价格不超过10元，整包热量不超过150千卡，每100g热量不超过80千卡，蛋白质至少15克，每100g蛋白质至少5克，钠不超过150毫克，不含白砂糖和蔗糖，配料数量不超过4项，一整包接近热量预算',
    )

    expect(parsed.rules.map((rule) => rule.kind)).toEqual([
      'priceMax',
      'packageCaloriesMax',
      'per100gCaloriesMax',
      'packageProteinMin',
      'per100gProteinMin',
      'packageSodiumMax',
      'excludeIngredientTerm',
      'excludeIngredientTerm',
      'ingredientCountMax',
      'packageNearCalorieBudget',
    ])
    expect(parsed.rules.find((rule) => rule.kind === 'priceMax')?.value).toBe(10)
    expect(parsed.rules.find((rule) => rule.kind === 'packageCaloriesMax')?.value).toBe(
      150,
    )
    expect(parsed.rules.find((rule) => rule.kind === 'packageProteinMin')?.value).toBe(
      15,
    )
  })

  it('keeps unrecognized natural language as AI preferences without inventing metrics', () => {
    const parsed = parseCustomRequirements(
      '最好口感清爽，吃完更有饱腹感，适合减肥，不想买白砂糖排在配料前面的产品',
    )

    expect(parsed.rules).toEqual([])
    expect(parsed.unresolvedPreferences).toEqual([
      '最好口感清爽',
      '吃完更有饱腹感',
      '适合减肥',
      '不想买白砂糖排在配料前面的产品',
    ])
  })

  it('generates per-product evidence for multiple deterministic constraints', () => {
    const rules = parseCustomRequirements(
      '价格不超过7元，整包热量不超过150千卡，蛋白质至少10克',
    ).rules
    const evaluation = evaluateCustomRequirements(
      rules,
      mockProducts,
      calculated,
      budgets,
    )

    expect(evaluation.ruleResults).toHaveLength(3)
    expect(evaluation.ruleResults.every((result) => result.products.length === 3)).toBe(
      true,
    )
    expect(
      evaluation.ruleResults.flatMap((result) =>
        result.products.map((product) => product.evidence),
      ),
    ).toEqual(expect.arrayContaining([expect.stringContaining('实际')]))
  })

  it('reports tradeoffs instead of declaring a full match when none satisfies all rules', () => {
    const rules = parseCustomRequirements('价格不超过7元，蛋白质至少15克').rules
    const evaluation = evaluateCustomRequirements(
      rules,
      mockProducts,
      calculated,
      budgets,
    )

    expect(evaluation.fullyMatchedProductIds).toEqual([])
    expect(evaluation.noProductFullyMatches).toBe(true)
    expect(evaluation.tradeoffs).toHaveLength(3)
    expect(evaluation.productSummaries.every((summary) => summary.status !== '满足')).toBe(
      true,
    )
  })

  it('provides the exact protein-target difference without exaggerated wording', () => {
    const rule = parseCustomRequirements('蛋白质至少15克').rules
    const evaluation = evaluateCustomRequirements(
      rule,
      mockProducts,
      calculated,
      budgets,
    )
    const productA = evaluation.ruleResults[0].products[0]

    expect(productA.evidence).toContain('实际 18 克/包')
    expect(productA.evidence).toContain('达到要求并高出 3 克/包')
    expect(productA.evidence).not.toContain('远超')
  })
})
