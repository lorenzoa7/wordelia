import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_EXPORT, DEFAULT_TYPOGRAPHY } from '../book'
import type { ExportSettings, Typography } from '../types'
import { chapterPages, estimatePages, headingHeight, lineCount, pageLayout, type PageBook } from './pages'

const book = (typo: Partial<Typography> = {}, exp: Partial<ExportSettings> = {}): PageBook => ({
  typography: { ...DEFAULT_TYPOGRAPHY, ...typo },
  export: { ...DEFAULT_EXPORT, ...exp }
})

/** The chapters of a sample book, without their frontmatter. */
function sample(dir: string): Array<{ title: string; body: string }> {
  const path = join('e2e/fixtures', dir, 'manuscript')
  return readdirSync(path)
    .sort()
    .map((f) => ({ title: f.replace(/\.md$/, ''), body: readFileSync(join(path, f), 'utf8').replace(/^---[\s\S]*?---\s*/, '') }))
}

/** A long chapter: the text of a sample book 14 times, with scene breaks. */
function longChapter(dir: string): { title: string; body: string } {
  const all = sample(dir)
    .map((c) => c.body)
    .join('\n\n* * *\n\n')
  return { title: 'Um capítulo longo', body: Array.from({ length: 14 }, (_, i) => all + (i % 3 === 2 ? '\n\n* * *\n\n' : '\n\n')).join('') }
}

/** A chapter of short dialogue lines. */
const dialogue = {
  title: 'Diálogo',
  body: Array.from({ length: 120 }, (_, i) => (i % 2 ? '— Sim — disse ela.' : `— Você viu o bote número ${i}? — perguntou Elias, olhando para o mar.`)).join('\n\n')
}

describe('page layout', () => {
  it('A5 with the default margins and typography, in CSS pixels', () => {
    const l = pageLayout(book())
    expect(l.textWidth).toBeCloseTo(((148 - 18 - 14) * 96) / 25.4, 3)
    expect(l.textHeight).toBeCloseTo(((210 - 20 - 20) * 96) / 25.4, 3)
    expect(l.fontPx).toBe(16)
    expect(l.linePx).toBeCloseTo(25.6, 6)
    expect(l.indentPx).toBe(24)
  })
  it('a font that the table does not know gets middle widths', () => {
    const l = pageLayout(book({ fontFamily: 'Some Font' }))
    expect(l.char).toBeGreaterThan(0.4)
    expect(l.char).toBeLessThan(0.6)
  })
  it('the heading takes the height that the app measured (183.7 px for 12 pt)', () => {
    expect(headingHeight('A Tempestade', pageLayout(book()))).toBeCloseTo(183.7, 0)
  })
  it('a long title wraps and makes the heading taller', () => {
    const l = pageLayout(book())
    expect(headingHeight('A Tempestade que Chegou do Norte na Noite em que Elias Perdeu a Conta dos Barcos', l)).toBeGreaterThan(headingHeight('A Tempestade', l) + 20)
  })
})

describe('lines of a paragraph', () => {
  const w = { char: 0.5, space: 0.25 }
  it('fills each line with whole words', () => {
    // 10 px a character and 5 px a space at 20 px: "aaaa" is 40 px, so two words and a space need 85 px.
    expect(lineCount(['aaaa aaaa'], 85, 0, 20, w)).toBe(1)
    expect(lineCount(['aaaa aaaa'], 84, 0, 20, w)).toBe(2)
    expect(lineCount(['aaaa aaaa aaaa'], 130, 0, 20, w)).toBe(1)
  })
  it('the first line is shorter by the indent', () => {
    expect(lineCount(['aaaa aaaa'], 85, 10, 20, w)).toBe(2)
  })
  it('an empty paragraph is one line, and each line break starts a line', () => {
    expect(lineCount([''], 100, 0, 20, w)).toBe(1)
    expect(lineCount(['aa', 'aa', ''], 100, 0, 20, w)).toBe(3)
  })
  it('a word longer than the line takes its own line', () => {
    expect(lineCount(['a aaaaaaaaaaaaaaaaaaaa a'], 100, 0, 20, w)).toBe(3)
  })
})

describe('pages of a chapter', () => {
  const l = pageLayout(book())
  // 25 lines of 25.6 px fit in a page of 642.5 px; the heading leaves 17 on the first page.
  const lines = (n: number): string => Array.from({ length: n }, () => 'Uma linha.').join('\n\n')
  it('an empty chapter is one page', () => {
    expect(chapterPages({ title: 'Um', body: '' }, l)).toBe(1)
  })
  it('the first page holds the heading and 17 lines, the next pages 25', () => {
    expect(chapterPages({ title: 'Um', body: lines(17) }, l)).toBe(1)
    expect(chapterPages({ title: 'Um', body: lines(18) }, l)).toBe(2)
    expect(chapterPages({ title: 'Um', body: lines(17 + 25) }, l)).toBe(2)
    expect(chapterPages({ title: 'Um', body: lines(17 + 26) }, l)).toBe(3)
  })
  it('a page break starts a new page', () => {
    expect(chapterPages({ title: 'Um', body: 'Antes.\n\n<!-- page break -->\n\nDepois.' }, l)).toBe(2)
  })
  it('the space after a paragraph and the margin of a scene break become one', () => {
    // The space after each paragraph (1.2 em) is not larger than the margin of the scene break after it (1.2 em).
    const spaced = pageLayout(book({ paragraphSpacing: 1.2 }))
    for (let n = 1; n <= 40; n++) {
      const body = Array.from({ length: n }, () => 'Uma linha.\n\n* * *').join('\n\n')
      expect(chapterPages({ title: 'Um', body }, spaced), `${n} scenes`).toBe(chapterPages({ title: 'Um', body }, l))
    }
  })
  it('each chapter starts on a new page; a book without chapters has no pages', () => {
    expect(estimatePages([], book())).toBe(0)
    expect(estimatePages([{ title: 'Um', body: 'Texto.' }, { title: 'Dois', body: 'Texto.' }], book())).toBe(2)
  })
})

/**
 * The pages that the Write view showed for real-looking chapters (counted on screen on 2026-10-18:
 * the sheets and their page gaps). The estimate must stay within 10%, or one page for a short book.
 */
describe('the estimate against the pages on screen', () => {
  const configs: Array<{ name: string; typo: Partial<Typography>; exp: Partial<ExportSettings>; pt: [number, number, number]; en: [number, number, number] }> = [
    { name: 'A5, Literata 12/1.6', typo: {}, exp: {}, pt: [22, 8, 3], en: [23, 8, 3] },
    { name: 'A5, EB Garamond 11/1.45', typo: { fontFamily: 'EB Garamond', fontSize: 11, lineHeight: 1.45 }, exp: {}, pt: [16, 5, 2], en: [16, 5, 2] },
    { name: '6 × 9 in, Lora 11/1.5', typo: { fontFamily: 'Lora', fontSize: 11, lineHeight: 1.5 }, exp: { pageSize: 'Trade6x9', margins: { top: 19, bottom: 19, inner: 19, outer: 16 } }, pt: [16, 6, 2], en: [16, 6, 2] },
    { name: 'A4, Times New Roman 12/2', typo: { fontFamily: 'Times New Roman', fontSize: 12, lineHeight: 2 }, exp: { pageSize: 'A4', margins: { top: 25.4, bottom: 25.4, inner: 25.4, outer: 25.4 } }, pt: [14, 5, 2], en: [14, 5, 2] },
    { name: 'Letter, Courier Prime 12/2', typo: { fontFamily: 'Courier Prime', fontSize: 12, lineHeight: 2 }, exp: { pageSize: 'Letter', margins: { top: 25.4, bottom: 25.4, inner: 25.4, outer: 25.4 } }, pt: [19, 7, 3], en: [19, 7, 3] },
    { name: 'A5, Merriweather 10/1.5, paragraph space', typo: { fontFamily: 'Merriweather', fontSize: 10, lineHeight: 1.5, paragraphSpacing: 0.6 }, exp: {}, pt: [18, 8, 3], en: [17, 8, 2] }
  ]
  const near = (estimate: number, screen: number): void => {
    expect(Math.abs(estimate - screen)).toBeLessThanOrEqual(Math.max(1, screen * 0.1))
  }
  for (const c of configs) {
    it(c.name, () => {
      const b = book(c.typo, { margins: { top: 20, bottom: 20, inner: 18, outer: 14 }, ...c.exp })
      for (const [dir, [long, talk, small]] of [['sample-book', c.pt], ['sample-book-en', c.en]] as const) {
        near(estimatePages([longChapter(dir)], b), long)
        near(estimatePages([dialogue], b), talk)
        near(estimatePages(sample(dir), b), small)
      }
    })
  }
})
