import { describe, expect, it } from 'vitest'
import { buildCompactAnalyzePayload } from '../compactPayload'
import { validAnalyzeInput } from '../validation.test'
import {
  agentMessageText,
  isCompletionMessage,
  parseFlexibleReport,
  ReportFormatError,
  REQUIRED_REPORT_HEADINGS,
  validateAndNormalizeReport,
  validateAndSanitizeReport,
} from './reportExtraction'

const validReport = `# 本次结论
A 更匹配。

## 为什么更匹配
客户端排名显示 A 更符合当前目标。

## 各款商品的主要取舍
A 与 B 各有不同取舍。

## 不同目标下排名为什么变化
不同排名使用不同的客户端指标。

## 包装宣传提醒
宣传语应与包装标签一起理解。

## 数据不足与无法判断
客户端未标记不足项。

## 最终购买建议
可按本次目标参考 A。`

describe('validateAndSanitizeReport', () => {
  it('recognizes non-partial completion text in content-shaped UI messages', () => {
    const message = {
      type: 'say',
      say: 'completion_result',
      partial: 'false',
      content: { markdown: validReport },
    }

    expect(isCompletionMessage(message)).toBe(true)
    expect(agentMessageText(message)).toBe(validReport)
  })

  it('does not treat string or numeric partial completion snapshots as final', () => {
    expect(isCompletionMessage({ say: 'completion_result', partial: 'true' })).toBe(false)
    expect(isCompletionMessage({ ask: 'completion_result', partial: 1 })).toBe(false)
  })

  it('removes an official completion wrapper before the canonical Markdown', () => {
    const cleaned = validateAndSanitizeReport(`任务已完成，用户可见正文如下：\n${validReport}`)

    expect(cleaned).toBe(validReport)
  })

  it('rejects a report missing any required heading', () => {
    const missing = validReport.replace(
      `${REQUIRED_REPORT_HEADINGS[3]}\n宣传语应与包装标签一起理解。\n\n`,
      '',
    )

    expect(() => validateAndSanitizeReport(missing)).toThrowError(ReportFormatError)
    expect(() => validateAndSanitizeReport(missing)).toThrowError(/包装宣传提醒/)
  })

  it('rejects a prompt echo even when its request JSON lists every required heading', () => {
    const promptEcho = `SYSTEM PROMPT ECHO
请严格输出以下结构：
# 本次结论
## 为什么更匹配
## 各款商品的主要取舍
## 不同目标下排名为什么变化
## 包装宣传提醒
## 数据不足与无法判断
## 最终购买建议
compact payload: {"goal":"proteinDensity","products":[],"rankings":[]}`

    const validate = () => validateAndSanitizeReport(promptEcho)

    expect(validate).toThrowError(ReportFormatError)
    expect(validate).toThrowError(/标题“# 本次结论”下没有正文/)
    expect(validate).toThrowError(/JSON 请求体|prompt 模板/)
  })

  it('only accepts required headings that occur on real Markdown lines', () => {
    const inlineTemplate = validReport.replace(
      '## 为什么更匹配',
      '模板字段：## 为什么更匹配',
    )

    expect(() => validateAndSanitizeReport(inlineTemplate)).toThrowError(
      /缺少标题“## 为什么更匹配”/,
    )
  })

  it.each([
    ['environment_details', '<environment_details>cwd=/workspace</environment_details>'],
    ['request JSON', '{"goal":"proteinDensity","products":[]}'],
    ['tool error', '[ERROR] write_to_file failed'],
    ['automatic completion', "The user's task is complete"],
    ['internal reasoning', '让我分析一下再给出答案'],
  ])('rejects forbidden %s content', (_label, forbidden) => {
    expect(() => validateAndSanitizeReport(`${validReport}\n${forbidden}`)).toThrowError(
      ReportFormatError,
    )
  })

  it('removes an unsupported multiplier sentence while keeping the remaining section', () => {
    const payload = buildCompactAnalyzePayload(validAnalyzeInput()).payload
    const overreaching = validReport.replace(
      '客户端排名显示 A 更符合当前目标。',
      '客户端排名显示 A 更符合当前目标。A 的优势达到 B 的 1.5倍。',
    )

    const result = validateAndNormalizeReport(overreaching, payload)

    expect(result.normalized).toBe(true)
    expect(result.report).toContain('客户端排名显示 A 更符合当前目标。')
    expect(result.report).not.toContain('1.5倍')
    expect(result.normalizationWarnings).toContain('已移除客户端未提供的派生比较')
    for (const heading of REQUIRED_REPORT_HEADINGS) {
      expect(result.report).toContain(`${heading}\n`)
    }
  })

  it('neutralizes exaggerated wording without rejecting an otherwise valid report', () => {
    const exaggerated = validReport.replace(
      '客户端排名显示 A 更符合当前目标。',
      'A 的整包蛋白质达到18克，高于目标3克，因此远超15克目标。',
    )

    const result = validateAndNormalizeReport(exaggerated)

    expect(result.report).toContain('因此高于15克目标')
    expect(result.report).not.toContain('远超')
    expect(result.normalized).toBe(true)
    expect(result.normalizationWarnings).toContain('已中和夸张措辞')
  })
})

describe('parseFlexibleReport', () => {
  const structured = {
    intentSummary: '希望在现有标签信息中做综合选择。',
    interpretedRequirements: [
      {
        originalText: '想健康一点',
        type: 'soft',
        evaluable: false,
        explanation: '按综合差异解释现有标签。',
      },
    ],
    recommendation: {
      type: 'tradeoff',
      productId: null,
      summary: '两款各有取舍。',
    },
    evidence: [
      {
        dimension: 'protein',
        statement: 'A的蛋白质标签值更高。',
        source: 'deterministicMetrics',
      },
    ],
    limitations: ['价格未录入，因此不比较性价比。'],
    userFacingAnalysis: '本次只比较包装标签中已经确认的信息。',
  }

  it('parses a standard JSON report', () => {
    const result = parseFlexibleReport(structured)

    expect(result?.reportMode).toBe('structured')
    expect(result?.report).toContain('两款各有取舍')
    expect(result?.report).toContain('A的蛋白质标签值更高')
  })

  it('parses JSON inside a Markdown code block', () => {
    const result = parseFlexibleReport(`说明文字\n\`\`\`json\n${JSON.stringify(structured)}\n\`\`\``)

    expect(result?.reportMode).toBe('structured')
    expect(result?.report).toContain('本次只比较包装标签')
  })

  it('parses a JSON string nested in completion_result', () => {
    const result = parseFlexibleReport({
      completion_result: JSON.stringify(structured),
    })

    expect(result?.reportMode).toBe('structured')
    expect(result?.report).toContain('希望在现有标签信息中做综合选择')
  })

  it('accepts partial structured output when non-core fields are missing', () => {
    const result = parseFlexibleReport({
      recommendation: { summary: '现有信息下A更匹配。' },
    })

    expect(result?.reportMode).toBe('partial')
    expect(result?.report).toContain('现有信息下A更匹配')
  })

  it('falls back to safe raw analysis text when JSON cannot be parsed', () => {
    const result = parseFlexibleReport(
      '综合现有包装标签，A的蛋白质标签值更高；价格缺失，所以本次不比较性价比。',
    )

    expect(result?.reportMode).toBe('raw')
    expect(result?.report).toContain('价格缺失')
  })

  it('returns null only when no usable text exists', () => {
    expect(parseFlexibleReport({ completion_result: '' })).toBeNull()
    expect(parseFlexibleReport('任务已完成')).toBeNull()
  })
})
