import { ArrowRight, Camera, FlaskConical, SlidersHorizontal } from 'lucide-react'

interface Props {
  onStart: () => void
  onDemo: () => void
  onAdvanced: () => void
}

export function HomeScreen({ onStart, onDemo, onAdvanced }: Props) {
  return (
    <div className="mx-auto max-w-4xl py-4 sm:py-10">
      <section className="relative overflow-hidden rounded-[2rem] bg-ink px-5 py-10 text-white shadow-card sm:px-10 sm:py-14">
        <div
          className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[36px] border-orange/20"
          aria-hidden="true"
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-bold tracking-[0.18em] text-orange">拍包装 · 看差别 · 再决定</p>
          <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-6xl">
            两款食品，<br />拍完直接比。
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-stone-300 sm:text-base">
            添加包装标签照片，LabelLens 会识别营养信息并先给你一个简单、可核查的比较结果。
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl bg-orange px-6 font-black text-white transition hover:bg-orange/90"
            >
              <Camera size={21} aria-hidden="true" />
              拍照开始比较
              <ArrowRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onDemo}
              className="inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-6 font-black text-white transition hover:bg-white/15"
            >
              <FlaskConical size={20} aria-hidden="true" />
              使用示例看看
            </button>
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={onAdvanced}
        className="mx-auto mt-6 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-stone-500 transition hover:bg-white hover:text-ink"
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        高级比较模式：手动录入、预算与自定义要求
      </button>
    </div>
  )
}
