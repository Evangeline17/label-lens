import type { Product } from '../types'

export function getInsufficientItems(products: Product[]): string[] {
  return products.flatMap((product) => {
    const fields: string[] = []
    if (!product.energy.trim()) fields.push('能量')
    if (!product.protein.trim()) fields.push('蛋白质')
    if (!product.fat.trim()) fields.push('脂肪')
    if (!product.sodium.trim()) fields.push('钠')
    if (!product.price.trim()) fields.push('价格')
    if (!product.ingredients.trim()) fields.push('配料表')
    return fields.length ? [`${product.name}：${fields.join('、')}`] : []
  })
}

