import { describe, expect, it } from 'vitest'
import { newPage } from './pagination'

const brk = (pos: number, forced = false, inline = false): { pos: number; inline: boolean; forced: boolean } => ({ pos, inline, forced })

describe('newPage: the page that comes in after an edit', () => {
  it('is the new last page when the text grows past the end', () => {
    expect(newPage([brk(100)], [brk(100), brk(300, false, true)], 305)).toBe(1)
  })

  it('is the page after a new page break, also in the middle of a chapter', () => {
    expect(newPage([brk(100), brk(400)], [brk(100), brk(200, true), brk(480)], 202)).toBe(1)
  })

  it('is no page when a line goes to a page that was there before', () => {
    // Typing on page 1 pushes its last line to page 2, and the chapter gets one more page at its end.
    expect(newPage([brk(100), brk(400)], [brk(95), brk(390), brk(700)], 97)).toBe(-1)
  })

  it('is no page when the break before the cursor did not change', () => {
    expect(newPage([brk(100)], [brk(100), brk(600)], 150)).toBe(-1)
  })

  it('is no page on the first page', () => {
    expect(newPage([], [brk(500)], 20)).toBe(-1)
  })
})
