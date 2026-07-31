import { describe, expect, it } from 'vitest'
import {
  parseLabelRecognitionJson,
  RecognitionFormatError,
  validateLabelRecognitionResult,
} from './recognitionSchema'

function result(overrides: Record<string, unknown> = {}) {
  return {
    productName: '测试酸奶',
    ingredientsText: '生牛乳、乳酸菌',
    netContent: 200,
    netContentUnit: 'g',
    nutritionBasis: 'per100g',
    energyValue: 330,
    energyUnit: 'kJ',
    protein: 9,
    fat: 3,
    carbohydrate: 5.5,
    sodium: 65,
    ...overrides,
  }
}

describe('label recognition schema', () => {
  it.each([
    ['per100g', 'kJ'],
    ['per100ml', 'kcal'],
    ['perServing', 'kJ'],
  ])('preserves %s basis and %s energy without conversion', (basis, energyUnit) => {
    const parsed = validateLabelRecognitionResult(
      result({ nutritionBasis: basis, energyUnit, energyValue: 418.4 }),
    )

    expect(parsed.nutritionBasis).toBe(basis)
    expect(parsed.energyUnit).toBe(energyUnit)
    expect(parsed.energyValue).toBe(418.4)
  })

  it('preserves explicit null and unknown values for unreadable fields', () => {
    const parsed = validateLabelRecognitionResult(result({
      productName: null,
      ingredientsText: null,
      netContent: null,
      netContentUnit: null,
      nutritionBasis: 'unknown',
      energyValue: null,
      energyUnit: null,
      protein: null,
      fat: null,
      carbohydrate: null,
      sodium: null,
    }))

    expect(parsed.productName).toBeNull()
    expect(parsed.netContent).toBeNull()
    expect(parsed.nutritionBasis).toBe('unknown')
    expect(parsed.protein).toBeNull()
  })

  it('requires every contract key even when the value is unreadable', () => {
    const candidate = Object.fromEntries(
      Object.entries(result()).filter(([key]) => key !== 'protein'),
    )
    expect(() => validateLabelRecognitionResult(candidate)).toThrowError(/缺少必需字段/)
  })

  it('rejects illegal JSON and Markdown wrappers', () => {
    expect(() => parseLabelRecognitionJson('{bad json')).toThrowError(
      RecognitionFormatError,
    )
    expect(() =>
      parseLabelRecognitionJson('```json\n{"nutritionBasis":"unknown"}\n```'),
    ).toThrowError(/原始JSON/)
  })

  it('rejects extra fields and numeric strings', () => {
    expect(() =>
      validateLabelRecognitionResult(result({ price: 8.9 })),
    ).toThrowError(/未允许字段/)
    expect(() =>
      validateLabelRecognitionResult(result({ protein: '9.0' })),
    ).toThrowError(/非负有限数字/)
  })
})
