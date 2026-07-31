import { describe, expect, it } from 'vitest'
import { buildCompactAnalyzePayload } from '../compactPayload'
import type { CompactAnalyzePayload } from '../types'
import { validAnalyzeInput } from '../validation.test'
import { auditReportBoundaries } from './reportBoundaryChecks'

function payloadWithWhiteSugarConcern(): CompactAnalyzePayload {
  const payload = buildCompactAnalyzePayload(validAnalyzeInput()).payload
  return {
    ...payload,
    customRequirements: {
      original: '不含白砂糖，蛋白质至少15克',
      constraints: [
        {
          kind: 'excludeIngredientTerm',
          label: '配料表未出现“白砂糖”',
          term: '白砂糖',
          basis: '仅检查用户录入的配料表文字是否出现该词',
        },
        {
          kind: 'packageProteinMin',
          label: '整包蛋白质下限',
          value: '15 克/包',
          basis: '使用每包装总蛋白质',
        },
      ],
      matches: [
        {
          requirement: '整包蛋白质下限',
          products: [
            {
              product: 'A',
              name: 'A',
              status: '满足',
              evidence: '实际 18 克/包；要求至少 15 克/包；达到要求并高出 3 克/包',
            },
          ],
        },
      ],
      productSummaries: [],
      unresolvedPreferences: [],
      noProductFullyMatches: false,
      tradeoffs: [],
    },
  }
}

describe('auditReportBoundaries', () => {
  it('rejects derived multipliers that are absent from the compact payload', () => {
    const issues = auditReportBoundaries(
      'A 的蛋白质是 B 的 1.5倍，另一项达到3倍以上。',
      payloadWithWhiteSugarConcern(),
    )

    expect(issues.join('；')).toContain('派生比较')
  })

  it('keeps a custom concern term exact instead of expanding its meaning', () => {
    const payload = payloadWithWhiteSugarConcern()

    expect(
      auditReportBoundaries('A 的录入文字中未出现白砂糖。', payload),
    ).toEqual([])
    expect(
      auditReportBoundaries('A 未出现蔗糖类原料，也可视为不含添加糖。', payload).join(
        '；',
      ),
    ).toContain('扩大')
  })

  it('rejects nutrient-contribution inference from ingredient order', () => {
    const issues = auditReportBoundaries(
      '乳清蛋白粉排在配料表第二位，因此贡献了更高的蛋白质。',
      payloadWithWhiteSugarConcern(),
    )

    expect(issues.join('；')).toContain('配料顺序')
  })

  it('rejects an all-dimensions-last claim for a product with a first-place metric', () => {
    const issues = auditReportBoundaries(
      'A 在所有维度均排末位。',
      payloadWithWhiteSugarConcern(),
    )

    expect(issues.join('；')).toContain('存在第一名指标')
  })

  it('accepts an explicit client-provided difference and rejects exaggerated wording', () => {
    const payload = payloadWithWhiteSugarConcern()

    expect(
      auditReportBoundaries('A 达到要求并高出 3 克/包。', payload),
    ).toEqual([])
    expect(
      auditReportBoundaries('A 的18克蛋白质远超15克目标。', payload).join('；'),
    ).toContain('远超')
  })

  it('does not conflate package calories with first-place protein density', () => {
    const issues = auditReportBoundaries(
      'A 的蛋白质优势需要更多热量作为代价。',
      payloadWithWhiteSugarConcern(),
    )

    expect(issues.join('；')).toContain('蛋白质密度第一')
  })
})
