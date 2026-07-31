import type { ReactNode } from 'react'

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${index}-${part}`}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={`${index}-${part}`}
          className="rounded bg-stone-200 px-1.5 py-0.5 text-[0.92em]"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

export function MarkdownReport({ markdown }: { markdown: string }) {
  const blocks = markdown.replace(/\r\n/g, '\n').split('\n')
  const content: ReactNode[] = []
  let list: string[] = []

  const flushList = () => {
    if (!list.length) return
    const items = list
    content.push(
      <ul
        key={`list-${content.length}`}
        className="my-3 list-disc space-y-2 pl-5 text-sm leading-7 text-stone-700"
      >
        {items.map((item, index) => (
          <li key={`${index}-${item}`}>{inline(item)}</li>
        ))}
      </ul>,
    )
    list = []
  }

  blocks.forEach((rawLine) => {
    const line = rawLine.trim()
    const listMatch = line.match(/^[-*]\s+(.+)$/)
    if (listMatch) {
      list.push(listMatch[1])
      return
    }
    flushList()
    if (!line) return
    if (line.startsWith('### ')) {
      content.push(
        <h4 key={`h4-${content.length}`} className="mb-2 mt-5 text-base font-black">
          {inline(line.slice(4))}
        </h4>,
      )
      return
    }
    if (line.startsWith('## ')) {
      content.push(
        <h3 key={`h3-${content.length}`} className="mb-2 mt-7 text-lg font-black text-ink">
          {inline(line.slice(3))}
        </h3>,
      )
      return
    }
    if (line.startsWith('# ')) {
      content.push(
        <h2 key={`h2-${content.length}`} className="mb-3 mt-1 text-2xl font-black text-ink">
          {inline(line.slice(2))}
        </h2>,
      )
      return
    }
    if (line.startsWith('> ')) {
      content.push(
        <blockquote
          key={`quote-${content.length}`}
          className="my-3 border-l-4 border-orange/40 bg-orange/5 px-4 py-2 text-sm leading-7 text-stone-600"
        >
          {inline(line.slice(2))}
        </blockquote>,
      )
      return
    }
    content.push(
      <p key={`p-${content.length}`} className="my-2 text-sm leading-7 text-stone-700">
        {inline(line)}
      </p>,
    )
  })
  flushList()

  return <div>{content}</div>
}

