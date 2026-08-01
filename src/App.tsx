import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { StepProgress } from './components/StepProgress'
import { createEmptyProduct, cloneMockProducts } from './data/mockProducts'
import { GoalStep } from './features/GoalStep'
import { ProductsStep } from './features/ProductsStep'
import { ResultsStep } from './features/ResultsStep'
import { ReviewStep } from './features/ReviewStep'
import { calculateAll } from './lib/calculations'
import { checkAllClaims } from './lib/claimChecks'
import {
  evaluateCustomRequirements,
  parseCustomRequirements,
} from './lib/customRequirements'
import { getPreferredProduct, getRankingGroups } from './lib/ranking'
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
  Product,
} from './types'

const initialBudgets: Budgets = {
  calories: '150',
  protein: '15',
  price: '10',
}

export default function App() {
  const [restoredApp] = useState(() => loadLabelLensSession()?.app)
  const [step, setStep] = useState(restoredApp?.step ?? 1)
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
    recognitionSessions,
    rankings,
    step,
    unresolvedPreferences,
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
    setShowProductValidation(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <AppHeader />
      <StepProgress currentStep={step} />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-9">
        {step === 1 && (
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
        {step === 2 && (
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
        {step === 3 && (
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
        {step === 4 && (
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
