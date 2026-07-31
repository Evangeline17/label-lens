import { Check, CircleAlert, LoaderCircle, ScanText } from 'lucide-react'
import {
  applyRecognitionDraft,
  completedRecognitionSession,
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
  const hasPhoto = Boolean(product.ingredientPhoto || product.nutritionPhoto)
  const currentImageKinds: Array<'ingredients' | 'nutrition'> = [
    ...(product.ingredientPhoto ? (['ingredients'] as const) : []),
    ...(product.nutritionPhoto ? (['nutrition'] as const) : []),
  ]
  const imageKinds = session.imageKinds ?? currentImageKinds
  const missingImageLabels = [
    ...(!imageKinds.includes('ingredients') ? ['配料表图片'] : []),
    ...(!imageKinds.includes('nutrition') ? ['营养成分表图片'] : []),
  ]

  const start = async () => {
    if (!hasPhoto || session.status === 'starting') return
    const starting: LabelRecognitionSession = {
      status: 'starting',
      imageKinds: currentImageKinds,
    }
    onSessionChange(starting)
    try {
      const response = await startLabelRecognition(
        product.ingredientPhoto,
        product.nutritionPhoto,
      )
      onSessionChange(completedRecognitionSession(response))
    } catch (error) {
      onSessionChange({
        status: 'failed',
        error:
          error instanceof Error
            ? error.message
            : '图片识别暂时不可用，请改为手动录入。',
      })
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
        {session.status !== 'starting' && session.status !== 'completed' && (
          <button
            type="button"
            disabled={!hasPhoto}
            onClick={() => void start()}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-leaf px-4 text-sm font-bold text-white transition hover:bg-leaf/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ScanText size={17} aria-hidden="true" />
            {session.status === 'failed' ? '重新识别' : '识别并自动填写'}
          </button>
        )}
      </div>

      {!hasPhoto && session.status !== 'completed' && (
        <p className="mt-3 text-xs font-medium text-stone-500">
          请先上传配料表或营养成分表图片。
        </p>
      )}

      {session.status === 'starting' && (
        <div className="mt-4 rounded-xl bg-white px-3 py-3 text-sm text-stone-700">
          <p className="flex items-center gap-2 font-bold">
            <LoaderCircle size={17} className="animate-spin text-orange" aria-hidden="true" />
            正在调用腾讯云高精度文字识别
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            图片正在同步识别；完成后仍需对照包装人工确认。
          </p>
        </div>
      )}

      {session.status === 'failed' && (
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
        </div>
      )}

      {session.status === 'completed' && draft && (
        <section className="mt-4 rounded-2xl border border-orange/20 bg-white p-4">
          <p className="font-black text-ink">人工确认识别结果</p>
          <p className="mt-1 rounded-xl bg-orange/10 px-3 py-2 text-xs font-semibold leading-5 text-orange">
            OCR识别可能有误，请对照包装检查数值、单位和标示基准。
          </p>
          {missingImageLabels.length > 0 && (
            <p className="mt-2 rounded-xl bg-stone-100 px-3 py-2 text-xs font-medium leading-5 text-stone-600">
              本次未提供{missingImageLabels.join('和')}；无法从现有图片确认的字段会保留为空或
              unknown，请结合包装手动补充。
            </p>
          )}
          {Boolean(session.warnings?.length) && (
            <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-stone-700">
              {session.warnings?.map((warning) => (
                <p key={warning}>• {warning}</p>
              ))}
            </div>
          )}
          {(session.rawText?.ingredients || session.rawText?.nutrition) && (
            <details className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
              <summary className="cursor-pointer font-bold text-stone-700">
                查看 OCR 原文与字段来源
              </summary>
              {session.rawText.ingredients && (
                <div className="mt-3">
                  <p className="font-bold">配料表 OCR 原文</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans leading-5">
                    {session.rawText.ingredients}
                  </pre>
                </div>
              )}
              {session.rawText.nutrition && (
                <div className="mt-3">
                  <p className="font-bold">营养成分表 OCR 原文</p>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans leading-5">
                    {session.rawText.nutrition}
                  </pre>
                </div>
              )}
              {session.fieldSources && (
                <div className="mt-3">
                  <p className="font-bold">字段来源行</p>
                  {Object.entries(session.fieldSources).map(([field, sources]) => (
                    <p key={field} className="mt-1 break-words leading-5">
                      {field}：{sources?.map((item) => item.text).join('；')}
                    </p>
                  ))}
                </div>
              )}
            </details>
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
              onClick={() => {
                onConfirm(applyRecognitionDraft(product, draft))
                onSessionChange({
                  ...session,
                  draft,
                  confirmedAt: new Date().toISOString(),
                })
              }}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange px-4 text-sm font-bold text-white"
            >
              <Check size={17} aria-hidden="true" />
              确认并填入商品
            </button>
            {session.confirmedAt && (
              <span className="text-xs font-bold text-leaf">
                已填入商品表单，仍可继续手动修改。
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
