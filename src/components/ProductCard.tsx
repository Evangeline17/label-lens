import {
  ChevronDown,
  ChevronUp,
  Copy,
  ImageIcon,
  PackageOpen,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import type {
  FormErrors,
  LabelRecognitionSession,
  Product,
  ProductCategory,
} from '../types'
import { errorInputClass, FieldShell, inputClass } from './FormField'
import { LabelRecognitionPanel } from './LabelRecognitionPanel'
import { PhotoUpload } from './PhotoUpload'

const categories: ProductCategory[] = [
  '酸奶/乳制品',
  '面包/主食',
  '蛋白棒/能量棒',
  '饮料',
  '零食',
  '其他',
]

interface Props {
  product: Product
  index: number
  errors: FormErrors
  canDelete: boolean
  canDuplicate: boolean
  recognitionBetaAvailable: boolean
  recognitionBetaEnabled: boolean
  recognitionSession: LabelRecognitionSession
  onChange: (product: Product) => void
  onRecognitionSessionChange: (session: LabelRecognitionSession) => void
  onDelete: () => void
  onDuplicate: () => void
}

export function ProductCard({
  product,
  index,
  errors,
  canDelete,
  canDuplicate,
  recognitionBetaAvailable,
  recognitionBetaEnabled,
  recognitionSession,
  onChange,
  onRecognitionSessionChange,
  onDelete,
  onDuplicate,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const update = <K extends keyof Product>(field: K, value: Product[K]) => {
    onChange({ ...product, [field]: value })
  }

  return (
    <article className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-card">
      <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-4 sm:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-leaf/10 text-sm font-black text-leaf">
          {String.fromCharCode(65 + index)}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={!collapsed}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold">
              {product.name || `商品 ${String.fromCharCode(65 + index)}`}
            </span>
            <span className="mt-0.5 block text-xs text-stone-500">
              {collapsed ? '点击展开编辑' : '标签数据可随时修改'}
            </span>
          </span>
          {collapsed ? (
            <ChevronDown size={19} aria-hidden="true" />
          ) : (
            <ChevronUp size={19} aria-hidden="true" />
          )}
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={!canDuplicate}
            title={canDuplicate ? '复制商品' : '最多比较4款商品'}
            aria-label={`复制${product.name || `商品${index + 1}`}`}
            className="grid h-9 w-9 place-items-center rounded-xl text-stone-500 transition hover:bg-stone-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Copy size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={!canDelete}
            title={canDelete ? '删除商品' : '至少保留2款商品'}
            aria-label={`删除${product.name || `商品${index + 1}`}`}
            className="grid h-9 w-9 place-items-center rounded-xl text-stone-500 transition hover:bg-brick/10 hover:text-brick disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-7 p-4 sm:p-6">
          <section>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-stone-700">
              <PackageOpen size={17} className="text-orange" aria-hidden="true" />
              商品与包装
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <FieldShell
                label="商品名称"
                htmlFor={`${product.id}-name`}
                required
                error={errors.name}
              >
                <input
                  id={`${product.id}-name`}
                  className={`${inputClass} ${errors.name ? errorInputClass : ''}`}
                  value={product.name}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder="例如：原味酸奶"
                />
              </FieldShell>
              <FieldShell label="商品类别" htmlFor={`${product.id}-category`}>
                <select
                  id={`${product.id}-category`}
                  className={inputClass}
                  value={product.category}
                  onChange={(event) => update('category', event.target.value as ProductCategory)}
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </FieldShell>
              <FieldShell label="包装宣传语" htmlFor={`${product.id}-claims`}>
                <input
                  id={`${product.id}-claims`}
                  className={inputClass}
                  value={product.claims}
                  onChange={(event) => update('claims', event.target.value)}
                  placeholder="例如：高蛋白、0蔗糖"
                />
              </FieldShell>
              <div className="grid grid-cols-[1fr_88px] gap-2">
                <FieldShell
                  label="净含量"
                  htmlFor={`${product.id}-net`}
                  required
                  error={errors.netContent}
                >
                  <input
                    id={`${product.id}-net`}
                    inputMode="decimal"
                    className={`${inputClass} ${errors.netContent ? errorInputClass : ''}`}
                    value={product.netContent}
                    onChange={(event) => update('netContent', event.target.value)}
                    placeholder="200"
                  />
                </FieldShell>
                <FieldShell label="单位" htmlFor={`${product.id}-unit`}>
                  <select
                    id={`${product.id}-unit`}
                    className={inputClass}
                    value={product.netUnit}
                    onChange={(event) => update('netUnit', event.target.value as Product['netUnit'])}
                  >
                    <option value="g">g</option>
                    <option value="mL">mL</option>
                  </select>
                </FieldShell>
              </div>
              <FieldShell label="价格（元）" htmlFor={`${product.id}-price`} error={errors.price}>
                <input
                  id={`${product.id}-price`}
                  inputMode="decimal"
                  className={`${inputClass} ${errors.price ? errorInputClass : ''}`}
                  value={product.price}
                  onChange={(event) => update('price', event.target.value)}
                  placeholder="8.9"
                />
              </FieldShell>
              <FieldShell
                label="配料表"
                htmlFor={`${product.id}-ingredients`}
                hint="请按包装原顺序录入，使用顿号或逗号分隔。"
              >
                <textarea
                  id={`${product.id}-ingredients`}
                  rows={3}
                  className={inputClass}
                  value={product.ingredients}
                  onChange={(event) => update('ingredients', event.target.value)}
                  placeholder="生牛乳、乳清蛋白粉、乳酸菌…"
                />
              </FieldShell>
            </div>
          </section>

          <section className="rounded-2xl bg-stone-50 p-4 sm:p-5">
            <h3 className="mb-4 text-sm font-black text-stone-700">营养成分表</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FieldShell label="标示基准" htmlFor={`${product.id}-basis`}>
                <select
                  id={`${product.id}-basis`}
                  className={inputClass}
                  value={product.basis}
                  onChange={(event) =>
                    update('basis', event.target.value as Product['basis'])
                  }
                >
                  <option value="per100g">每100g</option>
                  <option value="per100ml">每100mL</option>
                  <option value="perServing">每份</option>
                </select>
              </FieldShell>
              {product.basis === 'perServing' && (
                <FieldShell
                  label={`每份重量或体积（${product.netUnit}）`}
                  htmlFor={`${product.id}-serving`}
                  required
                  error={errors.servingSize}
                >
                  <input
                    id={`${product.id}-serving`}
                    inputMode="decimal"
                    className={`${inputClass} ${errors.servingSize ? errorInputClass : ''}`}
                    value={product.servingSize}
                    onChange={(event) => update('servingSize', event.target.value)}
                    placeholder="40"
                  />
                </FieldShell>
              )}
              <div className="grid grid-cols-[1fr_94px] gap-2">
                <FieldShell label="能量数值" htmlFor={`${product.id}-energy`} error={errors.energy}>
                  <input
                    id={`${product.id}-energy`}
                    inputMode="decimal"
                    className={`${inputClass} ${errors.energy ? errorInputClass : ''}`}
                    value={product.energy}
                    onChange={(event) => update('energy', event.target.value)}
                    placeholder="330"
                  />
                </FieldShell>
                <FieldShell label="单位" htmlFor={`${product.id}-energy-unit`}>
                  <select
                    id={`${product.id}-energy-unit`}
                    className={inputClass}
                    value={product.energyUnit}
                    onChange={(event) =>
                      update('energyUnit', event.target.value as Product['energyUnit'])
                    }
                  >
                    <option value="kJ">kJ</option>
                    <option value="kcal">kcal</option>
                  </select>
                </FieldShell>
              </div>
              {(
                [
                  ['protein', '蛋白质（g）', '9.0'],
                  ['fat', '脂肪（g）', '3.0'],
                  ['carbs', '碳水化合物（g）', '5.5'],
                  ['sodium', '钠（mg）', '65'],
                ] as const
              ).map(([field, label, placeholder]) => (
                <FieldShell
                  key={field}
                  label={label}
                  htmlFor={`${product.id}-${field}`}
                  error={errors[field]}
                >
                  <input
                    id={`${product.id}-${field}`}
                    inputMode="decimal"
                    className={`${inputClass} ${errors[field] ? errorInputClass : ''}`}
                    value={product[field]}
                    onChange={(event) => update(field, event.target.value)}
                    placeholder={placeholder}
                  />
                </FieldShell>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-4 flex items-center gap-2 text-sm font-black text-stone-700">
              <ImageIcon size={17} className="text-orange" aria-hidden="true" />
              标签照片
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <PhotoUpload
                id={`${product.id}-ingredient-photo`}
                label="上传配料表照片"
                preview={product.ingredientPhoto}
                onChange={(preview) => update('ingredientPhoto', preview)}
              />
              <PhotoUpload
                id={`${product.id}-nutrition-photo`}
                label="上传营养成分表照片"
                preview={product.nutritionPhoto}
                onChange={(preview) => update('nutritionPhoto', preview)}
              />
            </div>
            {recognitionBetaAvailable && recognitionBetaEnabled ? (
              <LabelRecognitionPanel
                product={product}
                session={recognitionSession}
                onSessionChange={onRecognitionSessionChange}
                onConfirm={onChange}
              />
            ) : recognitionBetaAvailable ? (
              <p className="mt-3 rounded-xl bg-stone-100 px-3 py-2.5 text-xs font-medium leading-5 text-stone-600">
                图片识别 Beta 已关闭。手动录入和图片预览不受影响。
              </p>
            ) : null}
          </section>
        </div>
      )}
    </article>
  )
}
