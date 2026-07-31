import { describe, expect, it } from 'vitest'
import { calculateProduct, KJ_PER_KCAL, toNonNegativeNumber } from './calculations'
import { mockProducts } from '../data/mockProducts'

const budgets = { calories: '150', protein: '15', price: '10' }

describe('calculateProduct', () => {
  it('converts kJ and calculates package metrics deterministically', () => {
    const result = calculateProduct(mockProducts[0], budgets)
    expect(result.kcalPer100).toBeCloseTo(330 / KJ_PER_KCAL)
    expect(result.packageProtein).toBeCloseTo(18)
    expect(result.packageSodium).toBeCloseTo(130)
    expect(result.proteinCostPer10g).toBeCloseTo(8.9 / 18 * 10)
  })

  it('normalizes per-serving nutrition values', () => {
    const result = calculateProduct(
      {
        ...mockProducts[0],
        basis: 'perServing',
        servingSize: '40',
        energyUnit: 'kcal',
        energy: '80',
        protein: '6',
      },
      budgets,
    )
    expect(result.kcalPer100).toBeCloseTo(200)
    expect(result.proteinPer100).toBeCloseTo(15)
  })

  it('returns null for empty, invalid and zero-denominator calculations', () => {
    const result = calculateProduct(
      {
        ...mockProducts[0],
        netContent: '0',
        price: '0',
        protein: '0',
        energy: '',
      },
      budgets,
    )
    expect(result.packageCalories).toBeNull()
    expect(result.proteinCostPer10g).toBeNull()
    expect(result.gramsUnderCalorieBudget).toBeNull()
    expect(toNonNegativeNumber('oops')).toBeNull()
  })
})
