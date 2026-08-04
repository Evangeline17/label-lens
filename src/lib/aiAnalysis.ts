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
import type { QuickGoal, ProgressiveResultStatus } from './quickComparison'

export interface AiLocalComparison {
  status: ProgressiveResultStatus | 'advanced'
  preferredId: string | null
  compared: string[]
  summary: string
}

export interface AiAnalyzePayload {
  rawPreference: string
  quickGoal: QuickGoal | null
  confirmedProducts: Array<Omit<Product, 'ingredientPhoto' | 'nutritionPhoto'>>
  deterministicMetrics: CalculatedProduct[]
  availableDimensions: string[]
  missingDimensions: string[]
  localComparison: AiLocalComparison
  safetyBoundary: string
  requestFingerprint: string
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
  reportMode?: 'structured' | 'partial' | 'raw'
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
  reportMode?: 'structured' | 'partial' | 'raw'
}

export function aiAnalysisRequestKey(payload: AiAnalyzePayload): string {
  const { requestFingerprint: _requestFingerprint, ...fingerprintInput } = payload
  const serialized = JSON.stringify(fingerprintInput)
  let hash = 0x811c9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `v1-${(hash >>> 0).toString(16)}`
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
  quickGoal?: QuickGoal | null
  availableDimensions?: string[]
  missingDimensions?: string[]
  localComparison?: AiLocalComparison
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
  const confirmedProducts = parts.products.map(productWithoutPhotos)
  const base = {
    rawPreference: parts.customRequirementText,
    quickGoal: parts.quickGoal ?? null,
    confirmedProducts,
    deterministicMetrics: parts.calculated,
    availableDimensions: parts.availableDimensions ?? [],
    missingDimensions: parts.missingDimensions ?? parts.insufficient,
    localComparison: parts.localComparison ?? {
      status: 'advanced' as const,
      preferredId: parts.preferred?.id ?? null,
      compared: [],
      summary: parts.preferred
        ? `${parts.preferred.name}更符合当前确定性目标。`
        : '本地确定性比较未形成唯一首选。',
    },
    safetyBoundary: '不得提供医疗诊断、治疗方案或个性化医疗营养建议。',
    goal: parts.goal,
    budgets: { ...parts.budgets },
    products: confirmedProducts,
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
  const payload = { ...base, requestFingerprint: '' }
  return { ...payload, requestFingerprint: aiAnalysisRequestKey(payload) }
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
  const requestKey = aiAnalysisRequestKey(payload)
  if (activeAnalysisStart) {
    if (activeAnalysisStart.requestKey === requestKey) {
      return activeAnalysisStart.promise
    }
    try {
      await activeAnalysisStart.promise
    } catch {
      // A different request may start after the previous creation attempt settles.
    }
    return startAiAnalysis(payload, signal)
  }
  const promise = (async () => {
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
  })()
  activeAnalysisStart = { requestKey, promise }
  try {
    return await promise
  } finally {
    if (activeAnalysisStart?.promise === promise) activeAnalysisStart = null
  }
}

let activeAnalysisStart: {
  requestKey: string
  promise: Promise<AiTaskStatusResult>
} | null = null

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
