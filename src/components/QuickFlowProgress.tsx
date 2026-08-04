import { Check } from 'lucide-react'

export type QuickFlowStage = 'upload' | 'review' | 'quick-result' | 'full-analysis'

const stages: Array<{ id: QuickFlowStage; short: string; label: string }> = [
  { id: 'upload', short: '上传', label: '上传照片' },
  { id: 'review', short: '确认', label: '确认识别' },
  { id: 'quick-result', short: '结果', label: '快速结果' },
  { id: 'full-analysis', short: '分析', label: '完整分析' },
]

export function QuickFlowProgress({ current }: { current: QuickFlowStage }) {
  const currentIndex = stages.findIndex((stage) => stage.id === current)
  return (
    <nav
      aria-label="快速比较进度"
      data-mobile-width="390"
      className="mx-auto mb-5 max-w-5xl rounded-2xl border border-stone-200 bg-white px-2 py-3 shadow-sm sm:px-4"
    >
      <ol className="grid grid-cols-4 gap-1">
        {stages.map((stage, index) => {
          const completed = index < currentIndex
          const active = index === currentIndex
          return (
            <li
              key={stage.id}
              aria-current={active ? 'step' : undefined}
              className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-center ${
                active
                  ? 'bg-orange/10 text-orange'
                  : completed
                    ? 'text-leaf'
                    : 'text-stone-400'
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${
                  active
                    ? 'bg-orange text-white'
                    : completed
                      ? 'bg-leaf text-white'
                      : 'bg-stone-100'
                }`}
              >
                {completed ? <Check size={13} aria-hidden="true" /> : index + 1}
              </span>
              <span className="w-full truncate text-[10px] font-bold leading-4 sm:hidden">
                {stage.short}
              </span>
              <span className="hidden text-xs font-bold leading-4 sm:block">{stage.label}</span>
            </li>
          )
        })}
      </ol>
      <p className="sr-only">当前步骤：{stages[currentIndex]?.label}</p>
    </nav>
  )
}
