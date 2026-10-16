// Find planning entries by name for [[wiki links]].

import type { Entry } from '@shared/types'
import { getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'

export function findEntryByName(name: string): Entry | undefined {
  const n = name.trim().toLowerCase()
  const entries = useBook.getState().entries
  return entries.find((e) => e.name.toLowerCase() === n) ?? entries.find((e) => e.aliases.some((a) => a.toLowerCase() === n))
}

export function openWikiLink(name: string): void {
  const e = findEntryByName(name)
  if (e) {
    useBook.getState().selectEntry(e.id)
    return
  }
  const t = getT()
  toast(t.plan.links.noEntry(name), {
    action: {
      label: t.plan.links.createIt,
      run: () => {
        const cats = useBook.getState().manifest?.planning.categories ?? []
        const folder = cats.find((c) => c.folder === 'Notes')?.folder ?? cats[0]?.folder ?? 'Notes'
        void useBook.getState().createEntry(folder, name).then((created) => useBook.getState().selectEntry(created.id))
      }
    }
  })
}

export const wikiLinkOptions = (plainClick: boolean) => ({
  exists: (name: string) => Boolean(findEntryByName(name)),
  open: openWikiLink,
  plainClick
})
