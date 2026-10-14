// Document JSON -> Wordelia Markdown.
// The output is stable: parse(serialize(doc)) gives the same doc.

import type { DocMark, DocNode } from '../types'

/** Mark order, outermost first. A stable order keeps the output stable. */
const MARK_ORDER = ['link', 'textStyle', 'bold', 'italic', 'underline', 'strike', 'code'] as const

function markRank(m: DocMark): number {
  const i = (MARK_ORDER as readonly string[]).indexOf(m.type)
  return i < 0 ? MARK_ORDER.length : i
}

function markKey(m: DocMark): string {
  return m.type + JSON.stringify(m.attrs ?? {})
}

function isSpanMark(m: DocMark): boolean {
  if (m.type !== 'textStyle') return false
  const a = m.attrs ?? {}
  return Boolean(a.fontFamily) || Boolean(a.fontSize)
}

function relevantMarks(marks: DocMark[] | undefined): DocMark[] {
  return (marks ?? [])
    .filter((m) => (m.type === 'textStyle' ? isSpanMark(m) : (MARK_ORDER as readonly string[]).includes(m.type)))
    .sort((a, b) => markRank(a) - markRank(b))
}

function openMark(m: DocMark): string {
  switch (m.type) {
    case 'bold':
      return '**'
    case 'italic':
      return '*'
    case 'underline':
      return '<u>'
    case 'strike':
      return '~~'
    case 'code':
      return '`'
    case 'link':
    case 'textStyle':
      return '['
    default:
      return ''
  }
}

function closeMark(m: DocMark): string {
  switch (m.type) {
    case 'bold':
      return '**'
    case 'italic':
      return '*'
    case 'underline':
      return '</u>'
    case 'strike':
      return '~~'
    case 'code':
      return '`'
    case 'link':
      return `](${escapeUrl(String(m.attrs?.href ?? ''))})`
    case 'textStyle': {
      const a = m.attrs ?? {}
      const parts: string[] = []
      if (a.fontFamily) parts.push(`font="${String(a.fontFamily).replace(/"/g, "'")}"`)
      if (a.fontSize) parts.push(`size=${Number.parseFloat(String(a.fontSize))}`)
      return `]{${parts.join(' ')}}`
    }
    default:
      return ''
  }
}

function escapeUrl(url: string): string {
  return url.replace(/[()\s]/g, (c) => encodeURIComponent(c))
}

/** Escape Markdown syntax characters in plain text. */
export function escapeText(text: string): string {
  return text.replace(/[\\*_`[\]<>~{}&]/g, '\\$&')
}

/** Escape characters that start a block when they are at the start of a line. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+=|-])/, '$1\\$2')
    .replace(/^(\s*\d+)([.)])(\s)/, '$1\\$2$3')
}

interface InlinePiece {
  text: string
  marks: DocMark[]
  kind: 'text' | 'break' | 'image'
  raw?: string
}

function serializeInline(nodes: DocNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return ''
  const pieces: InlinePiece[] = nodes.map((n) => {
    if (n.type === 'hardBreak') return { text: '', marks: [], kind: 'break' }
    if (n.type === 'image') return { text: '', marks: [], kind: 'image', raw: imageMarkdown(n) }
    return { text: n.text ?? '', marks: relevantMarks(n.marks), kind: 'text' }
  })

  let out = ''
  let active: DocMark[] = []

  const closeTo = (keep: number): void => {
    while (active.length > keep) {
      const m = active.pop()!
      // Move trailing whitespace outside the closing delimiter.
      const ws = /\s+$/.exec(out)?.[0] ?? ''
      if (ws && m.type !== 'code') out = out.slice(0, out.length - ws.length) + closeMark(m) + ws
      else out += closeMark(m)
    }
  }

  for (let idx = 0; idx < pieces.length; idx++) {
    const p = pieces[idx]
    if (p.kind === 'break') {
      closeTo(0)
      out += '\\\n'
      continue
    }
    if (p.kind === 'image') {
      closeTo(0)
      out += p.raw
      continue
    }
    // Keep marks that are already open first, in their open order, so they stay open.
    const activeKeys = active.map(markKey)
    p.marks = [
      ...active.filter((m) => p.marks.some((pm) => markKey(pm) === markKey(m))),
      ...p.marks.filter((m) => !activeKeys.includes(markKey(m)))
    ]
    let common = 0
    while (common < active.length && common < p.marks.length && markKey(active[common]) === markKey(p.marks[common])) {
      common++
    }
    closeTo(common)
    let text = p.marks.some((m) => m.type === 'code') ? p.text : escapeText(p.text)
    // Move leading whitespace before the opening delimiters.
    if (p.marks.length > common) {
      const ws = /^\s+/.exec(text)?.[0] ?? ''
      if (ws) {
        out += ws
        text = text.slice(ws.length)
      }
      for (const m of p.marks.slice(common)) {
        out += openMark(m)
        active.push(m)
      }
    }
    out += text
  }
  closeTo(0)
  return out
}

function imageMarkdown(n: DocNode): string {
  const alt = escapeText(String(n.attrs?.alt ?? ''))
  const src = escapeUrl(String(n.attrs?.src ?? ''))
  const title = n.attrs?.title ? ` "${String(n.attrs.title).replace(/"/g, "'")}"` : ''
  return `![${alt}](${src}${title})`
}

function paragraphAttrs(node: DocNode): string {
  const parts: string[] = []
  const align = node.attrs?.textAlign
  if (align && align !== 'left' && align !== null) parts.push(`align=${String(align)}`)
  if (node.attrs?.noIndent) parts.push('indent=0')
  return parts.length ? `\n{${parts.join(' ')}}` : ''
}

function cleanParagraphText(s: string): string {
  // Leading spaces would start a code block. Trailing spaces would make a hard break.
  return s.replace(/^[ \t]+/, '').replace(/[ \t]+$/gm, '')
}

function serializeBlock(node: DocNode, indent: string): string {
  switch (node.type) {
    case 'paragraph': {
      const text = cleanParagraphText(serializeInline(node.content))
      if (!text) return indent + '&nbsp;' + paragraphAttrs(node)
      return text
        .split('\n')
        .map((line) => indent + escapeLineStart(line))
        .join('\n') + paragraphAttrs(node).replace(/\n/g, '\n' + indent)
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 6)
      const text = cleanParagraphText(serializeInline(node.content)).replace(/\\\n/g, ' ')
      const align = node.attrs?.textAlign && node.attrs.textAlign !== 'left' ? ` {align=${String(node.attrs.textAlign)}}` : ''
      return `${indent}${'#'.repeat(level)} ${text}${align}`
    }
    case 'sceneBreak':
    case 'horizontalRule':
      return indent + '* * *'
    case 'image':
      return indent + imageMarkdown(node)
    case 'blockquote': {
      const inner = serializeBlocks(node.content ?? [], '')
      return inner
        .split('\n')
        .map((l) => (l ? `${indent}> ${l}` : `${indent}>`))
        .join('\n')
    }
    case 'bulletList':
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return (node.content ?? [])
        .map((item, i) => {
          const marker = node.type === 'bulletList' ? '- ' : `${start + i}. `
          const pad = ' '.repeat(marker.length)
          const children = item.content ?? []
          const parts = children.map((child, j) => {
            const s = serializeBlock(child, '')
            const lines = s.split('\n')
            return lines.map((l, k) => (j === 0 && k === 0 ? marker + l : l ? pad + l : l)).join('\n')
          })
          return parts.join('\n').split('\n').map((l) => (l ? indent + l : l)).join('\n')
        })
        .join('\n')
    }
    default:
      if (node.content) return serializeBlocks(node.content, indent)
      return ''
  }
}

function serializeBlocks(nodes: DocNode[], indent: string): string {
  return nodes.map((n) => serializeBlock(n, indent)).join('\n\n')
}

/** Serialize a `doc` node into Wordelia Markdown. Ends with one newline. */
export function serializeMarkdown(doc: DocNode): string {
  const blocks = [...(doc.content ?? [])]
  // Drop empty paragraphs at the end of the document.
  while (blocks.length && isEmptyParagraph(blocks[blocks.length - 1])) blocks.pop()
  if (blocks.length === 0) return ''
  return serializeBlocks(blocks, '') + '\n'
}

function isEmptyParagraph(n: DocNode): boolean {
  return n.type === 'paragraph' && (!n.content || n.content.length === 0) && !n.attrs?.textAlign && !n.attrs?.noIndent
}
