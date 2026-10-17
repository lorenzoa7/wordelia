// The live editors: one for each chapter on screen. The chat, the actions and the toolbar
// read and change the text through this module.

import type { Editor } from '@tiptap/core'
import { create } from 'zustand'
import { applyHunk, findText } from '@shared/proposals/apply'
import { markdownToPlain } from '@shared/book'
import { useBook } from '@/stores/book'
import { getT } from '@/lib/i18n'
import { toast } from '@/stores/ui'
import { typesetForBook } from '@/lib/typeset'
import { snapshot } from '@/features/history/snapshots'
import { onReviewEnd, reviewKey, sliceFromMarkdown, textWithMap } from './review'

export interface ChapterEditor {
  editor: Editor
  chapterId: string
  /** Write unsaved typing to the book store now */
  flush: () => void
}

/** The editors that are mounted now, by chapter id */
const editors = new Map<string, ChapterEditor>()

/** The editor that the toolbar, the actions and the selection menu use: the chapter with the cursor, or the one on screen */
export const useActiveEditor = create<{ active: ChapterEditor | null }>(() => ({ active: null }))

/** Callbacks that wait for the editor of a chapter to mount */
const waiting = new Map<string, Array<(e: ChapterEditor) => void>>()

export function registerChapterEditor(e: ChapterEditor): () => void {
  editors.set(e.chapterId, e)
  const queued = waiting.get(e.chapterId) ?? []
  waiting.delete(e.chapterId)
  for (const fn of queued) fn(e)
  if (useBook.getState().activeChapterId === e.chapterId && !hasCursor()) setActiveEditor(e)
  return () => {
    if (editors.get(e.chapterId) === e) editors.delete(e.chapterId)
    if (useActiveEditor.getState().active === e) useActiveEditor.setState({ active: null })
  }
}

export function getChapterEditor(chapterId: string): ChapterEditor | null {
  const e = editors.get(chapterId)
  return e && !e.editor.isDestroyed ? e : null
}

/** Run `fn` as soon as the editor of the chapter is mounted (now, if it is). */
export function whenChapterEditor(chapterId: string, fn: (e: ChapterEditor) => void): void {
  const e = getChapterEditor(chapterId)
  if (e) return fn(e)
  waiting.set(chapterId, [...(waiting.get(chapterId) ?? []), fn])
}

/** True when the text cursor is in one of the chapters. */
export function hasCursor(): boolean {
  for (const e of editors.values()) if (!e.editor.isDestroyed && e.editor.view.hasFocus()) return true
  return false
}

export function setActiveEditor(a: ChapterEditor | null): void {
  if (useActiveEditor.getState().active !== a) useActiveEditor.setState({ active: a })
}

export function getActiveEditor(): ChapterEditor | null {
  const a = useActiveEditor.getState().active
  if (a && !a.editor.isDestroyed) return a
  const id = useBook.getState().activeChapterId
  return id ? getChapterEditor(id) : null
}

/** Write pending typing of every mounted chapter to the store now. */
export function flushEditor(): void {
  for (const e of editors.values()) if (!e.editor.isDestroyed) e.flush()
}

export type ApplyResult = { ok: true } | { ok: false; reason: string }

/** Find Markdown text in an editor. Returns the document range, or why it was not found. */
function locate(editor: Editor, find: string): { from: number; to: number } | { reason: string } {
  const { state } = editor
  const { text, map } = textWithMap(state.doc, 0, state.doc.content.size)
  const m = findText(text, markdownToPlain(find).trim())
  if (!m) return { reason: getT().editor.apply.notFound }
  if (m.count > 1) return { reason: getT().editor.apply.manyMatches }
  return { from: map[m.start], to: map[m.end - 1] + 1 }
}

/** Apply a find-and-replace to a chapter. A chapter on screen changes in its editor (one undo step). */
export function applyToChapter(chapterId: string, find: string, replace: string): ApplyResult {
  const a = getChapterEditor(chapterId)
  if (a) {
    const { state } = a.editor
    if (!find.trim()) {
      const slice = sliceFromMarkdown(state.schema, replace)
      a.editor.view.dispatch(state.tr.insert(state.doc.content.size, slice.content).setMeta('allowDuringReview', true))
      return { ok: true }
    }
    const r = locate(a.editor, find)
    if ('reason' in r) return { ok: false, reason: r.reason }
    const slice = sliceFromMarkdown(state.schema, replace)
    a.editor.view.dispatch(state.tr.replaceRange(r.from, r.to, slice).setMeta('allowDuringReview', true))
    return { ok: true }
  }
  const book = useBook.getState()
  const ch = book.chapters.find((c) => c.id === chapterId)
  if (!ch) return { ok: false, reason: getT().editor.apply.noChapter }
  const r = applyHunk(ch.body, find, replace)
  if (!r.ok) return r
  book.setChapterBody(chapterId, r.text)
  return { ok: true }
}

/** Selected text of the active chapter, as plain text. */
export function selectedText(): string {
  const a = getActiveEditor()
  if (!a) return ''
  const { from, to } = a.editor.state.selection
  return textWithMap(a.editor.state.doc, from, to).text
}

/** Scroll the desk so that a position of an editor sits in the upper part of the screen. */
export function scrollToPos(editor: Editor, pos: number, behavior: ScrollBehavior = 'smooth'): void {
  const desk = editor.view.dom.closest('.desk') as HTMLElement | null
  if (!desk) return
  const p = Math.max(0, Math.min(pos, editor.state.doc.content.size))
  const coords = editor.view.coordsAtPos(p)
  const box = desk.getBoundingClientRect()
  const target = box.top + box.height * 0.35
  desk.scrollBy({ top: coords.top - target, behavior })
}

/* ------------------------------------------------------------------ */
/* Chat proposals shown in the text                                     */
/* ------------------------------------------------------------------ */

const decisions = new Map<string, (accepted: boolean) => void>()
let revealSeq = 0

/** Called by the review plugin when a review ends: applied or not. */
export function reviewEnded(id: string, accepted: boolean): void {
  const fn = decisions.get(id)
  if (!fn) return
  decisions.delete(id)
  fn(accepted)
}
onReviewEnd(reviewEnded)

export function isChatReview(id: string | undefined): boolean {
  return Boolean(id?.startsWith('chat-'))
}

/**
 * Show a chat proposal in the text: open its chapter, scroll to the passage, and show the change
 * as an inline diff with Accept and Reject. `onDecision` gets true when the user accepts it there
 * (the change is then applied) and false when they reject it. Returns false when the passage is
 * not found in the chapter. A chapter that is not on screen yet opens first.
 */
export function revealProposal(chapterId: string, find: string, replace: string, onDecision: (accepted: boolean) => void): boolean {
  const book = useBook.getState()
  const ch = book.chapters.find((c) => c.id === chapterId)
  if (!ch) return false
  // Quick check, so the chat can say "not found" at once.
  const live = getChapterEditor(chapterId)
  if (find.trim()) {
    if (live ? 'reason' in locate(live.editor, find) : !findText(markdownToPlain(ch.body), markdownToPlain(find).trim())) return false
  }
  book.selectChapter(chapterId)
  // Let the jump to the chapter finish before the review scrolls.
  whenChapterEditor(chapterId, (e) => setTimeout(() => show(e), 120))
  return true

  function show(e: ChapterEditor): void {
    const { editor } = e
    if (editor.isDestroyed) return
    if (reviewKey.getState(editor.state)) editor.commands.rejectReview()
    let range: { from: number; to: number }
    if (!find.trim()) {
      const end = editor.state.doc.content.size
      range = { from: end, to: end }
    } else {
      const r = locate(editor, find)
      if ('reason' in r) {
        toast(r.reason, { kind: 'error' })
        return
      }
      range = r
    }
    // Keep the text before the change in the version history.
    snapshot(chapterId, 'Before AI chat change')
    const id = `chat-${++revealSeq}`
    decisions.set(id, onDecision)
    setActiveEditor(e)
    editor.commands.startReview({ id, from: range.from, to: range.to, label: getT().editor.review.chatProposal })
    editor.commands.updateReview(id, typesetForBook(replace), 'ready')
    editor.commands.setTextSelection(range.to)
    scrollToPos(editor, range.from)
  }
}

// Test runs (WORDELIA_E2E) can call the reveal directly.
if (typeof window !== 'undefined' && window.wordelia?.isE2E) {
  ;(window as unknown as Record<string, unknown>).__reveal = revealProposal
  ;(window as unknown as Record<string, unknown>).__activeEditor = useActiveEditor
}
