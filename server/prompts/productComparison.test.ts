import { describe, expect, it } from 'vitest'
import { buildCompactAnalyzePayload } from '../compactPayload'
import { validAnalyzeInput } from '../validation.test'
import { buildProductComparisonPrompt } from './productComparison'

describe('buildProductComparisonPrompt', () => {
  it('keeps strict budget, ingredient-order, and derived-claim boundaries explicit', () => {
    const prompt = buildProductComparisonPrompt(
      buildCompactAnalyzePayload(validAnalyzeInput()).payload,
    )

    expect(prompt).toContain('不得仅凭配料先后判断')
    expect(prompt).toContain('只能引用客户端已经提供的预算、整包热量和差额')
    expect(prompt).toContain('可食用克数（或 mL）和包装比例')
    expect(prompt).toContain('“几倍”“高出近一半”')
    expect(prompt).toContain('若数据中没有显式差额，不得自行计算')
    expect(prompt).toContain('不得重新计算、改写满足状态')
    expect(prompt).toContain('没有商品满足全部要求')
    expect(prompt).toContain('“想健康一点”“吃得好一点”“更有营养”“整体看看”')
    expect(prompt).toContain('仍应继续完成普通食品标签比较')
    expect(prompt).toContain('不得发明包装信息或补全空值')
    expect(prompt).toContain('不提供疾病诊断、医疗建议、治疗方案或每日营养目标')
    expect(prompt).toContain('只能引用 compact payload 中明确提供')
    expect(prompt).toContain('不得自行增加“几倍”“高出近一半”等倍数、百分比')
    expect(prompt).toContain('录入文字中未出现白砂糖')
    expect(prompt).toContain('“远超”“远低”“远未达到”')
    expect(prompt).toContain('不得写“所有维度最后”')
    expect(prompt).toContain('包装总热量较高不等于蛋白质效率较低')
    expect(prompt).toContain('rawPreference 是一级输入')
    expect(prompt).toContain('confirmedProducts 和 deterministicMetrics')
    expect(prompt).toContain('rawPreference 中存在明确且较新的可计算要求时')
    expect(prompt).toContain('你提到的身体状况不会作为医疗推荐依据')
    expect(prompt).toContain('"userFacingAnalysis"')
  })
})
