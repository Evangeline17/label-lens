import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { calculateAll } from '../lib/calculations'
import { checkAllClaims } from '../lib/claimChecks'
import { evaluateCustomRequirements } from '../lib/customRequirements'
import { getRankingGroups } from '../lib/ranking'
import type { LabelRecognitionSession, Product } from '../types'
import { HomeScreen } from './HomeScreen'
import { ProductsStep } from './ProductsStep'
import { QuickCompareStep } from './QuickCompareStep'
import { QuickResults } from './QuickResults'

const budgets = { calories: '150', protein: '15', price: '10' }
const products: Product[] = [
  {
    id: 'a',
    name: '高蛋白酸奶',
    category: '酸奶/乳制品',
    claims: '',
    ingredients: '生牛乳、乳清蛋白粉',
    netContent: '200',
    netUnit: 'g',
    price: '8',
    basis: 'per100g',
    servingSize: '',
    energy: '300',
    energyUnit: 'kJ',
    protein: '9',
    fat: '3',
    carbs: '5',
    sodium: '60',
  },
  {
    id: 'b',
    name: '普通酸奶',
    category: '酸奶/乳制品',
    claims: '',
    ingredients: '生牛乳、白砂糖',
    netContent: '200',
    netUnit: 'g',
    price: '5',
    basis: 'per100g',
    servingSize: '',
    energy: '400',
    energyUnit: 'kJ',
    protein: '3',
    fat: '3.5',
    carbs: '12',
    sodium: '70',
  },
]

const calculated = calculateAll(products, budgets)
const rankings = getRankingGroups(calculated, budgets)
const claimChecks = checkAllClaims(products, calculated)
const customEvaluation = evaluateCustomRequirements([], products, calculated, budgets)
const noop = () => undefined

describe('photo-first product flow UI', () => {
  it('exposes photo comparison and demo as the two homepage primary actions', () => {
    const html = renderToStaticMarkup(
      <HomeScreen onStart={noop} onDemo={noop} onAdvanced={noop} />,
    )
    expect(html).toContain('拍照开始比较')
    expect(html).toContain('使用示例看看')
    expect(html).toContain('高级比较模式')
    expect(html).not.toContain('本次热量预算')
  })

  it('shows two lightweight photo cards and one unified recognition button', () => {
    const html = renderToStaticMarkup(
      <QuickCompareStep
        products={products.map((product) => ({ ...product, name: '' }))}
        calculated={calculated}
        recognitionSessions={{}}
        onProductsChange={noop}
        onRecognitionSessionChange={noop}
        onBack={noop}
        onReady={noop}
        onAdvanced={noop}
      />,
    )
    expect(html).toContain('商品A')
    expect(html).toContain('商品B')
    expect(html.match(/添加包装标签照片/g)).toHaveLength(2)
    expect(html.match(/识别并开始比较/g)).toHaveLength(1)
    expect(html).not.toContain('包装宣传语')
  })

  it('keeps full recognized fields inside a closed details element', () => {
    const sessions: Record<string, LabelRecognitionSession> = Object.fromEntries(
      products.map((product) => [
        product.id,
        {
          status: 'completed',
          confirmedAt: '2026-08-03T00:00:00.000Z',
          result: {
            productName: product.name,
            ingredientsText: product.ingredients,
            netContent: Number(product.netContent),
            netContentUnit: product.netUnit,
            nutritionBasis: product.basis,
            energyValue: Number(product.energy),
            energyUnit: product.energyUnit,
            protein: Number(product.protein),
            fat: Number(product.fat),
            carbohydrate: Number(product.carbs),
            sodium: Number(product.sodium),
          },
          draft: {
            productName: product.name,
            ingredientsText: product.ingredients,
            netContent: product.netContent,
            netContentUnit: product.netUnit,
            nutritionBasis: product.basis,
            servingSize: '',
            energyValue: product.energy,
            energyUnit: product.energyUnit,
            protein: product.protein,
            fat: product.fat,
            carbohydrate: product.carbs,
            sodium: product.sodium,
          },
        },
      ]),
    )
    const html = renderToStaticMarkup(
      <QuickCompareStep
        products={products}
        calculated={calculated}
        recognitionSessions={sessions}
        onProductsChange={noop}
        onRecognitionSessionChange={noop}
        onBack={noop}
        onReady={noop}
        onAdvanced={noop}
      />,
    )
    expect(html).toContain('<details class="group')
    expect(html).not.toContain('<details open=""')
    expect(html).toContain('图片识别可能有误，建议对照包装核查。')
  })

  it('renders the quick conclusion before closed detailed and AI sections', () => {
    const html = renderToStaticMarkup(
      <QuickResults
        products={products}
        calculated={calculated}
        claimChecks={claimChecks}
        rankings={rankings}
        quickGoal="protein"
        goal="proteinDensity"
        budgets={budgets}
        concernWords=""
        customRequirementText=""
        customRequirementRules={[]}
        unresolvedPreferences={[]}
        customRequirementEvaluation={customEvaluation}
        onQuickGoalChange={noop}
        onCustomRequirementTextChange={noop}
        onCustomRequirementRulesChange={noop}
        onEdit={noop}
        onRestart={noop}
      />,
    )
    expect(html.indexOf('快速比较结果')).toBeLessThan(html.indexOf('查看详细对比'))
    expect(html.indexOf('快速比较结果')).toBeLessThan(html.indexOf('查看完整AI分析'))
    expect(html).not.toContain('<details open=""')
  })

  it('keeps the original manual product entry step available', () => {
    const html = renderToStaticMarkup(
      <ProductsStep
        products={products}
        errors={{}}
        showValidationSummary={false}
        recognitionSessions={{}}
        onProductsChange={noop}
        onRecognitionSessionChange={noop}
        onLoadDemo={noop}
        onBack={noop}
        onNext={noop}
      />,
    )
    expect(html).toContain('录入 2—4 款食品')
    expect(html).toContain('包装宣传语')
    expect(html).toContain('检查标签数据')
  })
})
