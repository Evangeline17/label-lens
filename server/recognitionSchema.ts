import type { LabelRecognitionResult } from './types.js'

const RESULT_KEYS = [
  'productName',
  'ingredientsText',
  'netContent',
  'netContentUnit',
  'nutritionBasis',
  'energyValue',
  'energyUnit',
  'protein',
  'fat',
  'carbohydrate',
  'sodium',
] as const

export class RecognitionFormatError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(`标签识别结果格式错误：${issues.join('；')}`)
    this.name = 'RecognitionFormatError'
    this.issues = issues
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function nullableText(
  value: unknown,
  label: string,
  maxLength: number,
  issues: string[],
): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') {
    issues.push(`${label}必须是字符串或null`)
    return null
  }
  const normalized = value.trim()
  if (normalized.length > maxLength) {
    issues.push(`${label}长度超过${maxLength}个字符`)
    return null
  }
  return normalized || null
}

function nullableNumber(
  value: unknown,
  label: string,
  issues: string[],
): number | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    issues.push(`${label}必须是非负有限数字或null`)
    return null
  }
  if (value > 1_000_000) {
    issues.push(`${label}数值超出允许范围`)
    return null
  }
  return value
}

function enumValue<T extends string>(
  value: unknown,
  label: string,
  allowed: readonly T[],
  fallback: T | null,
  issues: string[],
): T | null {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'string' && allowed.includes(value as T)) return value as T
  issues.push(`${label}不是允许的枚举值`)
  return fallback
}

export function validateLabelRecognitionResult(value: unknown): LabelRecognitionResult {
  if (!isRecord(value)) throw new RecognitionFormatError(['结果必须是JSON对象'])
  const issues: string[] = []
  const missingKeys = RESULT_KEYS.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  )
  if (missingKeys.length) issues.push(`缺少必需字段“${missingKeys[0]}”`)
  const extraKeys = Object.keys(value).filter(
    (key) => !RESULT_KEYS.includes(key as (typeof RESULT_KEYS)[number]),
  )
  if (extraKeys.length) issues.push(`包含未允许字段“${extraKeys[0]}”`)

  const result: LabelRecognitionResult = {
    productName: nullableText(value.productName, 'productName', 120, issues),
    ingredientsText: nullableText(
      value.ingredientsText,
      'ingredientsText',
      5_000,
      issues,
    ),
    netContent: nullableNumber(value.netContent, 'netContent', issues),
    netContentUnit: enumValue(
      value.netContentUnit,
      'netContentUnit',
      ['g', 'mL'] as const,
      null,
      issues,
    ),
    nutritionBasis:
      enumValue(
        value.nutritionBasis,
        'nutritionBasis',
        ['per100g', 'per100ml', 'perServing', 'unknown'] as const,
        'unknown',
        issues,
      ) ?? 'unknown',
    energyValue: nullableNumber(value.energyValue, 'energyValue', issues),
    energyUnit: enumValue(
      value.energyUnit,
      'energyUnit',
      ['kJ', 'kcal'] as const,
      null,
      issues,
    ),
    protein: nullableNumber(value.protein, 'protein', issues),
    fat: nullableNumber(value.fat, 'fat', issues),
    carbohydrate: nullableNumber(value.carbohydrate, 'carbohydrate', issues),
    sodium: nullableNumber(value.sodium, 'sodium', issues),
  }
  if (issues.length) throw new RecognitionFormatError([...new Set(issues)])
  return result
}

export function parseLabelRecognitionJson(text: string): LabelRecognitionResult {
  const normalized = text.replace(/^\uFEFF/, '').trim()
  if (!normalized.startsWith('{') || !normalized.endsWith('}')) {
    throw new RecognitionFormatError(['最终结果必须是原始JSON对象，不得包含Markdown或解释'])
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    throw new RecognitionFormatError(['最终结果不是合法JSON'])
  }
  return validateLabelRecognitionResult(parsed)
}
