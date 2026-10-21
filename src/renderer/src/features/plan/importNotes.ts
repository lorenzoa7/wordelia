// Import Markdown notes (for example from Obsidian) into a planning category. The plan of the
// import (names, front matter, embeds) is in src/shared/planning/import.ts.

import { planImport } from '@shared/planning/import'
import { invoke } from '@/lib/api'
import { categoryName, getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'

export async function importNotes(category: string): Promise<void> {
  const picked = await invoke('import:pickNotes')
  if (!picked.notes.length && !picked.left) return
  const book = useBook.getState()
  // A name that a note of the book has gets " 2": two notes with one name would confuse the links.
  const taken = book.entries.flatMap((e) => [e.name, ...e.aliases])
  const items = planImport(picked.notes, category, taken)
  for (const item of items) await useBook.getState().createEntry(category, item.name, item.body, item.extra)

  const t = getT()
  const def = book.manifest?.planning.categories.find((c) => c.folder === category)
  const renamed = items.filter((i) => i.renamedFrom).map((i) => t.plan.importRenamedItem(i.renamedFrom!, i.name))
  const parts = [t.plan.imported(items.length, def ? categoryName(t, def) : category)]
  if (renamed.length) parts.push(t.plan.importRenamed(renamed.join('; ')))
  if (picked.left) parts.push(t.plan.importLeftOut(picked.left, picked.max))
  // A longer message stays longer on screen.
  toast(parts.join(' '), { ms: parts.length > 1 ? 9000 : undefined })
}
