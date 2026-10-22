// The column of the comment cards beside the page: its width, the places of the cards, and the room on the
// desk. Pure code: the margin (Margin.tsx) and the zoom of the desk (editor/zoom.ts) use it.

/** The width of the column of the cards on the desk, in pixels on screen: the cards (272) and the room around them. */
export const MARGIN_W = 300
/** The width of a card */
export const CARD_W = 272
/** The room between the page and the cards */
export const CARD_INSET = (MARGIN_W - CARD_W) / 2

export interface CardBox {
  id: string
  /** The place that the card wants: next to its passage */
  top: number
  height: number
}

/**
 * The tops of the cards in the column, in the order of the list. A card is next to its passage, or lower
 * when the card above it takes that place. Two cards never overlap: there are `gap` pixels between them.
 */
export function layoutCards(items: CardBox[], gap: number): { id: string; top: number }[] {
  let free = -Infinity
  return items.map((it) => {
    const top = Math.max(it.top, free)
    free = top + it.height + gap
    return { id: it.id, top }
  })
}

/** The desk has room for a page at 100 % (`pageWidth`) and the column of the cards to its right. */
export function columnFits(deskWidth: number, pageWidth: number): boolean {
  return deskWidth - pageWidth >= MARGIN_W
}

/**
 * The left offset of the scaled pages on the desk. `width` is the width of the pages with their room on the
 * sides, at the scale on screen. Without the column, the pages are in the middle of the desk. With the
 * column, the pages and the column together are in the middle, or the pages start at the left edge when there
 * is no more room.
 */
export function pagesOffset(room: number, width: number, column: boolean): number {
  if (column) return Math.max(0, (room - width - MARGIN_W) / 2)
  return width < room ? (room - width) / 2 : 0
}
