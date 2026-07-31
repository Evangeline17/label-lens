import type { Product } from '../types'

const base = {
  category: '酸奶/乳制品' as const,
  netUnit: 'g' as const,
  basis: 'per100g' as const,
  servingSize: '',
  energyUnit: 'kJ' as const,
}

export const mockProducts: Product[] = [
  {
    ...base,
    id: 'demo-a',
    name: '原味高蛋白酸奶',
    claims: '高蛋白、0蔗糖',
    ingredients: '生牛乳、乳清蛋白粉、乳酸菌、甜味剂',
    netContent: '200',
    price: '8.9',
    energy: '330',
    protein: '9.0',
    fat: '3.0',
    carbs: '5.5',
    sodium: '65',
  },
  {
    ...base,
    id: 'demo-b',
    name: '风味发酵乳',
    claims: '轻盈口感',
    ingredients: '生牛乳、白砂糖、果酱、乳粉、乳酸菌',
    netContent: '200',
    price: '5.5',
    energy: '410',
    protein: '3.2',
    fat: '3.1',
    carbs: '13.0',
    sodium: '75',
  },
  {
    ...base,
    id: 'demo-c',
    name: '低脂原味酸奶',
    claims: '低脂、简单配方',
    ingredients: '生牛乳、乳粉、乳酸菌',
    netContent: '180',
    price: '6.9',
    energy: '270',
    protein: '5.0',
    fat: '1.2',
    carbs: '7.0',
    sodium: '60',
  },
]

export function cloneMockProducts(): Product[] {
  return mockProducts.map((product) => ({
    ...product,
    id: `${product.id}-${crypto.randomUUID()}`,
  }))
}

export function createEmptyProduct(index: number): Product {
  return {
    id: crypto.randomUUID(),
    name: '',
    category: '酸奶/乳制品',
    claims: '',
    ingredients: '',
    netContent: '',
    netUnit: 'g',
    price: '',
    basis: 'per100g',
    servingSize: '',
    energy: '',
    energyUnit: 'kJ',
    protein: '',
    fat: '',
    carbs: '',
    sodium: '',
  }
}
