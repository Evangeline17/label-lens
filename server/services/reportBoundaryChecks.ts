import type { CompactAnalyzePayload } from '../types.js'

const EXAGGERATED_WORDS = ['远超', '远低', '远未达到', '断层领先', '碾压'] as const

export interface ReportNormalizationResult {
  report: string
  normalized: boolean
  normalizationWarnings: string[]
}

function payloadText(payload?: CompactAnalyzePayload): string {
  return payload ? JSON.stringify(payload) : ''
}

function reportSentences(report: string): string[] {
  return report
    .split(/[。！？\n]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
}

function hasIngredientOrderInference(report: string): boolean {
  return reportSentences(report).some((sentence) => {
    const mentionsOrder =
      /(?:配料|原料).{0,18}(?:排在|排第|位于|顺序|前\d|前三)|(?:排在|排第|位于).{0,12}(?:配料|原料)/.test(
        sentence,
      )
    const infersContribution =
      /(?:因此|所以|说明|表明|导致|带来|贡献|来源|归因|使得|造就|换来).{0,30}(?:蛋白质|脂肪|碳水|糖|热量)|(?:蛋白质|脂肪|碳水|糖|热量).{0,30}(?:贡献|来源|归因|因此|所以|导致|带来)/.test(
        sentence,
      )
    return mentionsOrder && infersContribution
  })
}

function expandedConcernTerms(
  report: string,
  payload?: CompactAnalyzePayload,
): string[] {
  const terms =
    payload?.customRequirements?.constraints
      .filter((constraint) => constraint.kind === 'excludeIngredientTerm')
      .map((constraint) => constraint.term)
      .filter((term): term is string => Boolean(term)) ?? []
  if (!terms.length) return []

  const issues: string[] = []
  const normalized = report.replace(
    /(?:不等于|不代表|不意味着|不能说明|无法确认|不能认定)[“"]?(?:无糖|不含添加糖|无添加糖)[”"]?/g,
    '',
  )
  if (
    terms.includes('白砂糖') &&
    !terms.some((term) => ['蔗糖', '添加糖', '糖'].includes(term)) &&
    /(?:未见|未出现|没有|不含|无)\s*(?:蔗糖类原料|蔗糖相关原料|添加糖)|(?:^|[\s，。；：])无糖(?:[\s，。；]|$)/m.test(
      normalized,
    )
  ) {
    issues.push('把关注词“白砂糖”扩大成了蔗糖类原料、添加糖或无糖')
  }
  return issues
}

function unsupportedLastPlaceClaims(
  report: string,
  payload?: CompactAnalyzePayload,
): string[] {
  if (!payload) return []
  const firstPlaceNames = new Set(
    payload.rankings
      .map((ranking) => ranking.order[0]?.name)
      .filter((name): name is string => Boolean(name)),
  )
  return [...firstPlaceNames]
    .filter((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return [
        new RegExp(`${escaped}.{0,24}(?:所有|全部|各个).{0,8}(?:维度|指标).{0,8}(?:末位|最后)`),
        new RegExp(`(?:所有|全部|各个).{0,8}(?:维度|指标).{0,8}(?:末位|最后).{0,24}${escaped}`),
      ].some((pattern) => pattern.test(report))
    })
    .map((name) => `“${name}”存在第一名指标，不能概括为所有维度末位`)
}

function proteinDensityContradictions(
  report: string,
  payload?: CompactAnalyzePayload,
): string[] {
  const densityRanking = payload?.rankings.find((ranking) =>
    ranking.label.includes('蛋白质密度'),
  )
  const first = densityRanking?.order[0]?.name
  if (!first) return []
  const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `${escaped}.{0,50}(?:蛋白质优势|较高蛋白质|高蛋白).{0,30}(?:需要|以|是以).{0,15}(?:更多|较高).{0,8}热量.{0,12}(?:代价|换取)|${escaped}.{0,50}(?:更多|较高).{0,8}热量.{0,12}(?:代价|换取).{0,20}(?:蛋白质优势|较高蛋白质|高蛋白)`,
  )
  return pattern.test(report)
    ? [`“${first}”蛋白质密度第一，不能把整包热量解释为蛋白质效率代价`]
    : []
}

function unsupportedDerivedClaims(
  report: string,
  payload?: CompactAnalyzePayload,
): string[] {
  const source = payloadText(payload)
  const claims = [
    ...(report.match(
      /\d+(?:\.\d+)?\s*倍(?:以上|以下|左右)?|(?:几|数|多)倍|翻倍/g,
    ) ?? []),
    ...(report.match(/\d+(?:\.\d+)?\s*%|百分之[一二三四五六七八九十百零\d.]+/g) ?? []),
  ]
  return [...new Set(claims.filter((claim) => !source.includes(claim)))]
}

function unsupportedBroadRankingClaim(
  sentence: string,
  payload?: CompactAnalyzePayload,
): boolean {
  const isBroadLastPlace = /(?:所有|全部|各个).{0,8}(?:维度|指标).{0,8}(?:末位|最后)/.test(
    sentence,
  )
  if (!isBroadLastPlace) return false
  if (!payload) return true
  return unsupportedLastPlaceClaims(sentence, payload).length > 0
}

function removeSentences(
  report: string,
  shouldRemove: (sentence: string) => boolean,
): { report: string; removed: boolean } {
  let removed = false
  const lines = report.split('\n').map((line) => {
    if (!line.trim() || /^#{1,6}\s/.test(line.trimStart())) return line
    const parts = line.match(/[^。！？!?]+[。！？!?]?/g) ?? [line]
    const kept = parts.filter((part) => {
      if (!shouldRemove(part.trim())) return true
      removed = true
      return false
    })
    const next = kept.join('').trimEnd()
    return /^(?:[-*+]\s*|\d+[.)、]\s*)$/.test(next.trim()) ? '' : next
  })
  return {
    report: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    removed,
  }
}

/**
 * Normalizes narrative boundary issues without inventing replacement facts.
 * Structural/pollution validation remains the responsibility of reportExtraction.
 */
export function normalizeReportBoundaries(
  report: string,
  payload?: CompactAnalyzePayload,
): ReportNormalizationResult {
  let normalizedReport = report
  const warnings: string[] = []

  const derived = removeSentences(
    normalizedReport,
    (sentence) => unsupportedDerivedClaims(sentence, payload).length > 0,
  )
  normalizedReport = derived.report
  if (derived.removed) warnings.push('已移除客户端未提供的派生比较')

  const broadRanking = removeSentences(normalizedReport, (sentence) =>
    unsupportedBroadRankingClaim(sentence, payload),
  )
  normalizedReport = broadRanking.report
  if (broadRanking.removed) warnings.push('已移除未经排名支持的概括')

  const otherBoundaryIssues = removeSentences(normalizedReport, (sentence) =>
    hasIngredientOrderInference(sentence) ||
    expandedConcernTerms(sentence, payload).length > 0 ||
    proteinDensityContradictions(sentence, payload).length > 0,
  )
  normalizedReport = otherBoundaryIssues.report
  if (otherBoundaryIssues.removed) {
    warnings.push('已移除超出客户端数据边界的表述')
  }

  const neutralized = normalizedReport
    .replaceAll('远未达到', '未达到')
    .replaceAll('远低于', '低于')
    .replaceAll('远低', '低')
    .replaceAll('远超', '高于')
    .replaceAll('断层领先', '排名领先')
    .replaceAll('碾压', '优于')
  if (neutralized !== normalizedReport) warnings.push('已中和夸张措辞')
  normalizedReport = neutralized

  return {
    report: normalizedReport,
    normalized: normalizedReport !== report,
    normalizationWarnings: [...new Set(warnings)],
  }
}

/**
 * Rejects a small set of high-risk narrative overreaches. This checker is
 * deterministic and never retries or creates an upstream task.
 */
export function auditReportBoundaries(
  report: string,
  payload?: CompactAnalyzePayload,
): string[] {
  const issues: string[] = []
  const unsupportedDerived = unsupportedDerivedClaims(report, payload)
  if (unsupportedDerived.length) {
    issues.push(`报告包含客户端未提供的派生比较“${unsupportedDerived[0]}”`)
  }

  for (const word of EXAGGERATED_WORDS) {
    if (report.includes(word)) issues.push(`报告包含夸张措辞“${word}”`)
  }
  if (hasIngredientOrderInference(report)) {
    issues.push('报告根据配料顺序推断了营养来源、贡献或因果关系')
  }
  issues.push(...expandedConcernTerms(report, payload))
  issues.push(...unsupportedLastPlaceClaims(report, payload))
  issues.push(...proteinDensityContradictions(report, payload))
  return [...new Set(issues)]
}
