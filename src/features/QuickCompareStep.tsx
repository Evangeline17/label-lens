import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  ImagePlus,
  LoaderCircle,
  Plus,
  ScanText,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PhotoUpload } from '../components/PhotoUpload'
import { FieldShell, inputClass } from '../components/FormField'
import { createEmptyProduct } from '../data/mockProducts'
import {
  getLabelRecognitionStatus,
  markRecognitionImagesChanged,
  mergeRecognitionStatus,
  recognitionResultToDraft,
  startLabelRecognition,
} from '../lib/labelRecognition'
import { formatMetric } from '../lib/calculations'
import {
  applyReliableRecognitionDraft,
  getMissingRecognitionFields,
} from '../lib/quickComparison'
import type {
  CalculatedProduct,
  LabelRecognitionDraft,
  LabelRecognitionSession,
  Product,
} from '../types'

interface Props {
  products: Product[]
  calculated: CalculatedProduct[]
  recognitionSessions: Record<string, LabelRecognitionSession>
  onProductsChange: (products: Product[]) => void
  onRecognitionSessionChange: (productId: string, session: LabelRecognitionSession) => void
  onBack: () => void
  onReady: () => void
  onAdvanced: () => void
}

function productLetter(index: number) {
  return String.fromCharCode(65 + index)
}

function recognitionStatus(session: LabelRecognitionSession) {
  if (session.status === 'completed') return '已完成'
  if (session.status === 'starting' || session.status === 'processing') return '识别中'
  if (['failed', 'not_found', 'unknown'].includes(session.status)) return '需要重试'
  return '等待照片'
}

function updateDraft(
  session: LabelRecognitionSession,
  key: keyof LabelRecognitionDraft,
  value: string,
): LabelRecognitionSession {
  if (!session.result) return session
  return {
    ...session,
    draft: {
      ...(session.draft ?? recognitionResultToDraft(session.result)),
      [key]: value,
    },
    confirmedAt: undefined,
  }
}

export function QuickCompareStep({
  products,
  calculated,
  recognitionSessions,
  onProductsChange,
  onRecognitionSessionChange,
  onBack,
  onReady,
  onAdvanced,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [supplementingProductId, setSupplementingProductId] = useState<string | null>(null)
  const [manualOpenIds, setManualOpenIds] = useState<Record<string, boolean>>({})
  const pollingRef = useRef(false)
  const readySentRef = useRef(
    products.length >= 2 &&
      products.every((product) => {
        const session = recognitionSessions[product.id]
        return session?.status === 'completed' && Boolean(session.confirmedAt) && !session.stale
      }),
  )

  const updateProduct = (id: string, next: Product) => {
    onProductsChange(products.map((product) => (product.id === id ? next : product)))
  }

  const updatePhoto = (
    product: Product,
    field: 'ingredientPhoto' | 'nutritionPhoto',
    value: Product[typeof field],
  ) => {
    updateProduct(product.id, { ...product, [field]: value })
    onRecognitionSessionChange(
      product.id,
      markRecognitionImagesChanged(recognitionSessions[product.id] ?? { status: 'idle' }),
    )
    readySentRef.current = false
  }

  const applyCompletedSessions = (
    outcomes: Array<{ productId: string; session: LabelRecognitionSession }>,
  ) => {
    const byId = new Map(outcomes.map((outcome) => [outcome.productId, outcome.session]))
    let changed = false
    const nextProducts = products.map((product) => {
      const session = byId.get(product.id)
      if (!session?.draft || session.status !== 'completed') return product
      changed = true
      return applyReliableRecognitionDraft(product, session.draft)
    })
    if (changed) onProductsChange(nextProducts)
    outcomes.forEach(({ productId, session }) => {
      onRecognitionSessionChange(
        productId,
        session.status === 'completed'
          ? { ...session, confirmedAt: new Date().toISOString() }
          : session,
      )
    })
  }

  const startAll = async () => {
    const targets = products.filter((product) => {
      const session = recognitionSessions[product.id]
      return session?.status !== 'completed' || session.stale
    })
    if (
      submitting ||
      !targets.length ||
      targets.some((product) => !product.ingredientPhoto && !product.nutritionPhoto)
    ) {
      return
    }
    setSubmitting(true)
    readySentRef.current = false
    const outcomes = await Promise.all(
      targets.map(async (product) => {
        const starting: LabelRecognitionSession = {
          status: 'starting',
          progress: '正在提交包装照片',
          imageKinds: [
            ...(product.ingredientPhoto ? (['ingredients'] as const) : []),
            ...(product.nutritionPhoto ? (['nutrition'] as const) : []),
          ],
        }
        onRecognitionSessionChange(product.id, starting)
        try {
          const response = await startLabelRecognition(
            product.ingredientPhoto,
            product.nutritionPhoto,
          )
          return { productId: product.id, session: mergeRecognitionStatus(starting, response) }
        } catch (error) {
          return {
            productId: product.id,
            session: {
              status: 'failed' as const,
              error: error instanceof Error ? error.message : '图片识别暂时不可用。',
            },
          }
        }
      }),
    )
    applyCompletedSessions(outcomes)
    setSubmitting(false)
  }

  const processingKey = Object.entries(recognitionSessions)
    .filter(([, session]) => session.status === 'processing' && session.taskId)
    .map(([productId, session]) => `${productId}:${session.taskId}`)
    .sort()
    .join('|')

  useEffect(() => {
    const processing = Object.entries(recognitionSessions).filter(
      ([, session]) => session.status === 'processing' && session.taskId,
    )
    if (!processing.length) return
    const check = async () => {
      if (pollingRef.current) return
      pollingRef.current = true
      try {
        const outcomes = await Promise.all(
          processing.map(async ([productId, session]) => {
            try {
              const response = await getLabelRecognitionStatus(session.taskId!)
              return { productId, session: mergeRecognitionStatus(session, response) }
            } catch (error) {
              return {
                productId,
                session: {
                  ...session,
                  error: error instanceof Error ? error.message : '暂时无法查询识别状态。',
                },
              }
            }
          }),
        )
        applyCompletedSessions(outcomes)
      } finally {
        pollingRef.current = false
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 9_000)
    return () => window.clearInterval(timer)
    // Products and sessions are replaced by each completed status snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processingKey])

  useEffect(() => {
    const allCompleted =
      products.length >= 2 &&
      products.every((product) => {
        const session = recognitionSessions[product.id]
        return session?.status === 'completed' && Boolean(session.confirmedAt) && !session.stale
      })
    if (allCompleted && !readySentRef.current) {
      readySentRef.current = true
      onReady()
    }
  }, [onReady, products, recognitionSessions])

  const hasAllPhotos = products.every(
    (product) => {
      const session = recognitionSessions[product.id]
      return (
        (session?.status === 'completed' && !session.stale) ||
        product.ingredientPhoto ||
        product.nutritionPhoto
      )
    },
  )
  const hasRecognitionTargets = products.some((product) => {
    const session = recognitionSessions[product.id]
    return session?.status !== 'completed' || session.stale
  })
  const hasCompletedRecognition = products.some(
    (product) => recognitionSessions[product.id]?.status === 'completed',
  )
  const isRunning =
    submitting ||
    Object.values(recognitionSessions).some((session) =>
      ['starting', 'processing'].includes(session.status),
    )
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回首页"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-stone-200 bg-white text-stone-600"
        >
          <ArrowLeft size={19} aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.15em] text-orange">拍照比较</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">先放两款包装标签</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            每款至少添加一张清晰标签照片，准备好后统一识别。
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {products.map((product, index) => {
          const session = recognitionSessions[product.id] ?? { status: 'idle' as const }
          const metric = calculated.find((item) => item.id === product.id)
          const missing = getMissingRecognitionFields(session.draft)
          const completed = session.status === 'completed' && !session.stale
          return (
            <article key={product.id} className="rounded-3xl border border-stone-200 bg-white p-4 shadow-card sm:p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-sm font-black text-white">
                  {productLetter(index)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">
                    {product.name || `商品${productLetter(index)}`}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-stone-500">
                    识别状态：{recognitionStatus(session)}
                  </p>
                </div>
                {products.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onProductsChange(products.filter((item) => item.id !== product.id))}
                    aria-label={`删除商品${productLetter(index)}`}
                    className="grid h-9 w-9 place-items-center rounded-xl text-stone-400 hover:bg-brick/10 hover:text-brick"
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                )}
              </div>

              {!completed && (
                <div className="mt-4 space-y-3">
                  <PhotoUpload
                    id={`${product.id}-quick-photo-primary`}
                    label="添加包装标签照片"
                    preview={product.nutritionPhoto}
                    onChange={(preview) => updatePhoto(product, 'nutritionPhoto', preview)}
                  />
                  {product.nutritionPhoto && (
                    <PhotoUpload
                      id={`${product.id}-quick-photo-secondary`}
                      label="补充另一张标签照片（可选）"
                      preview={product.ingredientPhoto}
                      onChange={(preview) => updatePhoto(product, 'ingredientPhoto', preview)}
                    />
                  )}
                </div>
              )}

              {isRunning && session.status !== 'idle' && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-orange/10 p-3 text-sm font-bold text-orange">
                  <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
                  {session.progress ?? '正在识别包装标签'}
                </div>
              )}

              {session.error && (
                <p role="alert" className="mt-3 rounded-xl bg-brick/5 px-3 py-2 text-xs font-semibold leading-5 text-brick">
                  {session.error}
                </p>
              )}

              {completed && (
                <div className="mt-4">
                  <div className="rounded-2xl bg-leaf/5 p-4">
                    <p className="text-xs font-bold text-stone-500">
                      {product.netContent ? `${product.netContent}${product.netUnit}` : '净含量未识别'}｜
                      {metric?.packageCalories !== null
                        ? formatMetric(metric?.packageCalories, ' kcal/包')
                        : metric?.kcalPer100 !== null
                          ? formatMetric(metric?.kcalPer100, ' kcal/100单位')
                          : '能量未识别'}｜
                      {metric?.packageProtein !== null
                        ? formatMetric(metric?.packageProtein, 'g蛋白质/包')
                        : metric?.proteinPer100 !== null
                          ? formatMetric(metric?.proteinPer100, 'g蛋白质/100单位')
                          : '蛋白质未识别'}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-xs font-bold text-leaf">
                      <Check size={15} aria-hidden="true" />识别已完成
                    </p>
                  </div>

                  {missing.length > 0 && (
                    <div className="mt-3 rounded-2xl border border-orange/25 bg-orange/5 p-3">
                      <p className="flex items-center gap-2 text-sm font-black text-orange">
                        <CircleAlert size={17} aria-hidden="true" />
                        暂未识别：{missing.map((field) => field.label).join('、')}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-stone-600">
                        不影响先看已有可靠数据；需要时再补充。
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setSupplementingProductId(product.id)}
                          className="min-h-9 rounded-xl border border-orange/30 bg-white px-3 text-xs font-black text-orange"
                        >
                          补拍
                        </button>
                        <button
                          type="button"
                          onClick={() => setManualOpenIds((current) => ({ ...current, [product.id]: true }))}
                          className="min-h-9 rounded-xl border border-stone-300 bg-white px-3 text-xs font-black text-stone-700"
                        >
                          手动补充
                        </button>
                        <button
                          type="button"
                          onClick={onReady}
                          className="min-h-9 rounded-xl px-3 text-xs font-black text-leaf"
                        >
                          先看现有结果
                        </button>
                      </div>
                    </div>
                  )}

                  {supplementingProductId === product.id && (
                    <div className="mt-3 space-y-3 rounded-2xl border border-leaf/20 bg-leaf/5 p-3">
                      <p className="text-sm font-black text-leaf">补充包装照片</p>
                      <PhotoUpload
                        id={`${product.id}-supplement-nutrition`}
                        label="补拍营养成分表"
                        preview={product.nutritionPhoto}
                        onChange={(preview) => updatePhoto(product, 'nutritionPhoto', preview)}
                      />
                      <PhotoUpload
                        id={`${product.id}-supplement-ingredients`}
                        label="补拍配料表"
                        preview={product.ingredientPhoto}
                        onChange={(preview) => updatePhoto(product, 'ingredientPhoto', preview)}
                      />
                    </div>
                  )}

                  <details
                    open={Boolean(manualOpenIds[product.id])}
                    onToggle={(event) =>
                      setManualOpenIds((current) => ({
                        ...current,
                        [product.id]: event.currentTarget.open,
                      }))
                    }
                    className="group mt-3 rounded-2xl border border-stone-200 p-3"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black">
                      查看并修改识别结果
                      <ChevronDown size={17} className="transition group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="mt-3 rounded-xl bg-orange/10 px-3 py-2 text-xs font-semibold leading-5 text-orange">
                      图片识别可能有误，建议对照包装核查。
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {session.draft && (
                        <>
                          {([
                            ['productName', '商品名称'],
                            ['netContent', '净含量'],
                            ['netContentUnit', '净含量单位'],
                            ['nutritionBasis', '营养标示基准'],
                            ['energyValue', '能量数值'],
                            ['energyUnit', '能量单位'],
                            ['protein', '蛋白质（g）'],
                            ['fat', '脂肪（g）'],
                            ['carbohydrate', '碳水化合物（g）'],
                            ['sodium', '钠（mg）'],
                          ] as const).map(([key, label]) => (
                            <QuickRecognitionField
                              key={key}
                              productId={product.id}
                              field={key}
                              label={label}
                              draft={session.draft!}
                              onChange={(value) =>
                                onRecognitionSessionChange(product.id, updateDraft(session, key, value))
                              }
                            />
                          ))}
                          <div className="sm:col-span-2">
                            <FieldShell label="完整配料表" htmlFor={`${product.id}-quick-ingredients`}>
                              <textarea
                                id={`${product.id}-quick-ingredients`}
                                rows={3}
                                className={inputClass}
                                value={session.draft.ingredientsText}
                                onChange={(event) =>
                                  onRecognitionSessionChange(
                                    product.id,
                                    updateDraft(session, 'ingredientsText', event.target.value),
                                  )
                                }
                              />
                            </FieldShell>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!session.draft) return
                        updateProduct(product.id, applyReliableRecognitionDraft(product, session.draft))
                        onRecognitionSessionChange(product.id, {
                          ...session,
                          confirmedAt: new Date().toISOString(),
                        })
                      }}
                      className="mt-3 min-h-10 rounded-xl bg-ink px-4 text-xs font-black text-white"
                    >
                      保存修改
                    </button>
                  </details>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {products.length < 4 && (
        <button
          type="button"
          onClick={() => onProductsChange([...products, createEmptyProduct(products.length)])}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-400 bg-white/50 font-bold text-stone-600"
        >
          <Plus size={18} aria-hidden="true" />继续添加商品（最多4款）
        </button>
      )}

      <div className="sticky bottom-3 z-10 mt-6 rounded-3xl border border-stone-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:p-4">
        <button
          type="button"
          disabled={(hasRecognitionTargets && !hasAllPhotos) || isRunning}
          onClick={() => (hasRecognitionTargets ? void startAll() : onReady())}
          className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-orange px-6 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isRunning ? <LoaderCircle className="animate-spin" size={20} /> : <ScanText size={20} />}
          {isRunning
            ? '正在识别，请稍候'
            : hasRecognitionTargets
              ? hasCompletedRecognition
                ? '识别新增照片并更新比较'
                : '识别并开始比较'
              : '先看现有结果'}
        </button>
        {hasRecognitionTargets && !hasAllPhotos && (
          <p className="mt-2 text-center text-xs font-semibold text-stone-500">
            请先为每款商品添加至少一张照片
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onAdvanced}
        className="mx-auto mt-5 flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-stone-500"
      >
        <ImagePlus size={15} aria-hidden="true" />需要手动录入？进入高级比较模式
      </button>
    </div>
  )
}

function QuickRecognitionField({
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
  const id = `${productId}-quick-${field}`
  if (field === 'nutritionBasis') {
    return (
      <FieldShell label={label} htmlFor={id}>
        <select id={id} className={inputClass} value={draft[field]} onChange={(event) => onChange(event.target.value)}>
          <option value="unknown">请选择</option>
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
          <option value="">请选择</option>
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
