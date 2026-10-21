// Find planning entries by name for [[wiki links]], and open them.

import { nameKey, parseWikiTarget } from '@shared/planning/notes'
import type { Entry } from '@shared/types'
import { getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { createFromLink } from './noteActions'

/** The note with this name, else the note with this alias. "Marta#Role" finds Marta. */
export function findEntryByName(name: string): Entry | undefined {
  const n = nameKey(parseWikiTarget(name).name)
  if (!n) return undefined
  const entries = useBook.getState().entries
  return entries.find((e) => nameKey(e.name) === n) ?? entries.find((e) => e.aliases.some((a) => nameKey(a) === n))
}

/** Scroll the open note to its heading with this text, as soon as the note is on screen. */
function revealHeading(entryId: string, heading: string): void {
  const want = nameKey(heading)
  let tries = 0
  const look = (): void => {
    const found = [...document.querySelectorAll<HTMLElement>(`.entry-page[data-entry="${entryId}"] .note-text :is(h1, h2, h3, h4, h5, h6)`)].find(
      (h) => nameKey(h.textContent ?? '') === want
    )
    if (found) found.scrollIntoView({ block: 'start', behavior: 'smooth' })
    else if (++tries < 40) requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
}

/** Open the note of a link (at its heading, for [[Name#Heading]]); for a missing note, offer to create it. */
export function openWikiLink(name: string, heading = ''): void {
  const target = parseWikiTarget(name)
  const e = findEntryByName(target.name)
  const at = heading || target.heading
  if (e) {
    useBook.getState().selectEntry(e.id)
    if (at) revealHeading(e.id, at)
    return
  }
  const t = getT()
  toast(t.plan.links.noEntry(target.name), {
    action: { label: t.plan.links.createIt, run: () => void createFromLink(target.name) }
  })
}

/** The options of the WikiLinks extension: a link opens with Ctrl+click, in notes and in chapters. */
export const wikiLinkOptions = (plainClick = false) => ({
  exists: (name: string) => Boolean(findEntryByName(name)),
  open: openWikiLink,
  plainClick,
  hint: (exists: boolean) => (exists ? getT().plan.links.openHint : getT().plan.links.missingHint)
})
