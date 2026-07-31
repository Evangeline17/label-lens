import { AlertTriangle, CheckCircle2, CircleHelp, ListChecks, XCircle } from 'lucide-react'
import type {
  CustomRequirementEvaluation,
  CustomRequirementRule,
  RequirementMatchStatus,
} from '../types'

function statusClass(status: RequirementMatchStatus): string {
  if (status === '满足') return 'bg-leaf/10 text-leaf'
  if (status === '部分满足') return 'bg-orange/10 text-orange'
  if (status === '不满足') return 'bg-brick/10 text-brick'
  return 'bg-stone-100 text-stone-600'
}

function StatusIcon({ status }: { status: RequirementMatchStatus }) {
  if (status === '满足') return <CheckCircle2 size={16} aria-hidden="true" />
  if (status === '不满足') return <XCircle size={16} aria-hidden="true" />
  if (status === '部分满足') return <AlertTriangle size={16} aria-hidden="true" />
  return <CircleHelp size={16} aria-hidden="true" />
}

interface Props {
  text: string
  rules: CustomRequirementRule[]
  unresolvedPreferences: string[]
  evaluation: CustomRequirementEvaluation
}

export function RequirementMatchSection({
  text,
  rules,
  unresolvedPreferences,
  evaluation,
}: Props) {
  if (!text.trim()) return null

  return (
    <section className="rounded-3xl border border-orange/20 bg-[#fffaf3] p-5 shadow-card sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange/10 text-orange">
          <ListChecks size={20} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-black tracking-tight">我的要求匹配情况</h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            下面只使用你确认的本地规则和包装标签数据，不替你补全缺失信息。
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-orange/15 bg-white p-4">
        <p className="text-xs font-bold text-stone-500">你的原始要求</p>
        <p className="mt-1 text-sm leading-6">{text}</p>
      </div>

      {rules.length > 0 && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {evaluation.productSummaries.map((summary) => (
              <article key={summary.productId} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-black">{summary.productName}</h3>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(summary.status)}`}
                  >
                    <StatusIcon status={summary.status} />
                    {summary.status}
                  </span>
                </div>
                <p className="mt-3 text-xs leading-5 text-stone-500">
                  满足 {summary.satisfiedCount}/{rules.length} 条 · 不满足{' '}
                  {summary.failedCount} 条 · 无法判断 {summary.unknownCount} 条
                </p>
              </article>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            {evaluation.ruleResults.map((result, index) => (
              <article key={result.rule.id} className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
                <p className="text-xs font-bold text-orange">要求 {index + 1}</p>
                <h3 className="mt-1 font-black">
                  {result.rule.original} → {result.rule.label}
                  {result.rule.value !== undefined
                    ? ` ${result.rule.value}${result.rule.unit ?? ''}`
                    : ''}
                </h3>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  系统识别口径：{result.rule.basis}
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {result.products.map((match) => (
                    <div key={match.productId} className="rounded-xl bg-stone-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black">{match.productName}</p>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${statusClass(match.status)}`}
                        >
                          <StatusIcon status={match.status} />
                          {match.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-stone-600">{match.evidence}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {unresolvedPreferences.length > 0 && (
        <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white p-4">
          <p className="font-black">需要 AI 解释的偏好</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            这些要求没有被伪造成确定性指标；仅凭标签无法直接判断时会保留原文。
          </p>
          <ul className="mt-3 space-y-2">
            {unresolvedPreferences.map((preference) => (
              <li key={preference} className="rounded-xl bg-stone-50 px-3 py-2 text-sm">
                <span className="mr-2 rounded-full bg-stone-200 px-2 py-0.5 text-xs font-bold text-stone-600">
                  无法判断
                </span>
                {preference}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evaluation.noProductFullyMatches && (
        <div className="mt-5 rounded-2xl border border-orange/20 bg-orange/10 p-4">
          <p className="flex items-center gap-2 font-black text-orange">
            <AlertTriangle size={18} aria-hidden="true" />
            没有商品满足全部确定性要求
          </p>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            本次不强行宣布某款完全符合。可以根据下面的主要取舍决定优先保留哪些要求。
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {evaluation.tradeoffs.map((tradeoff) => (
              <li key={tradeoff} className="rounded-xl bg-white/80 px-3 py-2">
                {tradeoff}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
