// Live word counts for the status bar and the chapter list.

import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import { create } from 'zustand'
import { countMarkdownWords, countWords } from '@shared/book'
import type { Chapter } from '@shared/types'
import { useBook } from '@/stores/book'
import { textWithMap } from './review'

interface Stats {
  /** The book that the counts are for. Null until they are counted for the open book. */
  root: string | null
  chapterWords: number
  bookWords: number
  selectionWords: number
}

export const useStats = create<Stats>(() => ({ root: null, chapterWords: 0, bookWords: 0, selectionWords: 0 }))

/** Clear the counts: another book opens. */
export function resetStats(): void {
  useStats.setState({ root: null, chapterWords: 0, bookWords: 0, selectionWords: 0 })
}

/** The words of each chapter, counted again only when its text changes. */
const counted = new Map<string, { body: string; words: number }>()

export function chapterWordCount(ch: Pick<Chapter, 'id' | 'body'>): number {
  const known = counted.get(ch.id)
  if (known && known.body === ch.body) return known.words
  const words = countMarkdownWords(ch.body)
  counted.set(ch.id, { body: ch.body, words })
  return words
}

/** The counts of the chapter of `editor` (the chapter with the cursor) and of the book. */
export function useEditorStats(editor: Editor | null, chapterId: string | null): void {
  useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const compute = (): void => {
      // A late timer of an editor that is no longer the active one must not win.
      if (stopped || editor.isDestroyed) return
      const chapterWords = countWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' '))
      const { chapters, root } = useBook.getState()
      // The other chapters from the store: only a chapter that changed is counted again
      // (`chapterWordCount` keeps the others). The chapter of the editor counts from its live text.
      const others = chapters.reduce((n, c) => (c.id === chapterId ? n : n + chapterWordCount(c)), 0)
      useStats.setState({ root, chapterWords, bookWords: others + chapterWords })
    }
    const onUpdate = (): void => {
      clearTimeout(timer)
      timer = setTimeout(compute, 400)
    }
    const onSelection = (): void => {
      const { from, to } = editor.state.selection
      useStats.setState({ selectionWords: from === to ? 0 : countWords(textWithMap(editor.state.doc, from, to).text) })
    }
    compute()
    editor.on('update', onUpdate)
    editor.on('selectionUpdate', onSelection)
    const unsub = useBook.subscribe((s, p) => {
      if (s.activeChapterId !== p.activeChapterId || s.chapters.length !== p.chapters.length) {
        clearTimeout(timer)
        timer = setTimeout(compute, 50)
      }
    })
    return () => {
      stopped = true
      clearTimeout(timer)
      editor.off('update', onUpdate)
      editor.off('selectionUpdate', onSelection)
      unsub()
    }
  }, [editor, chapterId])
}
