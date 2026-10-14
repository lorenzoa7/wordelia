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

const WIKI_LINK = /\[\[[^[\]\n]{1,80}\]\]/g

/** Escape Markdown syntax characters in plain text. [[Wiki links]] stay as they are. */
export function escapeText(text: string): string {
  let out = ''
  let pos = 0
  for (const m of text.matchAll(WIKI_LINK)) {
    out += escapePlain(text.slice(pos, m.index)) + m[0]
    pos = (m.index ?? 0) + m[0].length
  }
  return out + escapePlain(text.slice(pos))
}

function escapePlain(text: string): string {
  return text.replace(/[\\*_`[\]<>~{}&]/g, '\\$&')
}

/** Escape characters that start a block when they are at the start of a line. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+=|-])/, '$1\\$2')
    .replace(/^(\s*\d{1,9})([.)])(\s|$)/, '$1\\$2$3')
}

interface InlinePiece {
  text: string
  marks: DocMark[]
  kind: 'text' | 'break' | 'image'
  raw?: string
}

/** HTML tags for marks, used when Markdown delimiters would not parse back. */
const HTML_TAGS: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }

function openFor(m: DocMark, html: boolean): string {
  if (html && HTML_TAGS[m.type]) return `<${HTML_TAGS[m.type]}>`
  return openMark(m)
}

function closeFor(m: DocMark, html: boolean): string {
  if (html && HTML_TAGS[m.type]) return `</${HTML_TAGS[m.type]}>`
  return closeMark(m)
}

function toPieces(nodes: DocNode[]): InlinePiece[] {
  return nodes.map((n) => {
    if (n.type === 'hardBreak') return { text: '', marks: [], kind: 'break' }
    if (n.type === 'image') return { text: '', marks: [], kind: 'image', raw: imageMarkdown(n) }
    const text = n.text ?? ''
    let marks = relevantMarks(n.marks)
    // Formatting on spaces alone has no visible effect and breaks emphasis rules.
    if (/^\s*$/.test(text)) marks = marks.filter((m) => m.type === 'link')
    return { text, marks, kind: 'text' }
  })
}

function serializeInlineWith(nodes: DocNode[], html: boolean): string {
  const pieces = toPieces(nodes)
  let out = ''
  const active: DocMark[] = []

  const closeTo = (keep: number): void => {
    while (active.length > keep) {
      const m = active.pop()!
      // Move trailing whitespace outside the closing delimiter.
      const ws = /\s+$/.exec(out)?.[0] ?? ''
      if (ws && m.type !== 'code') out = out.slice(0, out.length - ws.length) + closeFor(m, html) + ws
      else out += closeFor(m, html)
    }
  }

  for (let idx = 0; idx < pieces.length; idx++) {
    const p = pieces[idx]
    if (p.kind === 'break') {
      closeTo(0)
      // A break at the end of a paragraph cannot use "\" (nothing follows it).
      const last = pieces.slice(idx + 1).every((q) => q.kind === 'text' && q.text === '')
      out += last ? '<br>' : '\\\n'
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
        const open = openFor(m, html)
        // "!" before "[" would make an image.
        if (open === '[' && /(^|[^\\])!$/.test(out)) out = out.slice(0, -1) + '\\!'
        out += open
        active.push(m)
      }
    }
    out += text
  }
  closeTo(0)
  return out
}

/**
 * Text and marks as the reader sees them: the text, and the marks of each visible character.
 * Spaces can move in or out of a mark without a visible change.
 */
export function inlineSignature(nodes: DocNode[]): string {
  let text = ''
  const marks: string[] = []
  for (const p of toPieces(nodes)) {
    if (p.kind === 'break') {
      text += '\n'
      continue
    }
    if (p.kind === 'image') {
      text += `￼${p.raw}`
      continue
    }
    const key = p.marks
      .map((m) =>
        m.type === 'textStyle'
          ? `ts:${String(m.attrs?.fontFamily ?? '')}:${String(m.attrs?.fontSize ?? '')}`
          : m.type === 'link'
            ? `a:${String(m.attrs?.href ?? '')}`
            : m.type
      )
      .sort()
      .join('+')
    for (const ch of p.text) {
      text += ch
      if (!/\s/.test(ch)) marks.push(key)
    }
  }
  return `${text}\u0000${marks.join('|')}`
}

let verify: ((src: string) => DocNode[]) | null = null

/** The parser registers itself here, so the serializer can check its own output. */
export function setInlineVerifier(fn: (src: string) => DocNode[]): void {
  verify = fn
}

function serializeInline(nodes: DocNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return ''
  const md = serializeInlineWith(nodes, false)
  if (!verify || !/[*_~]/.test(md)) return md
  // Emphasis delimiters next to punctuation can fail to parse. Then use HTML tags.
  if (inlineSignature(verify(md)) === inlineSignature(nodes)) return md
  return serializeInlineWith(nodes, true)
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

function serializeBlock(node: DocNode, indent: string, alt = false): string {
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
          // A list right after a list of the same kind needs other markers, or the two merge.
          const marker = node.type === 'bulletList' ? (alt ? '* ' : '- ') : `${start + i}${alt ? ')' : '.'} `
          const pad = ' '.repeat(marker.length)
          const children = item.content ?? []
          const parts = children.map((child, j) => {
            const s = serializeBlock(child, '')
            const lines = s.split('\n')
            return lines.map((l, k) => (j === 0 && k === 0 ? marker + l : l ? pad + l : l)).join('\n')
          })
          return parts.join('\n\n').split('\n').map((l) => (l ? indent + l : l)).join('\n')
        })
        .join('\n')
    }
    default:
      if (node.content) return serializeBlocks(node.content, indent)
      return ''
  }
}

function serializeBlocks(nodes: DocNode[], indent: string): string {
  let alt = false
  return nodes
    .map((n, i) => {
      const isList = n.type === 'bulletList' || n.type === 'orderedList'
      alt = isList && nodes[i - 1]?.type === n.type ? !alt : false
      return serializeBlock(n, indent, alt)
    })
    .join('\n\n')
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
