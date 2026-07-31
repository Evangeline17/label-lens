import type {
  Budgets,
  CalculatedProduct,
  ClaimCheckResult,
  ComparisonGoal,
  CustomRequirementEvaluation,
  CustomRequirementRule,
  LabelRecognitionSession,
  Product,
  RankingGroup,
} from '../types'
import type { AiTaskStatus } from './aiAnalysis'

export const LABEL_LENS_SESSION_KEY = 'label-lens-session-v1'
const LEGACY_AI_TASK_KEY = 'label-lens-active-ai-task'

export interface SessionStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface StoredAppSession {
  step: number
  goal: ComparisonGoal
  budgets: Budgets
  concernWords: string
  customRequirementText: string
  customRequirementRules: CustomRequirementRule[]
  unresolvedPreferences: string[]
  customRequirementEvaluation: CustomRequirementEvaluation
  products: Array<Omit<Product, 'ingredientPhoto' | 'nutritionPhoto'>>
  calculated: CalculatedProduct[]
  rankings: RankingGroup[]
  claimChecks: ClaimCheckResult[]
  preferred: { id: string; name: string } | null
  recognitionBetaEnabled?: boolean
  recognitionSessions?: Record<string, LabelRecognitionSession>
}

export interface StoredAiSession {
  status: AiTaskStatus | 'idle' | 'starting'
  taskId?: string
  createdAt?: string
  progress?: string
  report?: string
  error?: string
  localWaitEnded?: boolean
  normalized?: boolean
  normalizationWarnings?: string[]
}

export interface LabelLensSession {
  version: 1
  app?: StoredAppSession
  ai?: StoredAiSession
}

function browserStorage(): SessionStorageLike | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function withoutPhotos(
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

function safeSession(value: unknown): LabelLensSession | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<LabelLensSession>
  if (candidate.version !== 1) return null
  const session = candidate as LabelLensSession
  if (session.app?.recognitionSessions) {
    session.app.recognitionSessions = Object.fromEntries(
      Object.entries(session.app.recognitionSessions).map(([productId, recognition]) => [
        productId,
        sanitizeRecognitionSession(recognition),
      ]),
    )
  }
  return session
}

function sanitizeRecognitionSession(
  session: LabelRecognitionSession,
): LabelRecognitionSession {
  if (session.status === 'completed' && session.result) {
    return {
      status: 'completed',
      result: { ...session.result },
      draft: session.draft ? { ...session.draft } : undefined,
      error: session.error,
      confirmedAt: session.confirmedAt,
      imageKinds: session.imageKinds ? [...session.imageKinds] : undefined,
      rawText: session.rawText ? { ...session.rawText } : undefined,
      fieldSources: session.fieldSources
        ? Object.fromEntries(
            Object.entries(session.fieldSources).map(([field, sources]) => [
              field,
              sources?.map((source) => ({ ...source })),
            ]),
          )
        : undefined,
      warnings: session.warnings ? [...session.warnings] : undefined,
    }
  }
  if (session.status === 'failed') {
    return { status: 'failed', error: session.error }
  }
  return { status: 'idle' }
}

export function loadLabelLensSession(
  storage: SessionStorageLike | null = browserStorage(),
): LabelLensSession | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(LABEL_LENS_SESSION_KEY)
    return raw ? safeSession(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function mergeSession(
  patch: Partial<LabelLensSession>,
  storage: SessionStorageLike | null,
): void {
  if (!storage) return
  const existing = loadLabelLensSession(storage) ?? { version: 1 as const }
  const next: LabelLensSession = { ...existing, ...patch, version: 1 }
  storage.setItem(LABEL_LENS_SESSION_KEY, JSON.stringify(next))
}

export function saveAppSession(
  app: Omit<StoredAppSession, 'products'> & { products: Product[] },
  storage: SessionStorageLike | null = browserStorage(),
): void {
  try {
    mergeSession(
      {
        app: {
          ...app,
          step: Math.min(4, Math.max(1, Math.trunc(app.step))),
          budgets: { ...app.budgets },
          customRequirementRules: app.customRequirementRules.map((rule) => ({ ...rule })),
          unresolvedPreferences: [...app.unresolvedPreferences],
          customRequirementEvaluation: {
            ...app.customRequirementEvaluation,
            ruleResults: app.customRequirementEvaluation.ruleResults.map((result) => ({
              rule: { ...result.rule },
              products: result.products.map((product) => ({ ...product })),
            })),
            productSummaries: app.customRequirementEvaluation.productSummaries.map(
              (summary) => ({ ...summary }),
            ),
            fullyMatchedProductIds: [
              ...app.customRequirementEvaluation.fullyMatchedProductIds,
            ],
            tradeoffs: [...app.customRequirementEvaluation.tradeoffs],
          },
          products: app.products.map(withoutPhotos),
          calculated: app.calculated.map((item) => ({
            ...item,
            formulas: { ...item.formulas },
          })),
          rankings: app.rankings.map((group) => ({
            ...group,
            items: group.items.map((item) => ({ ...item })),
          })),
          claimChecks: app.claimChecks.map((check) => ({
            ...check,
            observations: check.observations.map((observation) => ({ ...observation })),
          })),
          preferred: app.preferred ? { ...app.preferred } : null,
          recognitionBetaEnabled: app.recognitionBetaEnabled,
          recognitionSessions: Object.fromEntries(
            Object.entries(app.recognitionSessions ?? {}).map(([productId, session]) => [
              productId,
              sanitizeRecognitionSession(session),
            ]),
          ),
        },
      },
      storage,
    )
  } catch {
    // Quota or privacy-mode failures must not interrupt the comparison flow.
  }
}

export function saveAiSession(
  ai: StoredAiSession,
  storage: SessionStorageLike | null = browserStorage(),
): void {
  try {
    mergeSession({ ai: { ...ai } }, storage)
  } catch {
    // Session recovery is best effort.
  }
}

export function loadAiSession(
  storage: SessionStorageLike | null = browserStorage(),
): StoredAiSession | null {
  const current = loadLabelLensSession(storage)?.ai
  if (current) return current
  if (!storage) return null
  try {
    const raw = storage.getItem(LEGACY_AI_TASK_KEY)
    if (!raw) return null
    const legacy = JSON.parse(raw) as { taskId?: unknown; createdAt?: unknown }
    if (typeof legacy.taskId !== 'string' || typeof legacy.createdAt !== 'string') return null
    const migrated: StoredAiSession = {
      status: 'processing',
      taskId: legacy.taskId,
      createdAt: legacy.createdAt,
      progress: '正在恢复上次的分析任务',
    }
    saveAiSession(migrated, storage)
    storage.removeItem(LEGACY_AI_TASK_KEY)
    return migrated
  } catch {
    return null
  }
}

export function storedAiNeedsStatusQuery(ai: StoredAiSession | null): boolean {
  return Boolean(
    ai?.taskId &&
      !ai.report &&
      ['processing', 'unknown', 'starting'].includes(ai.status),
  )
}

export function clearLabelLensSession(
  storage: SessionStorageLike | null = browserStorage(),
): void {
  if (!storage) return
  try {
    storage.removeItem(LABEL_LENS_SESSION_KEY)
    storage.removeItem(LEGACY_AI_TASK_KEY)
  } catch {
    // Nothing else to clear.
  }
}
