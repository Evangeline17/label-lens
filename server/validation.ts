import type {
  AnalyzeCalculatedProduct,
  AnalyzeClaimCheck,
  AnalyzeCustomRequirementEvaluation,
  AnalyzeCustomRequirementRule,
  AnalyzeInput,
  AnalyzeProduct,
  AnalyzeRankingGroup,
} from './types.js'

const goals = new Set([
  'calories',
  'proteinDensity',
  'proteinValue',
  'sodium',
  'claims',
  'balance',
])
const categories = new Set([
  '酸奶/乳制品',
  '面包/主食',
  '蛋白棒/能量棒',
  '饮料',
  '零食',
  '其他',
])
const bases = new Set(['per100g', 'per100ml', 'perServing'])
const netUnits = new Set(['g', 'mL'])
const energyUnits = new Set(['kJ', 'kcal'])
const customRequirementKinds = new Set([
  'priceMax',
  'packageCaloriesMax',
  'per100gCaloriesMax',
  'packageProteinMin',
  'per100gProteinMin',
  'packageSodiumMax',
  'excludeIngredientTerm',
  'ingredientCountMax',
  'packageNearCalorieBudget',
])
const requirementMatchStatuses = new Set(['满足', '不满足', '无法判断'])
const requirementSummaryStatuses = new Set(['满足', '部分满足', '不满足', '无法判断'])
const numericProductFields = [
  'netContent',
  'price',
  'servingSize',
  'energy',
  'protein',
  'fat',
  'carbs',
  'sodium',
] as const
const calculatedNumberFields = [
  'kcalPer100',
  'proteinPer100',
  'fatPer100',
  'carbsPer100',
  'sodiumPer100',
  'packageCalories',
  'packageProtein',
  'packageSodium',
  'pricePer100',
  'proteinCostPer10g',
  'proteinPer100Kcal',
  'gramsUnderCalorieBudget',
  'packagesUnderCalorieBudget',
  'gramsForProteinTarget',
  'caloriesForProteinTarget',
  'costForProteinTarget',
  'proteinUnderPriceBudget',
] as const

export class ValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(issues[0] ?? '请求数据不合法')
    this.name = 'ValidationError'
    this.issues = issues
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(
  value: unknown,
  path: string,
  issues: string[],
  options: { max: number; required?: boolean } = { max: 200 },
): string {
  if (typeof value !== 'string') {
    issues.push(`${path} 必须是字符串`)
    return ''
  }
  const text = value.trim()
  if (options.required && !text) issues.push(`${path} 不能为空`)
  if (value.length > options.max) issues.push(`${path} 不能超过 ${options.max} 个字符`)
  if (/data:image\/|base64,/i.test(value)) issues.push(`${path} 不允许包含图片或 Base64 数据`)
  return value
}

function readNumericString(
  value: unknown,
  path: string,
  issues: string[],
  options: { required?: boolean; positive?: boolean } = {},
): string {
  const text = readString(value, path, issues, { max: 40, required: options.required })
  if (!text.trim()) return text
  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed < 0) {
    issues.push(`${path} 必须是合法的非负数字`)
  } else if (options.positive && parsed <= 0) {
    issues.push(`${path} 必须大于 0`)
  }
  return text
}

function readNullableNumber(value: unknown, path: string, issues: string[]): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push(`${path} 必须是非负有限数字或 null`)
    return null
  }
  return value
}

function readOptionalNumber(
  value: unknown,
  path: string,
  issues: string[],
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push(`${path} 必须是非负有限数字`)
    return undefined
  }
  return value
}

function readCount(value: unknown, path: string, issues: string[]): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 20) {
    issues.push(`${path} 必须是 0—20 的整数`)
    return 0
  }
  return value
}

function validateProduct(value: unknown, index: number, issues: string[]): AnalyzeProduct {
  const path = `products[${index}]`
  if (!isRecord(value)) {
    issues.push(`${path} 必须是对象`)
    return {} as AnalyzeProduct
  }
  if ('ingredientPhoto' in value || 'nutritionPhoto' in value || 'dataUrl' in value) {
    issues.push(`${path} 不允许上传或提交本地图片`)
  }

  const product = {
    id: readString(value.id, `${path}.id`, issues, { max: 100, required: true }),
    name: readString(value.name, `${path}.name`, issues, { max: 100, required: true }),
    category: readString(value.category, `${path}.category`, issues, {
      max: 40,
      required: true,
    }),
    claims: readString(value.claims, `${path}.claims`, issues, { max: 300 }),
    ingredients: readString(value.ingredients, `${path}.ingredients`, issues, { max: 2000 }),
    netContent: readNumericString(value.netContent, `${path}.netContent`, issues, {
      required: true,
      positive: true,
    }),
    netUnit: readString(value.netUnit, `${path}.netUnit`, issues, {
      max: 4,
      required: true,
    }) as AnalyzeProduct['netUnit'],
    price: readNumericString(value.price, `${path}.price`, issues),
    basis: readString(value.basis, `${path}.basis`, issues, {
      max: 20,
      required: true,
    }) as AnalyzeProduct['basis'],
    servingSize: readNumericString(value.servingSize, `${path}.servingSize`, issues),
    energy: readNumericString(value.energy, `${path}.energy`, issues),
    energyUnit: readString(value.energyUnit, `${path}.energyUnit`, issues, {
      max: 5,
      required: true,
    }) as AnalyzeProduct['energyUnit'],
    protein: readNumericString(value.protein, `${path}.protein`, issues),
    fat: readNumericString(value.fat, `${path}.fat`, issues),
    carbs: readNumericString(value.carbs, `${path}.carbs`, issues),
    sodium: readNumericString(value.sodium, `${path}.sodium`, issues),
  }

  if (!categories.has(product.category)) issues.push(`${path}.category 不是支持的商品类别`)
  if (!netUnits.has(product.netUnit)) issues.push(`${path}.netUnit 必须是 g 或 mL`)
  if (!bases.has(product.basis)) issues.push(`${path}.basis 不是支持的营养标示基准`)
  if (!energyUnits.has(product.energyUnit)) issues.push(`${path}.energyUnit 必须是 kJ 或 kcal`)
  if (
    product.basis === 'perServing' &&
    (!product.servingSize.trim() || Number(product.servingSize) <= 0)
  ) {
    issues.push(`${path}.servingSize 在“每份”标示基准下必须大于 0`)
  }
  return product
}

function validateCalculated(
  value: unknown,
  index: number,
  issues: string[],
): AnalyzeCalculatedProduct {
  const path = `calculated[${index}]`
  if (!isRecord(value)) {
    issues.push(`${path} 必须是对象`)
    return {} as AnalyzeCalculatedProduct
  }
  const result: Record<string, unknown> = {
    id: readString(value.id, `${path}.id`, issues, { max: 100, required: true }),
    name: readString(value.name, `${path}.name`, issues, { max: 100, required: true }),
  }
  for (const field of calculatedNumberFields) {
    result[field] = readNullableNumber(value[field], `${path}.${field}`, issues)
  }
  if (!isRecord(value.formulas)) {
    issues.push(`${path}.formulas 必须是对象`)
    result.formulas = {}
  } else {
    const formulas: Record<string, string> = {}
    for (const [key, formula] of Object.entries(value.formulas).slice(0, 30)) {
      formulas[readString(key, `${path}.formulas key`, issues, { max: 80, required: true })] =
        readString(formula, `${path}.formulas.${key}`, issues, { max: 300 })
    }
    result.formulas = formulas
  }
  return result as unknown as AnalyzeCalculatedProduct
}

function validateRanking(value: unknown, index: number, issues: string[]): AnalyzeRankingGroup {
  const path = `rankings[${index}]`
  if (!isRecord(value)) {
    issues.push(`${path} 必须是对象`)
    return {} as AnalyzeRankingGroup
  }
  const items = Array.isArray(value.items) ? value.items : []
  if (!Array.isArray(value.items)) issues.push(`${path}.items 必须是数组`)
  if (items.length > 4) issues.push(`${path}.items 最多 4 项`)
  return {
    key: readString(value.key, `${path}.key`, issues, { max: 60, required: true }),
    label: readString(value.label, `${path}.label`, issues, { max: 100, required: true }),
    note: readString(value.note, `${path}.note`, issues, { max: 300 }),
    items: items.map((item, itemIndex) => {
      const itemPath = `${path}.items[${itemIndex}]`
      if (!isRecord(item)) {
        issues.push(`${itemPath} 必须是对象`)
        return {} as AnalyzeRankingGroup['items'][number]
      }
      const rank =
        item.rank === null
          ? null
          : typeof item.rank === 'number' &&
              Number.isInteger(item.rank) &&
              item.rank >= 1 &&
              item.rank <= 4
            ? item.rank
            : (issues.push(`${itemPath}.rank 必须是 1—4 的整数或 null`), null)
      return {
        productId: readString(item.productId, `${itemPath}.productId`, issues, {
          max: 100,
          required: true,
        }),
        productName: readString(item.productName, `${itemPath}.productName`, issues, {
          max: 100,
          required: true,
        }),
        value: readNullableNumber(item.value, `${itemPath}.value`, issues),
        displayValue: readString(item.displayValue, `${itemPath}.displayValue`, issues, {
          max: 100,
        }),
        rank,
      }
    }),
  }
}

function validateClaimCheck(value: unknown, index: number, issues: string[]): AnalyzeClaimCheck {
  const path = `claimChecks[${index}]`
  if (!isRecord(value)) {
    issues.push(`${path} 必须是对象`)
    return {} as AnalyzeClaimCheck
  }
  const observations = Array.isArray(value.observations) ? value.observations : []
  if (!Array.isArray(value.observations)) issues.push(`${path}.observations 必须是数组`)
  if (observations.length > 10) issues.push(`${path}.observations 最多 10 项`)
  return {
    productId: readString(value.productId, `${path}.productId`, issues, {
      max: 100,
      required: true,
    }),
    productName: readString(value.productName, `${path}.productName`, issues, {
      max: 100,
      required: true,
    }),
    status: readString(value.status, `${path}.status`, issues, { max: 40, required: true }),
    observations: observations.map((observation, observationIndex) => {
      const itemPath = `${path}.observations[${observationIndex}]`
      if (!isRecord(observation)) {
        issues.push(`${itemPath} 必须是对象`)
        return {} as AnalyzeClaimCheck['observations'][number]
      }
      return {
        claim: readString(observation.claim, `${itemPath}.claim`, issues, {
          max: 200,
          required: true,
        }),
        status: readString(observation.status, `${itemPath}.status`, issues, {
          max: 40,
          required: true,
        }),
        detail: readString(observation.detail, `${itemPath}.detail`, issues, { max: 1000 }),
      }
    }),
  }
}

function validateCustomRequirementRule(
  value: unknown,
  path: string,
  issues: string[],
): AnalyzeCustomRequirementRule {
  if (!isRecord(value)) {
    issues.push(`${path} 必须是对象`)
    return {} as AnalyzeCustomRequirementRule
  }
  const kind = readString(value.kind, `${path}.kind`, issues, {
    max: 60,
    required: true,
  }) as AnalyzeCustomRequirementRule['kind']
  if (!customRequirementKinds.has(kind)) issues.push(`${path}.kind 不是支持的本地约束`)
  return {
    id: readString(value.id, `${path}.id`, issues, { max: 100, required: true }),
    kind,
    original: readString(value.original, `${path}.original`, issues, {
      max: 300,
      required: true,
    }),
    label: readString(value.label, `${path}.label`, issues, { max: 100, required: true }),
    value: readOptionalNumber(value.value, `${path}.value`, issues),
    term:
      value.term === undefined
        ? undefined
        : readString(value.term, `${path}.term`, issues, { max: 30, required: true }),
    unit:
      value.unit === undefined
        ? undefined
        : readString(value.unit, `${path}.unit`, issues, { max: 30 }),
    basis: readString(value.basis, `${path}.basis`, issues, {
      max: 300,
      required: true,
    }),
  }
}

function validateCustomRequirementEvaluation(
  value: unknown,
  rules: AnalyzeCustomRequirementRule[],
  productIds: Set<string>,
  issues: string[],
): AnalyzeCustomRequirementEvaluation {
  if (!isRecord(value)) {
    issues.push('customRequirementEvaluation 必须是对象')
    return {
      ruleResults: [],
      productSummaries: [],
      fullyMatchedProductIds: [],
      noProductFullyMatches: false,
      tradeoffs: [],
    }
  }
  const rawRuleResults = Array.isArray(value.ruleResults) ? value.ruleResults : []
  if (!Array.isArray(value.ruleResults)) {
    issues.push('customRequirementEvaluation.ruleResults 必须是数组')
  }
  if (rawRuleResults.length > 20) {
    issues.push('customRequirementEvaluation.ruleResults 最多 20 项')
  }
  const ruleResults = rawRuleResults.slice(0, 20).map((result, resultIndex) => {
    const path = `customRequirementEvaluation.ruleResults[${resultIndex}]`
    if (!isRecord(result)) {
      issues.push(`${path} 必须是对象`)
      return {} as AnalyzeCustomRequirementEvaluation['ruleResults'][number]
    }
    const rule = validateCustomRequirementRule(result.rule, `${path}.rule`, issues)
    const rawProducts = Array.isArray(result.products) ? result.products : []
    if (!Array.isArray(result.products)) issues.push(`${path}.products 必须是数组`)
    if (rawProducts.length > 4) issues.push(`${path}.products 最多 4 项`)
    return {
      rule,
      products: rawProducts.slice(0, 4).map((product, productIndex) => {
        const productPath = `${path}.products[${productIndex}]`
        if (!isRecord(product)) {
          issues.push(`${productPath} 必须是对象`)
          return {} as AnalyzeCustomRequirementEvaluation['ruleResults'][number]['products'][number]
        }
        const productId = readString(product.productId, `${productPath}.productId`, issues, {
          max: 100,
          required: true,
        })
        const status = readString(product.status, `${productPath}.status`, issues, {
          max: 20,
          required: true,
        }) as '满足' | '不满足' | '无法判断'
        if (!requirementMatchStatuses.has(status)) {
          issues.push(`${productPath}.status 不是支持的匹配状态`)
        }
        if (!productIds.has(productId)) issues.push(`${productPath}.productId 不属于本次商品`)
        return {
          productId,
          productName: readString(product.productName, `${productPath}.productName`, issues, {
            max: 100,
            required: true,
          }),
          status,
          evidence: readString(product.evidence, `${productPath}.evidence`, issues, {
            max: 500,
            required: true,
          }),
        }
      }),
    }
  })

  const rawSummaries = Array.isArray(value.productSummaries) ? value.productSummaries : []
  if (!Array.isArray(value.productSummaries)) {
    issues.push('customRequirementEvaluation.productSummaries 必须是数组')
  }
  const productSummaries = rawSummaries.slice(0, 4).map((summary, index) => {
    const path = `customRequirementEvaluation.productSummaries[${index}]`
    if (!isRecord(summary)) {
      issues.push(`${path} 必须是对象`)
      return {} as AnalyzeCustomRequirementEvaluation['productSummaries'][number]
    }
    const productId = readString(summary.productId, `${path}.productId`, issues, {
      max: 100,
      required: true,
    })
    const status = readString(summary.status, `${path}.status`, issues, {
      max: 20,
      required: true,
    }) as AnalyzeCustomRequirementEvaluation['productSummaries'][number]['status']
    if (!requirementSummaryStatuses.has(status)) {
      issues.push(`${path}.status 不是支持的汇总状态`)
    }
    if (!productIds.has(productId)) issues.push(`${path}.productId 不属于本次商品`)
    return {
      productId,
      productName: readString(summary.productName, `${path}.productName`, issues, {
        max: 100,
        required: true,
      }),
      status,
      satisfiedCount: readCount(summary.satisfiedCount, `${path}.satisfiedCount`, issues),
      failedCount: readCount(summary.failedCount, `${path}.failedCount`, issues),
      unknownCount: readCount(summary.unknownCount, `${path}.unknownCount`, issues),
    }
  })
  const rawFullyMatched = Array.isArray(value.fullyMatchedProductIds)
    ? value.fullyMatchedProductIds
    : []
  if (!Array.isArray(value.fullyMatchedProductIds)) {
    issues.push('customRequirementEvaluation.fullyMatchedProductIds 必须是数组')
  }
  const fullyMatchedProductIds = rawFullyMatched.slice(0, 4).map((id, index) => {
    const parsed = readString(
      id,
      `customRequirementEvaluation.fullyMatchedProductIds[${index}]`,
      issues,
      { max: 100, required: true },
    )
    if (!productIds.has(parsed)) {
      issues.push(`customRequirementEvaluation.fullyMatchedProductIds[${index}] 不属于本次商品`)
    }
    return parsed
  })
  const rawTradeoffs = Array.isArray(value.tradeoffs) ? value.tradeoffs : []
  if (!Array.isArray(value.tradeoffs)) issues.push('customRequirementEvaluation.tradeoffs 必须是数组')
  const tradeoffs = rawTradeoffs
    .slice(0, 4)
    .map((item, index) =>
      readString(item, `customRequirementEvaluation.tradeoffs[${index}]`, issues, {
        max: 500,
        required: true,
      }),
    )
  if (typeof value.noProductFullyMatches !== 'boolean') {
    issues.push('customRequirementEvaluation.noProductFullyMatches 必须是 boolean')
  }
  if (ruleResults.length !== rules.length) {
    issues.push('customRequirementEvaluation.ruleResults 数量必须与 customRequirementRules 一致')
  }
  return {
    ruleResults,
    productSummaries,
    fullyMatchedProductIds,
    noProductFullyMatches:
      typeof value.noProductFullyMatches === 'boolean'
        ? value.noProductFullyMatches
        : false,
    tradeoffs,
  }
}

export function validateAnalyzeInput(value: unknown): AnalyzeInput {
  const issues: string[] = []
  if (!isRecord(value)) throw new ValidationError(['请求体必须是 JSON 对象'])
  const serialized = JSON.stringify(value)
  if (serialized.length > 180_000) issues.push('请求数据过大')
  if (/data:image\/|base64,/i.test(serialized)) issues.push('请求中不得包含本地图片或 Base64 数据')

  const goal = readString(value.goal, 'goal', issues, {
    max: 40,
    required: true,
  }) as AnalyzeInput['goal']
  if (!goals.has(goal)) issues.push('goal 不是支持的比较目标')

  const budgetRecord = isRecord(value.budgets) ? value.budgets : {}
  if (!isRecord(value.budgets)) issues.push('budgets 必须是对象')
  const budgets = {
    calories: readNumericString(budgetRecord.calories, 'budgets.calories', issues),
    protein: readNumericString(budgetRecord.protein, 'budgets.protein', issues),
    price: readNumericString(budgetRecord.price, 'budgets.price', issues),
  }

  const rawProducts = Array.isArray(value.products) ? value.products : []
  if (!Array.isArray(value.products)) issues.push('products 必须是数组')
  if (rawProducts.length < 2 || rawProducts.length > 4) issues.push('每次必须提交 2—4 款商品')
  const products = rawProducts.slice(0, 4).map((item, index) => validateProduct(item, index, issues))
  const ids = products.map((product) => product.id)
  if (new Set(ids).size !== ids.length) issues.push('商品 id 不能重复')

  const rawCalculated = Array.isArray(value.calculated) ? value.calculated : []
  if (!Array.isArray(value.calculated)) issues.push('calculated 必须是数组')
  if (rawCalculated.length !== products.length) issues.push('calculated 数量必须与 products 一致')
  const calculated = rawCalculated
    .slice(0, 4)
    .map((item, index) => validateCalculated(item, index, issues))
  if (
    calculated.length === products.length &&
    calculated.some((item, index) => item.id !== products[index]?.id)
  ) {
    issues.push('calculated 必须按 products 顺序提供相同的商品 id')
  }

  const rawRankings = Array.isArray(value.rankings) ? value.rankings : []
  if (!Array.isArray(value.rankings)) issues.push('rankings 必须是数组')
  if (rawRankings.length < 1 || rawRankings.length > 6) issues.push('rankings 必须包含 1—6 组')
  const rankings = rawRankings
    .slice(0, 6)
    .map((item, index) => validateRanking(item, index, issues))

  const rawClaimChecks = Array.isArray(value.claimChecks) ? value.claimChecks : []
  if (!Array.isArray(value.claimChecks)) issues.push('claimChecks 必须是数组')
  if (rawClaimChecks.length !== products.length) issues.push('claimChecks 数量必须与 products 一致')
  const claimChecks = rawClaimChecks
    .slice(0, 4)
    .map((item, index) => validateClaimCheck(item, index, issues))
  if (
    claimChecks.length === products.length &&
    claimChecks.some((item, index) => item.productId !== products[index]?.id)
  ) {
    issues.push('claimChecks 必须按 products 顺序提供相同的商品 id')
  }

  const rawInsufficient = Array.isArray(value.insufficient) ? value.insufficient : []
  if (!Array.isArray(value.insufficient)) issues.push('insufficient 必须是数组')
  if (rawInsufficient.length > 40) issues.push('insufficient 最多 40 项')
  const insufficient = rawInsufficient
    .slice(0, 40)
    .map((item, index) =>
      readString(item, `insufficient[${index}]`, issues, { max: 300, required: true }),
    )

  const customRequirementText =
    value.customRequirementText === undefined
      ? ''
      : readString(value.customRequirementText, 'customRequirementText', issues, { max: 300 })
  const rawCustomRequirementRules = Array.isArray(value.customRequirementRules)
    ? value.customRequirementRules
    : []
  if (
    value.customRequirementRules !== undefined &&
    !Array.isArray(value.customRequirementRules)
  ) {
    issues.push('customRequirementRules 必须是数组')
  }
  if (rawCustomRequirementRules.length > 20) issues.push('customRequirementRules 最多 20 项')
  const customRequirementRules = rawCustomRequirementRules
    .slice(0, 20)
    .map((item, index) =>
      validateCustomRequirementRule(item, `customRequirementRules[${index}]`, issues),
    )
  const rawUnresolvedPreferences = Array.isArray(value.unresolvedPreferences)
    ? value.unresolvedPreferences
    : []
  if (
    value.unresolvedPreferences !== undefined &&
    !Array.isArray(value.unresolvedPreferences)
  ) {
    issues.push('unresolvedPreferences 必须是数组')
  }
  if (rawUnresolvedPreferences.length > 20) {
    issues.push('unresolvedPreferences 最多 20 项')
  }
  const unresolvedPreferences = rawUnresolvedPreferences
    .slice(0, 20)
    .map((item, index) =>
      readString(item, `unresolvedPreferences[${index}]`, issues, {
        max: 300,
        required: true,
      }),
    )
  const customRequirementEvaluation =
    value.customRequirementEvaluation === undefined
      ? {
          ruleResults: [],
          productSummaries: [],
          fullyMatchedProductIds: [],
          noProductFullyMatches: false,
          tradeoffs: [],
        }
      : validateCustomRequirementEvaluation(
          value.customRequirementEvaluation,
          customRequirementRules,
          new Set(ids),
          issues,
        )

  let preferred: AnalyzeInput['preferred'] = null
  if (value.preferred !== null && value.preferred !== undefined) {
    if (!isRecord(value.preferred)) {
      issues.push('preferred 必须是对象或 null')
    } else {
      preferred = {
        id: readString(value.preferred.id, 'preferred.id', issues, {
          max: 100,
          required: true,
        }),
        name: readString(value.preferred.name, 'preferred.name', issues, {
          max: 100,
          required: true,
        }),
      }
      if (preferred.id && !ids.includes(preferred.id)) {
        issues.push('preferred.id 必须属于本次 products')
      }
    }
  }

  const knownIds = new Set(ids)
  for (const [groupIndex, group] of rankings.entries()) {
    if (group.items.some((item) => !knownIds.has(item.productId))) {
      issues.push(`rankings[${groupIndex}] 包含不属于本次 products 的商品 id`)
    }
  }

  for (const [index, product] of products.entries()) {
    for (const field of numericProductFields) {
      const valueAtField = product[field]
      if (typeof valueAtField !== 'string') issues.push(`products[${index}].${field} 格式错误`)
    }
  }

  if (issues.length) throw new ValidationError([...new Set(issues)].slice(0, 20))
  return {
    goal,
    budgets,
    products,
    calculated,
    rankings,
    claimChecks,
    insufficient,
    preferred,
    customRequirementText,
    customRequirementRules,
    customRequirementEvaluation,
    unresolvedPreferences,
  }
}
