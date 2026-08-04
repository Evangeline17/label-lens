import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockProducts } from '../data/mockProducts'
import { calculateAll } from './calculations'
import { checkAllClaims } from './claimChecks'
import { evaluateCustomRequirements } from './customRequirements'
import {
  aiAnalysisRequestKey,
  buildAiAnalyzePayload,
  startAiAnalysis,
} from './aiAnalysis'
import { getRankingGroups } from './ranking'

function emptyParts() {
  return {
    goal: 'balance',
    budgets: { calories: '', protein: '', price: '' },
    products: [],
    calculated: [],
    rankings: [],
    claimChecks: [],
    insufficient: [],
    preferred: null,
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
  } satisfies Parameters<typeof buildAiAnalyzePayload>[0]
}

function emptyPayload() {
  return buildAiAnalyzePayload(emptyParts())
}

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

  it('keeps free-form preference verbatim alongside an optional quick goal', () => {
    const payload = buildAiAnalyzePayload({
      ...emptyParts(),
      products: mockProducts.slice(0, 2),
      calculated: calculateAll(mockProducts.slice(0, 2), {
        calories: '150',
        protein: '15',
        price: '10',
      }),
      customRequirementText: '想健康一点，我最近感冒了；价格不超过10元',
      quickGoal: 'protein',
    })

    expect(payload.rawPreference).toBe('想健康一点，我最近感冒了；价格不超过10元')
    expect(payload.quickGoal).toBe('protein')
    expect(payload.confirmedProducts).toHaveLength(2)
    expect(payload.deterministicMetrics).toHaveLength(2)
    expect(payload.safetyBoundary).toContain('不得提供医疗诊断')
    expect(payload.requestFingerprint).toBe(aiAnalysisRequestKey(payload))
  })

  it('builds a complete analysis context from raw preference without a quick goal', () => {
    const payload = buildAiAnalyzePayload({
      ...emptyParts(),
      customRequirementText: '想健康一点，整体看看',
      quickGoal: null,
      availableDimensions: ['能量', '蛋白质'],
      missingDimensions: ['价格未录入'],
    })

    expect(payload.rawPreference).toBe('想健康一点，整体看看')
    expect(payload.quickGoal).toBeNull()
    expect(payload.availableDimensions).toEqual(['能量', '蛋白质'])
    expect(payload.missingDimensions).toEqual(['价格未录入'])
    expect(payload.localComparison).toBeDefined()
  })
})

describe('startAiAnalysis', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deduplicates simultaneous analysis task creation', async () => {
    let resolveResponse!: (response: Response) => void
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => pendingResponse)
    vi.stubGlobal('fetch', fetchMock)

    const payload = buildAiAnalyzePayload({
      ...emptyParts(),
      customRequirementText: '想健康一点，我最近感冒了',
      quickGoal: null,
    })

    const first = startAiAnalysis(payload)
    const second = startAiAnalysis(payload)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Parameters<typeof startAiAnalysis>[0]
    expect(requestBody.rawPreference).toBe('想健康一点，我最近感冒了')
    expect(requestBody.quickGoal).toBeNull()
    expect(requestBody.confirmedProducts).toEqual(payload.confirmedProducts)
    expect(requestBody.requestFingerprint).toBe(payload.requestFingerprint)

    resolveResponse(
      new Response(JSON.stringify({ status: 'processing', taskId: 'task-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'processing', taskId: 'task-1' },
      { status: 'processing', taskId: 'task-1' },
    ])
  })
})

describe('aiAnalysisRequestKey', () => {
  it('changes when the selected goal changes', () => {
    const base = emptyPayload()

    expect(aiAnalysisRequestKey(base)).not.toBe(
      aiAnalysisRequestKey({ ...base, goal: 'calories' }),
    )
  })
})
