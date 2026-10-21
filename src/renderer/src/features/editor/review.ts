// Inline review of an AI rewrite (an action): the proposal shows as a diff on the page.
// Accept replaces the range in one transaction (one undo step). Reject removes the marks.
//
// Only the reviewed passage is locked, while the AI works and while the change waits: the author can
// write in the rest of the chapter, and the range follows those edits. Enter, Esc and Tab decide the
// review only when the cursor is in the passage. There is one review in the book at a time: the
// review bar shows the review of `useReviewHost`, also when the cursor is in another chapter.

import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Slice, type Mark, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { create } from 'zustand'
import { parseMarkdown } from '@shared/markdown/parse'
import { markdownToPlainBlocks } from '@shared/book'
import { styledDiff, type DiffOp } from '@shared/text/diff'
import { useApp } from '@/stores/app'
import './review.css'

export interface ReviewData {
  id: string
  from: number
  to: number
  phase: 'loading' | 'ready' | 'error'
  label: string
  /** The action of the review (for the name in the bar and for Retry) */
  actionId?: string
  /** The chapter of the review: a review whose editor closes can come back there (runAction.ts) */
  docId?: string
  /** The selection of the author when the action started. It comes back when the review ends without a change. */
  selection: { anchor: number; head: number }
  /** Text of the range, blocks joined with a blank line, scene breaks as "* * *" (`reviewText`) */
  original: string
  /** The rewrite, as Markdown */
  proposed: string
  ops: DiffOp[]
  error?: string
}

type ReviewMeta =
  | { type: 'start'; data: ReviewData }
  | { type: 'update'; id: string; proposed: string; phase: ReviewData['phase']; error?: string }
  | { type: 'clear' }
  | { type: 'apply' }

export const reviewKey = new PluginKey<ReviewData | null>('review')

/** Reviews that ended with Accept. The view hook below reports each end once. */
const applied = new Set<string>()

/**
 * The end of a review. `lost`: its editor closed (the chapter left the screen, or the Write view
 * closed), so the review did not really end; runAction can keep it for the return.
 */
export interface ReviewEnd {
  id: string
  accepted: boolean
  lost: boolean
  data: ReviewData
}
const endListeners = new Set<(e: ReviewEnd) => void>()

/** Get told when a review ends (accepted or not). Returns a function that stops it. */
export function onReviewEnd(fn: (e: ReviewEnd) => void): () => void {
  endListeners.add(fn)
  return () => endListeners.delete(fn)
}

/** The editor that has the review of the book now, if any. The review bar shows its review. */
export const useReviewHost = create<{ editor: Editor | null; id: string | null }>(() => ({ editor: null, id: null }))

/** Typing that the lock of the passage refused. The review bar shows a short cue for each one. */
export const useReviewCue = create<{ n: number }>(() => ({ n: 0 }))
function cue(): void {
  queueMicrotask(() => useReviewCue.setState((s) => ({ n: s.n + 1 })))
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    review: {
      startReview: (opts: { id: string; from: number; to: number; label: string; actionId?: string; docId?: string; selection?: { anchor: number; head: number } }) => ReturnType
      /** Show a review again, as it was (a review that waited while its editor was closed) */
      resumeReview: (data: ReviewData) => ReturnType
      updateReview: (id: string, proposed: string, phase: ReviewData['phase'], error?: string) => ReturnType
      acceptReview: () => ReturnType
      /** End the review without a change. The selection of the author comes back when the cursor is still in the passage. */
      rejectReview: () => ReturnType
    }
  }
}

/** Text of a range and a map from each text index to its document position. */
export function textWithMap(doc: PMNode, from: number, to: number): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  let first = true
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isTextblock) return true
    if (!first) {
      text += '\n\n'
      map.push(pos, pos)
    }
    first = false
    const start = Math.max(from, pos + 1)
    const end = Math.min(to, pos + 1 + node.content.size)
    node.forEach((child, offset) => {
      const cFrom = pos + 1 + offset
      const cTo = cFrom + child.nodeSize
      if (cTo <= start || cFrom >= end) return
      if (child.isText) {
        const s = Math.max(start, cFrom) - cFrom
        const e = Math.min(end, cTo) - cFrom
        for (let i = s; i < e; i++) {
          text += child.text![i]
          map.push(cFrom + i)
        }
      } else if (child.type.name === 'hardBreak') {
        text += '\n'
        map.push(cFrom)
      }
    })
    return false
  })
  return { text, map }
}

export function proposedPlain(markdown: string): string {
  return markdownToPlainBlocks(markdown)
}

/** What a character of a review text is. */
export const Kind = {
  /** A letter, a space or a mark of the text */
  Text: 0,
  /** One of the two characters of "\n\n" between two blocks */
  Paragraph: 1,
  /** A block without text: a scene break ("* * *") or a page break */
  Block: 2,
  /** A line break inside a paragraph (Shift+Enter) */
  Line: 3
} as const
export type Kind = (typeof Kind)[keyof typeof Kind]

/** The text of a scene break in a review text, as in Markdown */
export const SCENE_TEXT = '* * *'
/** The text of a page break (Ctrl+Enter) in a review text */
export const PAGE_TEXT = '↡'

/**
 * The text of a range for a review, with what Accept would change: the text of each block, a blank
 * line between two blocks, a scene break as "* * *", and the formatting of each character. Thus a
 * removed paragraph break, a removed scene break or removed italics are part of the diff.
 * `map[i]`: the document position of character i. The first character of a paragraph break maps to
 * the end of the block before it; the second one to the start of the block after it.
 */
export interface ReviewText {
  text: string
  map: number[]
  marks: string[]
  kinds: Kind[]
}

/** The formatting of a text node, as one key: "bold italic", "font=Lora", or "" */
export function markKey(marks: readonly Mark[]): string {
  const keys: string[] = []
  for (const m of marks) {
    if (m.type.name === 'textStyle') {
      if (m.attrs.fontFamily) keys.push(`font=${m.attrs.fontFamily}`)
      if (m.attrs.fontSize) keys.push(`size=${m.attrs.fontSize}`)
    } else keys.push(m.type.name)
  }
  return keys.sort().join(' ')
}

export function reviewText(doc: PMNode, from: number, to: number): ReviewText {
  const out: ReviewText = { text: '', map: [], marks: [], kinds: [] }
  const push = (s: string, pos: number, mark: string, kind: Kind): void => {
    for (const ch of s) {
      out.text += ch
      out.map.push(pos)
      out.marks.push(mark)
      out.kinds.push(kind)
    }
  }
  let first = true
  /** The end of the block before: inside a textblock, or after a block without text */
  let prevEnd = from
  const separate = (next: number): void => {
    if (!first) {
      push('\n', prevEnd, '', Kind.Paragraph)
      push('\n', next, '', Kind.Paragraph)
    }
    first = false
  }
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      const start = Math.max(from, pos + 1)
      const end = Math.min(to, pos + 1 + node.content.size)
      separate(start)
      node.forEach((child, offset) => {
        const cFrom = pos + 1 + offset
        const cTo = cFrom + child.nodeSize
        if (cTo <= start || cFrom >= end) return
        if (child.isText) {
          const key = markKey(child.marks)
          const s = Math.max(start, cFrom) - cFrom
          const e = Math.min(end, cTo) - cFrom
          for (let i = s; i < e; i++) push(child.text![i], cFrom + i, key, Kind.Text)
        } else if (child.type.name === 'hardBreak') push('\n', cFrom, '', Kind.Line)
      })
      prevEnd = end
      return false
    }
    if (node.isBlock && node.isLeaf) {
      // A scene break or a page break counts only when the range has all of it.
      if (pos < from || pos + node.nodeSize > to) return false
      separate(pos)
      push(node.type.name === 'sceneBreak' ? SCENE_TEXT : node.type.name === 'pageBreak' ? PAGE_TEXT : '￼', pos, '', Kind.Block)
      prevEnd = pos + node.nodeSize
      return false
    }
    return true
  })
  return out
}

/** The Markdown of a rewrite as a document of the editor: the same document that Accept inserts. */
function proposalDoc(schema: Schema, markdown: string): PMNode {
  return schema.nodeFromJSON(parseMarkdown(markdown))
}

/** The diff of a review: the range of the document against the rewrite (Markdown), with formatting. */
export function reviewOps(doc: PMNode, from: number, to: number, markdown: string): DiffOp[] {
  const proposal = proposalDoc(doc.type.schema, markdown)
  return styledDiff(reviewText(doc, from, to), reviewText(proposal, 0, proposal.content.size))
}

/** True when the cursor (or all of the selection) is in the reviewed passage, its ends included. */
export function cursorInPassage(state: EditorState, r: Pick<ReviewData, 'from' | 'to'>): boolean {
  const { from, to } = state.selection
  return from >= r.from && to <= r.to
}

/**
 * True when a transaction changes the passage [from, to]: a change inside it, or one that covers a
 * part of it. Text typed at one of its two ends is outside: it goes before or after the passage.
 */
export function touchesPassage(tr: Transaction, from: number, to: number): boolean {
  let a = from
  let b = to
  for (const map of tr.mapping.maps) {
    let hit = false
    map.forEach((oldStart, oldEnd) => {
      if (oldStart < b && oldEnd > a) hit = true
      else if (oldStart === oldEnd && oldStart > a && oldStart < b) hit = true
    })
    if (hit) return true
    a = map.map(a, 1)
    b = map.map(b, -1)
  }
  return false
}

/** Move the focus to the review bar (Tab in the passage). False when there is no bar. */
function focusBar(view: { dom: Element }): boolean {
  const button = view.dom.closest('.desk-zoom')?.querySelector<HTMLButtonElement>('.review-bar button')
  if (!button) return false
  button.focus()
  return true
}

function decorations(state: EditorState, r: ReviewData): DecorationSet {
  const decos: Decoration[] = [roomFor(state.doc, r)]
  if (r.phase !== 'ready') {
    decos.push(Decoration.inline(r.from, r.to, { class: r.phase === 'error' ? 'ai-error' : 'ai-pending' }))
    return DecorationSet.create(state.doc, decos)
  }
  decos.push(Decoration.inline(r.from, r.to, { class: 'ai-range' }))
  decos.push(...diffDecorations(state.doc, r.from, r.to, r.ops, r.id, currentDiffView(), reviewText(state.doc, r.from, r.to)))
  return DecorationSet.create(state.doc, decos)
}

/**
 * The room for the review bar: space above the paragraph where the passage starts. The bar sits in
 * it, so it never covers the text around the passage (ReviewBar.tsx sets the height).
 */
function roomFor(doc: PMNode, r: ReviewData): Decoration {
  const $from = doc.resolve(Math.min(r.from, doc.content.size))
  const start = $from.depth >= 1 ? $from.before(1) : 0
  const node = doc.nodeAt(start)
  return Decoration.node(start, start + (node?.nodeSize ?? 1), { class: 'review-room' })
}

/** A word diff drawn in the text: deleted words struck through, new words as widgets. */
export type DiffView = 'words' | 'stacked' | 'new'

/** The view of AI changes in the text (Settings → General, and the review bar) */
export function currentDiffView(): DiffView {
  return useApp.getState().settings?.editor.diffView ?? 'words'
}

/** A review text from `textWithMap`, for diffs that were made on its plain text (the chat proposals). */
function plainSource(doc: PMNode, from: number, to: number): ReviewText {
  const { text, map } = textWithMap(doc, from, to)
  const kinds = map.map((p, i) => (text[i] !== '\n' ? Kind.Text : doc.resolve(p).parent.isTextblock ? Kind.Line : Kind.Paragraph))
  return { text, map, marks: map.map(() => ''), kinds }
}

/** The position at the end of the block before a paragraph break (a position between two blocks moves into the textblock before it). */
function breakPos(doc: PMNode, p: number): number {
  const $p = doc.resolve(Math.min(p, doc.content.size))
  if ($p.parent.isTextblock) return p
  return $p.nodeBefore?.isTextblock ? p - 1 : p
}

/**
 * An AI change drawn in the text, in one of three views:
 * - words: deleted words struck through and new words in green, word by word;
 * - stacked: the old text struck through, then the whole new text under it, to read one over the other;
 * - new: only the new text, in the place of the old one.
 * A removed paragraph break shows as a struck "¶", a removed scene break is struck through, and new
 * text keeps its italics and other formatting. `source`: the review text that `ops` came from (else
 * the plain text of `textWithMap`).
 */
export function diffDecorations(doc: PMNode, from: number, to: number, ops: DiffOp[], id: string, view: DiffView = 'words', source?: ReviewText): Decoration[] {
  if (view !== 'words') return wholeDecorations(doc, from, to, ops, id, view)
  const src = source ?? plainSource(doc, from, to)
  const decos: Decoration[] = []
  const { map, kinds } = src
  let i = 0
  ops.forEach((op, n) => {
    const len = op.text.length
    if (op.type === 'equal') {
      i += len
      return
    }
    if (op.type === 'delete') {
      decos.push(...deleteDecorations(doc, src, i, Math.min(i + len, map.length), `${id}-${n}`))
      i += len
      return
    }
    // A new text at a paragraph break goes at the end of the paragraph before it.
    const pos = i >= map.length ? to : kinds[i] === Kind.Paragraph ? breakPos(doc, map[i]) : map[i]
    decos.push(
      Decoration.widget(pos, () => insertElement(op, 'words'), { side: -1, key: `ins-${id}-${n}-${op.text.length}-${(op.marks ?? []).join('|').length}`, ignoreSelection: true })
    )
  })
  return decos
}

/** The marks of deleted text [a, b) of a review text: words struck through, a struck "¶" for a paragraph break, a struck scene break. */
function deleteDecorations(doc: PMNode, src: ReviewText, a: number, b: number, key: string): Decoration[] {
  const decos: Decoration[] = []
  const { map, kinds } = src
  // A removed scene break takes one paragraph break with it: the paragraphs around it stay apart.
  // Each other removed paragraph break joins two paragraphs, and shows as a struck "¶".
  const blocks = new Set(map.slice(a, b).filter((_, i) => kinds[a + i] === Kind.Block)).size
  const breaks = kinds.slice(a, b).filter((k) => k === Kind.Paragraph).length / 2
  let joins = Math.max(0, Math.round(breaks) - blocks)
  let k = a
  while (k < b) {
    const kind = kinds[k]
    let e = k + 1
    while (e < b && kinds[e] === kind && (kind !== Kind.Block || map[e] === map[k])) e++
    if (kind === Kind.Text) {
      const start = map[k]
      const end = map[e - 1] + 1
      if (end > start) decos.push(Decoration.inline(start, end, { class: 'ai-del' }))
    } else if (kind === Kind.Block) {
      const node = doc.nodeAt(map[k])
      if (node) decos.push(Decoration.node(map[k], map[k] + node.nodeSize, { class: 'ai-del-block' }))
    } else if (kind === Kind.Paragraph && joins > 0) {
      joins--
      decos.push(Decoration.widget(breakPos(doc, map[k]), () => mark('ai-del ai-del-break', '¶'), { side: 1, key: `del-p-${key}-${k}`, ignoreSelection: true }))
    } else if (kind === Kind.Line) {
      decos.push(Decoration.widget(map[k], () => mark('ai-del ai-del-break', '↵'), { side: -1, key: `del-l-${key}-${k}`, ignoreSelection: true }))
    }
    k = e
  }
  return decos
}

function mark(className: string, text: string): HTMLElement {
  const span = document.createElement('span')
  span.className = className
  span.textContent = text
  return span
}

/** The elements of a formatting key (`markKey`), outside in */
function wrapWithMarks(text: string, key: string): Node {
  let node: Node = document.createTextNode(text)
  for (const part of key ? key.split(' ') : []) {
    let el: HTMLElement
    if (part === 'italic') el = document.createElement('em')
    else if (part === 'bold') el = document.createElement('strong')
    else if (part === 'underline') el = document.createElement('u')
    else if (part === 'strike') el = document.createElement('s')
    else if (part === 'code') el = document.createElement('code')
    else if (part.startsWith('font=')) {
      el = document.createElement('span')
      el.style.fontFamily = part.slice(5)
    } else if (part.startsWith('size=')) {
      el = document.createElement('span')
      el.style.fontSize = part.slice(5)
    } else continue
    el.appendChild(node)
    node = el
  }
  return node
}

/** New text with its formatting, into `parent`. A single "\n" is a line break of the paragraph. */
function appendStyled(parent: HTMLElement, text: string, marks: string[] | undefined, offset: number): void {
  let k = 0
  while (k < text.length) {
    if (text[k] === '\n') {
      parent.appendChild(document.createElement('br'))
      k++
      continue
    }
    const key = marks?.[offset + k] ?? ''
    let e = k + 1
    while (e < text.length && text[e] !== '\n' && (marks?.[offset + e] ?? '') === key) e++
    parent.appendChild(wrapWithMarks(text.slice(k, e), key))
    k = e
  }
}

/** The paragraphs of a new text: [start, text] for each, split at the blank lines */
function paragraphs(text: string): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = []
  let start = 0
  for (const m of text.matchAll(/\n\n/g)) {
    out.push({ start, text: text.slice(start, m.index) })
    start = m.index + 2
  }
  out.push({ start, text: text.slice(start) })
  return out
}

/**
 * The element of new text. Words view: one span in the line, a "¶" for each new paragraph break, a
 * new scene break on its own line. The other views: one paragraph for each paragraph.
 */
function insertElement(op: Pick<DiffOp, 'text' | 'marks'>, view: DiffView): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = view === 'words' ? 'ai-ins' : view === 'stacked' ? 'ai-ins ai-ins-stacked' : 'ai-ins ai-ins-new'
  const parts = paragraphs(op.text)
  parts.forEach((p, k) => {
    const scene = p.text === SCENE_TEXT
    if (view === 'words') {
      if (k > 0 && !scene && parts[k - 1].text !== SCENE_TEXT) wrap.appendChild(mark('ai-ins-break', '¶'))
      if (scene) wrap.appendChild(mark('ai-ins-scene', SCENE_TEXT))
      else appendStyled(wrap, p.text, op.marks, p.start)
      return
    }
    if (!p.text && k > 0 && k === parts.length - 1) return
    const el = document.createElement('span')
    // The first paragraph goes on in the line (the "new" view); the next ones are paragraphs.
    el.className = scene ? 'ai-ins-scene' : k > 0 || view === 'stacked' ? 'ai-ins-para' : ''
    if (scene) el.textContent = SCENE_TEXT
    else appendStyled(el, p.text, op.marks, p.start)
    wrap.appendChild(el)
  })
  return wrap
}

/** The "stacked" and the "new" views: the old text as one piece, the new text as one piece. */
function wholeDecorations(doc: PMNode, from: number, to: number, ops: DiffOp[], id: string, view: 'stacked' | 'new'): Decoration[] {
  const decos: Decoration[] = []
  const kept = ops.filter((o) => o.type !== 'delete')
  const text = kept.map((o) => o.text).join('')
  const marks = kept.some((o) => o.marks) ? kept.flatMap((o) => o.marks ?? o.text.split('').map(() => '')) : undefined
  if (view === 'stacked') {
    decos.push(Decoration.inline(from, to, { class: 'ai-del' }))
    // A scene break in the passage is a block without text: strike it as a whole.
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.isBlock && node.isLeaf && pos >= from && pos + node.nodeSize <= to) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'ai-del-block' }))
      return !node.isTextblock
    })
  } else {
    // Hide the old text. A paragraph that is all inside the change hides as a whole, but not the
    // last one: the new text shows in it. A scene break in the passage hides too.
    doc.nodesBetween(from, to, (node, pos) => {
      if (node.isBlock && node.isLeaf) {
        if (pos >= from && pos + node.nodeSize <= to) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'ai-hide' }))
        return false
      }
      if (!node.isTextblock) return true
      const start = pos + 1
      const end = pos + 1 + node.content.size
      const whole = from <= start && to >= end && end < to
      if (whole) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'ai-hide' }))
      else if (Math.min(to, end) > Math.max(from, start)) decos.push(Decoration.inline(Math.max(from, start), Math.min(to, end), { class: 'ai-hide' }))
      return false
    })
  }
  decos.push(
    Decoration.widget(to, () => insertElement({ text, marks }, view), { side: 1, key: `ins-${view}-${id}-${text.length}-${marks?.join('|').length ?? 0}`, ignoreSelection: true })
  )
  return decos
}

/** Build a slice from Markdown, open at both ends when the ends are paragraphs. */
export function sliceFromMarkdown(schema: Schema, markdown: string): Slice {
  const doc = schema.nodeFromJSON(parseMarkdown(markdown))
  const content = doc.content
  const openStart = content.firstChild?.isTextblock ? 1 : 0
  const openEnd = content.lastChild?.isTextblock ? 1 : 0
  return new Slice(content, openStart, openEnd)
}

function mapSelection(tr: Transaction, r: ReviewData, from: number, to: number): ReviewData['selection'] {
  const clamp = (p: number): number => Math.max(from, Math.min(to, tr.mapping.map(p)))
  return { anchor: clamp(r.selection.anchor), head: clamp(r.selection.head) }
}

export const Review = Extension.create({
  name: 'review',
  // Before the page break (Ctrl+Enter, priority 1000): Ctrl+Enter in the passage accepts the change.
  priority: 1100,

  addProseMirrorPlugins() {
    const editor = this.editor
    const report = (data: ReviewData, lost: boolean): void => {
      const accepted = applied.delete(data.id)
      if (useReviewHost.getState().id === data.id) useReviewHost.setState({ editor: null, id: null })
      for (const fn of endListeners) fn({ id: data.id, accepted, lost, data })
    }
    return [
      new Plugin<ReviewData | null>({
        key: reviewKey,
        state: {
          init: () => null,
          apply(tr: Transaction, prev: ReviewData | null, _old, next): ReviewData | null {
            const meta = tr.getMeta(reviewKey) as ReviewMeta | undefined
            if (meta?.type === 'start') return meta.data
            if (meta?.type === 'apply' && prev) applied.add(prev.id)
            if (meta?.type === 'clear' || meta?.type === 'apply') return null
            if (!prev) return null
            let r = prev
            if (tr.docChanged) {
              // An edit that the lock let through (a chat proposal) changed the passage: the change of the AI does not fit any more.
              if (touchesPassage(tr, prev.from, prev.to)) return null
              const from = tr.mapping.map(prev.from, 1)
              const to = tr.mapping.map(prev.to, -1)
              if (to <= from) return null
              r = { ...prev, from, to, selection: mapSelection(tr, prev, from, to) }
            }
            if (meta?.type === 'update' && meta.id === r.id) {
              const ops = meta.phase === 'ready' ? reviewOps(next.doc, r.from, r.to, meta.proposed) : r.ops
              return { ...r, proposed: meta.proposed, phase: meta.phase, error: meta.error, ops }
            }
            return r
          }
        },
        view: (view) => {
          // A review that the state has when the editor starts (it cannot, but be safe).
          const first = reviewKey.getState(view.state)
          if (first) useReviewHost.setState({ editor, id: first.id })
          return {
            update(v, prevState) {
              const prev = reviewKey.getState(prevState)
              const cur = reviewKey.getState(v.state)
              if (prev && (!cur || cur.id !== prev.id)) report(prev, false)
              if (cur && (!prev || prev.id !== cur.id)) useReviewHost.setState({ editor, id: cur.id })
            },
            destroy() {
              // A new set of plugins (a menu that adds its plugin) also destroys this view, but the
              // review stays in the state. Only a destroyed editor loses it.
              const cur = reviewKey.getState(view.state)
              if (cur) queueMicrotask(() => view.isDestroyed && report(cur, true))
            }
          }
        },
        props: {
          decorations(state) {
            const r = reviewKey.getState(state)
            return r ? decorations(state, r) : null
          },
          handleKeyDown(view, event) {
            const r = reviewKey.getState(view.state)
            // Outside the passage, the keys do their normal work.
            if (!r || !cursorInPassage(view.state, r)) return false
            if (event.key === 'Escape') {
              // While the AI works this stops it too (runAction listens to the end of the review).
              view.dispatch(endTransaction(view.state, true))
              return true
            }
            if (event.key === 'Enter' && !event.altKey) {
              // Enter and Ctrl+Enter accept. Shift+Enter, and Enter while the AI works, would split the locked passage.
              if (r.phase === 'ready' && !event.shiftKey) acceptInto(view.state, view.dispatch)
              else cue()
              return true
            }
            if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) return focusBar(view)
            return false
          }
        },
        filterTransaction(tr, state) {
          const r = reviewKey.getState(state)
          if (!r || !tr.docChanged || tr.getMeta(reviewKey)) return true
          if (!touchesPassage(tr, r.from, r.to)) return true
          // A chat proposal can change the passage; the review then ends (see apply).
          if (tr.getMeta('allowDuringReview')) return true
          cue()
          return false
        }
      })
    ]
  },

  addCommands() {
    return {
      startReview:
        ({ id, from, to, label, actionId, docId, selection }) =>
        ({ state, tr, dispatch }) => {
          if (dispatch) {
            const original = reviewText(state.doc, from, to).text
            const sel = selection ?? { anchor: state.selection.anchor, head: state.selection.head }
            const data: ReviewData = { id, from, to, label, actionId, docId, selection: sel, phase: 'loading', original, proposed: '', ops: [] }
            tr.setMeta(reviewKey, { type: 'start', data } satisfies ReviewMeta)
          }
          return true
        },
      resumeReview:
        (data) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(reviewKey, { type: 'start', data } satisfies ReviewMeta)
          return true
        },
      updateReview:
        (id, proposed, phase, error) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(reviewKey, { type: 'update', id, proposed, phase, error } satisfies ReviewMeta)
          return true
        },
      acceptReview:
        () =>
        ({ state, dispatch }) => {
          return acceptInto(state, dispatch)
        },
      rejectReview:
        () =>
        ({ state, tr, dispatch }) => {
          const r = reviewKey.getState(state)
          if (!r) return false
          if (dispatch) {
            tr.setMeta(reviewKey, { type: 'clear' } satisfies ReviewMeta)
            restoreSelection(tr, state, r)
          }
          return true
        }
    }
  }
})

/** Give back the selection of the author, when the cursor is still in the passage. */
function restoreSelection(tr: Transaction, state: EditorState, r: ReviewData): void {
  if (!cursorInPassage(state, r)) return
  const size = tr.doc.content.size
  const at = (p: number): number => Math.max(0, Math.min(size, p))
  tr.setSelection(TextSelection.between(tr.doc.resolve(at(r.selection.anchor)), tr.doc.resolve(at(r.selection.head))))
}

/** The transaction that ends the review without a change. `restore`: give the selection back. */
function endTransaction(state: EditorState, restore: boolean): Transaction {
  const r = reviewKey.getState(state)
  const tr = state.tr.setMeta(reviewKey, { type: 'clear' } satisfies ReviewMeta)
  if (r && restore) restoreSelection(tr, state, r)
  return tr
}

/** End a review without a change and without moving the cursor (a new review starts somewhere else). */
export function dropReview(editor: Editor): void {
  if (!editor.isDestroyed && reviewKey.getState(editor.state)) editor.view.dispatch(endTransaction(editor.state, false))
}

function acceptInto(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const r = reviewKey.getState(state)
  if (!r || r.phase !== 'ready') return false
  if (dispatch) {
    const slice = sliceFromMarkdown(state.schema, r.proposed)
    const tr = state.tr.replaceRange(r.from, r.to, slice)
    tr.setMeta(reviewKey, { type: 'apply' } satisfies ReviewMeta)
    tr.scrollIntoView()
    dispatch(tr)
  }
  return true
}

// Test runs (WORDELIA_E2E) read the review of the book.
if (typeof window !== 'undefined' && window.wordelia?.isE2E) {
  ;(window as unknown as Record<string, unknown>).__review = {
    host: useReviewHost,
    cue: useReviewCue,
    state: () => {
      const e = useReviewHost.getState().editor
      return e && !e.isDestroyed ? reviewKey.getState(e.state) : null
    }
  }
}
