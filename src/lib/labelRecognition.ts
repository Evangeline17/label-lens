import type {
  LabelRecognitionDraft,
  LabelRecognitionResult,
  LabelRecognitionSession,
  LabelOcrOutput,
  PhotoPreview,
  Product,
} from '../types'

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
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new Error(
      '图片识别请求未到达后端。请确认本地 Node 服务已启动，并通过当前页面访问。',
    )
  }
}

function isLabelOcrOutput(value: unknown): value is LabelOcrOutput {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LabelOcrOutput>
  return (
    Boolean(candidate.result && typeof candidate.result === 'object') &&
    Boolean(candidate.rawText && typeof candidate.rawText === 'object') &&
    Boolean(candidate.fieldSources && typeof candidate.fieldSources === 'object') &&
    Array.isArray(candidate.warnings) &&
    Array.isArray(candidate.imageKinds)
  )
}

async function parseOcrOutput(response: Response): Promise<LabelOcrOutput> {
  if (!response.ok) throw new Error(await responseError(response))
  const body: unknown = await response.json()
  if (!isLabelOcrOutput(body)) throw new Error('服务端返回了未知的 OCR 结果结构。')
  return body
}

export async function startLabelRecognition(
  ingredientPhoto?: PhotoPreview,
  nutritionPhoto?: PhotoPreview,
  signal?: AbortSignal,
): Promise<LabelOcrOutput> {
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
  })
  return parseOcrOutput(response)
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
    servingSize: draftNumber(result.servingSize),
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

export function completedRecognitionSession(
  response: LabelOcrOutput,
): LabelRecognitionSession {
  return {
    status: 'completed',
    result: response.result,
    draft: recognitionResultToDraft(response.result),
    imageKinds: response.imageKinds,
    rawText: response.rawText,
    fieldSources: response.fieldSources,
    warnings: response.warnings,
  }
}

export function abandonLabelRecognition(): LabelRecognitionSession {
  return { status: 'idle' }
}
