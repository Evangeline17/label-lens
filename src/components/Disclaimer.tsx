import { Info } from 'lucide-react'

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <aside
      className={`flex gap-3 rounded-2xl border border-stone-200 bg-white/70 ${
        compact ? 'p-4' : 'p-5'
      }`}
    >
      <Info className="mt-0.5 shrink-0 text-stone-500" size={18} aria-hidden="true" />
      <p className="text-xs leading-5 text-stone-600 sm:text-sm sm:leading-6">
        本工具根据用户录入的包装标签进行计算和比较，不提供疾病诊断、医疗建议或个体化治疗方案。图片识别结果和人工录入数据都应由用户核对。购买和食用决策还应结合个人总饮食、过敏情况及专业建议。
      </p>
    </aside>
  )
}
