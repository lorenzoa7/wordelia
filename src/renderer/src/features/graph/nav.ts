// Navigation to and from the map.
//
// The map is a view of the Plan overview. It uses the `activeCategory` of the book store with a
// value that no category folder can have (":" is not valid in a Windows file name), so the sidebar,
// the back links and Alt+← work as for the other Plan pages.
// An entry that the user opens from the map remembers it: its back link goes to the map.

import { create } from 'zustand'
import { useBook } from '@/stores/book'

export const MAP_PAGE = ':map'
/** The story line, the third view of the Plan overview */
export const LINE_PAGE = ':line'

interface MapNav {
  /** The entry that the user opened from the map, while it is open */
  returnTo: string | null
}

export const useMapNav = create<MapNav>(() => ({ returnTo: null }))

// Another entry or page clears the way back.
useBook.subscribe((s) => {
  const r = useMapNav.getState().returnTo
  if (r && s.activeEntryId !== r) useMapNav.setState({ returnTo: null })
})

export function openMap(): void {
  useBook.getState().selectCategory(MAP_PAGE)
}

export function openLine(): void {
  useBook.getState().selectCategory(LINE_PAGE)
}

export function openCards(): void {
  useBook.getState().selectCategory(null)
}

/** Open an entry from the map. Its back link goes to the map. */
export function openEntryFromMap(id: string): void {
  useMapNav.setState({ returnTo: id })
  useBook.getState().selectEntry(id)
}

/** The back link of this entry goes to the map. */
export function useReturnsToMap(entryId: string): boolean {
  return useMapNav((s) => s.returnTo === entryId)
}

/** One level up from the map or from an entry opened from it. False when it is not a map page. */
export function mapBack(): boolean {
  const s = useBook.getState()
  if (s.activeEntryId && useMapNav.getState().returnTo === s.activeEntryId) {
    openMap()
    return true
  }
  if (!s.activeEntryId && (s.activeCategory === MAP_PAGE || s.activeCategory === LINE_PAGE)) {
    openCards()
    return true
  }
  return false
}
