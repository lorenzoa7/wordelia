// The passages of the comments of an editor's read, in the text of a chapter.
//
// - The passage of each open comment has a mark: a soft wash in the color of its lens, or a wavy amber
//   line under the words for Continuity. A number in the right margin of the page gives the order of the
//   comment in the chapter.
// - A comment stays on its passage while the author writes: the range of the passage maps through each
//   edit. A replace of a larger part (a Polish of the paragraph, a paste, a chat change) that keeps the
//   words of the passage keeps the passage. After a pause, the comment gets the new words of its passage,
//   and a passage that is gone makes the comment "lost". When the words come back at the same place
//   (Ctrl+Z, Redo), the comment is not lost any more. The marks are decorations: they never change the
//   text, the selection or the undo history.
// - A comment that this editor does not follow yet (a new comment, a chapter that comes on screen, a text
//   from outside the editor) finds its passage by its text: the first match after the start of its read
//   (the selection of a read of a selection, else the start of the chapter).

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { Mappable, StepMap } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { create } from 'zustand'
import type { EditorComment, Lens } from '@shared/comments'
import { findText } from '@shared/proposals/apply'
import { isReload } from '@/features/editor/keep'
import { getChapterEditor } from '@/features/editor/registry'
import { textWithMap } from '@/features/editor/review'
import { useBook } from '@/stores/book'
import { setLost, updatePassage, useComments } from './store'
import './read.css'

/** A passage in the document: from its first character to the position after its last one. */
export interface Range {
  from: number
  to: number
}

/** A comment with a mark */
interface Shown {
  id: string
  lens: Lens
  rank: number
}

interface MarksState {
  /** The passage of each comment that the editor follows, by comment id. An empty range is a deleted passage. */
  ranges: Map<string, Range>
  /** The place where this editor saw the passage of a lost comment go. Its words can come back there (Ctrl+Z). */
  lost: Map<string, number>
  /** The comments with marks, in the order of the list */
  shown: Shown[]
  decorations: DecorationSet
  /** The text came from outside the editor: the view finds all the passages again by their text. */
  refind: boolean
}

export const commentMarksKey = new PluginKey<MarksState>('commentMarks')

/** The pause after the last edit, before the comments get the new words of their passages. */
const PASSAGE_PAUSE_MS = 300

/** The marks of the passages are off (the "Hide" switch of the margin sets it). The comments still follow the text. */
export const useCommentMarks = create<{ hidden: boolean }>(() => ({ hidden: false }))

function inDoc(doc: PMNode, r: Range): boolean {
  return r.from >= 0 && r.from <= r.to && r.to <= doc.content.size
}

/** Where a passage is in a text: the first match after the start of `scope` (when `scope` is in the text), else the first match. */
function locate(text: string, passage: string, scope?: string): { start: number; end: number } | null {
  const from = scope ? findText(text, scope)?.start : undefined
  if (from !== undefined) {
    const m = findText(text.slice(from), passage)
    if (m) return { start: from + m.start, end: from + m.end }
  }
  return findText(text, passage)
}

/**
 * The passage of each comment in a document. A comment with a known range keeps it. The other comments find
 * their passage by its text: the first match after the start of the read (`scopeOf` gives the selected text
 * of a read of a selection), also when the passage is in the chapter more than one time. A comment whose
 * passage is not in the text gets no range.
 */
export function anchorComments(
  doc: PMNode,
  comments: EditorComment[],
  known: Map<string, Range>,
  scopeOf?: (c: EditorComment) => string | undefined
): Map<string, Range> {
  const out = new Map<string, Range>()
  let plain: { text: string; map: number[] } | undefined
  for (const c of comments) {
    const had = known.get(c.id)
    if (had && inDoc(doc, had)) {
      out.set(c.id, had)
      continue
    }
    if (!c.passage.trim()) continue
    plain ??= textWithMap(doc, 0, doc.content.size)
    const m = locate(plain.text, c.passage, scopeOf?.(c))
    if (m) out.set(c.id, { from: plain.map[m.start], to: plain.map[m.end - 1] + 1 })
  }
  return out
}

/**
 * A range after one step. Text typed at the start or at the end of a passage stays out of it. A step that
 * replaces text of the passage (a Polish of the paragraph, a paste over it, a chat change) keeps the passage
 * when the new text still has its words; else the range keeps what is left of it, or becomes empty.
 */
function mapRange(map: StepMap, r: Range, before: PMNode, after: PMNode): Range {
  const from = map.map(r.from, 1)
  const to = map.map(r.to, -1)
  const mapped = from < to ? { from, to } : { from: to, to }
  if (r.from >= r.to) return mapped
  let start = r.from
  let end = r.to
  let replaced = false
  map.forEach((oldStart, oldEnd) => {
    if (oldEnd <= oldStart || oldStart >= r.to || oldEnd <= r.from) return
    replaced = true
    start = Math.min(start, oldStart)
    end = Math.max(end, oldEnd)
  })
  if (!replaced) return mapped
  const words = textWithMap(before, r.from, r.to).text
  const { text, map: at } = textWithMap(after, map.map(start, -1), map.map(end, 1))
  const m = words.trim() ? findText(text, words.trim()) : null
  return m ? { from: at[m.start], to: at[m.end - 1] + 1 } : mapped
}

/** The ranges after the steps of a transaction. */
export function mapRanges(ranges: Map<string, Range>, tr: Pick<Transaction, 'mapping' | 'docs' | 'doc'>): Map<string, Range> {
  let out = ranges
  tr.mapping.maps.forEach((map, i) => {
    const before = tr.docs[i]
    const after = tr.docs[i + 1] ?? tr.doc
    const next = new Map<string, Range>()
    for (const [id, r] of out) next.set(id, mapRange(map, r, before, after))
    out = next
  })
  return out
}

/** Places after an edit: text typed at a place goes after it. */
function mapPoints(points: Map<string, number>, mapping: Mappable): Map<string, number> {
  return new Map([...points].map(([id, p]) => [id, mapping.map(p, -1)]))
}

/**
 * The range of a passage that starts at a place (only spaces and paragraph breaks before it), or null. A
 * deleted passage whose words come back at the same place (Ctrl+Z, Redo) is found again, and never at
 * another place of the chapter.
 */
export function passageAt(doc: PMNode, at: number, passage: string): Range | null {
  if (!passage.trim()) return null
  const from = Math.max(0, Math.min(at, doc.content.size))
  const { text, map } = textWithMap(doc, from, Math.min(doc.content.size, from + passage.length + 32))
  const m = findText(text, passage)
  return m && !text.slice(0, m.start).trim() ? { from: map[m.start], to: map[m.end - 1] + 1 } : null
}

/**
 * What the edits did to the passages of the comments: the new text of each passage that changed, or `null`
 * for a passage that is gone (deleted, or not in the text).
 */
export function passageChanges(doc: PMNode, comments: EditorComment[], ranges: Map<string, Range>): Map<string, string | null> {
  const out = new Map<string, string | null>()
  for (const c of comments) {
    const r = ranges.get(c.id)
    const text = r && r.from < r.to && inDoc(doc, r) ? textWithMap(doc, r.from, r.to).text.trim() : ''
    if (!text) out.set(c.id, null)
    else if (text !== c.passage) out.set(c.id, text)
  }
  return out
}

/** The comments that have a passage, in the order of their passages in the chapter. The rank orders two comments at one place. */
export function inChapterOrder<T extends { id: string; rank: number }>(comments: T[], ranges: Map<string, Range>): T[] {
  const has = (c: T): boolean => {
    const r = ranges.get(c.id)
    return Boolean(r && r.from < r.to)
  }
  return comments.filter(has).sort((a, b) => ranges.get(a.id)!.from - ranges.get(b.id)!.from || a.rank - b.rank)
}

/** The live ranges of the passages of a chapter on screen. Empty when the chapter has no editor. */
export function commentRanges(chapterId: string): Map<string, Range> {
  const ed = getChapterEditor(chapterId)
  const st = ed ? commentMarksKey.getState(ed.editor.state) : undefined
  return new Map([...(st?.ranges ?? [])].filter(([, r]) => r.from < r.to))
}

/* ------------------------------------------------------------------ */
/* The read of a comment                                                */
/* ------------------------------------------------------------------ */

/** The selected text of the read of each reply (by message id), or null for a read of the whole chapter */
const scopes = new Map<string, string | null>()

/** The selected text of the read that gave a comment, or undefined for a read of the whole chapter. */
function readScope(c: EditorComment): string | undefined {
  const known = scopes.get(c.messageId)
  if (known !== undefined) return known ?? undefined
  const thread = useBook.getState().threads.find((t) => t.id === c.threadId)
  if (!thread) return undefined
  const i = thread.messages.findIndex((m) => m.id === c.messageId)
  // A reply that still streams is not in the thread yet: it answers the last message.
  const asked = i < 0 ? thread.messages.at(-1) : thread.messages[i - 1]
  const scope = asked?.role === 'user' && asked.read?.selection?.text.trim() ? asked.read.selection.text : null
  if (i >= 0) scopes.set(c.messageId, scope)
  return scope ?? undefined
}

/* ------------------------------------------------------------------ */
/* The marks                                                            */
/* ------------------------------------------------------------------ */

interface Numbered {
  id: string
  lens: Lens
  n: number
}

/** The numbers of the comments whose passages start at one place, in the right margin of the page. */
function numbersWidget(items: Numbered[]): HTMLElement {
  const box = document.createElement('span')
  box.className = 'cm-nums'
  box.setAttribute('contenteditable', 'false')
  box.setAttribute('aria-hidden', 'true')
  for (const it of items) {
    const num = document.createElement('span')
    num.className = `cm-num cm-${it.lens}`
    num.dataset.comment = it.id
    num.textContent = String(it.n)
    box.appendChild(num)
  }
  return box
}

/** The marks of the shown comments at their ranges. */
function marksOf(doc: PMNode, shown: Shown[], ranges: Map<string, Range>): DecorationSet {
  const ordered = inChapterOrder(shown, ranges)
  if (!ordered.length) return DecorationSet.empty
  const decos: Decoration[] = []
  const washes = new Set<string>()
  const starts = new Map<number, Numbered[]>()
  ordered.forEach((c, i) => {
    const r = ranges.get(c.id)!
    // Two comments of one lens on the same words get one mark, not a darker one.
    const wash = `${r.from}:${r.to}:${c.lens}`
    if (!washes.has(wash)) {
      washes.add(wash)
      decos.push(Decoration.inline(r.from, r.to, { class: `cm-mark cm-${c.lens}`, 'data-mark': c.id }))
    }
    starts.set(r.from, [...(starts.get(r.from) ?? []), { id: c.id, lens: c.lens, n: i + 1 }])
  })
  for (const [pos, items] of starts) {
    decos.push(
      Decoration.widget(pos, () => numbersWidget(items), {
        // Like the start of the range: text typed at this place goes before the number.
        side: 1,
        marks: [],
        key: `cm-num:${items.map((x) => `${x.id}.${x.lens}.${x.n}`).join('|')}`,
        ignoreSelection: true,
        stopEvent: () => true
      })
    )
  }
  return DecorationSet.create(doc, decos)
}

const shownKey = (shown: Shown[]): string => shown.map((c) => `${c.id}:${c.lens}:${c.rank}`).join(',')

function sameMap<V>(a: Map<string, V>, b: Map<string, V>, same: (x: V, y: V) => boolean): boolean {
  if (a.size !== b.size) return false
  for (const [id, v] of a) {
    const o = b.get(id)
    if (o === undefined || !same(v, o)) return false
  }
  return true
}

const sameRange = (a: Range, b: Range): boolean => a.from === b.from && a.to === b.to

/** The plugin of the marks in the editor of one chapter. */
export function commentMarksPlugin(chapterId: () => string): Plugin<MarksState> {
  return new Plugin<MarksState>({
    key: commentMarksKey,
    state: {
      init: () => ({ ranges: new Map(), lost: new Map(), shown: [], decorations: DecorationSet.empty, refind: false }),
      apply(tr, value) {
        const meta = tr.getMeta(commentMarksKey) as MarksState | undefined
        if (meta) return meta
        if (!tr.docChanged) return value
        const ranges = mapRanges(value.ranges, tr)
        return {
          ranges,
          lost: mapPoints(value.lost, tr.mapping),
          shown: value.shown,
          decorations: marksOf(tr.doc, value.shown, ranges),
          // A text from another program or a restored version: the view finds the passages again by their text.
          refind: value.refind || isReload(tr)
        }
      }
    },
    props: {
      decorations: (state) => commentMarksKey.getState(state)?.decorations
    },
    view(view) {
      /** The pause after the last edit */
      let pause: ReturnType<typeof setTimeout> | undefined
      let soon: ReturnType<typeof setTimeout> | undefined
      /** The first draw of this editor looks for the passages of the lost comments too. */
      let first = true
      // The book of this editor. When another book opens, the comment store changes before this editor
      // goes away: the comments of the other book (maybe with the same chapter ids) never show or change here.
      const book = useBook.getState().root
      const comments = (): { list: EditorComment[]; readOnly: boolean } => {
        const s = useComments.getState()
        return book !== null && s.root === book ? s : { list: [], readOnly: true }
      }

      /**
       * Find the passages of the comments that the editor does not follow yet, find again the deleted
       * passages whose words came back, and draw the marks again when something changed.
       */
      const draw = (): void => {
        const st = commentMarksKey.getState(view.state)
        if (!st) return
        const doc = view.state.doc
        const { list, readOnly } = comments()
        const open = list.filter((c) => c.chapterId === chapterId() && c.state === 'open')
        const mine = open.filter((c) => !c.lost)
        // A deleted passage whose words are back at its place keeps its comment.
        const known = st.refind ? new Map<string, Range>() : new Map(st.ranges)
        for (const c of mine) {
          const r = known.get(c.id)
          const again = r && r.from >= r.to ? passageAt(doc, r.from, c.passage) : null
          if (again) known.set(c.id, again)
        }
        const ranges = anchorComments(doc, mine, known, readScope)
        // The lost comments: their words at the place where they went, or (a new editor, a text from
        // outside) anywhere in the text. A comment that another computer made lost is not taken back here.
        const lost = new Map<string, number>()
        const search: EditorComment[] = []
        const back: string[] = []
        for (const c of open.filter((x) => x.lost)) {
          const r = st.ranges.get(c.id)
          const at = st.lost.get(c.id) ?? (r && r.from >= r.to ? r.from : undefined)
          const again = at !== undefined && !st.refind ? passageAt(doc, at, c.passage) : null
          if (again) {
            ranges.set(c.id, again)
            back.push(c.id)
          } else {
            if (at !== undefined && !st.refind) lost.set(c.id, at)
            if (first || st.refind) search.push(c)
          }
        }
        for (const [id, r] of anchorComments(doc, search, new Map(), readScope)) {
          ranges.set(id, r)
          lost.delete(id)
          back.push(id)
        }
        first = false
        const shown: Shown[] = useCommentMarks.getState().hidden ? [] : mine.map((c) => ({ id: c.id, lens: c.lens, rank: c.rank }))
        const same = !st.refind && shownKey(shown) === shownKey(st.shown) && sameMap(ranges, st.ranges, sameRange) && sameMap(lost, st.lost, (a, b) => a === b)
        if (!same) {
          const next: MarksState = { ranges, lost, shown, decorations: marksOf(doc, shown, ranges), refind: false }
          view.dispatch(view.state.tr.setMeta(commentMarksKey, next).setMeta('addToHistory', false).setMeta('allowDuringReview', true))
        }
        if (!readOnly) for (const id of back) setLost(id, false)
      }

      /** Give the comments the new words of their passages, and mark the passages that are gone. */
      const settle = (state: EditorState): void => {
        const { list, readOnly } = comments()
        const st = commentMarksKey.getState(state)
        // A comments file of a newer Wordelia is never written, and the comments of another book never change here.
        if (readOnly || !st) return
        const mine = list.filter((c) => c.chapterId === chapterId() && c.state === 'open' && !c.lost)
        for (const [id, text] of passageChanges(state.doc, mine, st.ranges)) {
          if (text === null) setLost(id, true)
          else updatePassage(id, text)
        }
      }

      const refresh = (): void => {
        if (view.isDestroyed) return
        draw()
        // Edits that are still in the pause settle at its end.
        if (!pause) settle(view.state)
      }

      const offComments = useComments.subscribe((s, prev) => {
        if (s.list !== prev.list || s.readOnly !== prev.readOnly) refresh()
      })
      const offHidden = useCommentMarks.subscribe(refresh)
      // After the editor is ready.
      soon = setTimeout(refresh, 0)
      return {
        update(v, prev) {
          if (v.state.doc === prev.doc) return
          clearTimeout(pause)
          pause = setTimeout(() => {
            pause = undefined
            refresh()
          }, PASSAGE_PAUSE_MS)
          if (commentMarksKey.getState(v.state)?.refind) {
            clearTimeout(soon)
            soon = setTimeout(refresh, 0)
          }
        },
        destroy() {
          offComments()
          offHidden()
          clearTimeout(soon)
          // The chapter leaves the screen in the pause: the comments get the last words now.
          if (pause) {
            clearTimeout(pause)
            pause = undefined
            settle(view.state)
          }
        }
      }
    }
  })
}

export interface CommentMarksOptions {
  /** The chapter of this editor */
  chapterId: () => string
}

export const CommentMarks = Extension.create<CommentMarksOptions>({
  name: 'commentMarks',

  addOptions() {
    return { chapterId: () => '' }
  },

  addProseMirrorPlugins() {
    return [commentMarksPlugin(this.options.chapterId)]
  }
})

// Test runs (WORDELIA_E2E) can read the live ranges and hide the marks.
if (typeof window !== 'undefined' && window.wordelia?.isE2E) {
  ;(window as unknown as Record<string, unknown>).__commentMarks = { commentRanges, useCommentMarks }
}
