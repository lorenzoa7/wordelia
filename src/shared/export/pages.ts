// An estimate of the pages of a book, as the Write view shows them (docs/ARCHITECTURE.md §7a).
// Pure code: the library card uses it in the main process, also for books that are not open.
//
// The model follows the page on screen:
// - The page has the page size and the margins of the book (`manifest.export`), at zoom 1.
// - The text has the font, the size, the line height, the indent and the paragraph space of the book
//   typography (`manifest.typography`).
// - Each chapter starts on a new page, under its heading. A page break (Ctrl+Enter) starts a new page.
// - Words fill each line from the left, and a word never breaks (the app has no hyphenation). A word
//   has the average width of the characters of its font (FONT_WIDTHS), times its number of characters.
// - A page is full when the next line does not fit in its text height.

import { parseMarkdown } from '../markdown/parse'
import type { BookManifest, DocNode } from '../types'
import { PAGE_SIZES } from './model'

/** CSS pixels in one millimeter, and in one point. */
const MM = 96 / 25.4
const PT = 4 / 3

/**
 * The average width of a character (letters and punctuation, without spaces) and of a space, in em.
 * Measured in the app with the canvas of the browser, on the prose of the two sample books. Then the
 * character width was fitted (by 1% or less) so that the lines of `lineCount` match the lines of the
 * browser for the paragraphs of that prose in boxes of ten widths (260 to 640 px): within 1% for each font.
 */
export const FONT_WIDTHS: Record<string, { char: number; space: number }> = {
  Literata: { char: 0.535, space: 0.2 },
  'EB Garamond': { char: 0.4261, space: 0.2 },
  'Crimson Pro': { char: 0.4475, space: 0.1875 },
  'Libre Baskerville': { char: 0.5636, space: 0.287 },
  Baskervville: { char: 0.4778, space: 0.264 },
  Lora: { char: 0.5082, space: 0.263 },
  Merriweather: { char: 0.5386, space: 0.237 },
  'Source Serif 4': { char: 0.5301, space: 0.237 },
  'Cormorant Garamond': { char: 0.4267, space: 0.234 },
  'Courier Prime': { char: 0.5996, space: 0.5996 },
  'Times New Roman': { char: 0.4426, space: 0.25 },
  Georgia: { char: 0.4923, space: 0.2412 },
  Arial: { char: 0.4832, space: 0.2778 }
}

/** A font that the table does not know: the middle of the serif fonts. */
const OTHER_FONT = { char: 0.5, space: 0.24 }

/** The layout of a page on screen, in CSS pixels at zoom 1. */
export interface PageLayout {
  /** The width of the text between the inner and the outer margin */
  textWidth: number
  /** The height of the text between the top and the bottom margin */
  textHeight: number
  fontPx: number
  linePx: number
  /** The first-line indent of a paragraph */
  indentPx: number
  /** The space after a paragraph */
  paragraphPx: number
  /** Book convention: the first paragraph of a chapter or a scene has no indent, unless this is true. */
  indentFirst: boolean
  char: number
  space: number
}

export type PageBook = Pick<BookManifest, 'export' | 'typography'>

export function pageLayout(book: PageBook): PageLayout {
  const size = PAGE_SIZES[book.export.pageSize] ?? PAGE_SIZES.A5
  const m = book.export.margins
  const t = book.typography
  const fontPx = t.fontSize * PT
  const widths = FONT_WIDTHS[t.fontFamily] ?? OTHER_FONT
  return {
    textWidth: (size.w - m.inner - m.outer) * MM,
    textHeight: (size.h - m.top - m.bottom) * MM,
    fontPx,
    linePx: fontPx * t.lineHeight,
    indentPx: t.firstLineIndent * fontPx,
    paragraphPx: t.paragraphSpacing * fontPx,
    indentFirst: t.indentFirstParagraph,
    char: widths.char,
    space: widths.space
  }
}

/**
 * The height of the chapter heading on the first page of a chapter (`.chapter-head` in editor.css):
 * the label ("Chapter One"), the number, the title (it can wrap), the short rule and the space under it.
 */
export function headingHeight(title: string, l: PageLayout): number {
  const label = 10.5 * 1.45 + 10
  const number = l.fontPx * 3.1
  const titleFont = l.fontPx * 1.15
  const titleLines = Math.max(1, lineCount([title], l.textWidth - 16, 0, titleFont, l))
  const titleBox = 14 + 4 + titleLines * titleFont * 1.3
  const rule = 22 + 1
  return label + number + titleBox + rule + 44
}

/**
 * The number of lines of one paragraph: `lines` are its parts between line breaks (Shift+Enter). Words
 * fill each line; the first line is shorter by `indent`.
 */
export function lineCount(lines: string[], width: number, indent: number, fontPx: number, l: Pick<PageLayout, 'char' | 'space'>): number {
  const charPx = l.char * fontPx
  const spacePx = l.space * fontPx
  let count = 0
  lines.forEach((text, part) => {
    const words = text.split(/\s+/).filter(Boolean)
    count++
    let room = width - (part === 0 ? indent : 0)
    let used = 0
    for (const word of words) {
      const w = [...word].length * charPx
      if (used === 0) {
        used = w
        continue
      }
      if (used + spacePx + w <= room + 0.01) used += spacePx + w
      else {
        count++
        room = width
        used = w
      }
    }
  })
  return count
}

/** The text of a block, in its parts between line breaks. */
function textParts(node: DocNode): string[] {
  const parts = ['']
  const walk = (n: DocNode): void => {
    if (n.type === 'text') parts[parts.length - 1] += n.text ?? ''
    else if (n.type === 'hardBreak') parts.push('')
    else n.content?.forEach(walk)
  }
  node.content?.forEach(walk)
  return parts
}

/** Lines and spaces of one chapter, in the order of the text. */
type Piece = { kind: 'lines'; count: number; height: number } | { kind: 'space'; height: number } | { kind: 'page' }

function chapterPieces(body: string, l: PageLayout): Piece[] {
  const out: Piece[] = []
  // Two margins that touch become one, the larger (CSS margin collapsing): a paragraph space and a scene break.
  const space = (height: number): void => {
    const last = out[out.length - 1]
    if (last?.kind === 'space') last.height = Math.max(last.height, height)
    else out.push({ kind: 'space', height })
  }
  // A block after which the next paragraph has no indent (the start, a scene break, a heading).
  let fresh = true
  const paragraph = (node: DocNode, width: number, indent: boolean): void => {
    const attrs = node.attrs ?? {}
    const centered = attrs.textAlign === 'center' || attrs.textAlign === 'right'
    const noIndent = attrs.noIndent === true || centered || !indent || (fresh && !l.indentFirst)
    out.push({ kind: 'lines', count: lineCount(textParts(node), width, noIndent ? 0 : l.indentPx, l.fontPx, l), height: l.linePx })
    if (l.paragraphPx) space(l.paragraphPx)
    fresh = false
  }
  const block = (node: DocNode, width: number, indent: boolean): void => {
    switch (node.type) {
      case 'paragraph':
        paragraph(node, width, indent)
        break
      case 'sceneBreak':
        space(1.2 * l.fontPx)
        out.push({ kind: 'lines', count: 1, height: l.linePx })
        space(1.2 * l.fontPx)
        fresh = true
        break
      case 'pageBreak':
        out.push({ kind: 'page' })
        break
      case 'heading': {
        const level = Number(node.attrs?.level ?? 2)
        const size = l.fontPx * (level === 1 ? 1.6 : level === 2 ? 1.3 : 1.1)
        space(1.6 * size)
        out.push({ kind: 'lines', count: lineCount(textParts(node), width, 0, size, l), height: size * 1.25 })
        space(0.7 * size)
        fresh = true
        break
      }
      case 'blockquote':
        space(l.fontPx)
        node.content?.forEach((n) => block(n, width - 2.5 * l.fontPx - 2, indent))
        space(l.fontPx)
        break
      case 'bulletList':
      case 'orderedList':
        node.content?.forEach((item) => item.content?.forEach((n) => block(n, width - 1.6 * l.fontPx, false)))
        break
      default:
        // An image or another block: about four lines.
        out.push({ kind: 'lines', count: 4, height: l.linePx })
    }
  }
  for (const node of parseMarkdown(body).content ?? []) block(node, l.textWidth, true)
  return out
}

/** The pages of one chapter: its heading takes the top of the first page. */
export function chapterPages(chapter: { title: string; body: string }, l: PageLayout): number {
  const H = l.textHeight + 0.75
  let pages = 1
  let y = headingHeight(chapter.title, l)
  for (const p of chapterPieces(chapter.body, l)) {
    if (p.kind === 'page') {
      pages++
      y = 0
    } else if (p.kind === 'space') {
      // A space at the end of a page does not move the text to the next page.
      y = Math.min(y + p.height, H)
    } else {
      for (let i = 0; i < p.count; i++) {
        if (y + p.height > H && y > 0) {
          pages++
          y = 0
        }
        y += p.height
      }
    }
  }
  return pages
}

/** The pages of the book on screen: each chapter starts on a new page. A book without chapters has none. */
export function estimatePages(chapters: Array<{ title: string; body: string }>, book: PageBook): number {
  const l = pageLayout(book)
  return chapters.reduce((n, c) => n + chapterPages(c, l), 0)
}
