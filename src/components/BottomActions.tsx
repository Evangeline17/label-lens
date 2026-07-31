import { ArrowLeft, ArrowRight } from 'lucide-react'

interface Props {
  onBack?: () => void
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
}

export function BottomActions({
  onBack,
  onNext,
  nextLabel,
  nextDisabled = false,
}: Props) {
  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-stone-200 bg-canvas/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0">
      <div className="mx-auto flex max-w-3xl gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white px-5 font-bold text-stone-700 transition hover:border-stone-400"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            返回
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="inline-flex min-h-12 flex-[1.6] items-center justify-center gap-2 rounded-2xl bg-ink px-5 font-bold text-white shadow-lg shadow-stone-900/10 transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {nextLabel}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
