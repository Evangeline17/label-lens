import { CirclePlus, FlaskConical, Plus, ScanText } from 'lucide-react'
import { BottomActions } from '../components/BottomActions'
import { ProductCard } from '../components/ProductCard'
import { SectionHeading } from '../components/SectionHeading'
import { createEmptyProduct } from '../data/mockProducts'
import type {
  FormErrors,
  LabelRecognitionSession,
  Product,
} from '../types'

interface Props {
  products: Product[]
  errors: Record<string, FormErrors>
  showValidationSummary: boolean
  recognitionSessions: Record<string, LabelRecognitionSession>
  onProductsChange: (products: Product[]) => void
  onRecognitionSessionChange: (
    productId: string,
    session: LabelRecognitionSession,
  ) => void
  onLoadDemo: () => void
  onBack: () => void
  onNext: () => void
}

export function ProductsStep({
  products,
  errors,
  showValidationSummary,
  recognitionSessions,
  onProductsChange,
  onRecognitionSessionChange,
  onLoadDemo,
  onBack,
  onNext,
}: Props) {
  const updateProduct = (id: string, product: Product) => {
    onProductsChange(products.map((item) => (item.id === id ? product : item)))
  }
  const deleteProduct = (id: string) => {
    onProductsChange(products.filter((item) => item.id !== id))
  }
  const duplicateProduct = (product: Product) => {
    if (products.length >= 4) return
    const index = products.findIndex((item) => item.id === product.id)
    const copy: Product = {
      ...product,
      id: crypto.randomUUID(),
      name: product.name ? `${product.name}（复制）` : '',
      ingredientPhoto: product.ingredientPhoto ? { ...product.ingredientPhoto } : undefined,
      nutritionPhoto: product.nutritionPhoto ? { ...product.nutritionPhoto } : undefined,
    }
    const next = [...products]
    next.splice(index + 1, 0, copy)
    onProductsChange(next)
  }

  return (
    <div>
      <SectionHeading
        eyebrow="步骤 2"
        title="录入 2—4 款食品"
        description="照着包装背面的标签填写。空缺数据不会被系统自行补全，之后会明确标为信息不足。"
        icon={CirclePlus}
      />

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-leaf/20 bg-leaf/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-bold text-leaf">想先看看完整效果？</p>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            示例含 3 款虚构酸奶，可继续修改每一项数据。
          </p>
        </div>
        <button
          type="button"
          onClick={onLoadDemo}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-leaf px-4 text-sm font-bold text-white transition hover:bg-leaf/90"
        >
          <FlaskConical size={17} aria-hidden="true" />
          加载酸奶对比示例
        </button>
      </div>
      <p className="mb-5 text-xs font-medium text-stone-500">
        演示数据为虚构数据，仅用于展示产品功能。
      </p>

      <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-orange/15 bg-orange/5 p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-stone-800">
            <ScanText size={17} className="text-orange" aria-hidden="true" />
            包装标签图片识别 Beta
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            识别结果需人工确认后填入；无法识别时仍可手动录入。
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-leaf/10 px-3 py-1 text-xs font-bold text-leaf">
          已启用
        </span>
      </div>

      {showValidationSummary && (
        <div
          role="alert"
          className="mb-5 rounded-2xl border border-brick/20 bg-brick/5 px-4 py-3 text-sm font-semibold text-brick"
        >
          请先修正标红字段。商品名称和净含量为比较所需的基础信息。
        </div>
      )}

      <div className="space-y-5">
        {products.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            index={index}
            errors={errors[product.id] ?? {}}
            canDelete={products.length > 2}
            canDuplicate={products.length < 4}
            recognitionSession={
              recognitionSessions[product.id] ?? { status: 'idle' }
            }
            onChange={(next) => updateProduct(product.id, next)}
            onRecognitionSessionChange={(session) =>
              onRecognitionSessionChange(product.id, session)
            }
            onDelete={() => deleteProduct(product.id)}
            onDuplicate={() => duplicateProduct(product)}
          />
        ))}
      </div>

      <button
        type="button"
        disabled={products.length >= 4}
        onClick={() => onProductsChange([...products, createEmptyProduct(products.length)])}
        className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-400 bg-white/50 font-bold text-stone-700 transition hover:border-orange hover:text-orange disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus size={18} aria-hidden="true" />
        {products.length >= 4 ? '最多比较4款商品' : '添加一款商品'}
      </button>

      <BottomActions onBack={onBack} onNext={onNext} nextLabel="检查标签数据" />
    </div>
  )
}
