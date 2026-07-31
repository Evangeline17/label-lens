import type { ReactNode } from 'react'

interface FieldShellProps {
  label: string
  htmlFor: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}

export function FieldShell({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
}: FieldShellProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-stone-700" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-1 text-brick">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-brick">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs leading-5 text-stone-500">{hint}</p>
      ) : null}
    </div>
  )
}

export const inputClass =
  'min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-stone-400 focus:border-orange focus:ring-4 focus:ring-orange/10'

export const errorInputClass = 'border-brick focus:border-brick focus:ring-brick/10'
