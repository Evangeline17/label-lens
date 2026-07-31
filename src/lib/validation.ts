import type { Budgets, FormErrors, Product } from '../types'

const numericFields: Array<[keyof Product, string]> = [
  ['netContent', '净含量'],
  ['price', '价格'],
  ['servingSize', '每份大小'],
  ['energy', '能量'],
  ['protein', '蛋白质'],
  ['fat', '脂肪'],
  ['carbs', '碳水化合物'],
  ['sodium', '钠'],
]

export function validateProduct(product: Product): FormErrors {
  const errors: FormErrors = {}
  if (!product.name.trim()) errors.name = '请填写商品名称'
  const net = Number(product.netContent)
  if (!product.netContent.trim()) errors.netContent = '请填写净含量'
  else if (!Number.isFinite(net) || net <= 0) errors.netContent = '净含量需大于0'

  numericFields.forEach(([field, label]) => {
    const raw = String(product[field] ?? '')
    if (!raw.trim()) return
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0) errors[String(field)] = `${label}需为不小于0的数字`
  })

  if (product.basis === 'perServing') {
    const serving = Number(product.servingSize)
    if (!product.servingSize.trim()) errors.servingSize = '按每份标示时必须填写每份大小'
    else if (!Number.isFinite(serving) || serving <= 0) errors.servingSize = '每份大小需大于0'
  }
  return errors
}

export function validateBudgets(budgets: Budgets): FormErrors {
  const errors: FormErrors = {}
  ;(
    [
      ['calories', '热量预算'],
      ['protein', '蛋白质目标'],
      ['price', '价格预算'],
    ] as const
  ).forEach(([field, label]) => {
    const value = Number(budgets[field])
    if (!budgets[field].trim()) return
    if (!Number.isFinite(value) || value < 0) errors[field] = `${label}需为不小于0的数字`
  })
  return errors
}

export function hasErrors(errors: FormErrors): boolean {
  return Object.values(errors).some(Boolean)
}
