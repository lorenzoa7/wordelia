// The live editors: one for each chapter on screen. The chat, the actions and the toolbar
// read and change the text through this module.

import type { Editor } from '@tiptap/core'
import { create } from 'zustand'
import { applyHunk, findText } from '@shared/proposals/apply'
import { markdownToPlain } from '@shared/book'
import { useBook } from '@/stores/book'
import { getT } from '@/lib/i18n'
import { sliceFromMarkdown, textWithMap } from './review'

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

/** The chapter editors on screen now */
export function chapterEditors(): ChapterEditor[] {
  return Array.from(editors.values()).filter((e) => !e.editor.isDestroyed)
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

/** Find Markdown text in a chapter: the editor range, or null. For "Show in text". */
export function locateInChapter(chapterId: string, find: string): { editor: ChapterEditor; from: number; to: number } | null {
  const e = getChapterEditor(chapterId)
  if (!e) return null
  const r = locate(e.editor, find)
  return 'reason' in r ? null : { editor: e, ...r }
}

/** True when the Markdown text is in the chapter once, in its editor or in the book store. */
export function chapterHasText(chapterId: string, find: string): boolean {
  const live = getChapterEditor(chapterId)
  if (live) return !('reason' in locate(live.editor, find))
  const ch = useBook.getState().chapters.find((c) => c.id === chapterId)
  const m = ch ? findText(markdownToPlain(ch.body), markdownToPlain(find).trim()) : null
  return Boolean(m && m.count === 1)
}

/** Reviews of chat proposals are gone: chat proposals show in the text by themselves (inlineProposals.ts). */
export function isChatReview(id: string | undefined): boolean {
  return Boolean(id?.startsWith('chat-'))
}

// Test runs (WORDELIA_E2E) can call the reveal directly.
if (typeof window !== 'undefined' && window.wordelia?.isE2E) {
  ;(window as unknown as Record<string, unknown>).__activeEditor = useActiveEditor
}
