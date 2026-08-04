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
  type LabelLensSession,
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
        quickGoal: 'overall',
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
        recognitionSessions: {
          [products[0].id]: {
            status: 'processing',
            taskId: '6f645da0-63b5-487e-9cc8-745b1d608001',
            connId: '6f645da0-63b5-487e-9cc8-745b1d608099',
            progress: 'InfiniSynapse 正在识别标签',
            imageKinds: ['ingredients'],
          },
          [products[1].id]: {
            status: 'completed',
            taskId: '7f645da0-63b5-487e-9cc8-745b1d608002',
            result: {
              productName: '已识别商品',
              ingredientsText: '生牛乳、乳酸菌',
              netContent: 200,
              netContentUnit: 'g',
              nutritionBasis: 'per100g',
              energyValue: 330,
              energyUnit: 'kJ',
              protein: 9,
              fat: 3,
              carbohydrate: 5.5,
              sodium: 65,
            },
            error: '不应保存的旧错误',
            confirmedAt: '2026-08-01T00:00:00.000Z',
            imageKinds: ['ingredients', 'nutrition'],
          },
        },
        recognitionQueue: {
          current: {
            productId: products[0].id,
            taskId: '6f645da0-63b5-487e-9cc8-745b1d608001',
            connId: '6f645da0-63b5-487e-9cc8-745b1d608099',
          },
          pendingProductIds: [products[2].id],
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
    const storedSnapshot = JSON.parse(serialized) as LabelLensSession
    const restored = loadLabelLensSession(storage)
    expect(restored?.app?.step).toBe(4)
    expect(restored?.app?.quickGoal).toBe('overall')
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
    expect(restored?.app?.recognitionSessions?.[products[0].id]).toMatchObject({
      status: 'processing',
      stale: false,
      taskId: '6f645da0-63b5-487e-9cc8-745b1d608001',
      connId: '6f645da0-63b5-487e-9cc8-745b1d608099',
    })
    expect(restored?.app?.recognitionSessions?.[products[1].id]).toMatchObject({
      status: 'completed',
      stale: true,
      taskId: '7f645da0-63b5-487e-9cc8-745b1d608002',
      result: { productName: '已识别商品', energyUnit: 'kJ' },
    })
    expect(storedSnapshot.app?.recognitionSessions?.[products[0].id]).toEqual({
      status: 'processing',
      stale: false,
      taskId: '6f645da0-63b5-487e-9cc8-745b1d608001',
      connId: '6f645da0-63b5-487e-9cc8-745b1d608099',
    })
    expect(restored?.app?.recognitionQueue).toEqual({
      current: {
        productId: products[0].id,
        taskId: '6f645da0-63b5-487e-9cc8-745b1d608001',
        connId: '6f645da0-63b5-487e-9cc8-745b1d608099',
      },
      pendingProductIds: [products[2].id],
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
    expect(serialized).toContain('6f645da0-63b5-487e-9cc8-745b1d608001')
    expect(serialized).not.toContain('InfiniSynapse 正在识别标签')
    expect(serialized).not.toContain('不应保存的旧错误')
    expect(serialized).not.toContain('confirmedAt')
    expect(serialized).not.toContain('imageKinds')
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
