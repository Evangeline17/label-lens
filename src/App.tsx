import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { StepProgress } from './components/StepProgress'
import { createEmptyProduct, cloneMockProducts } from './data/mockProducts'
import { GoalStep } from './features/GoalStep'
import { HomeScreen } from './features/HomeScreen'
import { ProductsStep } from './features/ProductsStep'
import { QuickCompareStep } from './features/QuickCompareStep'
import { QuickFullAnalysis } from './features/QuickFullAnalysis'
import { QuickRecognitionReview } from './features/QuickRecognitionReview'
import { QuickResults } from './features/QuickResults'
import { ResultsStep } from './features/ResultsStep'
import { ReviewStep } from './features/ReviewStep'
import { calculateAll } from './lib/calculations'
import { checkAllClaims } from './lib/claimChecks'
import {
  evaluateCustomRequirements,
  parseCustomRequirements,
} from './lib/customRequirements'
import { getPreferredProduct, getRankingGroups } from './lib/ranking'
import type { QuickGoal } from './lib/quickComparison'
import {
  clearLabelLensSession,
  loadLabelLensSession,
  saveAppSession,
} from './lib/sessionState'
import { hasErrors, validateBudgets, validateProduct } from './lib/validation'
import type {
  Budgets,
  ComparisonGoal,
  CustomRequirementRule,
  FormErrors,
  LabelRecognitionSession,
  LabelRecognitionQueueSnapshot,
  Product,
} from './types'

const initialBudgets: Budgets = {
  calories: '150',
  protein: '15',
  price: '10',
}

type AppView =
  | 'home'
  | 'quick-upload'
  | 'quick-review'
  | 'quick-result'
  | 'quick-analysis'
  | 'advanced'

function restoredView(flow: string | undefined): AppView {
  if (flow === 'quick-capture') return 'quick-upload'
  if (flow === 'quick-results') return 'quick-result'
  if (
    flow === 'home' ||
    flow === 'quick-upload' ||
    flow === 'quick-review' ||
    flow === 'quick-result' ||
    flow === 'quick-analysis' ||
    flow === 'advanced'
  ) {
    return flow
  }
  return flow ? 'advanced' : 'home'
}

function demoRecognitionSessions(
  products: Product[],
): Record<string, LabelRecognitionSession> {
  return Object.fromEntries(
    products.map((product) => {
      const result = {
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
      }
      return [
        product.id,
        {
          status: 'completed' as const,
          result,
          draft: {
            productName: product.name,
            ingredientsText: product.ingredients,
            netContent: product.netContent,
            netContentUnit: product.netUnit,
            nutritionBasis: product.basis,
            servingSize: product.servingSize,
            energyValue: product.energy,
            energyUnit: product.energyUnit,
            protein: product.protein,
            fat: product.fat,
            carbohydrate: product.carbs,
            sodium: product.sodium,
          },
          confirmedAt: new Date().toISOString(),
          imageKinds: ['ingredients', 'nutrition'] as Array<'ingredients' | 'nutrition'>,
        },
      ]
    }),
  )
}

export default function App() {
  const [restoredApp] = useState(() => loadLabelLensSession()?.app)
  const [view, setView] = useState<AppView>(
    restoredView(restoredApp?.flow),
  )
  const [step, setStep] = useState(restoredApp?.step ?? 1)
  const [quickGoal, setQuickGoal] = useState<QuickGoal | null>(
    restoredApp?.quickGoal ?? null,
  )
  const [goal, setGoal] = useState<ComparisonGoal>(
    restoredApp?.goal ?? 'proteinDensity',
  )
  const [budgets, setBudgets] = useState<Budgets>(
    restoredApp?.budgets ?? initialBudgets,
  )
  const [concernWords, setConcernWords] = useState(restoredApp?.concernWords ?? '')
  const [customRequirementText, setCustomRequirementText] = useState(
    restoredApp?.customRequirementText ?? '',
  )
  const [customRequirementRules, setCustomRequirementRules] = useState<
    CustomRequirementRule[]
  >(restoredApp?.customRequirementRules ?? [])
  const [unresolvedPreferences, setUnresolvedPreferences] = useState<string[]>(
    restoredApp?.unresolvedPreferences ?? [],
  )
  const [products, setProducts] = useState<Product[]>(
    restoredApp?.products ?? [createEmptyProduct(0), createEmptyProduct(1)],
  )
  const [recognitionSessions, setRecognitionSessions] = useState<
    Record<string, LabelRecognitionSession>
  >(restoredApp?.recognitionSessions ?? {})
  const [recognitionQueue, setRecognitionQueue] = useState<LabelRecognitionQueueSnapshot>(
    restoredApp?.recognitionQueue ?? { pendingProductIds: [] },
  )
  const [reviewAllRecognitionFields, setReviewAllRecognitionFields] = useState(false)
  const [showProductValidation, setShowProductValidation] = useState(false)
  const skipNextSessionSaveRef = useRef(false)

  const budgetErrors = useMemo(() => validateBudgets(budgets), [budgets])
  const allProductErrors = useMemo(
    () =>
      Object.fromEntries(
        products.map((product) => [product.id, validateProduct(product)]),
      ) as Record<string, FormErrors>,
    [products],
  )
  const visibleProductErrors = showProductValidation ? allProductErrors : {}
  const calculated = useMemo(() => calculateAll(products, budgets), [products, budgets])
  const claimChecks = useMemo(
    () => checkAllClaims(products, calculated),
    [products, calculated],
  )
  const rankings = useMemo(
    () => getRankingGroups(calculated, budgets),
    [calculated, budgets],
  )
  const preferred = useMemo(
    () => getPreferredProduct(goal, products, rankings, claimChecks),
    [goal, products, rankings, claimChecks],
  )
  const customRequirementEvaluation = useMemo(
    () =>
      evaluateCustomRequirements(
        customRequirementRules,
        products,
        calculated,
        budgets,
      ),
    [budgets, calculated, customRequirementRules, products],
  )

  useEffect(() => {
    if (skipNextSessionSaveRef.current) {
      skipNextSessionSaveRef.current = false
      return
    }
    saveAppSession({
      flow: view,
      quickGoal,
      step,
      goal,
      budgets,
      concernWords,
      customRequirementText,
      customRequirementRules,
      unresolvedPreferences,
      customRequirementEvaluation,
      products,
      calculated,
      rankings,
      claimChecks,
      preferred: preferred ? { id: preferred.id, name: preferred.name } : null,
      recognitionSessions,
      recognitionQueue,
    })
  }, [
    budgets,
    calculated,
    claimChecks,
    concernWords,
    customRequirementEvaluation,
    customRequirementRules,
    customRequirementText,
    goal,
    preferred,
    products,
    quickGoal,
    recognitionSessions,
    recognitionQueue,
    rankings,
    step,
    unresolvedPreferences,
    view,
  ])

  const nextFromGoal = () => {
    if (hasErrors(budgetErrors)) return
    setStep(2)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const nextFromProducts = () => {
    setShowProductValidation(true)
    if (
      products.length < 2 ||
      Object.values(allProductErrors).some((errors) => hasErrors(errors))
    ) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setStep(3)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goTo = (nextStep: number) => {
    setStep(nextStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const changeProducts = (nextProducts: Product[]) => {
    const ids = new Set(nextProducts.map((product) => product.id))
    setProducts(nextProducts)
    setRecognitionSessions((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([productId]) => ids.has(productId)),
      ),
    )
    setRecognitionQueue((current) => ({
      current:
        current.current && ids.has(current.current.productId)
          ? current.current
          : undefined,
      pendingProductIds: current.pendingProductIds.filter((productId) =>
        ids.has(productId),
      ),
    }))
  }

  const restart = () => {
    skipNextSessionSaveRef.current = true
    clearLabelLensSession()
    setStep(1)
    setGoal('proteinDensity')
    setBudgets(initialBudgets)
    setConcernWords('')
    setCustomRequirementText('')
    setCustomRequirementRules([])
    setUnresolvedPreferences([])
    setProducts([createEmptyProduct(0), createEmptyProduct(1)])
    setRecognitionSessions({})
    setRecognitionQueue({ pendingProductIds: [] })
    setShowProductValidation(false)
    setQuickGoal(null)
    setView('home')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startQuickCompare = () => {
    setProducts([createEmptyProduct(0), createEmptyProduct(1)])
    setRecognitionSessions({})
    setRecognitionQueue({ pendingProductIds: [] })
    setShowProductValidation(false)
    setQuickGoal(null)
    setView('quick-upload')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadQuickDemo = () => {
    const demoProducts = cloneMockProducts()
    changeProducts(demoProducts)
    setRecognitionSessions(demoRecognitionSessions(demoProducts))
    setQuickGoal(null)
    setView('quick-result')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const enterAdvanced = (targetStep = 1) => {
    setStep(targetStep)
    setView('advanced')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const changeQuickGoal = (nextGoal: QuickGoal) => {
    setQuickGoal(nextGoal)
  }

  const changeQuickPreference = (value: string) => {
    setCustomRequirementText(value)
    const parsed = parseCustomRequirements(value)
    setCustomRequirementRules(parsed.rules)
    setUnresolvedPreferences(parsed.unresolvedPreferences)
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <AppHeader />
      {view === 'advanced' && <StepProgress currentStep={step} />}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
        {view === 'home' && (
          <HomeScreen
            onStart={startQuickCompare}
            onDemo={loadQuickDemo}
            onAdvanced={() => enterAdvanced(1)}
          />
        )}
        {view === 'quick-upload' && (
          <QuickCompareStep
            products={products}
            calculated={calculated}
            recognitionSessions={recognitionSessions}
            recognitionQueue={recognitionQueue}
            onProductsChange={changeProducts}
            onRecognitionSessionChange={(productId, session) =>
              setRecognitionSessions((current) => ({ ...current, [productId]: session }))
            }
            onRecognitionQueueChange={setRecognitionQueue}
            onBack={() => setView('home')}
            onReady={() => {
              setView('quick-result')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onReview={() => {
              setReviewAllRecognitionFields(false)
              setView('quick-review')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onAdvanced={() => enterAdvanced(2)}
          />
        )}
        {view === 'quick-review' && (
          <QuickRecognitionReview
            products={products}
            sessions={recognitionSessions}
            onProductsChange={changeProducts}
            onSessionChange={(productId, session) =>
              setRecognitionSessions((current) => ({ ...current, [productId]: session }))
            }
            onBack={() => setView('quick-upload')}
            onContinue={() => {
              setView('quick-result')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            showAllFields={reviewAllRecognitionFields}
          />
        )}
        {view === 'quick-result' && (
          <QuickResults
            products={products}
            calculated={calculated}
            claimChecks={claimChecks}
            rankings={rankings}
            quickGoal={quickGoal}
            budgets={budgets}
            concernWords={concernWords}
            customRequirementText={customRequirementText}
            customRequirementRules={customRequirementRules}
            unresolvedPreferences={unresolvedPreferences}
            customRequirementEvaluation={customRequirementEvaluation}
            onQuickGoalChange={changeQuickGoal}
            onCustomRequirementTextChange={changeQuickPreference}
            onCustomRequirementRulesChange={setCustomRequirementRules}
            onEdit={() => {
              setReviewAllRecognitionFields(true)
              setView('quick-review')
            }}
            onSupplement={() => setView('quick-upload')}
            onContinue={() => {
              setView('quick-analysis')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onRestart={restart}
          />
        )}
        {view === 'quick-analysis' && (
          <QuickFullAnalysis
            products={products}
            calculated={calculated}
            claimChecks={claimChecks}
            rankings={rankings}
            quickGoal={quickGoal}
            budgets={budgets}
            customRequirementText={customRequirementText}
            customRequirementRules={customRequirementRules}
            unresolvedPreferences={unresolvedPreferences}
            customRequirementEvaluation={customRequirementEvaluation}
            onBack={() => setView('quick-result')}
            onRestart={restart}
          />
        )}
        {view === 'advanced' && step === 1 && (
          <GoalStep
            goal={goal}
            budgets={budgets}
            concernWords={concernWords}
            customRequirementText={customRequirementText}
            customRequirementRules={customRequirementRules}
            unresolvedPreferences={unresolvedPreferences}
            budgetErrors={budgetErrors}
            onGoalChange={setGoal}
            onBudgetsChange={setBudgets}
            onConcernWordsChange={setConcernWords}
            onCustomRequirementTextChange={(value) => {
              setCustomRequirementText(value)
              const parsed = parseCustomRequirements(value)
              setCustomRequirementRules(parsed.rules)
              setUnresolvedPreferences(parsed.unresolvedPreferences)
            }}
            onCustomRequirementRulesChange={setCustomRequirementRules}
            onNext={nextFromGoal}
          />
        )}
        {view === 'advanced' && step === 2 && (
          <ProductsStep
            products={products}
            errors={visibleProductErrors}
            showValidationSummary={
              showProductValidation &&
              Object.values(allProductErrors).some((errors) => hasErrors(errors))
            }
            recognitionSessions={recognitionSessions}
            onProductsChange={changeProducts}
            onRecognitionSessionChange={(productId, session) =>
              setRecognitionSessions((current) => ({
                ...current,
                [productId]: session,
              }))
            }
            onLoadDemo={() => {
              changeProducts(cloneMockProducts())
              setRecognitionSessions({})
              setShowProductValidation(false)
            }}
            onBack={() => goTo(1)}
            onNext={nextFromProducts}
          />
        )}
        {view === 'advanced' && step === 3 && (
          <ReviewStep
            products={products}
            calculated={calculated}
            goal={goal}
            budgets={budgets}
            customRequirementText={customRequirementText}
            customRequirementRules={customRequirementRules}
            unresolvedPreferences={unresolvedPreferences}
            onBack={() => goTo(2)}
            onEditRequirements={() => goTo(1)}
            onNext={() => goTo(4)}
          />
        )}
        {view === 'advanced' && step === 4 && (
          <ResultsStep
            products={products}
            calculated={calculated}
            claimChecks={claimChecks}
            rankings={rankings}
            preferred={preferred}
            goal={goal}
            budgets={budgets}
            concernWords={concernWords}
            customRequirementText={customRequirementText}
            customRequirementRules={customRequirementRules}
            unresolvedPreferences={unresolvedPreferences}
            customRequirementEvaluation={customRequirementEvaluation}
            onEdit={() => goTo(2)}
            onRestart={restart}
          />
        )}
      </main>
      <footer className="border-t border-stone-200/70 px-4 py-7 text-center text-xs leading-5 text-stone-500">
        标签真相局 · LabelLens
        <span className="mx-2 text-stone-300">/</span>
        本地前端原型
      </footer>
    </div>
  )
}
