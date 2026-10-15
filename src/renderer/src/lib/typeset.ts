// Give text from the AI the typography of the open book: its quotes and its ellipsis.

import { quotesFor, typesetText } from '@shared/text/quotes'
import { useBook } from '@/stores/book'

export function typesetForBook(markdown: string): string {
  const m = useBook.getState().manifest
  if (!m) return markdown
  return typesetText(markdown, quotesFor(m.language), { quotes: m.typography.smartQuotes, ellipsis: m.typography.smartEllipsis })
}
