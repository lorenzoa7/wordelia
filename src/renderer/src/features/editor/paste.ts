// Text that the author pastes into a chapter gets the look of the book:
// - HTML from Google Docs or Word keeps bold, italic and underline, and a centered or right-aligned
//   paragraph. Fonts, sizes, colors, spacing and a left or justified alignment go: the book
//   typography has them.
// - Images go (a web image cannot show in the book), and so do empty lines.
// - A line with "***" or "* * *" becomes a scene break.
// - Straight quotes, "--" and "..." become the quotes, the dash and the ellipsis of the book, as
//   for text from the AI.

import { Fragment, Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { quotesFor, typesetRun, type QuoteStyle, type TypesetOptions } from '@shared/text/quotes'

const KEEP = new Set(['font-weight', 'font-style', 'text-decoration', 'text-decoration-line'])

export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('[style]'))) {
    const kept: string[] = []
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style.item(i)
      if (KEEP.has(prop)) kept.push(`${prop}: ${el.style.getPropertyValue(prop)}`)
    }
    // Only an alignment that differs from the body text stays: a centered title, a signature at the right.
    const align = el.style.getPropertyValue('text-align')
    if (align === 'center' || align === 'right') kept.push(`text-align: ${align}`)
    if (kept.length) el.setAttribute('style', kept.join('; '))
    else el.removeAttribute('style')
  }
  for (const el of Array.from(doc.body.querySelectorAll('[align]'))) el.removeAttribute('align')
  for (const el of Array.from(doc.body.querySelectorAll('font'))) {
    el.replaceWith(...Array.from(el.childNodes))
  }
  for (const el of Array.from(doc.body.querySelectorAll('img, picture, svg, video, audio, iframe, object'))) el.remove()
  return doc.body.innerHTML
}

/** A paragraph that only holds a scene break mark */
const SCENE_BREAK_LINE = /^\s*(?:\*\s*\*\s*\*|⁂)\s*$/

export interface PasteStyle {
  quotes: QuoteStyle
  typeset: TypesetOptions
}

/** The typography of a book for pasted text. */
export function pasteStyleFor(language: string, t: { smartQuotes: boolean; smartEllipsis: boolean; dialogueDash: string }): PasteStyle {
  return { quotes: quotesFor(language), typeset: { quotes: t.smartQuotes, ellipsis: t.smartEllipsis, dash: t.dialogueDash } }
}

function isEmptyBlock(node: PMNode): boolean {
  if (!node.isTextblock) return false
  let empty = true
  node.forEach((child) => {
    if (child.isText ? (child.text ?? '').trim() : child.type.name !== 'hardBreak') empty = false
  })
  return empty
}

/** A textblock without line breaks at its start and its end, and with the typography of the book. */
function cleanTextblock(node: PMNode, style: PasteStyle): PMNode {
  const children: PMNode[] = []
  node.forEach((c) => {
    if (c.type.name !== 'image') children.push(c)
  })
  while (children[0]?.type.name === 'hardBreak') children.shift()
  while (children[children.length - 1]?.type.name === 'hardBreak') children.pop()
  let before = ''
  const content = children.map((c) => {
    if (!c.isText) {
      before = ''
      return c
    }
    const text = typesetRun(c.text ?? '', before, style.quotes, style.typeset)
    before = (before + text).slice(-3)
    return text === c.text ? c : node.type.schema.text(text, c.marks)
  })
  return node.copy(Fragment.from(content))
}

function cleanFragment(fragment: Fragment, schema: Schema, style: PasteStyle): Fragment {
  const out: PMNode[] = []
  fragment.forEach((node) => {
    if (node.type.name === 'image') return
    if (node.type.name === 'paragraph' && SCENE_BREAK_LINE.test(node.textContent) && schema.nodes.sceneBreak) {
      out.push(schema.nodes.sceneBreak.create())
      return
    }
    if (node.isTextblock) {
      if (isEmptyBlock(node)) return
      out.push(cleanTextblock(node, style))
      return
    }
    if (node.isText) {
      out.push(node)
      return
    }
    if (!node.isLeaf) {
      const inner = cleanFragment(node.content, schema, style)
      if (inner.size) out.push(node.copy(inner))
      return
    }
    out.push(node)
  })
  return Fragment.from(out)
}

/**
 * Clean a pasted slice. The text of a paste inside a paragraph (no blocks) only gets the typography.
 */
export function cleanPastedSlice(slice: Slice, schema: Schema, style: PasteStyle): Slice {
  let blocks = false
  slice.content.forEach((n) => {
    if (n.isBlock) blocks = true
  })
  if (!blocks) {
    const para = schema.nodes.paragraph.create(null, slice.content)
    return new Slice(cleanTextblock(para, style).content, slice.openStart, slice.openEnd)
  }
  const first = slice.content.firstChild
  const last = slice.content.lastChild
  const content = cleanFragment(slice.content, schema, style)
  if (!content.size) return Slice.empty
  // The open sides of the paste join the paragraph at the cursor. They stay open only when the
  // first (or last) paragraph is still there; a removed empty line or a new scene break is closed.
  const keeps = (orig: PMNode | null, now: PMNode | null): boolean =>
    Boolean(orig?.isTextblock && now?.type === orig.type && !isEmptyBlock(orig) && !SCENE_BREAK_LINE.test(orig.textContent))
  const openStart = keeps(first, content.firstChild) ? Math.min(slice.openStart, 1) : 0
  const openEnd = keeps(last, content.lastChild) ? Math.min(slice.openEnd, 1) : 0
  return new Slice(content, openStart, openEnd)
}
