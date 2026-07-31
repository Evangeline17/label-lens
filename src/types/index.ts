export type ComparisonGoal =
  | 'calories'
  | 'proteinDensity'
  | 'proteinValue'
  | 'sodium'
  | 'claims'
  | 'balance'

export type ProductCategory =
  | '酸奶/乳制品'
  | '面包/主食'
  | '蛋白棒/能量棒'
  | '饮料'
  | '零食'
  | '其他'

export type NutritionBasis = 'per100g' | 'per100ml' | 'perServing'
export type EnergyUnit = 'kJ' | 'kcal'
export type NetUnit = 'g' | 'mL'

export interface PhotoPreview {
  name: string
  dataUrl: string
  file: File
  size: number
}

export interface Product {
  id: string
  name: string
  category: ProductCategory
  claims: string
  ingredients: string
  netContent: string
  netUnit: NetUnit
  price: string
  basis: NutritionBasis
  servingSize: string
  energy: string
  energyUnit: EnergyUnit
  protein: string
  fat: string
  carbs: string
  sodium: string
  ingredientPhoto?: PhotoPreview
  nutritionPhoto?: PhotoPreview
}

export interface Budgets {
  calories: string
  protein: string
  price: string
}

export interface FormErrors {
  [field: string]: string | undefined
}

export interface CalculatedProduct {
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

export type ClaimSupportStatus = '标签数据较支持' | '支持有限' | '信息不足'

export interface ClaimObservation {
  claim: string
  status: ClaimSupportStatus
  detail: string
}

export interface ClaimCheckResult {
  productId: string
  productName: string
  status: ClaimSupportStatus
  observations: ClaimObservation[]
}

export interface IngredientObservation {
  firstThree: string[]
  count: number | null
  sugarTerms: string[]
  concernTerms: string[]
}

export type RankingKey =
  | 'calories'
  | 'proteinDensity'
  | 'proteinValue'
  | 'sodium'
  | 'servingFit'
  | 'balance'

export interface RankingItem {
  productId: string
  productName: string
  value: number | null
  displayValue: string
  rank: number | null
}

export interface RankingGroup {
  key: RankingKey
  label: string
  note: string
  items: RankingItem[]
}

export type CustomRequirementKind =
  | 'priceMax'
  | 'packageCaloriesMax'
  | 'per100gCaloriesMax'
  | 'packageProteinMin'
  | 'per100gProteinMin'
  | 'packageSodiumMax'
  | 'excludeIngredientTerm'
  | 'ingredientCountMax'
  | 'packageNearCalorieBudget'

export interface CustomRequirementRule {
  id: string
  kind: CustomRequirementKind
  original: string
  label: string
  value?: number
  term?: string
  unit?: string
  basis: string
}

export type RequirementMatchStatus = '满足' | '部分满足' | '不满足' | '无法判断'

export interface ProductRequirementMatch {
  productId: string
  productName: string
  status: Exclude<RequirementMatchStatus, '部分满足'>
  evidence: string
}

export interface RequirementRuleResult {
  rule: CustomRequirementRule
  products: ProductRequirementMatch[]
}

export interface ProductRequirementSummary {
  productId: string
  productName: string
  status: RequirementMatchStatus
  satisfiedCount: number
  failedCount: number
  unknownCount: number
}

export interface CustomRequirementEvaluation {
  ruleResults: RequirementRuleResult[]
  productSummaries: ProductRequirementSummary[]
  fullyMatchedProductIds: string[]
  noProductFullyMatches: boolean
  tradeoffs: string[]
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
  netContentUnit: NetUnit | null
  nutritionBasis: RecognitionNutritionBasis
  energyValue: number | null
  energyUnit: EnergyUnit | null
  protein: number | null
  fat: number | null
  carbohydrate: number | null
  sodium: number | null
}

export interface LabelRecognitionDraft {
  productName: string
  ingredientsText: string
  netContent: string
  netContentUnit: NetUnit | ''
  nutritionBasis: RecognitionNutritionBasis
  servingSize: string
  energyValue: string
  energyUnit: EnergyUnit | ''
  protein: string
  fat: string
  carbohydrate: string
  sodium: string
}

export type LabelRecognitionStatus =
  | 'idle'
  | 'starting'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'not_found'
  | 'unknown'

export interface LabelRecognitionSession {
  status: LabelRecognitionStatus
  stale?: boolean
  taskId?: string
  createdAt?: string
  progress?: string
  result?: LabelRecognitionResult
  draft?: LabelRecognitionDraft
  error?: string
  localWaitEnded?: boolean
  confirmedAt?: string
  imageKinds?: Array<'ingredients' | 'nutrition'>
}
