// Wordelia Markdown -> document JSON (ProseMirror-compatible).
// See docs/ARCHITECTURE.md section 4.2 for the dialect.

import MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type Token from 'markdown-it/lib/token.mjs'
import type { DocMark, DocNode } from '../types'
import { setInlineVerifier } from './serialize'

const md = new MarkdownIt({ html: true, linkify: false, typographer: false, breaks: false })
md.disable(['code', 'fence', 'table', 'lheading', 'html_block'])
md.inline.ruler.before('link', 'wordelia_span', bracketedSpan)

/** Attributes in braces: `{font="EB Garamond" size=14 align=center}` */
export function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'}]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? ''
  return out
}

/** Inline rule for Pandoc bracketed spans: `[text]{font="X" size=14}` */
function bracketedSpan(state: StateInline, silent: boolean): boolean {
  const start = state.pos
  if (state.src.charCodeAt(start) !== 0x5b /* [ */) return false
  const labelEnd = state.md.helpers.parseLinkLabel(state, start, true)
  if (labelEnd < 0) return false
  const after = labelEnd + 1
  if (state.src.charCodeAt(after) !== 0x7b /* { */) return false
  const close = state.src.indexOf('}', after)
  if (close < 0) return false
  const attrs = parseAttrs(state.src.slice(after + 1, close))
  if (!('font' in attrs) && !('size' in attrs)) return false
  if (!silent) {
    const open = state.push('wspan_open', 'span', 1)
    open.meta = attrs
    const oldMax = state.posMax
    state.pos = start + 1
    state.posMax = labelEnd
    state.md.inline.tokenize(state)
    state.posMax = oldMax
    state.push('wspan_close', 'span', -1)
  }
  state.pos = close + 1
  return true
}

const PARA_ATTR_RE = /(?:^|\n|\s)\{((?:align|indent)\s*=[^}]*)\}\s*$/

interface InlineCtx {
  marks: DocMark[]
}

function addText(out: DocNode[], text: string, marks: DocMark[]): void {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.type === 'text' && sameMarks(last.marks, marks)) {
    last.text += text
    return
  }
  const node: DocNode = { type: 'text', text }
  if (marks.length) node.marks = marks.map((m) => ({ ...m }))
  out.push(node)
}

function sameMarks(a: DocMark[] | undefined, b: DocMark[]): boolean {
  const aa = a ?? []
  if (aa.length !== b.length) return false
  return aa.every((m, i) => m.type === b[i].type && JSON.stringify(m.attrs ?? {}) === JSON.stringify(b[i].attrs ?? {}))
}

function pushMark(ctx: InlineCtx, mark: DocMark): void {
  ctx.marks = [...ctx.marks, mark]
}

function popMark(ctx: InlineCtx, type: string): void {
  for (let i = ctx.marks.length - 1; i >= 0; i--) {
    if (ctx.marks[i].type === type) {
      ctx.marks = [...ctx.marks.slice(0, i), ...ctx.marks.slice(i + 1)]
      return
    }
  }
}

const HTML_MARKS: Record<string, string> = { u: 'underline', strong: 'bold', b: 'bold', em: 'italic', i: 'italic', s: 'strike', del: 'strike' }

function inlineToNodes(tokens: Token[]): DocNode[] {
  const out: DocNode[] = []
  const ctx: InlineCtx = { marks: [] }
  for (const t of tokens) {
    switch (t.type) {
      case 'text':
        addText(out, t.content, ctx.marks)
        break
      case 'softbreak':
        addText(out, ' ', ctx.marks)
        break
      case 'hardbreak':
        out.push({ type: 'hardBreak' })
        break
      case 'em_open':
        pushMark(ctx, { type: 'italic' })
        break
      case 'em_close':
        popMark(ctx, 'italic')
        break
      case 'strong_open':
        pushMark(ctx, { type: 'bold' })
        break
      case 'strong_close':
        popMark(ctx, 'bold')
        break
      case 's_open':
        pushMark(ctx, { type: 'strike' })
        break
      case 's_close':
        popMark(ctx, 'strike')
        break
      case 'code_inline':
        addText(out, t.content, [...ctx.marks, { type: 'code' }])
        break
      case 'link_open':
        pushMark(ctx, { type: 'link', attrs: { href: t.attrGet('href') ?? '' } })
        break
      case 'link_close':
        popMark(ctx, 'link')
        break
      case 'wspan_open': {
        const a = (t.meta ?? {}) as Record<string, string>
        const size = a.size ? `${Number.parseFloat(a.size)}pt` : null
        pushMark(ctx, { type: 'textStyle', attrs: { fontFamily: a.font ?? null, fontSize: size } })
        break
      }
      case 'wspan_close':
        popMark(ctx, 'textStyle')
        break
      case 'image':
        out.push({
          type: 'image',
          attrs: { src: t.attrGet('src') ?? '', alt: t.content || null, title: t.attrGet('title') }
        })
        break
      case 'html_inline': {
        const tag = t.content.trim().toLowerCase()
        const tm = /^<(\/?)(u|strong|b|em|i|s|del)>$/.exec(tag)
        if (tm) {
          if (tm[1]) popMark(ctx, HTML_MARKS[tm[2]])
          else pushMark(ctx, { type: HTML_MARKS[tm[2]] })
        } else if (tag === '<br>' || tag === '<br/>' || tag === '<br />') out.push({ type: 'hardBreak' })
        else addText(out, t.content, ctx.marks)
        break
      }
      default:
        if (t.content) addText(out, t.content, ctx.marks)
    }
  }
  return out
}

/** Parse paragraph-level attributes at the end of the paragraph source. */
function splitParagraphAttrs(content: string): { content: string; attrs: Record<string, string> } {
  const m = PARA_ATTR_RE.exec(content)
  if (!m) return { content, attrs: {} }
  return { content: content.slice(0, m.index).replace(/\s+$/, ''), attrs: parseAttrs(m[1]) }
}

function paragraphNode(inline: Token): DocNode {
  const { content, attrs } = splitParagraphAttrs(inline.content)
  const children = content === inline.content ? (inline.children ?? []) : md.parseInline(content, {})[0]?.children ?? []
  const nodes = inlineToNodes(children)
  // A paragraph with only a non-breaking space is an intentional empty paragraph.
  if (nodes.length === 1 && nodes[0].type === 'text' && nodes[0].text === ' ' && !nodes[0].marks) {
    return withParaAttrs({ type: 'paragraph' }, attrs)
  }
  // An image alone in a paragraph becomes a block image.
  if (nodes.length === 1 && nodes[0].type === 'image') return nodes[0]
  const node: DocNode = { type: 'paragraph' }
  if (nodes.length) node.content = nodes
  return withParaAttrs(node, attrs)
}

function withParaAttrs(node: DocNode, attrs: Record<string, string>): DocNode {
  const align = attrs.align
  if (align === 'center' || align === 'right' || align === 'left' || align === 'justify') {
    node.attrs = { ...(node.attrs ?? {}), textAlign: align }
  }
  if (attrs.indent === '0') node.attrs = { ...(node.attrs ?? {}), noIndent: true }
  return node
}

const SCENE_BREAK_SOURCES = /^(\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_|⁂|❦|#)\s*$/

/** Parse Wordelia Markdown (no frontmatter) into a `doc` node. */
export function parseMarkdown(src: string): DocNode {
  const normalized = src.replace(/\r\n?/g, '\n').replace(/^\n+/, '')
  // A line with only "#" or "⁂" is a scene break too.
  const prepared = normalized.replace(/^(⁂|❦|#)[ \t]*$/gm, '* * *')
  const tokens = md.parse(prepared, {})
  const stack: DocNode[] = [{ type: 'doc', content: [] }]
  const top = (): DocNode => stack[stack.length - 1]
  const append = (node: DocNode): void => {
    const parent = top()
    ;(parent.content ??= []).push(node)
  }

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    switch (t.type) {
      case 'paragraph_open': {
        const inline = tokens[i + 1]
        const node = paragraphNode(inline)
        append(node)
        i += 2 // skip inline and paragraph_close
        break
      }
      case 'heading_open': {
        const level = Number(t.tag.slice(1))
        const inline = tokens[i + 1]
        const { content, attrs } = splitParagraphAttrs(inline.content)
        const children = content === inline.content ? (inline.children ?? []) : md.parseInline(content, {})[0]?.children ?? []
        const node: DocNode = { type: 'heading', attrs: { level } }
        const nodes = inlineToNodes(children)
        if (nodes.length) node.content = nodes
        if (attrs.align) node.attrs = { ...node.attrs, textAlign: attrs.align }
        append(node)
        i += 2
        break
      }
      case 'hr':
        append({ type: 'sceneBreak' })
        break
      case 'blockquote_open': {
        const node: DocNode = { type: 'blockquote', content: [] }
        append(node)
        stack.push(node)
        break
      }
      case 'blockquote_close':
        stack.pop()
        break
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const node: DocNode = { type: t.type === 'bullet_list_open' ? 'bulletList' : 'orderedList', content: [] }
        if (t.type === 'ordered_list_open') {
          const start = Number(t.attrGet('start') ?? 1)
          if (start !== 1) node.attrs = { start }
        }
        append(node)
        stack.push(node)
        break
      }
      case 'bullet_list_close':
      case 'ordered_list_close':
        stack.pop()
        break
      case 'list_item_open': {
        const node: DocNode = { type: 'listItem', content: [] }
        append(node)
        stack.push(node)
        break
      }
      case 'list_item_close': {
        const item = stack.pop()
        if (item && (!item.content || item.content.length === 0)) item.content = [{ type: 'paragraph' }]
        break
      }
      case 'inline': {
        // Tight list items have inline tokens without paragraph_open (hidden paragraphs).
        append(paragraphNode(t))
        break
      }
      case 'html_block':
        append({ type: 'paragraph', content: [{ type: 'text', text: t.content.trim() }] })
        break
      default:
        break
    }
  }
  const doc = stack[0]
  if (!doc.content || doc.content.length === 0) doc.content = [{ type: 'paragraph' }]
  return doc
}

/** Parse one line of inline Markdown into text nodes (used to check the serializer). */
export function parseInlineNodes(src: string): DocNode[] {
  const tokens = md.parseInline(src, {})[0]?.children ?? []
  return inlineToNodes(tokens)
}

setInlineVerifier(parseInlineNodes)

export { SCENE_BREAK_SOURCES }
