// The place of the author in a chapter survives when its editor goes away and when its text
// changes from outside:
// - A chapter far from the screen has no editor. Its last editor state (the undo history, the
//   cursor and the text) stays here, and the next editor of the chapter takes it back.
// - A new text for an open chapter (a file changed by another program, a restored version)
//   replaces only the part that changed, so the cursor moves with the text and the undo history stays.

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'

interface Kept {
  state: EditorState
  /** The Markdown of the chapter when the editor went away */
  body: string
}

const kept = new Map<string, Kept>()

/** Keep the state of a chapter editor that goes away. */
export function keepEditorState(chapterId: string, state: EditorState, body: string): void {
  kept.set(chapterId, { state, body })
}

/** The kept state of a chapter, once: the new editor takes it. */
export function takeEditorState(chapterId: string): Kept | undefined {
  const k = kept.get(chapterId)
  kept.delete(chapterId)
  return k
}

/** Forget the kept states, for example when another book opens. */
export function forgetEditorStates(): void {
  kept.clear()
}

/**
 * The meta of a transaction that loads text from the book store into an editor. It is not typing:
 * the editor does not save it again.
 */
export const RELOAD_META = 'wordelia:reload'

export function isReload(tr: Transaction): boolean {
  return Boolean(tr.getMeta(RELOAD_META))
}

/**
 * The one replace that changes `a` into `b`: the part between the first and the last difference.
 * Null when the two documents are the same.
 */
export function docDiff(a: PMNode, b: PMNode): { from: number; to: number; toB: number } | null {
  const start = a.content.findDiffStart(b.content)
  if (start == null) return null
  const end = a.content.findDiffEnd(b.content)
  if (!end) return null
  let { a: endA, b: endB } = end
  // The two ends overlap when the changed text repeats a neighbor ("aa" → "aaa").
  const overlap = start - Math.min(endA, endB)
  if (overlap > 0) {
    endA += overlap
    endB += overlap
  }
  return { from: start, to: endA, toB: endB }
}

/**
 * A transaction that changes the document of `state` into `doc` with one replace. The selection moves
 * with the text. `undoable`: Ctrl+Z undoes the change (a restored version). Else the change does not
 * go into the undo history, but the history maps through it, so Ctrl+Z still undoes the typing
 * before it (a change from another program). Null when nothing changes.
 */
export function reloadTransaction(state: EditorState, doc: PMNode, undoable: boolean): Transaction | null {
  const d = docDiff(state.doc, doc)
  if (!d) return null
  const tr = state.tr
  try {
    tr.replace(d.from, d.to, doc.slice(d.from, d.toB))
  } catch {
    // A replace that does not fit the schema: replace all, and keep the cursor near its place.
    tr.replaceWith(0, state.doc.content.size, doc.content)
  }
  tr.setMeta(RELOAD_META, true).setMeta('allowDuringReview', true)
  // A restore is its own undo step, also right after typing.
  if (undoable) closeHistory(tr)
  else tr.setMeta('addToHistory', false)
  return tr
}

/** Load a new text into a mounted editor and keep the place of the author. */
export function loadDoc(editor: Editor, doc: PMNode, undoable: boolean): void {
  const tr = reloadTransaction(editor.state, doc, undoable)
  if (tr) editor.view.dispatch(tr)
}
