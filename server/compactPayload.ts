import type {
  AnalyzeCalculatedProduct,
  AnalyzeInput,
  CompactAnalyzePayload,
  CompactPayloadStats,
  CompactProduct,
} from './types.js'

const goalLabels: Record<AnalyzeInput['goal'], string> = {
  calories: '控制本次热量',
  proteinDensity: '用更少热量获得更多蛋白质',
  proteinValue: '用更少的钱获得更多蛋白质',
  sodium: '相对控制钠',
  claims: '核对包装宣传',
  balance: '营养、份量和价格综合平衡',
}

function productLetter(index: number): string {
  return String.fromCharCode(65 + index)
}

function nonEmpty(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed || undefined
}

function formatted(value: number | null | undefined, digits: number): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : undefined
}

function numericString(value: string, digits: number): string | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : undefined
}

function requirementValue(
  rule: AnalyzeInput['customRequirementRules'][number],
): string | undefined {
  if (rule.value === undefined) return undefined
  const digits = rule.kind === 'priceMax' ? 2 : 1
  return `${rule.value.toFixed(digits)}${rule.unit ? ` ${rule.unit}` : ''}`
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === null || item === '') return false
      if (Array.isArray(item)) return item.length > 0
      if (typeof item === 'object') return Object.keys(item).length > 0
      return true
    }),
  ) as T
}

function compactProduct(
  input: AnalyzeInput,
  index: number,
  calculated: AnalyzeCalculatedProduct,
): CompactProduct {
  const product = input.products[index]
  const unit = product.netUnit
  return compactObject({
    product: productLetter(index),
    name: product.name,
    claims: nonEmpty(product.claims),
    ingredients: nonEmpty(product.ingredients),
    netContent: numericString(product.netContent, 1)
      ? `${numericString(product.netContent, 1)} ${unit}`
      : undefined,
    priceCny: numericString(product.price, 2),
    per100: compactObject({
      caloriesKcal: formatted(calculated.kcalPer100, 1),
      proteinG: formatted(calculated.proteinPer100, 1),
      fatG: formatted(calculated.fatPer100, 1),
      carbsG: formatted(calculated.carbsPer100, 1),
      sodiumMg: formatted(calculated.sodiumPer100, 1),
    }),
    perPackage: compactObject({
      caloriesKcal: formatted(calculated.packageCalories, 1),
      proteinG: formatted(calculated.packageProtein, 1),
    }),
    efficiency: compactObject({
      proteinGPer100Kcal: formatted(calculated.proteinPer100Kcal, 1),
      costCnyPer10gProtein: formatted(calculated.proteinCostPer10g, 2),
    }),
    currentBudgets: compactObject({
      amountUnderCalorieBudget: formatted(calculated.gramsUnderCalorieBudget, 1)
        ? `${formatted(calculated.gramsUnderCalorieBudget, 1)} ${unit}`
        : undefined,
      packagesUnderCalorieBudget: formatted(calculated.packagesUnderCalorieBudget, 2),
      amountForProteinTarget: formatted(calculated.gramsForProteinTarget, 1)
        ? `${formatted(calculated.gramsForProteinTarget, 1)} ${unit}`
        : undefined,
      caloriesForProteinTargetKcal: formatted(calculated.caloriesForProteinTarget, 1),
      costForProteinTargetCny: formatted(calculated.costForProteinTarget, 2),
      proteinUnderPriceBudgetG: formatted(calculated.proteinUnderPriceBudget, 1),
    }),
  })
}

export function buildCompactAnalyzePayload(input: AnalyzeInput): {
  payload: CompactAnalyzePayload
  stats: CompactPayloadStats
} {
  const idToIndex = new Map(input.products.map((product, index) => [product.id, index]))
  const preferredIndex = input.preferred ? idToIndex.get(input.preferred.id) : undefined
  const confirmedProducts = input.products.map((_, index) =>
    compactProduct(input, index, input.calculated[index]),
  )
  const payload: CompactAnalyzePayload = {
    rawPreference: input.rawPreference,
    quickGoal: input.quickGoal,
    confirmedProducts,
    deterministicMetrics: confirmedProducts.map((product) =>
      compactObject({
        product: product.product,
        name: product.name,
        per100: product.per100,
        perPackage: product.perPackage,
        efficiency: product.efficiency,
        currentBudgets: product.currentBudgets,
      }),
    ),
    availableDimensions: input.availableDimensions,
    missingDimensions: input.missingDimensions,
    localComparison: input.localComparison,
    safetyBoundary: input.safetyBoundary,
    requestFingerprint: input.requestFingerprint,
    goal: compactObject({
      key: input.goal,
      label: goalLabels[input.goal],
      preferred:
        typeof preferredIndex === 'number'
          ? `${productLetter(preferredIndex)} · ${input.products[preferredIndex].name}`
          : undefined,
    }),
    budgets: compactObject({
      caloriesKcal: numericString(input.budgets.calories, 1),
      proteinG: numericString(input.budgets.protein, 1),
      priceCny: numericString(input.budgets.price, 2),
    }),
    products: confirmedProducts,
    rankings: input.rankings.map((ranking) => ({
      label: ranking.label,
      order: [...ranking.items]
        .filter((item) => item.rank !== null)
        .sort((a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY))
        .map((item) => {
          return {
            name: item.productName,
            displayValue: item.displayValue,
          }
        }),
    })),
    claimChecks: input.claimChecks.map((check) => {
      const index = idToIndex.get(check.productId)
      return {
        product: typeof index === 'number' ? productLetter(index) : '?',
        name: check.productName,
        status: check.status,
        observations: check.observations,
      }
    }),
    insufficient: input.insufficient,
    customRequirements:
      input.customRequirementText.trim() ||
      input.customRequirementRules.length ||
      input.unresolvedPreferences.length
        ? {
            original: input.customRequirementText,
            constraints: input.customRequirementRules.map((rule) =>
              compactObject({
                kind: rule.kind,
                label: rule.label,
                value: requirementValue(rule),
                term: nonEmpty(rule.term ?? ''),
                basis: rule.basis,
              }),
            ),
            matches: input.customRequirementEvaluation.ruleResults.map((result) => ({
              requirement: result.rule.label,
              products: result.products.map((match) => {
                const index = idToIndex.get(match.productId)
                return {
                  product: typeof index === 'number' ? productLetter(index) : '?',
                  name: match.productName,
                  status: match.status,
                  evidence: match.evidence,
                }
              }),
            })),
            productSummaries: input.customRequirementEvaluation.productSummaries.map(
              (summary) => {
                const index = idToIndex.get(summary.productId)
                return {
                  product: typeof index === 'number' ? productLetter(index) : '?',
                  name: summary.productName,
                  status: summary.status,
                  satisfied: summary.satisfiedCount,
                  failed: summary.failedCount,
                  unknown: summary.unknownCount,
                }
              },
            ),
            unresolvedPreferences: input.unresolvedPreferences,
            noProductFullyMatches:
              input.customRequirementEvaluation.noProductFullyMatches,
            tradeoffs: input.customRequirementEvaluation.tradeoffs,
          }
        : undefined,
  }

  const originalCharacters = JSON.stringify(input).length
  const compactCharacters = JSON.stringify(payload).length
  const stats = {
    originalCharacters,
    compactCharacters,
    estimatedTokens: Math.ceil(compactCharacters / 2),
    reductionPercent:
      originalCharacters > 0
        ? Number((((originalCharacters - compactCharacters) / originalCharacters) * 100).toFixed(1))
        : 0,
  }
  return { payload, stats }
}
