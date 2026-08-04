import {
  ArrowLeft,
  Ban,
  ImagePlus,
  LoaderCircle,
  Plus,
  ScanText,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PhotoUpload } from '../components/PhotoUpload'
import { QuickFlowProgress } from '../components/QuickFlowProgress'
import { createEmptyProduct } from '../data/mockProducts'
import {
  getLabelRecognitionStatus,
  markRecognitionImagesChanged,
  mergeRecognitionStatus,
  startLabelRecognition,
} from '../lib/labelRecognition'
import {
  clearRecognitionImages,
  loadRecognitionImages,
  saveRecognitionImages,
} from '../lib/recognitionImageStore'
import { RecognitionQueueCoordinator } from '../lib/recognitionQueue'
import {
  applyReliableRecognitionDraft,
  getMissingRecognitionFields,
} from '../lib/quickComparison'
import type {
  CalculatedProduct,
  LabelRecognitionQueueSnapshot,
  LabelRecognitionSession,
  Product,
} from '../types'

interface Props {
  products: Product[]
  calculated: CalculatedProduct[]
  recognitionSessions: Record<string, LabelRecognitionSession>
  recognitionQueue: LabelRecognitionQueueSnapshot
  onProductsChange: (products: Product[]) => void
  onRecognitionSessionChange: (productId: string, session: LabelRecognitionSession) => void
  onRecognitionQueueChange: (queue: LabelRecognitionQueueSnapshot) => void
  onBack: () => void
  onReady: () => void
  onReview: () => void
  onAdvanced: () => void
}

function productLetter(index: number) {
  return String.fromCharCode(65 + index)
}

function recognitionStatus(session: LabelRecognitionSession) {
  if (session.status === 'completed') return '已完成'
  if (session.status === 'starting' || session.status === 'processing') return '识别中'
  if (session.status === 'queued') return '等待识别'
  if (['failed', 'not_found', 'unknown'].includes(session.status)) return '需要重试'
  return '等待照片'
}

function initialRecognitionBatch(
  products: Product[],
  sessions: Record<string, LabelRecognitionSession>,
  queue: LabelRecognitionQueueSnapshot,
): string[] {
  const queued = [
    ...(queue.current ? [queue.current.productId] : []),
    ...queue.pendingProductIds,
  ]
  if (!queue.current) return [...new Set(queued)]
  const currentIndex = products.findIndex(
    (product) => product.id === queue.current?.productId,
  )
  const alreadyCompleted = products
    .slice(0, Math.max(0, currentIndex))
    .filter((product) => sessions[product.id]?.status === 'completed')
    .map((product) => product.id)
  return [...new Set([...alreadyCompleted, ...queued])]
}

function completedRecognitionSummary(product: Product): string {
  const fields = [
    product.energy.trim() ? `能量 ${product.energy}${product.energyUnit}` : '',
    product.protein.trim() ? `蛋白质 ${product.protein}g` : '',
    product.fat.trim() ? `脂肪 ${product.fat}g` : '',
    product.carbs.trim() ? `碳水 ${product.carbs}g` : '',
    product.sodium.trim() ? `钠 ${product.sodium}mg` : '',
  ].filter(Boolean)
  return fields.length
    ? `已识别摘要：${fields.slice(0, 3).join('、')}`
    : '识别已完成，标签结果已保存。'
}

export function QuickCompareStep({
  products,
  calculated,
  recognitionSessions,
  recognitionQueue,
  onProductsChange,
  onRecognitionSessionChange,
  onRecognitionQueueChange,
  onBack,
  onReady,
  onReview,
  onAdvanced,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [batchIds, setBatchIds] = useState(() =>
    initialRecognitionBatch(products, recognitionSessions, recognitionQueue),
  )
  const submissionLock = useRef(false)
  const batchIdsRef = useRef(batchIds)
  const recognitionStartedAtRef = useRef(new Map<string, number>())
  const loggedRecognitionDurationsRef = useRef(new Set<string>())
  const productsRef = useRef(products)
  const sessionsRef = useRef(recognitionSessions)
  const callbacksRef = useRef({
    onProductsChange,
    onRecognitionSessionChange,
    onRecognitionQueueChange,
  })
  productsRef.current = products
  sessionsRef.current = recognitionSessions
  callbacksRef.current = {
    onProductsChange,
    onRecognitionSessionChange,
    onRecognitionQueueChange,
  }
  const readySentRef = useRef(
    products.length >= 2 &&
      products.every((product) => {
        const session = recognitionSessions[product.id]
        return session?.status === 'completed' && Boolean(session.confirmedAt) && !session.stale
      }),
  )

  const updateProduct = (id: string, next: Product) => {
    const nextProducts = productsRef.current.map((product) =>
      product.id === id ? next : product,
    )
    productsRef.current = nextProducts
    callbacksRef.current.onProductsChange(nextProducts)
  }

  const updateSession = (productId: string, session: LabelRecognitionSession) => {
    sessionsRef.current = { ...sessionsRef.current, [productId]: session }
    callbacksRef.current.onRecognitionSessionChange(productId, session)
  }

  const recordRecognitionDuration = (productId: string, outcome: string) => {
    if (loggedRecognitionDurationsRef.current.has(productId)) return
    const startedAt = recognitionStartedAtRef.current.get(productId)
    if (startedAt === undefined) return
    loggedRecognitionDurationsRef.current.add(productId)
    const index = productsRef.current.findIndex((product) => product.id === productId)
    console.info(
      `[LabelLens] 商品${productLetter(index)}图片识别耗时 ${Date.now() - startedAt}ms（${outcome}）`,
    )
  }

  const runnerRef = useRef<RecognitionQueueCoordinator | null>(null)
  if (!runnerRef.current) {
    runnerRef.current = new RecognitionQueueCoordinator(
      {
        start: async (productId) => {
          let product = productsRef.current.find((item) => item.id === productId)
          if (!product) throw new Error('排队商品已被移除。')
          if (!product.ingredientPhoto && !product.nutritionPhoto) {
            const restored = await loadRecognitionImages(productId)
            product = { ...product, ...restored }
            if (product.ingredientPhoto || product.nutritionPhoto) {
              updateProduct(productId, product)
            }
          }
          if (!product.ingredientPhoto && !product.nutritionPhoto) {
            throw new Error('未能恢复当前商品的标签图片，请重新选择图片。')
          }
          return startLabelRecognition(product.ingredientPhoto, product.nutritionPhoto)
        },
        status: (taskId) => getLabelRecognitionStatus(taskId),
        onQueueChange: (snapshot) =>
          callbacksRef.current.onRecognitionQueueChange(snapshot),
        onQueued: (productId) => {
          const current = sessionsRef.current[productId] ?? { status: 'idle' as const }
          updateSession(productId, {
            ...current,
            status: 'queued',
            progress: '等待识别',
            error: undefined,
          })
        },
        onStarting: (productId) => {
          const product = productsRef.current.find((item) => item.id === productId)
          recognitionStartedAtRef.current.set(productId, Date.now())
          loggedRecognitionDurationsRef.current.delete(productId)
          updateSession(productId, {
            status: 'starting',
            progress: '正在提交包装照片',
            imageKinds: [
              ...(product?.ingredientPhoto ? (['ingredients'] as const) : []),
              ...(product?.nutritionPhoto ? (['nutrition'] as const) : []),
            ],
          })
        },
        onStatus: (productId, response) => {
          if (!recognitionStartedAtRef.current.has(productId)) {
            recognitionStartedAtRef.current.set(productId, Date.now())
          }
          const current = sessionsRef.current[productId] ?? { status: 'processing' as const }
          let merged = mergeRecognitionStatus(current, response)
          if (merged.status === 'completed' && merged.draft) {
            const product = productsRef.current.find((item) => item.id === productId)
            if (product) updateProduct(productId, applyReliableRecognitionDraft(product, merged.draft))
            merged = { ...merged, confirmedAt: new Date().toISOString() }
            void clearRecognitionImages(productId)
            recordRecognitionDuration(productId, '完成')
          }
          updateSession(productId, merged)
        },
        onRetryWait: (productId, item, delayMs) => {
          const current = sessionsRef.current[productId] ?? { status: 'starting' as const }
          updateSession(productId, {
            ...current,
            status: item.taskId ? 'processing' : 'starting',
            taskId: item.taskId,
            connId: item.connId,
            progress: `识别服务繁忙，${Math.ceil(delayMs / 1_000)}秒后检查当前任务`,
            error: undefined,
          })
        },
        onFailure: (productId, message) => {
          const current = sessionsRef.current[productId] ?? { status: 'idle' as const }
          recordRecognitionDuration(productId, '失败')
          updateSession(productId, { ...current, status: 'failed', error: message })
        },
      },
      recognitionQueue,
    )
  }

  useEffect(() => {
    void runnerRef.current?.resume()
    return () => runnerRef.current?.stop()
  }, [])

  const updatePhoto = (
    product: Product,
    field: 'ingredientPhoto' | 'nutritionPhoto',
    value: Product[typeof field],
  ) => {
    updateProduct(product.id, { ...product, [field]: value })
    updateSession(
      product.id,
      markRecognitionImagesChanged(sessionsRef.current[product.id] ?? { status: 'idle' }),
    )
    readySentRef.current = false
  }

  const enqueueProducts = async (targets: Product[]) => {
    const targetIds = targets.map((product) => product.id)
    const hasActiveBatch = batchIdsRef.current.some((productId) =>
      ['queued', 'starting', 'processing'].includes(
        sessionsRef.current[productId]?.status ?? 'idle',
      ),
    )
    const nextBatchIds = hasActiveBatch
      ? [...new Set([...batchIdsRef.current, ...targetIds])]
      : targetIds
    batchIdsRef.current = nextBatchIds
    setBatchIds(nextBatchIds)
    for (const product of targets) await saveRecognitionImages(product)
    void runnerRef.current?.enqueue(targets.map((product) => product.id))
  }

  const startAll = async () => {
    const targets = products.filter((product) => {
      const session = recognitionSessions[product.id]
      return session?.status !== 'completed' || session.stale
    })
    if (
      submissionLock.current ||
      submitting ||
      !targets.length ||
      targets.some((product) => !product.ingredientPhoto && !product.nutritionPhoto)
    ) {
      return
    }
    submissionLock.current = true
    setSubmitting(true)
    readySentRef.current = false
    try {
      await enqueueProducts(targets)
    } finally {
      submissionLock.current = false
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const allCompleted =
      products.length >= 2 &&
      products.every((product) => {
        const session = recognitionSessions[product.id]
        return session?.status === 'completed' && Boolean(session.confirmedAt) && !session.stale
      })
    if (allCompleted && !readySentRef.current) {
      readySentRef.current = true
      advanceAfterRecognition()
    }
    // This transition only reacts to a newly completed queue snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady, onReview, products, recognitionSessions])

  const advanceAfterRecognition = () => {
    const needsReview = products.some(
      (product) =>
        getMissingRecognitionFields(recognitionSessions[product.id]?.draft).length > 0,
    )
    if (needsReview) onReview()
    else onReady()
  }

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
    Boolean(recognitionQueue.current || recognitionQueue.pendingProductIds.length) ||
    Object.values(recognitionSessions).some((session) =>
      ['queued', 'starting', 'processing'].includes(session.status),
    )
  const activeProductId =
    recognitionQueue.current?.productId ??
    products.find((product) =>
      ['starting', 'processing'].includes(
        recognitionSessions[product.id]?.status ?? 'idle',
      ),
    )?.id
  const activeBatchPosition = activeProductId
    ? Math.max(1, batchIds.indexOf(activeProductId) + 1)
    : 0
  const activeBatchTotal = Math.max(batchIds.length, activeBatchPosition)
  return (
    <>
      <QuickFlowProgress current="upload" />
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
          const completed = session.status === 'completed' && !session.stale
          const recognitionLocked = ['queued', 'starting', 'processing'].includes(
            session.status,
          )
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
                {session.status === 'queued' ? (
                  <button
                    type="button"
                    onClick={() => {
                      runnerRef.current?.cancel(product.id)
                      updateSession(
                        product.id,
                        session.result
                          ? { ...session, status: 'completed', progress: undefined }
                          : { status: 'idle' },
                      )
                    }}
                    aria-label={`取消商品${productLetter(index)}排队`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-stone-500 hover:bg-stone-100"
                  >
                    <Ban size={15} aria-hidden="true" />
                    取消排队
                  </button>
                ) : products.length > 2 && !recognitionLocked && (
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
                    disabled={recognitionLocked}
                    onChange={(preview) => updatePhoto(product, 'nutritionPhoto', preview)}
                  />
                  {product.nutritionPhoto && (
                    <PhotoUpload
                      id={`${product.id}-quick-photo-secondary`}
                      label="补充另一张标签照片（可选）"
                      preview={product.ingredientPhoto}
                      disabled={recognitionLocked}
                      onChange={(preview) => updatePhoto(product, 'ingredientPhoto', preview)}
                    />
                  )}
                </div>
              )}

              {session.status === 'queued' && (
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-stone-100 p-3 text-sm font-bold text-stone-600">
                  商品{productLetter(index)}等待识别；当前任务完成后会自动开始
                </div>
              )}

              {['starting', 'processing'].includes(session.status) && (
                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-orange/10 p-3 text-sm font-bold text-orange">
                  <LoaderCircle className="animate-spin" size={18} aria-hidden="true" />
                  <div>
                    <p>
                      正在识别商品{productLetter(index)}（{activeBatchPosition}/{activeBatchTotal}）
                    </p>
                    {session.progress && (
                      <p className="mt-1 text-xs font-semibold text-stone-500">
                        {session.progress}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {session.error && (
                <div className="mt-3 rounded-xl bg-brick/5 px-3 py-2 text-xs font-semibold leading-5 text-brick">
                  <p role="alert">{session.error}</p>
                  {session.status === 'failed' && (
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => void enqueueProducts([product])}
                      className="mt-2 min-h-9 rounded-xl border border-brick/20 bg-white px-3 font-black disabled:opacity-40"
                    >
                      仅重试这款商品
                    </button>
                  )}
                </div>
              )}

              {completed && (
                <div className="mt-4 rounded-2xl bg-leaf/5 p-3">
                  <p className="text-sm font-black text-leaf">商品{productLetter(index)}识别完成</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    {completedRecognitionSummary(product)}
                  </p>
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
          data-primary-action="true"
          disabled={(hasRecognitionTargets && !hasAllPhotos) || isRunning}
          onClick={() =>
            hasRecognitionTargets ? void startAll() : advanceAfterRecognition()
          }
          className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-orange px-6 font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isRunning ? <LoaderCircle className="animate-spin" size={20} /> : <ScanText size={20} />}
          {isRunning
            ? activeProductId
              ? `正在识别商品${productLetter(products.findIndex((product) => product.id === activeProductId))}（${activeBatchPosition}/${activeBatchTotal}）`
              : '正在识别，请稍候'
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
        {isRunning && (
          <p className="mt-2 text-center text-xs font-semibold text-stone-500">
            请不要重复提交，完成后会自动继续
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
    </>
  )
}
