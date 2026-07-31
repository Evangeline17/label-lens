import { describe, expect, it } from 'vitest'
import { parseLabelOcrDetections } from './labelOcrParser'

function line(text: string, y: number, confidence = 98) {
  return {
    DetectedText: text,
    Confidence: confidence,
    ItemPolygon: { X: 10, Y: y, Width: 300, Height: 20 },
  }
}

describe('parseLabelOcrDetections', () => {
  it('preserves kJ and mg while recognizing a per-100g nutrition table', () => {
    const output = parseLabelOcrDetections({
      nutrition: [
        line('项目 每100g NRV%', 10),
        line('能量 320 kJ 4%', 40),
        line('蛋白质 9.0 g 15%', 70),
        line('钠 60 mg 3%', 100),
      ],
    })

    expect(output.result.nutritionBasis).toBe('per100g')
    expect(output.result.energyValue).toBe(320)
    expect(output.result.energyUnit).toBe('kJ')
    expect(output.result.sodium).toBe(60)
    expect(output.fieldSources.energyUnit?.[0].text).toContain('320 kJ')
    expect(output.fieldSources.sodium?.[0].text).toContain('60 mg')
  })

  it.each([
    ['每100mL', 'per100ml'],
    ['每份', 'perServing'],
  ] as const)('recognizes %s without changing its basis', (basisText, expected) => {
    const output = parseLabelOcrDetections({
      nutrition: [line(`营养成分表 ${basisText}`, 10)],
    })
    expect(output.result.nutritionBasis).toBe(expected)
  })

  it('returns null instead of guessing missing or unit-mismatched fields', () => {
    const output = parseLabelOcrDetections({
      ingredients: [line('配料表：生牛乳、乳酸菌', 10)],
      nutrition: [line('钠 60 g', 10), line('能量 数值模糊', 40, 60)],
    })

    expect(output.result.productName).toBeNull()
    expect(output.result.netContent).toBeNull()
    expect(output.result.energyValue).toBeNull()
    expect(output.result.energyUnit).toBeNull()
    expect(output.result.sodium).toBeNull()
    expect(output.result.ingredientsText).toBe('生牛乳、乳酸菌')
  })

  it('returns raw text, source lines, and low-confidence warnings', () => {
    const output = parseLabelOcrDetections({
      ingredients: [
        line('品名：原味酸奶', 10, 82),
        line('配料表：生牛乳、乳酸菌', 40),
        line('净含量：200 g', 70),
      ],
    })

    expect(output.rawText.ingredients).toContain('净含量：200 g')
    expect(output.result.productName).toBe('原味酸奶')
    expect(output.result.netContent).toBe(200)
    expect(output.result.netContentUnit).toBe('g')
    expect(output.fieldSources.productName?.[0]).toMatchObject({ confidence: 82 })
    expect(output.warnings.join('；')).toContain('商品名称来源行置信度较低')
  })
})
