import {
  Ban,
  Check,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  ScanText,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  applyRecognitionDraft,
  abandonLabelRecognition,
  canConfirmRecognition,
  getLabelRecognitionStatus,
  mergeRecognitionStatus,
  recognitionActionLabel,
  recognitionResultToDraft,
  startLabelRecognition,
} from '../lib/labelRecognition'
import type {
  LabelRecognitionDraft,
  LabelRecognitionSession,
  Product,
} from '../types'
import { FieldShell, inputClass } from './FormField'

interface Props {
  product: Product
  session: LabelRecognitionSession
  onSessionChange: (session: LabelRecognitionSession) => void
  onConfirm: (product: Product) => void
}

const emptySession: LabelRecognitionSession = { status: 'idle' }

function updateDraft(
  session: LabelRecognitionSession,
  field: keyof LabelRecognitionDraft,
  value: string,
): LabelRecognitionSession {
  if (!session.result) return session
  const draft = session.draft ?? recognitionResultToDraft(session.result)
  return {
    ...session,
    draft: { ...draft, [field]: value },
    confirmedAt: undefined,
  }
}

export function LabelRecognitionPanel({
  product,
  session = emptySession,
  onSessionChange,
  onConfirm,
}: Props) {
  const [checking, setChecking] = useState(false)
  const submissionLock = useRef(false)
  const hasPhoto = Boolean(product.ingredientPhoto || product.nutritionPhoto)
  const actionLabel = recognitionActionLabel(hasPhoto, session)
  const canConfirm = canConfirmRecognition(session)
  const currentImageKinds: Array<'ingredients' | 'nutrition'> = [
    ...(product.ingredientPhoto ? (['ingredients'] as const) : []),
    ...(product.nutritionPhoto ? (['nutrition'] as const) : []),
  ]
  const imageKinds = session.imageKinds ?? currentImageKinds
  const missingImageLabels = [
    ...(!imageKinds.includes('ingredients') ? ['配料表图片'] : []),
    ...(!imageKinds.includes('nutrition') ? ['营养成分表图片'] : []),
  ]

  const checkStatus = async (signal?: AbortSignal) => {
    if (!session.taskId || checking) return
    setChecking(true)
    try {
      const response = await getLabelRecognitionStatus(session.taskId, signal)
      onSessionChange(mergeRecognitionStatus(session, response))
    } catch (error) {
      if (!signal?.aborted) {
        onSessionChange({
          ...session,
          error:
            error instanceof Error
              ? error.message
              : '暂时无法查询识别状态，请稍后再检查。',
        })
      }
    } finally {
      if (!signal?.aborted) setChecking(false)
    }
  }

  useEffect(() => {
    if (session.status !== 'processing' || !session.taskId) return
    const controller = new AbortController()
    void checkStatus(controller.signal)
    const timer = window.setInterval(() => {
      void checkStatus(controller.signal)
    }, 9_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
    // The current snapshot is intentionally replaced after each status response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status, session.taskId])

  const start = async () => {
    if (
      submissionLock.current ||
      !hasPhoto ||
      session.status === 'starting' ||
      session.status === 'processing'
    ) {
      return
    }
    submissionLock.current = true
    const starting: LabelRecognitionSession = {
      status: 'starting',
      stale: false,
      progress: '正在压缩并提交标签图片',
      imageKinds: currentImageKinds,
    }
    onSessionChange(starting)
    try {
      const response = await startLabelRecognition(
        product.ingredientPhoto,
        product.nutritionPhoto,
      )
      onSessionChange(mergeRecognitionStatus(starting, response))
    } catch (error) {
      onSessionChange({
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : '图片识别暂时不可用，请改为手动录入。',
      })
    } finally {
      submissionLock.current = false
    }
  }

  const draft =
    session.draft ?? (session.result ? recognitionResultToDraft(session.result) : null)

  return (
    <div className="mt-4 rounded-2xl border border-leaf/20 bg-leaf/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-leaf">
            <ScanText size={17} aria-hidden="true" />
            包装标签图片识别 Beta
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            每次只识别当前这款商品；价格仍需手动填写。
          </p>
        </div>
        {actionLabel && (
          <button
            type="button"
            disabled={!hasPhoto}
            onClick={() => void start()}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-leaf px-4 text-sm font-bold text-white transition hover:bg-leaf/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ScanText size={17} aria-hidden="true" />
            {actionLabel}
          </button>
        )}
      </div>

      {!hasPhoto && (
        <p className="mt-3 text-xs font-medium text-stone-500">
          {session.stale
            ? '图片预览无法从会话恢复或当前图片已删除，请重新选择至少一张图片。'
            : '请先上传配料表或营养成分表图片。'}
        </p>
      )}

      {session.stale && (
        <div className="mt-4 rounded-xl border border-orange/25 bg-orange/10 px-3 py-3 text-sm text-stone-700">
          <p className="font-bold text-orange">
            图片已更改，当前识别结果可能不再对应最新图片，请重新识别。
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            {session.confirmedAt
              ? '已填入的商品字段不会自动清空；新识别结果经确认后才会覆盖这些字段。'
              : '旧识别结果仅供参考，重新识别前不能继续确认旧结果。'}
          </p>
        </div>
      )}

      {['starting', 'processing'].includes(session.status) && (
        <div className="mt-4 rounded-xl bg-white px-3 py-3 text-sm text-stone-700">
          <p className="flex items-center gap-2 font-bold">
            <LoaderCircle size={17} className="animate-spin text-orange" aria-hidden="true" />
            {session.progress ?? '正在识别包装标签'}
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            可以继续编辑其他字段；任务完成后仍需人工确认。
          </p>
          {session.taskId && (
            <p className="mt-2 break-all font-mono text-[11px] text-stone-400">
              taskId: {session.taskId}
            </p>
          )}
        </div>
      )}

      {session.taskId &&
        ['processing', 'unknown'].includes(session.status) && (
          <button
            type="button"
            disabled={checking}
            onClick={() => void checkStatus()}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 disabled:opacity-50"
          >
            <RefreshCw size={15} className={checking ? 'animate-spin' : ''} aria-hidden="true" />
            {checking ? '正在检查' : '检查识别结果'}
          </button>
        )}

      {session.taskId &&
        ['processing', 'failed', 'not_found', 'unknown'].includes(session.status) && (
          <button
            type="button"
            onClick={() => onSessionChange(abandonLabelRecognition())}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700"
          >
            <Ban size={15} aria-hidden="true" />
            放弃本次识别
          </button>
        )}

      {['failed', 'not_found', 'unknown'].includes(session.status) && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-brick/20 bg-brick/5 px-3 py-3 text-sm text-brick"
        >
          <p className="flex items-center gap-2 font-bold">
            <CircleAlert size={17} aria-hidden="true" />
            图片识别未能完成
          </p>
          <p className="mt-1 text-xs leading-5">
            {session.error ?? '请保留图片预览，并改为手动录入标签数据。'}
          </p>
          {session.taskId && (
            <p className="mt-2 break-all font-mono text-[11px] opacity-70">
              taskId: {session.taskId}
            </p>
          )}
        </div>
      )}

      {session.status === 'completed' && draft && (
        <section className="mt-4 rounded-2xl border border-orange/20 bg-white p-4">
          <p className="font-black text-ink">人工确认识别结果</p>
          <p className="mt-1 rounded-xl bg-orange/10 px-3 py-2 text-xs font-semibold leading-5 text-orange">
            AI识别可能有误，请对照包装检查数值、单位和标示基准。
          </p>
          {missingImageLabels.length > 0 && (
            <p className="mt-2 rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium leading-5 text-stone-600">
              本次未提供{missingImageLabels.join('和')}；无法从现有图片确认的字段会保留为空或
              unknown，请结合包装手动补充。
            </p>
          )}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FieldShell label="商品名称" htmlFor={`${product.id}-recognized-name`}>
              <input
                id={`${product.id}-recognized-name`}
                className={inputClass}
                value={draft.productName}
                onChange={(event) =>
                  onSessionChange(
                    updateDraft(session, 'productName', event.target.value),
                  )
                }
              />
            </FieldShell>
            <FieldShell label="净含量" htmlFor={`${product.id}-recognized-net`}>
              <input
                id={`${product.id}-recognized-net`}
                inputMode="decimal"
                className={inputClass}
                value={draft.netContent}
                onChange={(event) =>
                  onSessionChange(updateDraft(session, 'netContent', event.target.value))
                }
              />
            </FieldShell>
            <FieldShell label="净含量单位" htmlFor={`${product.id}-recognized-net-unit`}>
              <select
                id={`${product.id}-recognized-net-unit`}
                className={inputClass}
                value={draft.netContentUnit}
                onChange={(event) =>
                  onSessionChange(
                    updateDraft(session, 'netContentUnit', event.target.value),
                  )
                }
              >
                <option value="">无法确认</option>
                <option value="g">g</option>
                <option value="mL">mL</option>
              </select>
            </FieldShell>
            <FieldShell label="营养标示基准" htmlFor={`${product.id}-recognized-basis`}>
              <select
                id={`${product.id}-recognized-basis`}
                className={inputClass}
                value={draft.nutritionBasis}
                onChange={(event) =>
                  onSessionChange(
                    updateDraft(session, 'nutritionBasis', event.target.value),
                  )
                }
              >
                <option value="unknown">无法确认</option>
                <option value="per100g">每100g</option>
                <option value="per100ml">每100mL</option>
                <option value="perServing">每份</option>
              </select>
            </FieldShell>
            {(
              [
                ['servingSize', '每份重量或体积'],
                ['energyValue', '能量数值'],
                ['protein', '蛋白质（g）'],
                ['fat', '脂肪（g）'],
                ['carbohydrate', '碳水化合物（g）'],
                ['sodium', '钠（mg）'],
              ] as const
            ).map(([field, label]) => (
              <FieldShell
                key={field}
                label={label}
                htmlFor={`${product.id}-recognized-${field}`}
              >
                <input
                  id={`${product.id}-recognized-${field}`}
                  inputMode="decimal"
                  className={inputClass}
                  value={draft[field]}
                  onChange={(event) =>
                    onSessionChange(updateDraft(session, field, event.target.value))
                  }
                />
              </FieldShell>
            ))}
            <FieldShell label="能量单位" htmlFor={`${product.id}-recognized-energy-unit`}>
              <select
                id={`${product.id}-recognized-energy-unit`}
                className={inputClass}
                value={draft.energyUnit}
                onChange={(event) =>
                  onSessionChange(
                    updateDraft(session, 'energyUnit', event.target.value),
                  )
                }
              >
                <option value="">无法确认</option>
                <option value="kJ">kJ</option>
                <option value="kcal">kcal</option>
              </select>
            </FieldShell>
            <div className="sm:col-span-2 lg:col-span-3">
              <FieldShell
                label="配料表文字"
                htmlFor={`${product.id}-recognized-ingredients`}
              >
                <textarea
                  id={`${product.id}-recognized-ingredients`}
                  rows={4}
                  className={inputClass}
                  value={draft.ingredientsText}
                  onChange={(event) =>
                    onSessionChange(
                      updateDraft(session, 'ingredientsText', event.target.value),
                    )
                  }
                />
              </FieldShell>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={!canConfirm}
              onClick={() => {
                if (!canConfirm) return
                onConfirm(applyRecognitionDraft(product, draft))
                onSessionChange({
                  ...session,
                  draft,
                  confirmedAt: new Date().toISOString(),
                })
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={17} aria-hidden="true" />
              {session.stale ? '结果已过期，请重新识别' : '确认并填入商品'}
            </button>
            {session.confirmedAt && (
              <span className="text-xs font-bold text-leaf">
                已填入商品表单，仍可继续手动修改。
              </span>
            )}
          </div>
          {session.taskId && (
            <p className="mt-3 break-all font-mono text-[11px] text-stone-400">
              taskId: {session.taskId}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
