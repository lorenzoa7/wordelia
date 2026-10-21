// The passages of the comments of an editor's read, in the text of a chapter.
//
// - The passage of each open comment has a mark: a soft wash in the color of its lens, or a wavy amber
//   line under the words for Continuity. A number in the right margin of the page gives the order of the
//   comment in the chapter.
// - A comment stays on its passage while the author writes: the range of the passage maps through each
//   edit. After a pause, the comment gets the new words of its passage, and a passage that is gone makes
//   the comment "lost". The marks are decorations: they never change the text, the selection or the undo
//   history.
// - A comment that this editor does not follow yet (a new comment, a chapter that comes on screen, a text
//   from outside the editor) finds its passage by its text: the first match in the chapter.

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import type { Mappable } from '@tiptap/pm/transform'
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

interface MarksState {
  /** The passage of each comment that the editor follows, by comment id. An empty range is a deleted passage. */
  ranges: Map<string, Range>
  decorations: DecorationSet
  /** What the marks show: the comments in their order, with their lenses. The view draws again when this changes. */
  drawn: string
  /** The text came from outside the editor: the view finds all the passages again by their text. */
  refind: boolean
}

export const commentMarksKey = new PluginKey<MarksState>('commentMarks')

/** The pause after the last edit, before the comments get the new words of their passages. */
const PASSAGE_PAUSE_MS = 300

/** The marks of the passages are off (the "Hide" switch of the margin sets it). The comments still follow the text. */
export const useCommentMarks = create<{ hidden: boolean }>(() => ({ hidden: false }))

/** The comments of a chapter that have a passage in its text: open, and not lost. */
function followed(list: EditorComment[], chapterId: string): EditorComment[] {
  return list.filter((c) => c.chapterId === chapterId && c.state === 'open' && !c.lost)
}

function inDoc(doc: PMNode, r: Range): boolean {
  return r.from >= 0 && r.from <= r.to && r.to <= doc.content.size
}

/**
 * The passage of each comment in a document. A comment with a known range keeps it. The other comments find
 * their passage by its text: the first match, also when the passage is in the chapter more than one time.
 * A comment whose passage is not in the text gets no range.
 */
export function anchorComments(doc: PMNode, comments: EditorComment[], known: Map<string, Range>): Map<string, Range> {
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
    const m = findText(plain.text, c.passage)
    if (m) out.set(c.id, { from: plain.map[m.start], to: plain.map[m.end - 1] + 1 })
  }
  return out
}

/**
 * The ranges after an edit. Text typed at the start or at the end of a passage stays out of it. A passage
 * that the edit deletes becomes an empty range.
 */
function mapRanges(ranges: Map<string, Range>, mapping: Mappable): Map<string, Range> {
  const out = new Map<string, Range>()
  for (const [id, r] of ranges) {
    const from = mapping.map(r.from, 1)
    const to = mapping.map(r.to, -1)
    out.set(id, from < to ? { from, to } : { from: to, to })
  }
  return out
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
export function inChapterOrder(comments: EditorComment[], ranges: Map<string, Range>): EditorComment[] {
  const has = (c: EditorComment): boolean => {
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

/** The state of the marks for comments at their ranges. */
function marksState(doc: PMNode, comments: EditorComment[], ranges: Map<string, Range>, hidden: boolean): MarksState {
  const ordered = hidden ? [] : inChapterOrder(comments, ranges)
  const drawn = ordered.map((c) => `${c.id}:${c.lens}`).join(',')
  if (!ordered.length) return { ranges, decorations: DecorationSet.empty, drawn, refind: false }
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
  return { ranges, decorations: DecorationSet.create(doc, decos), drawn, refind: false }
}

function sameRanges(a: Map<string, Range>, b: Map<string, Range>): boolean {
  if (a.size !== b.size) return false
  for (const [id, r] of a) {
    const o = b.get(id)
    if (!o || o.from !== r.from || o.to !== r.to) return false
  }
  return true
}

/** The plugin of the marks in the editor of one chapter. */
export function commentMarksPlugin(chapterId: () => string): Plugin<MarksState> {
  return new Plugin<MarksState>({
    key: commentMarksKey,
    state: {
      init: () => ({ ranges: new Map(), decorations: DecorationSet.empty, drawn: '', refind: false }),
      apply(tr, value) {
        const meta = tr.getMeta(commentMarksKey) as MarksState | undefined
        if (meta) return meta
        if (!tr.docChanged) return value
        const next = { ...value, ranges: mapRanges(value.ranges, tr.mapping), decorations: value.decorations.map(tr.mapping, tr.doc) }
        // A text from another program or a restored version: the view finds the passages again by their text.
        return isReload(tr) ? { ...next, refind: true } : next
      }
    },
    props: {
      decorations: (state) => commentMarksKey.getState(state)?.decorations
    },
    view(view) {
      /** The pause after the last edit */
      let pause: ReturnType<typeof setTimeout> | undefined
      let soon: ReturnType<typeof setTimeout> | undefined
      // The book of this editor. When another book opens, the comment store changes before this editor
      // goes away: the comments of the other book (maybe with the same chapter ids) never show or change here.
      const book = useBook.getState().root
      const comments = (): { list: EditorComment[]; readOnly: boolean } => {
        const s = useComments.getState()
        return book !== null && s.root === book ? s : { list: [], readOnly: true }
      }

      /** Find the passages of the comments that the editor does not follow yet, and draw the marks again when they changed. */
      const draw = (): void => {
        const st = commentMarksKey.getState(view.state)
        if (!st) return
        const { list, readOnly } = comments()
        const mine = followed(list, chapterId())
        // A text from outside: a lost comment whose passage is in the new text gets its passage back.
        const back = st.refind ? list.filter((c) => c.chapterId === chapterId() && c.state === 'open' && c.lost) : []
        const ranges = anchorComments(view.state.doc, [...mine, ...back], st.refind ? new Map() : st.ranges)
        const next = marksState(view.state.doc, mine, ranges, useCommentMarks.getState().hidden)
        if (!st.refind && next.drawn === st.drawn && sameRanges(ranges, st.ranges)) return
        view.dispatch(view.state.tr.setMeta(commentMarksKey, next).setMeta('addToHistory', false).setMeta('allowDuringReview', true))
        if (!readOnly) for (const c of back) if (ranges.has(c.id)) setLost(c.id, false)
      }

      /** Give the comments the new words of their passages, and mark the passages that are gone. */
      const settle = (state: EditorState): void => {
        const { list, readOnly } = comments()
        const st = commentMarksKey.getState(state)
        // A comments file of a newer Wordelia is never written, and the comments of another book never change here.
        if (readOnly || !st) return
        const changes = passageChanges(state.doc, followed(list, chapterId()), st.ranges)
        for (const [id, text] of changes) {
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
