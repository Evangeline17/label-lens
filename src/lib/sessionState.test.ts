import { describe, expect, it } from 'vitest'
import { mockProducts } from '../data/mockProducts'
import { calculateAll } from './calculations'
import { checkAllClaims } from './claimChecks'
import {
  evaluateCustomRequirements,
  parseCustomRequirements,
} from './customRequirements'
import { getRankingGroups } from './ranking'
import {
  clearLabelLensSession,
  LABEL_LENS_SESSION_KEY,
  loadAiSession,
  loadLabelLensSession,
  saveAiSession,
  saveAppSession,
  storedAiNeedsStatusQuery,
  type SessionStorageLike,
} from './sessionState'

class MemoryStorage implements SessionStorageLike {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('LabelLens session state', () => {
  it('stores the full comparison and completed report without photos or secrets', () => {
    const storage = new MemoryStorage()
    const products = mockProducts.map((product, index) => ({
      ...product,
      ingredientPhoto: {
        name: `ingredient-${index}.png`,
        dataUrl: 'data:image/png;base64,INGREDIENT',
        file: new File(['ingredient'], `ingredient-${index}.png`, {
          type: 'image/png',
        }),
        size: 10,
      },
      nutritionPhoto: {
        name: `nutrition-${index}.png`,
        dataUrl: 'data:image/png;base64,NUTRITION',
        file: new File(['nutrition'], `nutrition-${index}.png`, {
          type: 'image/png',
        }),
        size: 8,
      },
    }))
    const budgets = { calories: '150', protein: '15', price: '10' }
    const calculated = calculateAll(products, budgets)
    const rankings = getRankingGroups(calculated, budgets)
    const claimChecks = checkAllClaims(products, calculated)
    const customRequirementText =
      '价格不超过10元，整包热量不超过150千卡，最好口感清爽'
    const parsedRequirements = parseCustomRequirements(customRequirementText)
    const customRequirementEvaluation = evaluateCustomRequirements(
      parsedRequirements.rules,
      products,
      calculated,
      budgets,
    )

    saveAppSession(
      {
        step: 4,
        goal: 'proteinDensity',
        budgets,
        concernWords: '白砂糖',
        customRequirementText,
        customRequirementRules: parsedRequirements.rules,
        unresolvedPreferences: parsedRequirements.unresolvedPreferences,
        customRequirementEvaluation,
        products,
        calculated,
        rankings,
        claimChecks,
        preferred: { id: products[0].id, name: products[0].name },
        recognitionBetaEnabled: false,
        recognitionSessions: {
          [products[0].id]: {
            status: 'completed',
            result: {
              productName: 'OCR商品',
              ingredientsText: '生牛乳',
              netContent: null,
              netContentUnit: null,
              nutritionBasis: 'unknown',
              servingSize: null,
              energyValue: null,
              energyUnit: null,
              protein: null,
              fat: null,
              carbohydrate: null,
              sodium: null,
            },
            rawText: { ingredients: '配料表：生牛乳', nutrition: null },
            fieldSources: {},
            warnings: [],
            imageKinds: ['ingredients'],
          },
        },
      },
      storage,
    )
    saveAiSession(
      {
        status: 'completed',
        taskId: '5f645da0-63b5-487e-9cc8-745b1d608000',
        report: '# 本次结论\n\n已完成。',
        normalized: true,
        normalizationWarnings: ['已中和夸张措辞'],
      },
      storage,
    )

    const serialized = storage.getItem(LABEL_LENS_SESSION_KEY) ?? ''
    const restored = loadLabelLensSession(storage)
    expect(restored?.app?.step).toBe(4)
    expect(restored?.app?.goal).toBe('proteinDensity')
    expect(restored?.app?.products).toHaveLength(3)
    expect(restored?.app?.calculated).toEqual(calculated)
    expect(restored?.app?.rankings).toEqual(rankings)
    expect(restored?.app?.claimChecks).toEqual(claimChecks)
    expect(restored?.app?.customRequirementText).toBe(customRequirementText)
    expect(restored?.app?.customRequirementRules).toEqual(parsedRequirements.rules)
    expect(restored?.app?.customRequirementEvaluation).toEqual(
      customRequirementEvaluation,
    )
    expect(restored?.app?.recognitionBetaEnabled).toBe(false)
    expect(restored?.app?.recognitionSessions?.[products[0].id]).toMatchObject({
      status: 'completed',
      rawText: { ingredients: '配料表：生牛乳', nutrition: null },
    })
    expect(restored?.app?.products[0].name).toBe(products[0].name)
    expect(loadAiSession(storage)).toMatchObject({
      status: 'completed',
      taskId: '5f645da0-63b5-487e-9cc8-745b1d608000',
      report: '# 本次结论\n\n已完成。',
      normalized: true,
      normalizationWarnings: ['已中和夸张措辞'],
    })
    expect(storedAiNeedsStatusQuery(loadAiSession(storage))).toBe(false)
    expect(serialized).not.toContain('ingredientPhoto')
    expect(serialized).not.toContain('nutritionPhoto')
    expect(serialized).not.toContain('data:image')
    expect(serialized).not.toContain('6f645da0-63b5-487e-9cc8-745b1d608001')
    expect(serialized).not.toContain('INFINISYNAPSE_API_KEY')
  })

  it('clears the comparison session only through the explicit reset helper', () => {
    const storage = new MemoryStorage()
    saveAiSession(
      {
        status: 'processing',
        taskId: '5f645da0-63b5-487e-9cc8-745b1d608000',
      },
      storage,
    )

    expect(loadLabelLensSession(storage)).not.toBeNull()
    expect(storedAiNeedsStatusQuery(loadAiSession(storage))).toBe(true)
    clearLabelLensSession(storage)
    expect(loadLabelLensSession(storage)).toBeNull()
  })

  it('keeps a completed format error terminal instead of polling after refresh', () => {
    const storage = new MemoryStorage()
    saveAiSession(
      {
        status: 'format_error',
        taskId: '5a7971a0-16b2-4ef2-ba2a-8236d5907524',
        error: '任务已完成，但最终报告格式未通过校验。',
      },
      storage,
    )

    const restored = loadAiSession(storage)
    expect(restored?.status).toBe('format_error')
    expect(storedAiNeedsStatusQuery(restored)).toBe(false)
  })
})
