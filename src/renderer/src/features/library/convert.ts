// Convert imported HTML (from DOCX) to Wordelia Markdown.

import { generateJSON } from '@tiptap/core'
import { serializeMarkdown } from '@shared/markdown/serialize'
import type { DocNode } from '@shared/types'
import { schemaExtensions } from '@/features/editor/extensions'

function isEmptyBlock(el: Element): boolean {
  return el.tagName === 'P' && !el.querySelector('img') && (el.textContent ?? '').replace(/ /g, ' ').trim() === ''
}

/**
 * Clean HTML from a word processor:
 * - Empty paragraphs between two text paragraphs become a scene break.
 * - Other empty paragraphs (at the start or end) go away.
 * - Leading tabs and spaces in paragraphs go away.
 */
export function cleanImportedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const blocks = [...doc.body.children]
  const out: Element[] = []
  let pendingBreak = false
  for (const el of blocks) {
    if (isEmptyBlock(el)) {
      if (out.length) pendingBreak = true
      continue
    }
    if (pendingBreak) {
      out.push(doc.createElement('hr'))
      pendingBreak = false
    }
    // Remove leading whitespace text in paragraphs.
    if (el.tagName === 'P') {
      const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const first = walker.nextNode() as Text | null
      if (first) first.textContent = (first.textContent ?? '').replace(/^[\s ]+/, '')
    }
    out.push(el)
  }
  doc.body.replaceChildren(...out)
  return doc.body.innerHTML
}

export function htmlToMarkdown(html: string): string {
  const json = generateJSON(cleanImportedHtml(html), schemaExtensions()) as DocNode
  return serializeMarkdown(json)
}
