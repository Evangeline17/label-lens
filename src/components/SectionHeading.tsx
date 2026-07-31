import type { LucideIcon } from 'lucide-react'

interface Props {
  eyebrow?: string
  title: string
  description?: string
  icon?: LucideIcon
}

export function SectionHeading({ eyebrow, title, description, icon: Icon }: Props) {
  return (
    <div className="mb-6 flex items-start gap-3">
      {Icon && (
        <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange/10 text-orange">
          <Icon size={20} aria-hidden="true" />
        </span>
      )}
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-orange">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        {description && <p className="mt-1.5 text-sm leading-6 text-stone-600">{description}</p>}
      </div>
    </div>
  )
}
