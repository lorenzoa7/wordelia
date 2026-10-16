// A handle to the live editor, so the chat and the actions can read and change the open chapter.

import type { Editor } from '@tiptap/core'
import { applyHunk, findText } from '@shared/proposals/apply'
import { markdownToPlain } from '@shared/book'
import { useBook } from '@/stores/book'
import { getT } from '@/lib/i18n'
import { sliceFromMarkdown, textWithMap } from './review'

interface Active {
  editor: Editor
  chapterId: string
  flush: () => void
}

let active: Active | null = null

export function setActiveEditor(a: Active | null): void {
  active = a
}

export function getActiveEditor(): Active | null {
  return active && !active.editor.isDestroyed ? active : null
}

/** Write pending editor changes to the store now. */
export function flushEditor(): void {
  getActiveEditor()?.flush()
}

export type ApplyResult = { ok: true } | { ok: false; reason: string }

/** Apply a find-and-replace to a chapter. The open chapter changes in the editor (one undo step). */
export function applyToChapter(chapterId: string, find: string, replace: string): ApplyResult {
  const a = getActiveEditor()
  if (a && a.chapterId === chapterId) {
    const { state } = a.editor
    const docSize = state.doc.content.size
    if (!find.trim()) {
      const slice = sliceFromMarkdown(state.schema, replace)
      const tr = state.tr.insert(docSize, slice.content).setMeta('allowDuringReview', true)
      a.editor.view.dispatch(tr.scrollIntoView())
      return { ok: true }
    }
    const { text, map } = textWithMap(state.doc, 0, docSize)
    const plainFind = markdownToPlain(find).trim()
    const m = findText(text, plainFind)
    if (!m) return { ok: false, reason: getT().editor.apply.notFound }
    if (m.count > 1) return { ok: false, reason: getT().editor.apply.manyMatches }
    const from = map[m.start]
    const to = map[m.end - 1] + 1
    const slice = sliceFromMarkdown(state.schema, replace)
    const tr = state.tr.replaceRange(from, to, slice).setMeta('allowDuringReview', true)
    a.editor.view.dispatch(tr.scrollIntoView())
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

/** Selected text of the open chapter, as plain text. */
export function selectedText(): string {
  const a = getActiveEditor()
  if (!a) return ''
  const { from, to } = a.editor.state.selection
  return textWithMap(a.editor.state.doc, from, to).text
}
