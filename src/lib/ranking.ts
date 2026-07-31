import { formatCurrency, formatMetric, formatNumber } from './calculations'
import type {
  Budgets,
  CalculatedProduct,
  ClaimCheckResult,
  ComparisonGoal,
  Product,
  RankingGroup,
  RankingItem,
  RankingKey,
} from '../types'

interface RankingDefinition {
  key: Exclude<RankingKey, 'balance'>
  label: string
  note: string
  direction: 'asc' | 'desc'
  value: (item: CalculatedProduct) => number | null
  display: (item: CalculatedProduct) => string
}

function rankItems(
  calculated: CalculatedProduct[],
  definition: RankingDefinition,
): RankingItem[] {
  const valid = calculated
    .map((item) => ({ item, value: definition.value(item) }))
    .filter((entry): entry is { item: CalculatedProduct; value: number } => entry.value !== null)
    .sort((a, b) =>
      definition.direction === 'asc' ? a.value - b.value : b.value - a.value,
    )

  return calculated
    .map((item) => {
      const value = definition.value(item)
      const sortedIndex =
        value === null
          ? -1
          : valid.findIndex((entry) => Math.abs(entry.value - value) < 1e-8)
      return {
        productId: item.id,
        productName: item.name,
        value,
        displayValue: definition.display(item),
        rank: sortedIndex >= 0 ? sortedIndex + 1 : null,
      }
    })
    .sort((a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY))
}

export function getRankingGroups(
  calculated: CalculatedProduct[],
  budgets: Budgets,
): RankingGroup[] {
  const calorieBudget = Number(budgets.calories)
  const definitions: RankingDefinition[] = [
    {
      key: 'calories',
      label: '控制热量',
      note: '按每包装总热量由低到高',
      direction: 'asc',
      value: (item) => item.packageCalories,
      display: (item) => formatMetric(item.packageCalories, ' kcal'),
    },
    {
      key: 'proteinDensity',
      label: '蛋白质密度',
      note: '按每100千卡蛋白质由高到低',
      direction: 'desc',
      value: (item) => item.proteinPer100Kcal,
      display: (item) => formatMetric(item.proteinPer100Kcal, 'g/100 kcal'),
    },
    {
      key: 'proteinValue',
      label: '蛋白质性价比',
      note: '按每10g蛋白质成本由低到高',
      direction: 'asc',
      value: (item) => item.proteinCostPer10g,
      display: (item) => formatCurrency(item.proteinCostPer10g),
    },
    {
      key: 'sodium',
      label: '相对控制钠',
      note: '按每100单位钠由低到高',
      direction: 'asc',
      value: (item) => item.sodiumPer100,
      display: (item) => formatMetric(item.sodiumPer100, 'mg/100单位'),
    },
    {
      key: 'servingFit',
      label: '包装份量适配',
      note: '按整包热量与本次预算的接近程度',
      direction: 'asc',
      value: (item) =>
        item.packageCalories === null || !Number.isFinite(calorieBudget) || calorieBudget < 0
          ? null
          : Math.abs(item.packageCalories - calorieBudget),
      display: (item) =>
        item.packageCalories === null
          ? '—'
          : `整包 ${formatMetric(item.packageCalories, ' kcal')}`,
    },
  ]

  const groups: RankingGroup[] = definitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    note: definition.note,
    items: rankItems(calculated, definition),
  }))

  const rankTotals = new Map<string, { total: number; count: number }>()
  groups.forEach((group) => {
    group.items.forEach((item) => {
      if (item.rank === null) return
      const current = rankTotals.get(item.productId) ?? { total: 0, count: 0 }
      rankTotals.set(item.productId, {
        total: current.total + item.rank,
        count: current.count + 1,
      })
    })
  })
  const balanced = calculated
    .map((item) => {
      const total = rankTotals.get(item.id)
      const average = total && total.count === groups.length ? total.total / total.count : null
      return {
        productId: item.id,
        productName: item.name,
        value: average,
        displayValue: average === null ? '—' : `平均名次 ${formatNumber(average, 2)}`,
        rank: null,
      }
    })
    .sort((a, b) => (a.value ?? Number.POSITIVE_INFINITY) - (b.value ?? Number.POSITIVE_INFINITY))
    .map((item, index) => ({ ...item, rank: item.value === null ? null : index + 1 }))

  groups.push({
    key: 'balance',
    label: '综合平衡',
    note: '五项透明排名的平均名次，不是“健康总分”',
    items: balanced,
  })

  return groups
}

const goalToRanking: Record<Exclude<ComparisonGoal, 'claims'>, RankingKey> = {
  calories: 'calories',
  proteinDensity: 'proteinDensity',
  proteinValue: 'proteinValue',
  sodium: 'sodium',
  balance: 'balance',
}

export function getPreferredProduct(
  goal: ComparisonGoal,
  products: Product[],
  groups: RankingGroup[],
  claimChecks: ClaimCheckResult[],
): Product | null {
  let productId: string | undefined
  if (goal === 'claims') {
    const weight = { 标签数据较支持: 3, 支持有限: 2, 信息不足: 1 }
    productId = [...claimChecks].sort((a, b) => weight[b.status] - weight[a.status])[0]?.productId
  } else {
    productId = groups
      .find((group) => group.key === goalToRanking[goal])
      ?.items.find((item) => item.rank === 1)?.productId
  }
  return products.find((product) => product.id === productId) ?? null
}

export const goalLabels: Record<ComparisonGoal, string> = {
  calories: '控制本次热量',
  proteinDensity: '用更少热量获得更多蛋白质',
  proteinValue: '用更少的钱获得更多蛋白质',
  sodium: '相对控制钠',
  claims: '核对包装宣传',
  balance: '营养、份量和价格综合平衡',
}
