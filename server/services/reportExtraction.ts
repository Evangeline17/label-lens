import type { AgentMessage, CompactAnalyzePayload } from '../types.js'
import {
  auditReportBoundaries,
  normalizeReportBoundaries,
} from './reportBoundaryChecks.js'

export const REPORT_TITLE = '# 本次结论'
export const REQUIRED_REPORT_HEADINGS = [
  '## 为什么更匹配',
  '## 各款商品的主要取舍',
  '## 不同目标下排名为什么变化',
  '## 包装宣传提醒',
  '## 数据不足与无法判断',
  '## 最终购买建议',
] as const

const COMPLETION_MARKER = 'completion_result'
const MIN_REPORT_LENGTH = 120
const MAX_REPORT_LENGTH = 100_000
const INTERNAL_MESSAGE_KINDS = new Set([
  'reasoning',
  'analysis',
  'api_req_started',
  'api_req_failed',
  'tool',
  'tool_result',
  'tool_use',
  'system',
  'request',
  'followup',
  'resume_completed_task',
  'environment',
])

const forbiddenPatterns: Array<{ label: string; pattern: RegExp }> = [
  { label: 'environment_details', pattern: /<?environment_details>?/i },
  { label: '[ERROR]', pattern: /\[ERROR\]/i },
  {
    label: '自动完成提示',
    pattern: /The user's task is complete/i,
  },
  {
    label: '内部分析过程',
    pattern: /让我分析|现在开始输出|思考过程|内部分析过程/,
  },
  {
    label: '内部消息标签',
    pattern:
      /<(?:analysis|reasoning|request|system|tool)(?:\s[^>]*)?>|^\s*(?:analysis|reasoning|system|tool)\s*[:：]|\b(?:api_req_started|reasoning|tool_call|tool_result|tool_use|followup|resume_completed_task)\b/im,
  },
  {
    label: 'JSON 请求体',
    pattern:
      /```(?:json)?\s*[\[{]|"(?:goal|budgets|products|calculated|rankings|claimChecks|insufficient|preferred|compactPayload|payload|input)"\s*:|(?:完整\s*)?(?:request|请求)\s*(?:body|json|[:：])/i,
  },
  {
    label: 'prompt 模板',
    pattern:
      /(?:系统|任务)\s*prompt|prompt\s*template|compact\s*payload|建议输出结构|(?:必须|请)\s*(?:严格)?(?:以|包含|输出).{0,30}#\s*本次结论|以下(?:六个|标题|章节).{0,20}(?:必须|输出|包含)/i,
  },
]

export class ReportFormatError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`InfiniSynapse 最终报告格式错误：${issues.join('；')}`)
    this.name = 'ReportFormatError'
    this.issues = issues
  }
}

export function agentMessageText(message: AgentMessage): string | null {
  for (const key of ['text', 'content', 'answer', 'result', 'completion_result', 'output', 'data'] as const) {
    const value = message[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>
      for (const nestedKey of ['text', 'content', 'markdown', 'userFacingAnalysis', 'completion_result']) {
        const nestedValue = nested[nestedKey]
        if (typeof nestedValue === 'string' && nestedValue.trim()) return nestedValue.trim()
      }
    }
  }
  return null
}

export function isPartialMessage(message: AgentMessage): boolean {
  if (message.partial === true || message.partial === 1) return true
  if (typeof message.partial !== 'string') return false
  return ['true', '1'].includes(message.partial.trim().toLowerCase())
}

export function isCompletionMessage(message: AgentMessage): boolean {
  if (isPartialMessage(message)) return false
  return [message.say, message.ask, message.type].some(
    (value) => value === COMPLETION_MARKER,
  )
}

export function isUserVisibleReportCandidate(message: AgentMessage): boolean {
  if (isPartialMessage(message) || !agentMessageText(message)) return false
  const kinds = [message.say, message.ask, message.type]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase())
  return !kinds.some((kind) => INTERNAL_MESSAGE_KINDS.has(kind))
}

export function isVisibleSayTextMessage(message: AgentMessage): boolean {
  return (
    !isPartialMessage(message) &&
    message.type === 'say' &&
    message.say === 'text' &&
    Boolean(agentMessageText(message))
  )
}

function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
}

function unwrapMarkdownFence(text: string): string {
  const match = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i)
  return match ? match[1].trim() : text
}

/**
 * Official completion messages can contain a short transport wrapper before the
 * visible Markdown. Only the canonical report beginning at its required H1 is
 * eligible; content before it is never returned.
 */
function isolateCanonicalReport(text: string): string {
  const normalized = unwrapMarkdownFence(normalizeText(text))
  const titleMatch = /^# 本次结论\s*$/m.exec(normalized)
  if (!titleMatch?.index && titleMatch?.index !== 0) return normalized
  const fromTitle = normalized.slice(titleMatch.index).trim()

  const finalHeadingIndex = fromTitle.indexOf(REQUIRED_REPORT_HEADINGS.at(-1)!)
  if (finalHeadingIndex < 0) return fromTitle
  const afterFinalHeading = finalHeadingIndex + REQUIRED_REPORT_HEADINGS.at(-1)!.length
  const tail = fromTitle.slice(afterFinalHeading)
  const nextTopLevelHeading = /\n#{1,2}\s+\S/.exec(tail)
  if (!nextTopLevelHeading?.index && nextTopLevelHeading?.index !== 0) return fromTitle
  return fromTitle.slice(0, afterFinalHeading + nextTopLevelHeading.index).trim()
}

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface HeadingLine {
  start: number
  end: number
}

function headingLines(report: string, heading: string): HeadingLine[] {
  const pattern = new RegExp(`^${escapedPattern(heading)}[\\t ]*$`, 'gm')
  return [...report.matchAll(pattern)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }))
}

export function isFinalUserVisibleMessage(message: AgentMessage): boolean {
  return (
    isCompletionMessage(message) &&
    (Boolean(agentMessageText(message)) ||
      ['completion_result', 'result', 'data', 'output', 'content', 'answer'].some(
        (key) => message[key] !== undefined && message[key] !== null,
      ))
  )
}

function validateHardReport(candidate: string): string {
  const report = isolateCanonicalReport(candidate)
  const issues: string[] = []

  if (!report.startsWith(REPORT_TITLE)) {
    issues.push(`报告必须以“${REPORT_TITLE}”开头`)
  }
  if (report.length < MIN_REPORT_LENGTH) {
    issues.push(`报告正文少于 ${MIN_REPORT_LENGTH} 个字符`)
  }
  if (report.length > MAX_REPORT_LENGTH) {
    issues.push('报告长度超过 100000 个字符')
  }

  const expectedHeadings = [REPORT_TITLE, ...REQUIRED_REPORT_HEADINGS]
  const headingMatches = expectedHeadings.map((heading) => ({
    heading,
    matches: headingLines(report, heading),
  }))
  let previousIndex = -1
  for (const { heading, matches } of headingMatches) {
    const index = matches[0]?.start ?? -1
    if (index < 0) {
      issues.push(`缺少标题“${heading}”`)
    } else if (index <= previousIndex) {
      issues.push(`标题顺序错误：“${heading}”`)
    }
    previousIndex = Math.max(previousIndex, index)
    if (matches.length > 1) issues.push(`标题“${heading}”重复出现`)
  }

  const topLevelHeadings = report
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => /^#{1,2}\s+\S/.test(line))
  const unexpectedHeadings = topLevelHeadings.filter(
    (heading) => !expectedHeadings.includes(heading as (typeof expectedHeadings)[number]),
  )
  if (unexpectedHeadings.length) {
    issues.push(`包含未约定的一级或二级标题“${unexpectedHeadings[0]}”`)
  }

  headingMatches.forEach(({ heading, matches }, index) => {
    const current = matches[0]
    const next = headingMatches[index + 1]?.matches[0]
    const body = current
      ? report.slice(current.end, next?.start ?? report.length).trim()
      : ''
    if (!body) {
      issues.push(`标题“${heading}”下没有正文`)
    }
  })

  for (const forbidden of forbiddenPatterns) {
    if (forbidden.pattern.test(report)) {
      issues.push(`报告包含不允许的${forbidden.label}内容`)
    }
  }
  if (issues.length) throw new ReportFormatError([...new Set(issues)])
  return report
}

export interface ValidatedReport {
  report: string
  normalized: boolean
  normalizationWarnings: string[]
  reportMode: 'structured' | 'partial' | 'raw'
}

export function validateAndNormalizeReport(
  candidate: string,
  payload?: CompactAnalyzePayload,
): ValidatedReport {
  const hardValidated = validateHardReport(candidate)
  const normalization = normalizeReportBoundaries(hardValidated, payload)
  const finalReport = validateHardReport(normalization.report)
  const remainingBoundaryIssues = auditReportBoundaries(finalReport, payload)
  if (remainingBoundaryIssues.length) {
    throw new ReportFormatError(remainingBoundaryIssues)
  }
  return {
    report: finalReport,
    normalized: normalization.normalized,
    normalizationWarnings: normalization.normalizationWarnings,
    reportMode: 'structured',
  }
}

export function validateAndSanitizeReport(
  candidate: string,
  payload?: CompactAnalyzePayload,
): string {
  return validateAndNormalizeReport(candidate, payload).report
}

type AnalysisRequirementType = 'hard' | 'soft' | 'context' | 'unsupported'

interface FlexibleAnalysisReport {
  intentSummary: string
  interpretedRequirements: Array<{
    originalText: string
    type: AnalysisRequirementType
    evaluable: boolean
    explanation: string
  }>
  recommendation: {
    type: 'winner' | 'tradeoff' | 'insufficient'
    productId: string | null
    summary: string
  }
  evidence: Array<{
    dimension: string
    statement: string
    source: string
  }>
  limitations: string[]
  userFacingAnalysis: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function extractJsonValues(text: string): unknown[] {
  const candidates = [text.trim()]
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) candidates.push(match[1].trim())
  }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(text.slice(firstBrace, lastBrace + 1))
  }
  const values: unknown[] = []
  for (const candidate of [...new Set(candidates)]) {
    try {
      let parsed: unknown = JSON.parse(candidate)
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed)
        } catch {
          // Keep the decoded string as a raw-text candidate.
        }
      }
      values.push(parsed)
    } catch {
      // Try the next candidate or the raw-text fallback.
    }
  }
  return values
}

function structuredCandidates(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5) return []
  if (typeof value === 'string') {
    return extractJsonValues(value).flatMap((item) => structuredCandidates(item, depth + 1))
  }
  if (!isRecord(value)) return []
  const candidates = [value]
  for (const key of ['completion_result', 'result', 'data', 'output', 'content', 'answer', 'text']) {
    if (key in value) candidates.push(...structuredCandidates(value[key], depth + 1))
  }
  return candidates
}

function normalizeRequirement(value: unknown): FlexibleAnalysisReport['interpretedRequirements'][number] | null {
  if (!isRecord(value)) return null
  const typeValue = firstString(value, ['type', 'kind'])
  const type: AnalysisRequirementType = ['hard', 'soft', 'context', 'unsupported'].includes(typeValue)
    ? (typeValue as AnalysisRequirementType)
    : 'unsupported'
  const originalText = firstString(value, ['originalText', 'original_text', 'original', 'text'])
  const explanation = firstString(value, ['explanation', 'handling', 'summary'])
  if (!originalText && !explanation) return null
  return {
    originalText,
    type,
    evaluable: typeof value.evaluable === 'boolean' ? value.evaluable : type === 'hard',
    explanation,
  }
}

function normalizeEvidence(value: unknown): FlexibleAnalysisReport['evidence'][number] | null {
  if (!isRecord(value)) return null
  const statement = firstString(value, ['statement', 'summary', 'text', 'evidence'])
  if (!statement) return null
  return {
    dimension: firstString(value, ['dimension', 'metric', 'field']),
    statement,
    source: firstString(value, ['source']) || 'deterministicMetrics',
  }
}

function normalizeStructuredReport(value: Record<string, unknown>): {
  report: FlexibleAnalysisReport
  complete: boolean
} | null {
  const recommendationValue = value.recommendation ?? value.recommend
  const recommendationRecord = isRecord(recommendationValue) ? recommendationValue : {}
  const recommendationSummary =
    typeof recommendationValue === 'string'
      ? recommendationValue.trim()
      : firstString(recommendationRecord, ['summary', 'conclusion', 'text']) ||
        firstString(value, ['recommendationSummary', 'recommendation_summary', 'summary'])
  const userFacingAnalysis = firstString(value, [
    'userFacingAnalysis',
    'user_facing_analysis',
    'analysis',
    'report',
    'markdown',
  ])
  if (!recommendationSummary && !userFacingAnalysis) return null

  const recommendationTypeValue = firstString(recommendationRecord, ['type'])
  const recommendationType = ['winner', 'tradeoff', 'insufficient'].includes(
    recommendationTypeValue,
  )
    ? (recommendationTypeValue as FlexibleAnalysisReport['recommendation']['type'])
    : 'tradeoff'
  const productIdValue = recommendationRecord.productId ?? recommendationRecord.product_id
  const requirementValues = value.interpretedRequirements ?? value.interpreted_requirements
  const evidenceValues = value.evidence ?? value.evidences
  const limitationValues = value.limitations ?? value.missingDimensions
  const interpretedRequirements = Array.isArray(requirementValues)
    ? requirementValues.map(normalizeRequirement).filter((item): item is NonNullable<typeof item> => item !== null)
    : []
  const evidence = Array.isArray(evidenceValues)
    ? evidenceValues.map(normalizeEvidence).filter((item): item is NonNullable<typeof item> => item !== null)
    : []
  const limitations = Array.isArray(limitationValues)
    ? limitationValues.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())
    : []
  const complete =
    typeof value.intentSummary === 'string' &&
    Array.isArray(requirementValues) &&
    isRecord(recommendationValue) &&
    Array.isArray(evidenceValues) &&
    Array.isArray(limitationValues) &&
    Boolean(userFacingAnalysis)
  return {
    complete,
    report: {
      intentSummary: firstString(value, ['intentSummary', 'intent_summary', 'intent']),
      interpretedRequirements,
      recommendation: {
        type: recommendationType,
        productId: typeof productIdValue === 'string' && productIdValue.trim()
          ? productIdValue.trim()
          : null,
        summary: recommendationSummary,
      },
      evidence,
      limitations,
      userFacingAnalysis,
    },
  }
}

function structuredMarkdown(report: FlexibleAnalysisReport): string {
  const sections: string[] = []
  if (report.intentSummary) sections.push(`# 需求理解\n\n${report.intentSummary}`)
  if (report.recommendation.summary) {
    sections.push(`# 本次结论\n\n${report.recommendation.summary}`)
  }
  if (report.userFacingAnalysis) sections.push(`# 完整分析\n\n${report.userFacingAnalysis}`)
  if (report.interpretedRequirements.length) {
    sections.push(
      `# 要求处理\n\n${report.interpretedRequirements
        .map((item) => `- ${item.originalText || '未命名要求'}：${item.explanation || item.type}`)
        .join('\n')}`,
    )
  }
  if (report.evidence.length) {
    sections.push(
      `# 主要依据\n\n${report.evidence
        .map((item) => `- ${item.statement}`)
        .join('\n')}`,
    )
  }
  if (report.limitations.length) {
    sections.push(`# 还需注意\n\n${report.limitations.map((item) => `- ${item}`).join('\n')}`)
  }
  return sections.join('\n\n')
}

function rawTextCandidates(value: unknown, depth = 0): string[] {
  if (depth > 5) return []
  if (typeof value === 'string') {
    const normalized = unwrapMarkdownFence(normalizeText(value))
    return normalized ? [normalized] : []
  }
  if (!isRecord(value)) return []
  return ['completion_result', 'result', 'data', 'output', 'content', 'answer', 'text']
    .flatMap((key) => key in value ? rawTextCandidates(value[key], depth + 1) : [])
}

function safeRawText(value: string): string | null {
  const text = normalizeText(value).slice(0, MAX_REPORT_LENGTH)
  if (!text || /^\{\s*\}$/.test(text) || /^\[\s*\]$/.test(text)) return null
  if (forbiddenPatterns.some((forbidden) => forbidden.pattern.test(text))) return null
  if (/^(?:任务|task)\s*(?:已)?(?:完成|complete(?:d)?)\s*[。.!]?$/i.test(text)) return null
  return text
}

/** Layered parser used for completed analysis tasks. Strict Markdown remains
 * preferred, while partial JSON and safe visible text are valid fallbacks. */
export function parseFlexibleReport(
  candidate: unknown,
  payload?: CompactAnalyzePayload,
): ValidatedReport | null {
  if (typeof candidate === 'string') {
    try {
      return validateAndNormalizeReport(candidate, payload)
    } catch {
      // Continue with structured and raw-text fallbacks.
    }
  }

  for (const structuredCandidate of structuredCandidates(candidate)) {
    const normalized = normalizeStructuredReport(structuredCandidate)
    if (!normalized) continue
    const markdown = structuredMarkdown(normalized.report)
    const boundary = normalizeReportBoundaries(markdown, payload)
    return {
      report: boundary.report,
      normalized: boundary.normalized,
      normalizationWarnings: boundary.normalizationWarnings,
      reportMode: normalized.complete ? 'structured' : 'partial',
    }
  }

  for (const rawCandidate of rawTextCandidates(candidate)) {
    const safe = safeRawText(rawCandidate)
    if (!safe) continue
    const boundary = normalizeReportBoundaries(safe, payload)
    if (!boundary.report.trim()) continue
    return {
      report: boundary.report,
      normalized: boundary.normalized,
      normalizationWarnings: boundary.normalizationWarnings,
      reportMode: 'raw',
    }
  }
  return null
}
