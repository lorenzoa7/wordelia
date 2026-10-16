// Import Markdown notes (for example from Obsidian) into a planning category.

import { entryFromFile } from '@shared/book'
import { invoke } from '@/lib/api'
import { categoryName, getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'

/** Remove Obsidian embeds and footers that make no sense outside the vault. */
function cleanObsidian(body: string): string {
  return body
    .replace(/!\[\[[^\]]*\]\]\s*/g, '')
    .replace(/\^\[\[[^\]]*\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function importNotes(category: string): Promise<void> {
  const notes = await invoke('import:pickNotes')
  if (!notes.length) return
  let n = 0
  for (const note of notes) {
    const parsed = entryFromFile(`${category}/${note.name}.md`, note.text, 'tmp')
    await useBook.getState().createEntry(category, note.name, cleanObsidian(parsed.body) + '\n', {
      aliases: parsed.aliases,
      summary: parsed.summary
    })
    n++
  }
  const t = getT()
  const def = useBook.getState().manifest?.planning.categories.find((c) => c.folder === category)
  toast(t.plan.imported(n, def ? categoryName(t, def) : category))
}
