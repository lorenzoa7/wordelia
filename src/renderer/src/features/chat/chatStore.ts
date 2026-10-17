// Chat UI state: active thread, composer draft, quotes, mentions and streaming replies.

import { create } from 'zustand'
import { newId } from '@shared/book'
import type { Mention, Quote } from '@shared/types'
import { useApp } from '@/stores/app'

export interface Streaming {
  messageId: string
  text: string
  requestId: string
  cancel: () => void
  /** What the model thinks about, when the provider streams it. Never saved, never sent back to the AI. */
  thinking?: string
  /** A note from the provider, for example "Retrying…" */
  status?: string
}

interface ChatState {
  activeThreadId: string | null
  /** The chat shows the list of all threads, not the active thread */
  listOpen: boolean
  draft: string
  quotes: Quote[]
  mentions: Mention[]
  /** Thread id to its reply in progress */
  streaming: Record<string, Streaming | undefined>
  /** Message id to the thinking of its reply, for this session only */
  thoughts: Record<string, string>
  /** The user message that is open for editing */
  editingId: string | null
  /** Show a thread. This also closes the thread list. */
  setActiveThread(id: string | null): void
  setListOpen(open: boolean): void
  setDraft(v: string): void
  removeQuote(id: string): void
  addMention(m: Mention): void
  removeMention(id: string): void
  clearComposer(): void
  setEditing(id: string | null): void
}

export const useChat = create<ChatState>((set, get) => ({
  activeThreadId: null,
  listOpen: false,
  draft: '',
  quotes: [],
  mentions: [],
  streaming: {},
  thoughts: {},
  editingId: null,
  setActiveThread(id) {
    set({ activeThreadId: id, editingId: null, listOpen: false })
  },
  setListOpen(open) {
    set({ listOpen: open, editingId: null })
  },
  setDraft(v) {
    set({ draft: v })
  },
  removeQuote(id) {
    set({ quotes: get().quotes.filter((q) => q.id !== id) })
  },
  addMention(m) {
    // The composer must show: close the thread list.
    if (get().mentions.some((x) => x.id === m.id)) return set({ listOpen: false })
    set({ mentions: [...get().mentions, m], listOpen: false })
  },
  removeMention(id) {
    set({ mentions: get().mentions.filter((m) => m.id !== id) })
  },
  clearComposer() {
    set({ draft: '', quotes: [], mentions: [] })
  },
  setEditing(id) {
    set({ editingId: id })
  }
}))

/** Change the reply in progress of a thread. Nothing happens when the thread has none. */
export function patchStreaming(threadId: string, patch: Partial<Streaming> | ((s: Streaming) => Partial<Streaming>)): void {
  useChat.setState((s) => {
    const cur = s.streaming[threadId]
    if (!cur) return s
    const next = typeof patch === 'function' ? patch(cur) : patch
    return { streaming: { ...s.streaming, [threadId]: { ...cur, ...next } } }
  })
}

/** Put the cursor in the composer, after a delay in milliseconds (the composer can be about to show). */
export function focusComposer(delay = 0): void {
  setTimeout(() => document.querySelector<HTMLElement>('.composer-input')?.focus(), delay)
}

/** Quote text in the composer (the Reply action) and open the chat. */
export function addQuote(q: Omit<Quote, 'id'>): void {
  useChat.setState((s) => ({ quotes: [...s.quotes, { ...q, id: newId('q') }], listOpen: false }))
  const app = useApp.getState()
  if (!app.settings?.ui.chatOpen) app.setUi({ chatOpen: true })
  focusComposer(200)
}
