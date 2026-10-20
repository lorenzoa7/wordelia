// Navigation between the pages of the Plan view, like a browser.
//
// The map and the story line are views of the Plan overview. They use the `activeCategory` of the
// book store with values that no category folder can have (":" is not valid in a Windows file name).
//
// Each move to another Plan page records the page that the author leaves. Back (the back link,
// Alt+← and the back button of a mouse) goes to that page: from a note that the author opened on
// the story line, back goes to the story line, not to the category of the note. With no page to go
// back to, back goes one level up: from a note to its category, from a category, the map or the
// line to the overview.

import { create } from 'zustand'
import { useBook } from '@/stores/book'

export const MAP_PAGE = ':map'
/** The story line, the third view of the Plan overview */
export const LINE_PAGE = ':line'

/** A page of the Plan view: a category page (or the map, the line, the overview: null), or a note */
export interface PlanPlace {
  category: string | null
  entry: string | null
}

interface PlanNav {
  /** The pages before the page on screen, the newest last */
  back: PlanPlace[]
}

export const usePlanNav = create<PlanNav>(() => ({ back: [] }))

const LIMIT = 50
/** True while back moves: that move does not go into the history */
let stepping = false

function same(a: PlanPlace, b: PlanPlace): boolean {
  return a.category === b.category && a.entry === b.entry
}

useBook.subscribe((s, prev) => {
  // Another book: a new history.
  if (s.root !== prev.root) {
    usePlanNav.setState({ back: [] })
    return
  }
  const was: PlanPlace = { category: prev.activeCategory, entry: prev.activeEntryId }
  const now: PlanPlace = { category: s.activeCategory, entry: s.activeEntryId }
  if (same(was, now) || stepping) return
  const back = usePlanNav.getState().back
  usePlanNav.setState({ back: [...(back.length >= LIMIT ? back.slice(1) : back), was] })
})

/** A page that still exists (a note can be deleted, a category removed). */
function exists(p: PlanPlace): boolean {
  const s = useBook.getState()
  if (p.entry) return s.entries.some((e) => e.id === p.entry)
  if (!p.category || p.category === MAP_PAGE || p.category === LINE_PAGE) return true
  return Boolean(s.manifest?.planning.categories.some((c) => c.folder === p.category))
}

/** One level up from the page on screen, or null on the overview. */
function parent(): PlanPlace | null {
  const s = useBook.getState()
  const entry = s.entries.find((e) => e.id === s.activeEntryId)
  if (entry) return { category: entry.category, entry: null }
  if (s.activeCategory) return { category: null, entry: null }
  return null
}

/** The page that back goes to, or null when there is none. */
export function backPlace(): PlanPlace | null {
  const s = useBook.getState()
  const here: PlanPlace = { category: s.activeCategory, entry: s.activeEntryId }
  const back = usePlanNav.getState().back
  for (let i = back.length - 1; i >= 0; i--) if (exists(back[i]) && !same(back[i], here)) return back[i]
  return parent()
}

/** The page that back goes to, for the label of a back link. It changes with the history. */
export function useBackPlace(): PlanPlace | null {
  usePlanNav((n) => n.back)
  useBook((s) => `${s.activeCategory}|${s.activeEntryId}|${s.entries.length}`)
  return backPlace()
}

/** Go back one page. False when there is no page to go back to (the overview with no history). */
export function planBack(): boolean {
  const s = useBook.getState()
  const here: PlanPlace = { category: s.activeCategory, entry: s.activeEntryId }
  const back = [...usePlanNav.getState().back]
  let to: PlanPlace | null = null
  while (back.length) {
    const p = back.pop()!
    if (exists(p) && !same(p, here)) {
      to = p
      break
    }
  }
  to ??= parent()
  if (!to) return false
  stepping = true
  try {
    usePlanNav.setState({ back })
    useBook.setState({ view: 'plan', activeCategory: to.category, activeEntryId: to.entry })
  } finally {
    stepping = false
  }
  return true
}

export function openMap(): void {
  useBook.getState().selectCategory(MAP_PAGE)
}

export function openLine(): void {
  useBook.getState().selectCategory(LINE_PAGE)
}

export function openCards(): void {
  useBook.getState().selectCategory(null)
}

/** Open an entry from the map. Back goes to the map. */
export function openEntryFromMap(id: string): void {
  useBook.getState().selectEntry(id)
}
