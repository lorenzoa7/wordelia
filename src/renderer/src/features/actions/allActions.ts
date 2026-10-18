// The actions that the open book can use: the actions for all books (app settings), then the actions of
// this book (`ai/actions.json`). A shortcut that both groups have runs the book action inside its book
// (see `mergeActions` in src/shared/ai/scopes.ts). The selection menu, the shortcuts, the review bar and
// the keyboard list in Settings → General use this list.

import { useMemo } from 'react'
import { mergeActions } from '@shared/ai/scopes'
import type { AiAction } from '@shared/types'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'

const NONE: AiAction[] = []

/** The actions of the open book and the global actions, outside React. */
export function allActions(): AiAction[] {
  return mergeActions(useApp.getState().settings?.actions ?? NONE, useBook.getState().actions)
}

/** One action of the open book or a global action, by id. */
export function findAction(id: string | null | undefined): AiAction | undefined {
  return id ? allActions().find((a) => a.id === id) : undefined
}

/** The actions of the open book and the global actions. The list changes only when one of the two groups changes. */
export function useAllActions(): AiAction[] {
  const global = useApp((s) => s.settings?.actions ?? NONE)
  const book = useBook((s) => s.actions)
  return useMemo(() => mergeActions(global, book), [global, book])
}
