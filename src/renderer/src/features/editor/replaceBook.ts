// Find and replace in the whole manuscript. A chapter with an editor changes in its editor (one
// undo step there); a chapter far from the screen changes in the book store. The result has an
// Undo for all the chapters.

import { getSchema } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import type { DocNode } from '@shared/types'
import { useBook } from '@/stores/book'
import { schemaExtensions } from './extensions'
import { findMatches, type FindMatch } from './find'
import { getChapterEditor } from './registry'

export interface FindOptions {
  caseSensitive: boolean
  wholeWord: boolean
}

export interface ChapterMatches {
  chapterId: string
  title: string
  count: number
}

let schemaCache: ReturnType<typeof getSchema> | null = null
const schema = (): ReturnType<typeof getSchema> => (schemaCache ??= getSchema(schemaExtensions()))

function docOf(chapterId: string, body: string): PMNode {
  const e = getChapterEditor(chapterId)
  return e ? e.editor.state.doc : schema().nodeFromJSON(parseMarkdown(body))
}

/** The chapters that have the text, in the order of the book, with the number of matches in each. */
export function matchesInBook(query: string, opts: FindOptions): ChapterMatches[] {
  if (!query) return []
  return useBook
    .getState()
    .chapters.map((c) => ({ chapterId: c.id, title: c.title, count: findMatches(docOf(c.id, c.body), query, opts.caseSensitive, opts.wholeWord).length }))
    .filter((c) => c.count > 0)
}

/** Replace the matches in a transaction, from the last one to the first. */
function replaceIn(tr: Transaction, matches: FindMatch[], text: string): void {
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    if (text) tr.insertText(text, m.from, m.to)
    else tr.delete(m.from, m.to)
  }
}

export interface BookReplace {
  /** The number of replaced matches */
  total: number
  /** The number of changed chapters */
  chapters: number
  /**
   * Put back the text of each chapter from before the replace. A chapter that changed after the
   * replace stays as it is. Returns the number of chapters that went back.
   */
  undo: () => number
}

export function replaceInBook(query: string, text: string, opts: FindOptions): BookReplace {
  const book = useBook.getState()
  const changed: Array<{ id: string; before: string; after: string }> = []
  let total = 0
  for (const ch of book.chapters) {
    const live = getChapterEditor(ch.id)
    const doc = docOf(ch.id, ch.body)
    const matches = findMatches(doc, query, opts.caseSensitive, opts.wholeWord)
    if (!matches.length) continue
    total += matches.length
    if (live) {
      live.flush()
      const before = useBook.getState().chapters.find((c) => c.id === ch.id)?.body ?? ch.body
      const tr = live.editor.state.tr
      replaceIn(tr, matches, text)
      // One undo step of its own in this chapter.
      live.editor.view.dispatch(closeHistory(tr).setMeta('allowDuringReview', true))
      live.flush()
      changed.push({ id: ch.id, before, after: useBook.getState().chapters.find((c) => c.id === ch.id)?.body ?? '' })
    } else {
      const state = EditorState.create({ schema: schema(), doc })
      const tr = state.tr
      replaceIn(tr, matches, text)
      const after = serializeMarkdown(tr.doc.toJSON() as DocNode)
      book.setChapterBody(ch.id, after)
      changed.push({ id: ch.id, before: ch.body, after })
    }
  }
  return {
    total,
    chapters: changed.length,
    undo: () => {
      let n = 0
      for (const c of changed) {
        getChapterEditor(c.id)?.flush()
        const now = useBook.getState().chapters.find((x) => x.id === c.id)
        if (!now || now.body !== c.after) continue
        useBook.getState().restoreChapter(c.id, c.before)
        n++
      }
      return n
    }
  }
}
