import { describe, expect, it } from 'vitest'
import { MARGIN_MAX, MARGIN_W, columnFits, layoutCards, marginWidth, pagesOffset } from './layout'

describe('the cards in the margin', () => {
  it('keeps the order of the list', () => {
    const out = layoutCards(
      [
        { id: 'a', top: 300, height: 80 },
        { id: 'b', top: 100, height: 80 },
        { id: 'c', top: 600, height: 80 }
      ],
      10
    )
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    // A card never goes above the card before it.
    expect(out[1].top).toBe(390)
  })

  it('pushes a card down when the card above it takes its place', () => {
    const out = layoutCards(
      [
        { id: 'a', top: 100, height: 120 },
        { id: 'b', top: 150, height: 60 },
        { id: 'c', top: 200, height: 40 }
      ],
      8
    )
    expect(out).toEqual([
      { id: 'a', top: 100 },
      { id: 'b', top: 228 },
      { id: 'c', top: 296 }
    ])
  })

  it('keeps the tops of the cards when there is room', () => {
    const items = [
      { id: 'a', top: 100, height: 60 },
      { id: 'b', top: 200, height: 60 },
      { id: 'c', top: 400, height: 60 }
    ]
    expect(layoutCards(items, 10)).toEqual(items.map(({ id, top }) => ({ id, top })))
  })

  it('gives no cards for no items', () => {
    expect(layoutCards([], 10)).toEqual([])
  })
})

describe('room for the column on the desk', () => {
  // An A5 page at 100 %: 559 px.
  const PAGE = 559

  it('fits when the desk has the page and the column', () => {
    // 1440 px with the chat (400) and the chapter list (256): the desk has 774 px.
    expect(columnFits(774, PAGE)).toBe(false)
    // The chapter list closed: 1030 px.
    expect(columnFits(1030, PAGE)).toBe(true)
    expect(columnFits(PAGE + MARGIN_W, PAGE)).toBe(true)
    expect(columnFits(PAGE + MARGIN_W - 1, PAGE)).toBe(false)
  })

  it('puts the page in the middle of the desk without the column', () => {
    expect(pagesOffset(1000, 600, 0)).toBe(200)
    // Pages wider than the desk start at its left edge.
    expect(pagesOffset(500, 600, 0)).toBe(0)
  })

  it('puts the page and the column together in the middle of the desk', () => {
    // The page (600 with its side room) and a column of 300 in 1100: 100 px on each side.
    expect(pagesOffset(1100, 600, 300)).toBe(100)
    // No room on the sides: the page goes to the left edge of the desk.
    expect(pagesOffset(850, 600, 300)).toBe(0)
    // No column: the page alone in the middle.
    expect(pagesOffset(1000, 600, 0)).toBe(200)
  })

  it('gives the column the room beside the page, from MARGIN_W to MARGIN_MAX', () => {
    // The pages with their side room: 623 px. 1440 px with the chat, the chapter list closed: 1030 px.
    expect(marginWidth(1030, 623)).toBe(MARGIN_MAX)
    // Less room than the narrowest column: the narrowest column (the page fits in the rest).
    expect(marginWidth(900, 623)).toBe(MARGIN_W)
    expect(marginWidth(990, 623)).toBe(367)
    expect(marginWidth(2000, 623)).toBe(MARGIN_MAX)
  })
})
