import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiAnalysisRequestKey, buildAiAnalyzePayload } from '../lib/aiAnalysis'
import { saveAiSession, type SessionStorageLike } from '../lib/sessionState'
import { AiAnalysisSection } from './AiAnalysisSection'

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

function payload() {
  return buildAiAnalyzePayload({
    goal: 'balance',
    budgets: { calories: '', protein: '', price: '' },
    products: [],
    calculated: [],
    rankings: [],
    claimChecks: [],
    insufficient: [],
    preferred: null,
    customRequirementText: '整体看看',
    customRequirementRules: [],
    customRequirementEvaluation: {
      ruleResults: [],
      productSummaries: [],
      fullyMatchedProductIds: [],
      noProductFullyMatches: false,
      tradeoffs: [],
    },
    unresolvedPreferences: ['整体看看'],
    quickGoal: null,
  })
}

describe('AiAnalysisSection fallback display', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['partial', '部分分析格式未完整识别，以下内容已根据可用结果整理。'],
    ['raw', '分析任务已完成，以下为AI返回的原始分析结果。'],
  ] as const)('shows %s reports without exposing taskId', (reportMode, notice) => {
    const analysisPayload = payload()
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    saveAiSession({
      status: 'completed',
      requestKey: aiAnalysisRequestKey(analysisPayload),
      taskId: 'internal-task-id-must-stay-hidden',
      report: '现有包装标签信息仍可正常展示。',
      reportMode,
    })

    const html = renderToStaticMarkup(
      <AiAnalysisSection payload={analysisPayload} />,
    )

    expect(html).toContain(notice)
    expect(html).toContain('现有包装标签信息仍可正常展示')
    expect(html).not.toContain('internal-task-id-must-stay-hidden')
    expect(html).not.toContain('真实 taskId')
  })
})
