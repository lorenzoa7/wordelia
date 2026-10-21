// Convert imported HTML (from DOCX) to Wordelia Markdown.

import { generateJSON } from '@tiptap/core'
import { serializeMarkdown } from '@shared/markdown/serialize'
import { blankLineStats, chooseBlankLines, isSceneBreakMarker, sceneBreakPlan, type BlankLineStats, type BlankLines, type BlockKind } from '@shared/import'
import type { DocNode } from '@shared/types'
import { schemaExtensions } from '@/features/editor/extensions'

function blocksOf(html: string): { doc: Document; blocks: Element[] } {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  return { doc, blocks: [...doc.body.children] }
}

function kindOf(el: Element): BlockKind {
  if (el.tagName !== 'P' || el.querySelector('img')) return 'other'
  const text = (el.textContent ?? '').replace(/ /g, ' ').trim()
  if (!text) return 'empty'
  return isSceneBreakMarker(text) ? 'marker' : 'text'
}

/** How the chapters of an imported document use blank lines and scene break markers. */
export function analyzeImportedHtml(htmls: string[]): BlankLineStats & { suggested: BlankLines } {
  const stats = blankLineStats(htmls.map((html) => blocksOf(html).blocks.map(kindOf)))
  return { ...stats, suggested: chooseBlankLines(stats) }
}

/**
 * Clean HTML from a word processor:
 * - A paragraph with only a marker ("* * *", "***", "#", "⁂", "*") becomes a scene break.
 * - Empty paragraphs between two text paragraphs become a scene break when `blankLines` is 'breaks';
 *   else they are only spacing and go away. Empty paragraphs at the start or the end always go away.
 * - Leading tabs and spaces in paragraphs go away.
 */
export function cleanImportedHtml(html: string, blankLines: BlankLines = 'spacing'): string {
  const { doc, blocks } = blocksOf(html)
  const out: Element[] = []
  for (const step of sceneBreakPlan(blocks.map(kindOf), blankLines)) {
    if (step === 'break') {
      out.push(doc.createElement('hr'))
      continue
    }
    const el = blocks[step]
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

export function htmlToMarkdown(html: string, blankLines: BlankLines = 'spacing'): string {
  const json = generateJSON(cleanImportedHtml(html, blankLines), schemaExtensions()) as DocNode
  return serializeMarkdown(json)
}
