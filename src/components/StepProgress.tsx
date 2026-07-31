import { Check } from 'lucide-react'

const steps = ['选择目标', '录入食品', '检查数据', '比较结果']

export function StepProgress({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="比较步骤" className="border-b border-stone-200/70 bg-white/65">
      <ol className="mx-auto grid max-w-4xl grid-cols-4 px-3 py-4 sm:px-6">
        {steps.map((label, index) => {
          const step = index + 1
          const complete = currentStep > step
          const active = currentStep === step
          return (
            <li key={label} className="relative flex flex-col items-center gap-2 text-center">
              {index < steps.length - 1 && (
                <span
                  className={`absolute left-[58%] top-3.5 h-px w-[84%] ${
                    currentStep > step ? 'bg-leaf' : 'bg-stone-200'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 grid h-7 w-7 place-items-center rounded-full text-xs font-bold transition ${
                  complete
                    ? 'bg-leaf text-white'
                    : active
                      ? 'bg-orange text-white ring-4 ring-orange/10'
                      : 'border border-stone-300 bg-white text-stone-500'
                }`}
              >
                {complete ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : step}
              </span>
              <span
                className={`text-[11px] leading-4 sm:text-sm ${
                  active ? 'font-bold text-ink' : 'font-medium text-stone-500'
                }`}
              >
                {label}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
