import { describe, expect, it } from 'vitest'
import { mockProducts } from '../data/mockProducts'
import { calculateAll } from './calculations'
import { checkAllClaims } from './claimChecks'
import { evaluateCustomRequirements } from './customRequirements'
import { buildAiAnalyzePayload } from './aiAnalysis'
import { getRankingGroups } from './ranking'

describe('buildAiAnalyzePayload', () => {
  it('never includes local photo previews', () => {
    const products = mockProducts.slice(0, 2).map((product, index) => ({
      ...product,
      ingredientPhoto: {
        name: `ingredient-${index}.png`,
        dataUrl: 'data:image/png;base64,AAAA',
        file: new File(['a'], `ingredient-${index}.png`, { type: 'image/png' }),
        size: 1,
      },
      nutritionPhoto: {
        name: `nutrition-${index}.png`,
        dataUrl: 'data:image/png;base64,BBBB',
        file: new File(['b'], `nutrition-${index}.png`, { type: 'image/png' }),
        size: 1,
      },
    }))
    const budgets = { calories: '150', protein: '15', price: '10' }
    const calculated = calculateAll(products, budgets)
    const rankings = getRankingGroups(calculated, budgets)
    const claimChecks = checkAllClaims(products, calculated)
    const payload = buildAiAnalyzePayload({
      goal: 'proteinDensity',
      budgets,
      products,
      calculated,
      rankings,
      claimChecks,
      insufficient: [],
      preferred: products[0],
      customRequirementText: '',
      customRequirementRules: [],
      customRequirementEvaluation: evaluateCustomRequirements(
        [],
        products,
        calculated,
        budgets,
      ),
      unresolvedPreferences: [],
    })
    const serialized = JSON.stringify(payload)

    expect(serialized).not.toContain('ingredientPhoto')
    expect(serialized).not.toContain('nutritionPhoto')
    expect(serialized).not.toContain('data:image')
    expect(payload.products[0].ingredients).toBe(products[0].ingredients)
  })
})
