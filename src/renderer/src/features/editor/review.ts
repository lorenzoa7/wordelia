// Inline review of an AI rewrite: the proposal shows as a word diff on the page.
// Accept replaces the range in one transaction (one undo step). Reject removes the marks.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Slice, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { parseMarkdown } from '@shared/markdown/parse'
import { markdownToPlain } from '@shared/book'
import { wordDiff, type DiffOp } from '@shared/text/diff'

export interface ReviewData {
  id: string
  from: number
  to: number
  phase: 'loading' | 'ready' | 'error'
  label: string
  /** Text of the range, blocks joined with a blank line */
  original: string
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

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    review: {
      startReview: (opts: { id: string; from: number; to: number; label: string }) => ReturnType
      updateReview: (id: string, proposed: string, phase: ReviewData['phase'], error?: string) => ReturnType
      acceptReview: () => ReturnType
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
  return markdownToPlain(markdown)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\\\n/g, '\n').trim())
    .filter(Boolean)
    .join('\n\n')
}

/** An empty block after the reviewed text. The review bar sits in it, so it never covers text. */
function spacer(state: EditorState, r: ReviewData): Decoration {
  const $to = state.doc.resolve(Math.min(r.to, state.doc.content.size))
  const pos = $to.depth >= 1 ? $to.after(1) : r.to
  return Decoration.widget(
    pos,
    () => {
      const el = document.createElement('div')
      el.className = 'review-spacer'
      el.setAttribute('contenteditable', 'false')
      return el
    },
    { side: 1, key: 'review-spacer', ignoreSelection: true }
  )
}

function decorations(state: EditorState, r: ReviewData): DecorationSet {
  const decos: Decoration[] = [spacer(state, r)]
  if (r.phase !== 'ready') {
    decos.push(Decoration.inline(r.from, r.to, { class: r.phase === 'error' ? 'ai-error' : 'ai-pending' }))
    return DecorationSet.create(state.doc, decos)
  }
  const { map } = textWithMap(state.doc, r.from, r.to)
  let i = 0
  r.ops.forEach((op, n) => {
    const len = op.text.length
    if (op.type === 'equal') {
      i += len
    } else if (op.type === 'delete') {
      const a = map[i] ?? r.to
      const b = (map[Math.min(i + len, map.length) - 1] ?? r.to - 1) + 1
      if (b > a) decos.push(Decoration.inline(a, b, { class: 'ai-del' }))
      i += len
    } else {
      const pos = i < map.length ? map[i] : r.to
      decos.push(
        Decoration.widget(
          pos,
          () => {
            const span = document.createElement('span')
            span.className = 'ai-ins'
            const parts = op.text.split(/\n\n/)
            parts.forEach((part, k) => {
              if (k > 0) {
                const pil = document.createElement('span')
                pil.className = 'ai-ins-break'
                pil.textContent = '¶'
                span.appendChild(pil)
              }
              span.appendChild(document.createTextNode(part))
            })
            return span
          },
          { side: -1, key: `ins-${r.id}-${n}-${op.text.length}`, ignoreSelection: true }
        )
      )
    }
  })
  decos.push(Decoration.inline(r.from, r.to, { class: 'ai-range' }))
  return DecorationSet.create(state.doc, decos)
}

/** Build a slice from Markdown, open at both ends when the ends are paragraphs. */
export function sliceFromMarkdown(schema: Schema, markdown: string): Slice {
  const doc = schema.nodeFromJSON(parseMarkdown(markdown))
  const content = doc.content
  const openStart = content.firstChild?.isTextblock ? 1 : 0
  const openEnd = content.lastChild?.isTextblock ? 1 : 0
  return new Slice(content, openStart, openEnd)
}

export const Review = Extension.create({
  name: 'review',

  addProseMirrorPlugins() {
    return [
      new Plugin<ReviewData | null>({
        key: reviewKey,
        state: {
          init: () => null,
          apply(tr: Transaction, prev: ReviewData | null, _old, next): ReviewData | null {
            const meta = tr.getMeta(reviewKey) as ReviewMeta | undefined
            if (meta?.type === 'start') return meta.data
            if (meta?.type === 'clear' || meta?.type === 'apply') return null
            if (!prev) return null
            if (meta?.type === 'update' && meta.id === prev.id) {
              const ops = meta.phase === 'ready' ? wordDiff(prev.original, proposedPlain(meta.proposed)) : prev.ops
              return { ...prev, proposed: meta.proposed, phase: meta.phase, error: meta.error, ops }
            }
            if (tr.docChanged) {
              const from = tr.mapping.map(prev.from, 1)
              const to = tr.mapping.map(prev.to, -1)
              if (to <= from) return null
              return { ...prev, from, to, original: textWithMap(next.doc, from, to).text }
            }
            return prev
          }
        },
        props: {
          decorations(state) {
            const r = reviewKey.getState(state)
            return r ? decorations(state, r) : null
          },
          handleKeyDown(view, event) {
            const r = reviewKey.getState(view.state)
            if (!r) return false
            if (event.key === 'Escape') {
              view.dispatch(view.state.tr.setMeta(reviewKey, { type: 'clear' } satisfies ReviewMeta))
              return true
            }
            if (event.key === 'Enter' && r.phase === 'ready' && !event.shiftKey) {
              acceptInto(view.state, view.dispatch)
              return true
            }
            // Block typing while a review is open.
            if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete' || event.key === 'Enter') return true
            return false
          }
        },
        filterTransaction(tr, state) {
          const r = reviewKey.getState(state)
          if (!r || !tr.docChanged) return true
          return Boolean(tr.getMeta(reviewKey)) || Boolean(tr.getMeta('allowDuringReview'))
        }
      })
    ]
  },

  addCommands() {
    return {
      startReview:
        ({ id, from, to, label }) =>
        ({ state, tr, dispatch }) => {
          if (dispatch) {
            const original = textWithMap(state.doc, from, to).text
            tr.setMeta(reviewKey, { type: 'start', data: { id, from, to, label, phase: 'loading', original, proposed: '', ops: [] } } satisfies ReviewMeta)
          }
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
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(reviewKey, { type: 'clear' } satisfies ReviewMeta)
          return true
        }
    }
  }
})

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
