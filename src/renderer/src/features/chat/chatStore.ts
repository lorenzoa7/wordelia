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
  draft: string
  quotes: Quote[]
  mentions: Mention[]
  /** Thread id to its reply in progress */
  streaming: Record<string, Streaming | undefined>
  /** Message id to the thinking of its reply, for this session only */
  thoughts: Record<string, string>
  /** The user message that is open for editing */
  editingId: string | null
  setActiveThread(id: string | null): void
  setDraft(v: string): void
  removeQuote(id: string): void
  addMention(m: Mention): void
  removeMention(id: string): void
  clearComposer(): void
  setEditing(id: string | null): void
}

export const useChat = create<ChatState>((set, get) => ({
  activeThreadId: null,
  draft: '',
  quotes: [],
  mentions: [],
  streaming: {},
  thoughts: {},
  editingId: null,
  setActiveThread(id) {
    set({ activeThreadId: id, editingId: null })
  },
  setDraft(v) {
    set({ draft: v })
  },
  removeQuote(id) {
    set({ quotes: get().quotes.filter((q) => q.id !== id) })
  },
  addMention(m) {
    if (get().mentions.some((x) => x.id === m.id)) return
    set({ mentions: [...get().mentions, m] })
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

/** Quote text in the composer (the Reply action) and open the chat. */
export function addQuote(q: Omit<Quote, 'id'>): void {
  useChat.setState((s) => ({ quotes: [...s.quotes, { ...q, id: newId('q') }] }))
  const app = useApp.getState()
  if (!app.settings?.ui.chatOpen) app.setUi({ chatOpen: true })
  setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus(), 200)
}
