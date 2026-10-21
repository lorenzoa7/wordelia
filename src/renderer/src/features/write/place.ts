// Where the author was in a book: the view, the chapter on the screen, the scroll and the cursor.
// The book opens there again. The place stays in the local storage of the app (in the app data
// folder), for each book folder, and not in the book: a synced book gets no conflicts from it.

import type { BookView } from '@/stores/book'

export interface Place {
  view: BookView
  /** The chapter at the top of the desk, and how far down its sheet the top of the desk is (0 to 1) */
  top?: { chapterId: string; part: number }
  /** The cursor or the selection, in the text of a chapter */
  cursor?: { chapterId: string; anchor: number; head: number }
  /** When the place was saved (for the limit of kept books) */
  at: number
}

const KEY = 'wordelia.places'
/** The places of this many books stay; the oldest go. */
const MAX_BOOKS = 60

type Store = Record<string, Place>

const keyOf = (root: string): string => root.replace(/\\/g, '/').toLowerCase()

function read(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return v && typeof v === 'object' ? (v as Store) : {}
  } catch {
    return {}
  }
}

export function readPlace(root: string): Place | null {
  const p = read()[keyOf(root)]
  return p && (p.view === 'write' || p.view === 'plan') ? p : null
}

export function writePlace(root: string, place: Omit<Place, 'at'>): void {
  const store = read()
  store[keyOf(root)] = { ...place, at: Date.now() }
  const keys = Object.keys(store)
  if (keys.length > MAX_BOOKS) {
    for (const k of keys.sort((a, b) => store[a].at - store[b].at).slice(0, keys.length - MAX_BOOKS)) delete store[k]
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    /* storage may be off */
  }
}

/** The view and the active chapter for a book that opens: the remembered ones, when they still exist. */
export function openingPlace(root: string, chapterIds: string[]): { view: BookView; activeChapterId: string | null } {
  const p = readPlace(root)
  const id = p?.top?.chapterId
  return { view: p?.view ?? 'write', activeChapterId: id && chapterIds.includes(id) ? id : (chapterIds[0] ?? null) }
}
