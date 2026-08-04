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
import { QuickFullAnalysis } from './QuickFullAnalysis'
import { QuickRecognitionReview } from './QuickRecognitionReview'
import { QuickResults } from './QuickResults'
import { QuickFlowProgress } from '../components/QuickFlowProgress'

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
        recognitionQueue={{ pendingProductIds: [] }}
        onProductsChange={noop}
        onRecognitionSessionChange={noop}
        onRecognitionQueueChange={noop}
        onBack={noop}
        onReady={noop}
        onReview={noop}
        onAdvanced={noop}
      />,
    )
    expect(html).toContain('商品A')
    expect(html).toContain('商品B')
    expect(html.match(/添加包装标签照片/g)).toHaveLength(2)
    expect(html.match(/识别并开始比较/g)).toHaveLength(1)
    expect(html).not.toContain('包装宣传语')
  })

  it('renders upload, review, quick result, and full analysis as independent stages', () => {
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
    sessions[products[0].id] = {
      ...sessions[products[0].id],
      draft: { ...sessions[products[0].id].draft!, netContent: '' },
    }
    const uploadHtml = renderToStaticMarkup(
      <QuickCompareStep
        products={products}
        calculated={calculated}
        recognitionSessions={{}}
        recognitionQueue={{ pendingProductIds: [] }}
        onProductsChange={noop}
        onRecognitionSessionChange={noop}
        onRecognitionQueueChange={noop}
        onBack={noop}
        onReady={noop}
        onReview={noop}
        onAdvanced={noop}
      />,
    )
    const reviewHtml = renderToStaticMarkup(
      <QuickRecognitionReview
        products={products}
        sessions={sessions}
        onProductsChange={noop}
        onSessionChange={noop}
        onBack={noop}
        onContinue={noop}
      />,
    )
    const quickHtml = renderToStaticMarkup(
      <QuickResults
        products={products}
        calculated={calculated}
        claimChecks={claimChecks}
        rankings={rankings}
        quickGoal="protein"
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
        onContinue={noop}
        onSupplement={noop}
        aiTaskExists
      />,
    )
    const fullHtml = renderToStaticMarkup(
      <QuickFullAnalysis
        products={products}
        calculated={calculated}
        claimChecks={claimChecks}
        rankings={rankings}
        quickGoal="protein"
        budgets={budgets}
        customRequirementText=""
        customRequirementRules={[]}
        unresolvedPreferences={[]}
        customRequirementEvaluation={customEvaluation}
        onBack={noop}
        onRestart={noop}
      />,
    )

    expect(uploadHtml).toContain('当前步骤：上传照片')
    expect(uploadHtml).not.toContain('确认数据，查看比较结果')
    expect(reviewHtml).toContain('当前步骤：确认识别')
    expect(reviewHtml).toContain('只确认缺失或不明确的数据')
    expect(reviewHtml).not.toContain('快速比较结果')
    expect(quickHtml).toContain('当前步骤：快速结果')
    expect(quickHtml).not.toContain('InfiniSynapse综合建议')
    expect(quickHtml).not.toContain('分享卡')
    expect(fullHtml).toContain('当前步骤：完整分析')
    expect(fullHtml).toContain('详细数据对比')
    expect(fullHtml).toContain('分享卡')
    for (const html of [uploadHtml, reviewHtml, quickHtml, fullHtml]) {
      expect(html.match(/data-primary-action="true"/g)).toHaveLength(1)
    }
  })

  it('shows the next-step action before mounting full AI analysis', () => {
    const quickHtml = renderToStaticMarkup(
      <QuickResults
        products={products}
        calculated={calculated}
        claimChecks={claimChecks}
        rankings={rankings}
        quickGoal="protein"
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
        onContinue={noop}
        onSupplement={noop}
        aiTaskExists
      />,
    )
    expect(quickHtml).toContain('继续查看完整分析')
    expect(quickHtml).not.toContain('AI 综合选购建议')

    const fullHtml = renderToStaticMarkup(
      <QuickFullAnalysis
        products={products}
        calculated={calculated}
        claimChecks={claimChecks}
        rankings={rankings}
        quickGoal="protein"
        budgets={budgets}
        customRequirementText=""
        customRequirementRules={[]}
        unresolvedPreferences={[]}
        customRequirementEvaluation={customEvaluation}
        onBack={noop}
        onRestart={noop}
      />,
    )
    expect(fullHtml).toContain('AI 综合选购建议')
    expect(fullHtml).not.toContain('<details')
  })

  it('uses distinct primary actions for full, partial, and insufficient results', () => {
    const renderStatus = (statusProducts: Product[], goal: 'protein' | 'sodium') => {
      const statusCalculated = calculateAll(statusProducts, budgets)
      return renderToStaticMarkup(
        <QuickResults
          products={statusProducts}
          calculated={statusCalculated}
          claimChecks={checkAllClaims(statusProducts, statusCalculated)}
          rankings={getRankingGroups(statusCalculated, budgets)}
          quickGoal={goal}
          budgets={budgets}
          concernWords=""
          customRequirementText=""
          customRequirementRules={[]}
          unresolvedPreferences={[]}
          customRequirementEvaluation={evaluateCustomRequirements([], statusProducts, statusCalculated, budgets)}
          onQuickGoalChange={noop}
          onCustomRequirementTextChange={noop}
          onCustomRequirementRulesChange={noop}
          onEdit={noop}
          onContinue={noop}
          onRestart={noop}
          onSupplement={noop}
          aiTaskExists
        />,
      )
    }
    const full = renderStatus(products, 'protein')
    const partialProducts = products.map((product, index) =>
      index === 1 ? { ...product, sodium: '' } : product,
    )
    const partial = renderStatus(partialProducts, 'sodium')
    const insufficientProducts = products.map((product) => ({
      ...product,
      ingredients: '',
      netContent: '',
      price: '',
      energy: '',
      protein: '',
      fat: '',
      carbs: '',
      sodium: '',
    }))
    const insufficient = renderStatus(insufficientProducts, 'protein')

    expect(full).toContain('继续查看完整分析')
    expect(partial).toContain('继续查看现有完整分析')
    expect(partial).toContain('补充数据')
    expect(insufficient).toContain('补拍最需要的标签照片')
    expect(insufficient).not.toContain('继续查看完整分析')
    for (const html of [full, partial, insufficient]) {
      expect(html.match(/data-primary-action="true"/g)).toHaveLength(1)
    }
  })

  it('keeps the progress and next action legible at 390px', () => {
    const html = renderToStaticMarkup(<QuickFlowProgress current="quick-result" />)
    expect(html).toContain('data-mobile-width="390"')
    expect(html).toContain('当前步骤：快速结果')
    expect(html).toContain('grid-cols-4')
    expect(html).toContain('truncate')
  })

  it('uses comprehensive comparison for vague wellness and keeps medical context bounded', () => {
    const html = renderToStaticMarkup(
      <QuickResults
        products={products}
        calculated={calculated}
        claimChecks={claimChecks}
        rankings={rankings}
        quickGoal={null}
        budgets={budgets}
        concernWords=""
        customRequirementText="想要健康一点，我最近感冒了"
        customRequirementRules={[]}
        unresolvedPreferences={['想要健康一点', '我最近感冒了']}
        customRequirementEvaluation={customEvaluation}
        onQuickGoalChange={noop}
        onCustomRequirementTextChange={noop}
        onCustomRequirementRulesChange={noop}
        onEdit={noop}
        onSupplement={noop}
        onContinue={noop}
        onRestart={noop}
        aiTaskExists
      />,
    )

    expect(html).toContain('已按综合差异进行比较。')
    expect(html).toContain('你提到的身体状况不会被用于生成医疗或治疗建议。')
    expect(html).toContain('只看综合差异')
    expect(html).not.toContain('aria-pressed="true"')
    expect(html).not.toContain('控制本次热量')
  })

  it('keeps partial AI available and blocks it only for insufficient comparisons', () => {
    const partialProducts = products.map((product, index) =>
      index === 1 ? { ...product, sodium: '' } : product,
    )
    const partialCalculated = calculateAll(partialProducts, budgets)
    const partialHtml = renderToStaticMarkup(
      <QuickFullAnalysis
        products={partialProducts}
        calculated={partialCalculated}
        claimChecks={checkAllClaims(partialProducts, partialCalculated)}
        rankings={getRankingGroups(partialCalculated, budgets)}
        quickGoal="sodium"
        budgets={budgets}
        customRequirementText=""
        customRequirementRules={[]}
        unresolvedPreferences={[]}
        customRequirementEvaluation={evaluateCustomRequirements([], partialProducts, partialCalculated, budgets)}
        onBack={noop}
        onRestart={noop}
      />,
    )
    const insufficientProducts = products.map((product) => ({
      ...product,
      ingredients: '',
      netContent: '',
      price: '',
      energy: '',
      protein: '',
      fat: '',
      carbs: '',
      sodium: '',
    }))
    const insufficientCalculated = calculateAll(insufficientProducts, budgets)
    const insufficientHtml = renderToStaticMarkup(
      <QuickFullAnalysis
        products={insufficientProducts}
        calculated={insufficientCalculated}
        claimChecks={checkAllClaims(insufficientProducts, insufficientCalculated)}
        rankings={getRankingGroups(insufficientCalculated, budgets)}
        quickGoal="overall"
        budgets={budgets}
        customRequirementText=""
        customRequirementRules={[]}
        unresolvedPreferences={[]}
        customRequirementEvaluation={evaluateCustomRequirements([], insufficientProducts, insufficientCalculated, budgets)}
        onBack={noop}
        onRestart={noop}
      />,
    )

    expect(partialHtml).toContain('AI 综合选购建议')
    expect(partialHtml).toContain('本次重点：低钠')
    expect(insufficientHtml).not.toContain('AI 综合选购建议')
    expect(insufficientHtml).toContain('还没有共同可比较指标')
    expect(insufficientHtml).toContain('分享卡')
  })

  it('uses the same comprehensive goal in quick and full views without an empty requirement card', () => {
    const quickHtml = renderToStaticMarkup(
      <QuickResults
        products={products}
        calculated={calculated}
        claimChecks={claimChecks}
        rankings={rankings}
        quickGoal="overall"
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
        onSupplement={noop}
        onContinue={noop}
        onRestart={noop}
        aiTaskExists
      />,
    )
    const fullHtml = renderToStaticMarkup(
      <QuickFullAnalysis
        products={products}
        calculated={calculated}
        claimChecks={claimChecks}
        rankings={rankings}
        quickGoal="overall"
        budgets={budgets}
        customRequirementText=""
        customRequirementRules={[]}
        unresolvedPreferences={[]}
        customRequirementEvaluation={customEvaluation}
        onBack={noop}
        onRestart={noop}
      />,
    )

    expect(quickHtml).toContain('只看综合差异')
    expect(fullHtml).toContain('本次按综合差异进行比较')
    expect(fullHtml).not.toContain('控制本次热量')
    expect(fullHtml).not.toContain('我的要求匹配情况')
  })

  it('shows serial recognition position and completed summaries as each product updates', () => {
    const firstHtml = renderToStaticMarkup(
      <QuickCompareStep
        products={products}
        calculated={calculated}
        recognitionSessions={{
          a: { status: 'processing' },
          b: { status: 'queued' },
        }}
        recognitionQueue={{ current: { productId: 'a' }, pendingProductIds: ['b'] }}
        onProductsChange={noop}
        onRecognitionSessionChange={noop}
        onRecognitionQueueChange={noop}
        onBack={noop}
        onReady={noop}
        onReview={noop}
        onAdvanced={noop}
      />,
    )
    const secondHtml = renderToStaticMarkup(
      <QuickCompareStep
        products={products}
        calculated={calculated}
        recognitionSessions={{
          a: { status: 'completed', confirmedAt: '2026-08-04T00:00:00.000Z' },
          b: { status: 'processing' },
        }}
        recognitionQueue={{ current: { productId: 'b' }, pendingProductIds: [] }}
        onProductsChange={noop}
        onRecognitionSessionChange={noop}
        onRecognitionQueueChange={noop}
        onBack={noop}
        onReady={noop}
        onReview={noop}
        onAdvanced={noop}
      />,
    )

    expect(firstHtml).toContain('正在识别商品A（1/2）')
    expect(firstHtml).toContain('商品B等待识别')
    expect(firstHtml).toContain('请不要重复提交，完成后会自动继续')
    expect(secondHtml).toContain('商品A识别完成')
    expect(secondHtml).toContain('已识别摘要')
    expect(secondHtml).toContain('正在识别商品B（2/2）')
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
