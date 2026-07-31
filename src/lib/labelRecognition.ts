import type {
  LabelRecognitionDraft,
  LabelRecognitionResult,
  LabelRecognitionSession,
  PhotoPreview,
  Product,
} from '../types'

interface RecognitionStatusResponse {
  status:
    | 'processing'
    | 'completed'
    | 'failed'
    | 'not_found'
    | 'cancelled'
    | 'unknown'
  taskId: string
  createdAt?: string
  progress?: string
  result?: LabelRecognitionResult
  error?: string
  localWaitEnded?: boolean
  imageKinds?: Array<'ingredients' | 'nutrition'>
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

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) {
      return `服务端返回 HTTP ${response.status}：${body.error.trim()}`
    }
  } catch {
    // Fall back to the HTTP status.
  }
  return `服务端返回 HTTP ${response.status}，但没有提供可读的安全错误信息。`
}

async function recognitionFetch(
  input: string,
  init: RequestInit,
  action: 'submit' | 'status',
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(
      action === 'submit'
        ? '图片识别请求未到达后端。请确认本地 Node 服务已启动，并通过当前页面访问。'
        : '识别状态查询未到达后端。请确认本地 Node 服务仍在运行。',
    )
  }
}

function isRecognitionStatus(value: unknown): value is RecognitionStatusResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RecognitionStatusResponse>
  return (
    typeof candidate.taskId === 'string' &&
    ['processing', 'completed', 'failed', 'not_found', 'cancelled', 'unknown'].includes(
      String(candidate.status),
    )
  )
}

async function parseStatus(response: Response): Promise<RecognitionStatusResponse> {
  if (!response.ok) throw new Error(await responseError(response))
  const body: unknown = await response.json()
  if (!isRecognitionStatus(body)) throw new Error('服务端返回了未知的识别任务状态。')
  return body
}

export async function startLabelRecognition(
  ingredientPhoto?: PhotoPreview,
  nutritionPhoto?: PhotoPreview,
  signal?: AbortSignal,
): Promise<RecognitionStatusResponse> {
  const form = new FormData()
  if (ingredientPhoto) {
    form.append('ingredientsImage', ingredientPhoto.file, ingredientPhoto.file.name)
  }
  if (nutritionPhoto) {
    form.append('nutritionImage', nutritionPhoto.file, nutritionPhoto.file.name)
  }
  const response = await recognitionFetch('/api/ocr/label', {
    method: 'POST',
    headers: { 'x-label-lens-client-id': browserClientId() },
    body: form,
    signal,
  }, 'submit')
  return parseStatus(response)
}

export async function getLabelRecognitionStatus(
  taskId: string,
  signal?: AbortSignal,
): Promise<RecognitionStatusResponse> {
  const response = await recognitionFetch(
    `/api/recognize/status/${encodeURIComponent(taskId)}`,
    {
      method: 'GET',
      headers: { 'x-label-lens-client-id': browserClientId() },
      signal,
    },
    'status',
  )
  return parseStatus(response)
}

function draftNumber(value: number | null): string {
  return value === null ? '' : String(value)
}

export function recognitionResultToDraft(
  result: LabelRecognitionResult,
): LabelRecognitionDraft {
  return {
    productName: result.productName ?? '',
    ingredientsText: result.ingredientsText ?? '',
    netContent: draftNumber(result.netContent),
    netContentUnit: result.netContentUnit ?? '',
    nutritionBasis: result.nutritionBasis,
    servingSize: '',
    energyValue: draftNumber(result.energyValue),
    energyUnit: result.energyUnit ?? '',
    protein: draftNumber(result.protein),
    fat: draftNumber(result.fat),
    carbohydrate: draftNumber(result.carbohydrate),
    sodium: draftNumber(result.sodium),
  }
}

function validNumberText(value: string): string | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : null
}

export function applyRecognitionDraft(
  product: Product,
  draft: LabelRecognitionDraft,
): Product {
  const next = { ...product }
  if (draft.productName.trim()) next.name = draft.productName.trim()
  if (draft.ingredientsText.trim()) next.ingredients = draft.ingredientsText.trim()
  const netContent = validNumberText(draft.netContent)
  if (netContent !== null) next.netContent = netContent
  if (draft.netContentUnit) next.netUnit = draft.netContentUnit
  if (draft.nutritionBasis !== 'unknown') next.basis = draft.nutritionBasis
  const servingSize = validNumberText(draft.servingSize)
  if (servingSize !== null) next.servingSize = servingSize
  const energy = validNumberText(draft.energyValue)
  if (energy !== null) next.energy = energy
  if (draft.energyUnit) next.energyUnit = draft.energyUnit
  const protein = validNumberText(draft.protein)
  if (protein !== null) next.protein = protein
  const fat = validNumberText(draft.fat)
  if (fat !== null) next.fat = fat
  const carbs = validNumberText(draft.carbohydrate)
  if (carbs !== null) next.carbs = carbs
  const sodium = validNumberText(draft.sodium)
  if (sodium !== null) next.sodium = sodium
  return next
}

export function mergeRecognitionStatus(
  current: LabelRecognitionSession,
  response: RecognitionStatusResponse,
): LabelRecognitionSession {
  const status = response.status === 'cancelled' ? 'failed' : response.status
  return {
    ...current,
    status,
    stale: false,
    taskId: response.taskId,
    createdAt: response.createdAt ?? current.createdAt,
    progress: response.progress,
    result: response.result ?? current.result,
    draft:
      response.result && !current.draft
        ? recognitionResultToDraft(response.result)
        : current.draft,
    error: response.error,
    localWaitEnded: response.localWaitEnded,
    imageKinds: response.imageKinds ?? current.imageKinds,
  }
}

export function markRecognitionImagesChanged(
  session: LabelRecognitionSession,
): LabelRecognitionSession {
  const hasPreviousRecognition = Boolean(
    session.taskId ||
      session.result ||
      session.error ||
      session.stale ||
      session.status !== 'idle',
  )
  if (!hasPreviousRecognition) return session
  return {
    status: session.result ? 'completed' : 'idle',
    stale: true,
    result: session.result ? { ...session.result } : undefined,
    draft: session.draft ? { ...session.draft } : undefined,
    confirmedAt: session.confirmedAt,
    imageKinds: session.imageKinds ? [...session.imageKinds] : undefined,
  }
}

export function recognitionActionLabel(
  hasPhoto: boolean,
  session: LabelRecognitionSession,
): '识别当前商品标签' | '重新识别当前图片' | null {
  if (!hasPhoto || session.status === 'starting' || session.status === 'processing') {
    return null
  }
  return session.stale || session.status !== 'idle' || session.taskId || session.result
    ? '重新识别当前图片'
    : '识别当前商品标签'
}

export function canConfirmRecognition(session: LabelRecognitionSession): boolean {
  return session.status === 'completed' && Boolean(session.result) && !session.stale
}

export function abandonLabelRecognition(): LabelRecognitionSession {
  return { status: 'idle' }
}
