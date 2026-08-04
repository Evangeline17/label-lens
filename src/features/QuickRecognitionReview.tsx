import { AlertCircle, ArrowLeft, Check } from 'lucide-react'
import { FieldShell, inputClass } from '../components/FormField'
import { QuickFlowProgress } from '../components/QuickFlowProgress'
import { recognitionResultToDraft } from '../lib/labelRecognition'
import {
  applyReliableRecognitionDraft,
  getMissingRecognitionFields,
} from '../lib/quickComparison'
import type {
  LabelRecognitionDraft,
  LabelRecognitionSession,
  Product,
} from '../types'

interface Props {
  products: Product[]
  sessions: Record<string, LabelRecognitionSession>
  onProductsChange: (products: Product[]) => void
  onSessionChange: (productId: string, session: LabelRecognitionSession) => void
  onBack: () => void
  onContinue: () => void
  showAllFields?: boolean
}

const editableFields: Array<{ key: keyof LabelRecognitionDraft; label: string }> = [
  { key: 'productName', label: '商品名称' },
  { key: 'nutritionBasis', label: '营养标示基准' },
  { key: 'energyValue', label: '能量' },
  { key: 'energyUnit', label: '能量单位' },
  { key: 'netContent', label: '净含量' },
  { key: 'netContentUnit', label: '净含量单位' },
  { key: 'protein', label: '蛋白质' },
  { key: 'sodium', label: '钠' },
]

function draftFor(session: LabelRecognitionSession): LabelRecognitionDraft | undefined {
  return session.draft ?? (session.result ? recognitionResultToDraft(session.result) : undefined)
}

export function QuickRecognitionReview({
  products,
  sessions,
  onProductsChange,
  onSessionChange,
  onBack,
  onContinue,
  showAllFields = false,
}: Props) {
  const updateField = (
    productId: string,
    field: keyof LabelRecognitionDraft,
    value: string,
  ) => {
    const session = sessions[productId]
    const draft = session && draftFor(session)
    if (!session || !draft) return
    onSessionChange(productId, {
      ...session,
      draft: { ...draft, [field]: value },
      confirmedAt: undefined,
    })
  }

  const confirm = () => {
    const nextProducts = products.map((product) => {
      const session = sessions[product.id]
      const draft = session && draftFor(session)
      return draft ? applyReliableRecognitionDraft(product, draft) : product
    })
    onProductsChange(nextProducts)
    products.forEach((product) => {
      const session = sessions[product.id]
      const draft = session && draftFor(session)
      if (!session || !draft) return
      onSessionChange(product.id, {
        ...session,
        draft,
        confirmedAt: new Date().toISOString(),
      })
    })
    onContinue()
  }

  return (
    <>
      <QuickFlowProgress current="review" />
      <main className="mx-auto max-w-3xl pb-28">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-stone-500"
        >
          <ArrowLeft size={16} aria-hidden="true" />返回补拍
        </button>
        <header>
          <p className="text-xs font-bold tracking-[0.15em] text-orange">确认识别</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">只确认缺失或不明确的数据</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            已明确的识别结果不重复展示；留空的项目会在结果中标记为暂不可比较。
          </p>
        </header>

        <div className="mt-5 space-y-4">
          {products.map((product, index) => {
            const session = sessions[product.id]
            const draft = session && draftFor(session)
            const fields = showAllFields ? editableFields : getMissingRecognitionFields(draft)
            if (!draft || !fields.length) return null
            return (
              <section
                key={product.id}
                className="rounded-3xl border border-orange/20 bg-white p-5 shadow-card"
              >
                <h2 className="font-black">
                  商品{String.fromCharCode(65 + index)} · {product.name || '未识别名称'}
                </h2>
                <p className="mt-2 flex items-start gap-2 rounded-xl bg-orange/10 px-3 py-2 text-xs font-semibold leading-5 text-orange">
                  <AlertCircle className="mt-0.5 shrink-0" size={15} aria-hidden="true" />
                  {showAllFields ? '可修改关键识别数据' : `需要确认：${fields.map((field) => field.label).join('、')}`}
                </p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {fields.map(({ key, label }) => (
                    <ReviewField
                      key={key}
                      productId={product.id}
                      field={key}
                      label={label}
                      draft={draft}
                      onChange={(value) => updateField(product.id, key, value)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            data-primary-action="true"
            onClick={confirm}
            className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-orange px-5 font-black text-white"
          >
            <Check size={18} aria-hidden="true" />确认数据，查看比较结果
          </button>
        </div>
      </div>
    </>
  )
}

function ReviewField({
  productId,
  field,
  label,
  draft,
  onChange,
}: {
  productId: string
  field: keyof LabelRecognitionDraft
  label: string
  draft: LabelRecognitionDraft
  onChange: (value: string) => void
}) {
  const id = `${productId}-review-${field}`
  if (field === 'nutritionBasis') {
    return (
      <FieldShell label={label} htmlFor={id}>
        <select id={id} className={inputClass} value={draft[field]} onChange={(event) => onChange(event.target.value)}>
          <option value="unknown">暂时无法确认</option>
          <option value="per100g">每100g</option>
          <option value="per100ml">每100mL</option>
          <option value="perServing">每份</option>
        </select>
      </FieldShell>
    )
  }
  if (field === 'netContentUnit' || field === 'energyUnit') {
    const options = field === 'netContentUnit' ? ['g', 'mL'] : ['kJ', 'kcal']
    return (
      <FieldShell label={label} htmlFor={id}>
        <select id={id} className={inputClass} value={draft[field]} onChange={(event) => onChange(event.target.value)}>
          <option value="">暂时无法确认</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </FieldShell>
    )
  }
  return (
    <FieldShell label={label} htmlFor={id}>
      <input
        id={id}
        inputMode={field === 'productName' ? undefined : 'decimal'}
        className={inputClass}
        value={draft[field]}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  )
}
