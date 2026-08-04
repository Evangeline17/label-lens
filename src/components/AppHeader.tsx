import { ScanSearch } from 'lucide-react'

export function AppHeader() {
  return (
    <header className="border-b border-stone-200/70 bg-canvas/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-white shadow-sm">
            <ScanSearch aria-hidden="true" size={20} strokeWidth={2.2} />
          </span>
          <div>
            <p className="font-bold tracking-tight">标签真相局</p>
            <p className="text-xs font-medium tracking-[0.12em] text-stone-500">LABELLENS</p>
          </div>
        </div>
        <span className="hidden rounded-full border border-orange/20 bg-orange/10 px-3 py-1.5 text-xs font-semibold text-orange sm:inline-flex">
          食品货架对比器
        </span>
      </div>
    </header>
  )
}
