// Markdown and plain text export: one file with all the chapters. Pure code.
// The file is for other apps, so it has only standard Markdown, or only text: no marks that only
// Wordelia reads ({align=…}, [text]{size=18}, <!-- page break -->, &nbsp;).

import { SCENE_BREAK_GLYPH } from '../book'
import { escapeText, serializeMarkdown } from '../markdown/serialize'
import type { DocNode } from '../types'
import type { ExportBook } from './model'

/** The text of inline nodes, with a line break for each hard break (Shift+Enter). */
function inlineText(nodes: DocNode[] | undefined): string {
  return (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : n.type === 'hardBreak' ? '\n' : '')).join('')
}

function plainBlocks(nodes: DocNode[], glyph: string, out: string[]): void {
  for (const n of nodes) {
    switch (n.type) {
      case 'paragraph':
      case 'heading': {
        const text = inlineText(n.content).replace(/[ \t]+$/gm, '')
        // An empty paragraph is only space on the page.
        if (text.trim()) out.push(text)
        break
      }
      case 'sceneBreak':
        out.push(glyph)
        break
      case 'blockquote':
        plainBlocks(n.content ?? [], glyph, out)
        break
      case 'bulletList':
      case 'orderedList': {
        const start = Number(n.attrs?.start ?? 1)
        ;(n.content ?? []).forEach((item, i) => {
          const inner: string[] = []
          plainBlocks(item.content ?? [], glyph, inner)
          if (inner.length) out.push(`${n.type === 'bulletList' ? '-' : `${start + i}.`} ${inner.join('\n')}`)
        })
        break
      }
      default:
        // A page break and an image have no text.
        break
    }
  }
}

/** The chapter blocks as plain text: paragraphs with an empty line between them, the scene break symbol, real line breaks. */
export function blocksToPlainText(nodes: DocNode[], sceneGlyph: string): string {
  const out: string[] = []
  plainBlocks(nodes, sceneGlyph, out)
  return out.join('\n\n')
}

/** The whole book as plain text. */
export function bookToPlainText(book: ExportBook): string {
  const glyph = SCENE_BREAK_GLYPH[book.settings.sceneBreak] ?? SCENE_BREAK_GLYPH.asterisks
  const head = [book.title, book.subtitle, book.author].filter((s) => s.trim()).join('\n')
  const chapters = book.chapters.map((ch) => `${ch.number}\n${ch.title}\n\n${blocksToPlainText(ch.blocks, glyph)}`.trimEnd())
  return `${[head, ...chapters].join('\n\n\n')}\n`
}

/** Blocks in standard Markdown: a heading of the chapter text goes under the chapter title (##). */
function standardBlocks(nodes: DocNode[]): DocNode[] {
  const out: DocNode[] = []
  for (const n of nodes) {
    if (n.type === 'pageBreak') continue
    if (n.type === 'paragraph' && !inlineText(n.content).trim() && !(n.content ?? []).some((c) => c.type === 'image')) continue
    const content = n.content ? (n.type === 'paragraph' || n.type === 'heading' ? standardInline(n.content) : standardBlocks(n.content)) : undefined
    const attrs = { ...(n.attrs ?? {}) }
    delete attrs.textAlign
    delete attrs.noIndent
    // A heading in the text ("## Part one") goes one level under the chapter titles (##).
    if (n.type === 'heading') attrs.level = Math.min(6, Math.max(3, Number(n.attrs?.level ?? 2) + 1))
    out.push({ ...n, attrs, ...(content ? { content } : {}) })
  }
  return out
}

/** Inline nodes without the fonts and sizes of a span: only Wordelia reads them. */
function standardInline(nodes: DocNode[]): DocNode[] {
  return nodes.map((n) => (n.marks ? { ...n, marks: n.marks.filter((m) => m.type !== 'textStyle') } : n))
}

/** The whole book as standard Markdown: "# Title", "## Chapter", the text. */
export function bookToMarkdown(book: ExportBook): string {
  const head = `# ${escapeText(book.title)}\n\n${book.author ? `*${escapeText(book.author)}*\n\n` : ''}`
  const chapters = book.chapters.map((ch) => `## ${escapeText(ch.title)}\n\n${serializeMarkdown({ type: 'doc', content: standardBlocks(ch.blocks) })}`)
  return head + chapters.join('\n')
}
