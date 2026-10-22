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
// - A closed comment has no mark, but its passage maps and follows the edits too: the Undo of "Done" puts
//   it back on the same words.
// - A comment that this editor does not follow yet (a new comment, a chapter that comes on screen, a text
//   from outside the editor) finds its passage by its text: the first match after the start of its read
//   (the selection of a read of a selection, else the start of the chapter).

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import type { Mappable, StepMap } from '@tiptap/pm/transform'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { create } from 'zustand'
import { markdownToPlainBlocks } from '@shared/book'
import type { EditorComment, Lens, LensChoice } from '@shared/comments'
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

/** An open comment of the chapter. It has a number; it has a mark when it is `visible` (the lens filter). */
interface Shown {
  id: string
  lens: Lens
  rank: number
  visible: boolean
}

interface MarksState {
  /** The passage of each comment that the editor follows, by comment id. An empty range is a deleted passage. */
  ranges: Map<string, Range>
  /** The place where this editor saw the passage of a lost comment go. Its words can come back there (Ctrl+Z). */
  lost: Map<string, number>
  /** The comments with marks, in the order of the list */
  shown: Shown[]
  decorations: DecorationSet
  /**
   * The comments whose passages the edits of this editor changed since the last pause. Only these get a new
   * passage or the lost mark: the computer that made an edit writes it.
   */
  touched: ReadonlySet<string>
  /** The text came from outside the editor: the view finds all the passages again by their text. */
  refind: boolean
}

export const commentMarksKey = new PluginKey<MarksState>('commentMarks')

/** The pause after the last edit, before the comments get the new words of their passages. */
const PASSAGE_PAUSE_MS = 300

/**
 * What the marks show (the margin sets it, ui.ts). `hidden`: no marks ("Hide"); the comments still follow
 * the text. `lens`: only the marks of this lens; the numbers stay the same.
 */
export const useCommentMarks = create<{ hidden: boolean; lens: LensChoice }>(() => ({ hidden: false, lens: 'all' }))

/** The count of the draws of the marks that changed something: the margin draws its cards again after each. */
export const useMarksDrawn = create<{ n: number }>(() => ({ n: 0 }))

/** The editors that found the passages of their comments at least once */
const drawnViews = new WeakSet<EditorView>()

/** The event of the text of a chapter after its numbers are laid out again (each change of the text or the marks) */
export const NUMBERS_MOVED = 'cm-numbers'

/** The space between two numbers in the margin of the page, one under the other */
const NUMBER_GAP = 3

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
 * A range after one step, and whether the step changed text of the passage. Text typed at the start or at
 * the end of a passage stays out of it. A step that replaces text of the passage (a Polish of the
 * paragraph, a paste over it, a chat change) keeps the passage when the new text still has its words; else
 * the range keeps what is left of it, or becomes empty.
 */
function mapRange(map: StepMap, r: Range, before: PMNode, after: PMNode): { range: Range; touched: boolean } {
  const from = map.map(r.from, 1)
  const to = map.map(r.to, -1)
  const mapped = from < to ? { from, to } : { from: to, to }
  if (r.from >= r.to) return { range: mapped, touched: false }
  let start = r.from
  let end = r.to
  let replaced = false
  let inside = false
  map.forEach((oldStart, oldEnd) => {
    if (oldEnd === oldStart) {
      inside ||= r.from < oldStart && oldStart < r.to
      return
    }
    if (oldStart >= r.to || oldEnd <= r.from) return
    replaced = true
    start = Math.min(start, oldStart)
    end = Math.max(end, oldEnd)
  })
  if (!replaced) return { range: mapped, touched: inside }
  const words = textWithMap(before, r.from, r.to).text
  const { text, map: at } = textWithMap(after, map.map(start, -1), map.map(end, 1))
  const m = words.trim() ? findText(text, words.trim()) : null
  return { range: m ? { from: at[m.start], to: at[m.end - 1] + 1 } : mapped, touched: true }
}

/** The ranges after the steps of a transaction, and the comments whose passages the steps changed. */
export function mapRanges(ranges: Map<string, Range>, tr: Pick<Transaction, 'mapping' | 'docs' | 'doc'>): { ranges: Map<string, Range>; touched: Set<string> } {
  let out = ranges
  const touched = new Set<string>()
  tr.mapping.maps.forEach((map, i) => {
    const before = tr.docs[i]
    const after = tr.docs[i + 1] ?? tr.doc
    const next = new Map<string, Range>()
    for (const [id, r] of out) {
      const m = mapRange(map, r, before, after)
      next.set(id, m.range)
      if (m.touched) touched.add(id)
    }
    out = next
  })
  return { ranges: out, touched }
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

/**
 * What an editor writes to the comments at the end of a pause: the changes of the passages that its own edits
 * touched. A text from outside (another program, a restored version) changes no passage and makes no comment
 * lost here: the computer that made the edit writes it.
 */
export function changesToWrite(state: EditorState, comments: EditorComment[], touched: ReadonlySet<string>): Map<string, string | null> {
  const st = commentMarksKey.getState(state)
  if (!st || !touched.size) return new Map()
  return passageChanges(state.doc, comments.filter((c) => touched.has(c.id)), st.ranges)
}

/**
 * The passages that an editor follows after a draw, from the state of its marks (pure). `comments` are the
 * comments of the chapter. An open comment keeps its range, or finds its passage by its text; a deleted
 * passage whose words are back at its place keeps its comment. A lost comment gets its passage back when its
 * words are at the place where they went, or (`first`: the first draw of a new editor, or a text from
 * outside) anywhere in the text. A comment that another computer made lost is not taken back here.
 * `back`: the lost comments that have their passages again.
 */
export function followPassages(
  doc: PMNode,
  st: Pick<MarksState, 'ranges' | 'lost' | 'refind'>,
  comments: EditorComment[],
  first: boolean,
  scopeOf?: (c: EditorComment) => string | undefined
): { ranges: Map<string, Range>; lost: Map<string, number>; back: string[] } {
  const open = comments.filter((c) => c.state === 'open')
  const mine = open.filter((c) => !c.lost)
  const known = st.refind ? new Map<string, Range>() : new Map(st.ranges)
  for (const c of mine) {
    const r = known.get(c.id)
    const again = r && r.from >= r.to ? passageAt(doc, r.from, c.passage) : null
    if (again) known.set(c.id, again)
  }
  const ranges = anchorComments(doc, mine, known, scopeOf)
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
  for (const [id, r] of anchorComments(doc, search, new Map(), scopeOf)) {
    ranges.set(id, r)
    lost.delete(id)
    back.push(id)
  }
  // A closed comment has no mark, but the editor follows its passage too: the Undo of "Done" puts it back on
  // the same words. The first draw (and a text from outside) finds the passages of closed comments by text.
  const find: EditorComment[] = []
  for (const c of comments) {
    if (c.state === 'open') continue
    const r = known.get(c.id)
    if (r && inDoc(doc, r)) ranges.set(c.id, r)
    else if ((first || st.refind) && !c.lost) find.push(c)
  }
  for (const [id, r] of anchorComments(doc, find, new Map(), scopeOf)) ranges.set(id, r)
  return { ranges, lost, back }
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

/**
 * The chapter is on screen and its editor looked for the passages of its comments. Then a comment without a
 * live range has no passage in the text now.
 */
export function rangesKnown(chapterId: string): boolean {
  const ed = getChapterEditor(chapterId)
  return Boolean(ed && !ed.editor.isDestroyed && drawnViews.has(ed.editor.view))
}

/**
 * The number of each open comment of a chapter, as the margin shows it: the order of the passages in the
 * text. For a chapter that is not on screen, the passages are found in the text of the chapter (the first
 * match). A comment without a passage in the text has no number.
 */
export function marginNumbers(chapterId: string): Map<string, number> {
  const open = useComments.getState().list.filter((c) => c.chapterId === chapterId && c.state === 'open' && !c.lost)
  if (!open.length) return new Map()
  let ranges = commentRanges(chapterId)
  if (!rangesKnown(chapterId)) {
    const plain = markdownToPlainBlocks(useBook.getState().chapters.find((c) => c.id === chapterId)?.body ?? '')
    ranges = new Map()
    for (const c of open) {
      const m = c.passage.trim() ? findText(plain, c.passage) : null
      if (m) ranges.set(c.id, { from: m.start, to: m.end })
    }
  }
  return new Map(inChapterOrder(open, ranges).map((c, i) => [c.id, i + 1]))
}

/**
 * The numbers of passages that start on one line of text go one under the other, not on top of each other.
 * `root` is the text of a chapter (the box of the position of the numbers).
 */
export function stackNumbers(root: HTMLElement): void {
  let free = -Infinity
  for (const el of root.querySelectorAll<HTMLElement>('.cm-nums')) {
    // The place of the number in the layout of the text; the shift (a translate) does not change it.
    const top = el.offsetTop
    const shift = Math.max(0, free - top)
    const value = `${shift}px`
    if (el.style.getPropertyValue('--cm-shift') !== value) el.style.setProperty('--cm-shift', value)
    free = top + shift + el.offsetHeight + NUMBER_GAP
  }
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

/**
 * The marks of the visible comments at their ranges. The numbers count all the shown comments, so a filter
 * by lens does not change them.
 */
export function marksOf(doc: PMNode, shown: Shown[], ranges: Map<string, Range>): DecorationSet {
  const ordered = inChapterOrder(shown, ranges)
  if (!ordered.some((c) => c.visible)) return DecorationSet.empty
  const decos: Decoration[] = []
  const washes = new Set<string>()
  const starts = new Map<number, Numbered[]>()
  ordered.forEach((c, i) => {
    if (!c.visible) return
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

const shownKey = (shown: Shown[]): string => shown.map((c) => `${c.id}:${c.lens}:${c.rank}:${c.visible ? 1 : 0}`).join(',')

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
      init: () => ({ ranges: new Map(), lost: new Map(), shown: [], decorations: DecorationSet.empty, touched: new Set(), refind: false }),
      apply(tr, value) {
        const meta = tr.getMeta(commentMarksKey) as MarksState | undefined
        if (meta) return meta
        if (!tr.docChanged) return value
        const { ranges, touched } = mapRanges(value.ranges, tr)
        // A text from another program or a restored version: the view finds the passages again by their
        // text, and writes none of the changes that this text made.
        const reload = isReload(tr)
        return {
          ranges,
          lost: mapPoints(value.lost, tr.mapping),
          shown: value.shown,
          decorations: marksOf(tr.doc, value.shown, ranges),
          touched: reload ? new Set() : touched.size ? new Set([...value.touched, ...touched]) : value.touched,
          refind: value.refind || reload
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
       * passages whose words came back, and draw the marks again when something changed. `settled`: the
       * pause ended, and the comments that the edits touched start again from none.
       */
      const draw = (settled: boolean): void => {
        const st = commentMarksKey.getState(view.state)
        if (!st) return
        const doc = view.state.doc
        const { list, readOnly } = comments()
        const all = list.filter((c) => c.chapterId === chapterId())
        const mine = all.filter((c) => c.state === 'open' && !c.lost)
        const { ranges, lost, back } = followPassages(doc, st, all, first, readScope)
        const wasFirst = first
        first = false
        const { hidden, lens } = useCommentMarks.getState()
        const shown: Shown[] = hidden ? [] : mine.map((c) => ({ id: c.id, lens: c.lens, rank: c.rank, visible: lens === 'all' || c.lens === lens }))
        const touched = settled ? new Set<string>() : st.touched
        const same =
          !st.refind &&
          touched.size === st.touched.size &&
          shownKey(shown) === shownKey(st.shown) &&
          sameMap(ranges, st.ranges, sameRange) &&
          sameMap(lost, st.lost, (a, b) => a === b)
        if (!same) {
          const next: MarksState = { ranges, lost, shown, decorations: marksOf(doc, shown, ranges), touched, refind: false }
          view.dispatch(view.state.tr.setMeta(commentMarksKey, next).setMeta('addToHistory', false).setMeta('allowDuringReview', true))
        }
        drawnViews.add(view)
        if (!same || wasFirst) useMarksDrawn.setState((s) => ({ n: s.n + 1 }))
        if (!readOnly) for (const id of back) setLost(id, false)
      }

      // The numbers of passages on one line of text go one under the other: after each change of the
      // text or of the marks, and when the lines of the text move.
      let stackFrame = 0
      const restack = (): void => {
        if (stackFrame) return
        stackFrame = requestAnimationFrame(() => {
          stackFrame = 0
          if (view.isDestroyed) return
          stackNumbers(view.dom)
          // The numbers can be at new places: the margin draws the line of the selected card again.
          view.dom.dispatchEvent(new Event(NUMBERS_MOVED, { bubbles: true }))
        })
      }
      const lines = new ResizeObserver(restack)
      lines.observe(view.dom)

      /**
       * Give the comments that the edits of this editor touched the new words of their passages, and mark
       * the passages that are gone. The closed comments too: the Undo of a decision brings them back.
       */
      const settle = (state: EditorState, touched: ReadonlySet<string>): void => {
        const { list, readOnly } = comments()
        // A comments file of a newer Wordelia is never written, and the comments of another book never change here.
        if (readOnly) return
        const mine = list.filter((c) => c.chapterId === chapterId() && !c.lost)
        for (const [id, text] of changesToWrite(state, mine, touched)) {
          if (text === null) setLost(id, true)
          else updatePassage(id, text)
        }
      }

      const refresh = (): void => {
        if (view.isDestroyed) return
        // Edits that are still in the pause settle at its end.
        const settled = !pause
        const touched = commentMarksKey.getState(view.state)?.touched ?? new Set<string>()
        draw(settled)
        if (settled) settle(view.state, touched)
      }

      const offComments = useComments.subscribe((s, prev) => {
        if (s.list !== prev.list || s.readOnly !== prev.readOnly) refresh()
      })
      const offHidden = useCommentMarks.subscribe(refresh)
      // After the editor is ready.
      soon = setTimeout(refresh, 0)
      return {
        update(v, prev) {
          restack()
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
          lines.disconnect()
          cancelAnimationFrame(stackFrame)
          // The chapter leaves the screen in the pause: the comments get the last words now.
          if (pause) {
            clearTimeout(pause)
            pause = undefined
            settle(view.state, commentMarksKey.getState(view.state)?.touched ?? new Set())
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
