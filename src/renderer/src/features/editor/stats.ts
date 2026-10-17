// Live word counts for the status bar.

import { useEffect } from 'react'
import type { Editor } from '@tiptap/core'
import { create } from 'zustand'
import { countMarkdownWords, countWords } from '@shared/book'
import { useBook } from '@/stores/book'
import { textWithMap } from './review'

interface Stats {
  chapterWords: number
  bookWords: number
  selectionWords: number
}

export const useStats = create<Stats>(() => ({ chapterWords: 0, bookWords: 0, selectionWords: 0 }))

export function useEditorStats(editor: Editor | null): void {
  useEffect(() => {
    if (!editor) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const compute = (): void => {
      // A late timer of an editor that is no longer the active one must not win.
      if (stopped || editor.isDestroyed) return
      const chapterWords = countWords(editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' '))
      const { chapters, activeChapterId } = useBook.getState()
      const others = chapters.filter((c) => c.id !== activeChapterId).reduce((n, c) => n + countMarkdownWords(c.body), 0)
      useStats.setState({ chapterWords, bookWords: others + chapterWords })
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
  }, [editor])
}
