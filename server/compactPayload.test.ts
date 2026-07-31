import { describe, expect, it } from 'vitest'
import { buildCompactAnalyzePayload } from './compactPayload'
import type { AnalyzeInput } from './types'
import { validAnalyzeInput } from './validation.test'

describe('buildCompactAnalyzePayload', () => {
  it('removes formulas, UUID-like ids, photos, duplicates, and empty fields', () => {
    const input = validAnalyzeInput() as AnalyzeInput & {
      products: Array<AnalyzeInput['products'][number] & { ingredientPhoto?: unknown }>
    }
    input.products[0].id = '26b618a0-9299-4dc7-b689-cdc35eea8a63'
    input.calculated[0].id = input.products[0].id
    input.rankings[0].items[0].productId = input.products[0].id
    input.claimChecks[0].productId = input.products[0].id
    input.preferred = { id: input.products[0].id, name: input.products[0].name }
    input.products[0].ingredientPhoto = {
      name: 'label.png',
      dataUrl: 'data:image/png;base64,AAAA',
    }
    input.products[1].claims = ''
    input.products[1].servingSize = ''

    const { payload, stats } = buildCompactAnalyzePayload(input)
    const serialized = JSON.stringify(payload)

    expect(serialized).not.toContain('formulas')
    expect(serialized).not.toContain('26b618a0-9299-4dc7-b689-cdc35eea8a63')
    expect(serialized).not.toContain('ingredientPhoto')
    expect(serialized).not.toContain('data:image')
    expect(serialized).not.toContain('servingSize')
    expect(serialized).not.toContain('"productId"')
    expect(serialized).not.toContain('"value"')
    expect(payload.products.map((product) => product.product)).toEqual(['A', 'B'])
    expect(payload.products[0].priceCny).toBe('8.90')
    expect(payload.products[0].per100?.caloriesKcal).toBe('78.9')
    expect(payload.rankings[0].order[0]).toEqual({
      name: 'A',
      displayValue: '11.41g/100 kcal',
    })
    expect(stats.compactCharacters).toBeLessThan(stats.originalCharacters * 0.75)
    expect(stats.reductionPercent).toBeGreaterThan(25)
    expect(stats.estimatedTokens).toBe(Math.ceil(stats.compactCharacters / 2))
  })

  it('includes confirmed custom constraints, product matches, and unresolved preferences', () => {
    const input = validAnalyzeInput()
    const rule = {
      id: 'custom-priceMax-0',
      kind: 'priceMax' as const,
      original: '价格不超过7元',
      label: '价格上限',
      value: 7,
      unit: '元/包',
      basis: '使用用户录入的每包价格',
    }
    input.customRequirementText = '价格不超过7元，最好口感清爽'
    input.customRequirementRules = [rule]
    input.unresolvedPreferences = ['最好口感清爽']
    input.customRequirementEvaluation = {
      ruleResults: [
        {
          rule,
          products: input.products.map((product, index) => ({
            productId: product.id,
            productName: product.name,
            status: index === 0 ? ('不满足' as const) : ('满足' as const),
            evidence: index === 0 ? '实际 8.90 元' : '实际 5.50 元',
          })),
        },
      ],
      productSummaries: input.products.map((product, index) => ({
        productId: product.id,
        productName: product.name,
        status: index === 0 ? ('不满足' as const) : ('满足' as const),
        satisfiedCount: index === 0 ? 0 : 1,
        failedCount: index === 0 ? 1 : 0,
        unknownCount: 0,
      })),
      fullyMatchedProductIds: [input.products[1].id],
      noProductFullyMatches: false,
      tradeoffs: [],
    }

    const payload = buildCompactAnalyzePayload(input).payload
    const serialized = JSON.stringify(payload.customRequirements)

    expect(payload.customRequirements?.original).toBe(input.customRequirementText)
    expect(payload.customRequirements?.constraints[0]).toMatchObject({
      kind: 'priceMax',
      value: '7.00 元/包',
    })
    expect(payload.customRequirements?.matches[0].products.map((item) => item.product)).toEqual([
      'A',
      'B',
    ])
    expect(payload.customRequirements?.unresolvedPreferences).toEqual(['最好口感清爽'])
    expect(serialized).not.toContain('product-1')
    expect(serialized).not.toContain('"id"')
  })
})
