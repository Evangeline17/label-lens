export type AnalyzeGoal =
  | 'calories'
  | 'proteinDensity'
  | 'proteinValue'
  | 'sodium'
  | 'claims'
  | 'balance'

export interface AnalyzeBudgets {
  calories: string
  protein: string
  price: string
}

export interface AnalyzeProduct {
  id: string
  name: string
  category: string
  claims: string
  ingredients: string
  netContent: string
  netUnit: 'g' | 'mL'
  price: string
  basis: 'per100g' | 'per100ml' | 'perServing'
  servingSize: string
  energy: string
  energyUnit: 'kJ' | 'kcal'
  protein: string
  fat: string
  carbs: string
  sodium: string
}

export interface AnalyzeCalculatedProduct {
  id: string
  name: string
  kcalPer100: number | null
  proteinPer100: number | null
  fatPer100: number | null
  carbsPer100: number | null
  sodiumPer100: number | null
  packageCalories: number | null
  packageProtein: number | null
  packageSodium: number | null
  pricePer100: number | null
  proteinCostPer10g: number | null
  proteinPer100Kcal: number | null
  gramsUnderCalorieBudget: number | null
  packagesUnderCalorieBudget: number | null
  gramsForProteinTarget: number | null
  caloriesForProteinTarget: number | null
  costForProteinTarget: number | null
  proteinUnderPriceBudget: number | null
  formulas: Record<string, string>
}

export interface AnalyzeRankingItem {
  productId: string
  productName: string
  value: number | null
  displayValue: string
  rank: number | null
}

export interface AnalyzeRankingGroup {
  key: string
  label: string
  note: string
  items: AnalyzeRankingItem[]
}

export interface AnalyzeClaimObservation {
  claim: string
  status: string
  detail: string
}

export interface AnalyzeClaimCheck {
  productId: string
  productName: string
  status: string
  observations: AnalyzeClaimObservation[]
}

export type AnalyzeCustomRequirementKind =
  | 'priceMax'
  | 'packageCaloriesMax'
  | 'per100gCaloriesMax'
  | 'packageProteinMin'
  | 'per100gProteinMin'
  | 'packageSodiumMax'
  | 'excludeIngredientTerm'
  | 'ingredientCountMax'
  | 'packageNearCalorieBudget'

export interface AnalyzeCustomRequirementRule {
  id: string
  kind: AnalyzeCustomRequirementKind
  original: string
  label: string
  value?: number
  term?: string
  unit?: string
  basis: string
}

export interface AnalyzeProductRequirementMatch {
  productId: string
  productName: string
  status: '满足' | '不满足' | '无法判断'
  evidence: string
}

export interface AnalyzeRequirementRuleResult {
  rule: AnalyzeCustomRequirementRule
  products: AnalyzeProductRequirementMatch[]
}

export interface AnalyzeProductRequirementSummary {
  productId: string
  productName: string
  status: '满足' | '部分满足' | '不满足' | '无法判断'
  satisfiedCount: number
  failedCount: number
  unknownCount: number
}

export interface AnalyzeCustomRequirementEvaluation {
  ruleResults: AnalyzeRequirementRuleResult[]
  productSummaries: AnalyzeProductRequirementSummary[]
  fullyMatchedProductIds: string[]
  noProductFullyMatches: boolean
  tradeoffs: string[]
}

export interface AnalyzeInput {
  rawPreference: string
  quickGoal: 'protein' | 'calories' | 'sugar' | 'fat' | 'sodium' | 'value' | 'overall' | null
  confirmedProducts: AnalyzeProduct[]
  deterministicMetrics: AnalyzeCalculatedProduct[]
  availableDimensions: string[]
  missingDimensions: string[]
  localComparison: {
    status: 'full' | 'partial' | 'insufficient' | 'advanced'
    preferredId: string | null
    compared: string[]
    summary: string
  }
  safetyBoundary: string
  requestFingerprint: string
  goal: AnalyzeGoal
  budgets: AnalyzeBudgets
  products: AnalyzeProduct[]
  calculated: AnalyzeCalculatedProduct[]
  rankings: AnalyzeRankingGroup[]
  claimChecks: AnalyzeClaimCheck[]
  insufficient: string[]
  preferred: { id: string; name: string } | null
  customRequirementText: string
  customRequirementRules: AnalyzeCustomRequirementRule[]
  customRequirementEvaluation: AnalyzeCustomRequirementEvaluation
  unresolvedPreferences: string[]
}

export interface InfiniSynapseResult {
  taskId: string
  report: string
  normalized?: boolean
  normalizationWarnings?: string[]
  reportMode?: 'structured' | 'partial' | 'raw'
  rawResult?: unknown
}

export type LabelImageKind = 'ingredients' | 'nutrition'

export interface LabelImageUpload {
  kind: LabelImageKind
  filename: string
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
  data: Buffer
}

export type RecognitionNutritionBasis =
  | 'per100g'
  | 'per100ml'
  | 'perServing'
  | 'unknown'

export interface LabelRecognitionResult {
  productName: string | null
  ingredientsText: string | null
  netContent: number | null
  netContentUnit: 'g' | 'mL' | null
  nutritionBasis: RecognitionNutritionBasis
  energyValue: number | null
  energyUnit: 'kJ' | 'kcal' | null
  protein: number | null
  fat: number | null
  carbohydrate: number | null
  sodium: number | null
}

export interface LabelRecognitionTaskResult {
  taskId: string
  result: LabelRecognitionResult
}

export interface LabelRecognitionTaskStatusResult {
  status: AnalyzeTaskStatus
  taskId: string
  connId?: string
  createdAt?: string
  progress?: string
  result?: LabelRecognitionResult
  error?: string
  localWaitEnded?: boolean
  imageKinds?: LabelImageKind[]
}

export type AnalyzeTaskStatus =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'not_found'
  | 'cancelled'
  | 'format_error'
  | 'unknown'

export interface AnalyzeTaskStatusResult {
  status: AnalyzeTaskStatus
  taskId: string
  createdAt?: string
  progress?: string
  report?: string
  error?: string
  localWaitEnded?: boolean
  normalized?: boolean
  normalizationWarnings?: string[]
  reportMode?: 'structured' | 'partial' | 'raw'
  rawResult?: unknown
}

export interface CompactProduct {
  product: string
  name: string
  claims?: string
  ingredients?: string
  netContent?: string
  priceCny?: string
  per100?: {
    caloriesKcal?: string
    proteinG?: string
    fatG?: string
    carbsG?: string
    sodiumMg?: string
  }
  perPackage?: {
    caloriesKcal?: string
    proteinG?: string
  }
  efficiency?: {
    proteinGPer100Kcal?: string
    costCnyPer10gProtein?: string
  }
  currentBudgets?: {
    amountUnderCalorieBudget?: string
    packagesUnderCalorieBudget?: string
    amountForProteinTarget?: string
    caloriesForProteinTargetKcal?: string
    costForProteinTargetCny?: string
    proteinUnderPriceBudgetG?: string
  }
}

export interface CompactAnalyzePayload {
  rawPreference: string
  quickGoal: AnalyzeInput['quickGoal']
  confirmedProducts: CompactProduct[]
  deterministicMetrics: Array<{
    product: string
    name: string
    per100?: CompactProduct['per100']
    perPackage?: CompactProduct['perPackage']
    efficiency?: CompactProduct['efficiency']
    currentBudgets?: CompactProduct['currentBudgets']
  }>
  availableDimensions: string[]
  missingDimensions: string[]
  localComparison: AnalyzeInput['localComparison']
  safetyBoundary: string
  requestFingerprint: string
  goal: {
    key: AnalyzeGoal
    label: string
    preferred?: string
  }
  budgets: {
    caloriesKcal?: string
    proteinG?: string
    priceCny?: string
  }
  products: CompactProduct[]
  rankings: Array<{
    label: string
    order: Array<{ name: string; displayValue: string }>
  }>
  claimChecks: Array<{
    product: string
    name: string
    status: string
    observations: AnalyzeClaimObservation[]
  }>
  insufficient: string[]
  customRequirements?: {
    original: string
    constraints: Array<{
      kind: AnalyzeCustomRequirementKind
      label: string
      value?: string
      term?: string
      basis: string
    }>
    matches: Array<{
      requirement: string
      products: Array<{
        product: string
        name: string
        status: string
        evidence: string
      }>
    }>
    productSummaries: Array<{
      product: string
      name: string
      status: string
      satisfied: number
      failed: number
      unknown: number
    }>
    unresolvedPreferences: string[]
    noProductFullyMatches: boolean
    tradeoffs: string[]
  }
}

export interface CompactPayloadStats {
  originalCharacters: number
  compactCharacters: number
  estimatedTokens: number
  reductionPercent: number
}

export interface TaskInputSummary {
  goal: AnalyzeGoal
  productCount: number
  payloadStats: CompactPayloadStats
}

export type AnalyzeStreamEvent =
  | { type: 'progress'; message: string }
  | { type: 'result'; taskId: string; report: string }
  | { type: 'error'; message: string }

export interface AgentMessage {
  type?: string
  text?: string
  content?: unknown
  answer?: unknown
  result?: unknown
  say?: string
  ask?: string
  ts?: number
  partial?: boolean | number | string
  [key: string]: unknown
}

export interface ParsedSseEvent {
  event: string
  data: unknown
}
