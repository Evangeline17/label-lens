import type {
  Budgets,
  CalculatedProduct,
  ClaimCheckResult,
  ComparisonGoal,
  CustomRequirementEvaluation,
  CustomRequirementRule,
  Product,
  RankingGroup,
} from '../types'

export interface AiAnalyzePayload {
  goal: ComparisonGoal
  budgets: Budgets
  products: Array<Omit<Product, 'ingredientPhoto' | 'nutritionPhoto'>>
  calculated: CalculatedProduct[]
  rankings: RankingGroup[]
  claimChecks: ClaimCheckResult[]
  insufficient: string[]
  preferred: { id: string; name: string } | null
  customRequirementText: string
  customRequirementRules: CustomRequirementRule[]
  customRequirementEvaluation: CustomRequirementEvaluation
  unresolvedPreferences: string[]
}

export interface AiAnalysisResult {
  taskId: string
  report: string
  normalized?: boolean
  normalizationWarnings?: string[]
}

export type AiTaskStatus =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'not_found'
  | 'cancelled'
  | 'format_error'
  | 'unknown'

export interface AiTaskStatusResult {
  status: AiTaskStatus
  taskId: string
  createdAt?: string
  progress?: string
  report?: string
  error?: string
  localWaitEnded?: boolean
  normalized?: boolean
  normalizationWarnings?: string[]
}

interface PayloadParts {
  goal: ComparisonGoal
  budgets: Budgets
  products: Product[]
  calculated: CalculatedProduct[]
  rankings: RankingGroup[]
  claimChecks: ClaimCheckResult[]
  insufficient: string[]
  preferred: Product | null
  customRequirementText: string
  customRequirementRules: CustomRequirementRule[]
  customRequirementEvaluation: CustomRequirementEvaluation
  unresolvedPreferences: string[]
}

function productWithoutPhotos(
  product: Product,
): Omit<Product, 'ingredientPhoto' | 'nutritionPhoto'> {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    claims: product.claims,
    ingredients: product.ingredients,
    netContent: product.netContent,
    netUnit: product.netUnit,
    price: product.price,
    basis: product.basis,
    servingSize: product.servingSize,
    energy: product.energy,
    energyUnit: product.energyUnit,
    protein: product.protein,
    fat: product.fat,
    carbs: product.carbs,
    sodium: product.sodium,
  }
}

export function buildAiAnalyzePayload(parts: PayloadParts): AiAnalyzePayload {
  return {
    goal: parts.goal,
    budgets: { ...parts.budgets },
    products: parts.products.map(productWithoutPhotos),
    calculated: parts.calculated,
    rankings: parts.rankings,
    claimChecks: parts.claimChecks,
    insufficient: parts.insufficient,
    preferred: parts.preferred
      ? { id: parts.preferred.id, name: parts.preferred.name }
      : null,
    customRequirementText: parts.customRequirementText,
    customRequirementRules: parts.customRequirementRules,
    customRequirementEvaluation: parts.customRequirementEvaluation,
    unresolvedPreferences: parts.unresolvedPreferences,
  }
}

function browserClientId(): string {
  const key = 'label-lens-client-id'
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const created = crypto.randomUUID()
    sessionStorage.setItem(key, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

function isTaskStatusResult(value: unknown): value is AiTaskStatusResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<AiTaskStatusResult>
  return (
    typeof result.taskId === 'string' &&
    [
      'processing',
      'completed',
      'failed',
      'not_found',
      'cancelled',
      'format_error',
      'unknown',
    ].includes(
      String(result.status),
    )
  )
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error
  } catch {
    // Fall through to the status-based message.
  }
  return `请求失败（HTTP ${response.status}）。`
}

async function parseTaskResponse(response: Response): Promise<AiTaskStatusResult> {
  if (!response.ok) throw new Error(await responseError(response))
  const body: unknown = await response.json()
  if (!isTaskStatusResult(body)) throw new Error('服务端返回了未知的任务状态。')
  return body
}

export async function startAiAnalysis(
  payload: AiAnalyzePayload,
  signal?: AbortSignal,
): Promise<AiTaskStatusResult> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-label-lens-client-id': browserClientId(),
    },
    body: JSON.stringify(payload),
    signal,
  })
  return parseTaskResponse(response)
}

export async function getAiAnalysisStatus(
  taskId: string,
  signal?: AbortSignal,
): Promise<AiTaskStatusResult> {
  const response = await fetch(`/api/analyze/status/${encodeURIComponent(taskId)}`, {
    method: 'GET',
    headers: { 'x-label-lens-client-id': browserClientId() },
    signal,
  })
  return parseTaskResponse(response)
}

export async function cancelAiAnalysis(
  taskId: string,
  signal?: AbortSignal,
): Promise<AiTaskStatusResult> {
  const response = await fetch(`/api/analyze/cancel/${encodeURIComponent(taskId)}`, {
    method: 'POST',
    headers: { 'x-label-lens-client-id': browserClientId() },
    signal,
  })
  return parseTaskResponse(response)
}
