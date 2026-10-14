// Chat UI state: active thread, composer draft, quotes, mentions and streaming replies.

import { create } from 'zustand'
import { newId } from '@shared/book'
import type { Mention, Quote } from '@shared/types'
import { useApp } from '@/stores/app'

interface Streaming {
  messageId: string
  text: string
  requestId: string
  cancel: () => void
}

interface ChatState {
  activeThreadId: string | null
  draft: string
  quotes: Quote[]
  mentions: Mention[]
  /** Thread id to its reply in progress */
  streaming: Record<string, Streaming | undefined>
  setActiveThread(id: string | null): void
  setDraft(v: string): void
  removeQuote(id: string): void
  addMention(m: Mention): void
  removeMention(id: string): void
  clearComposer(): void
}

export const useChat = create<ChatState>((set, get) => ({
  activeThreadId: null,
  draft: '',
  quotes: [],
  mentions: [],
  streaming: {},
  setActiveThread(id) {
    set({ activeThreadId: id })
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
  }
}))

/** Quote text in the composer (the Reply action) and open the chat. */
export function addQuote(q: Omit<Quote, 'id'>): void {
  useChat.setState((s) => ({ quotes: [...s.quotes, { ...q, id: newId('q') }] }))
  const app = useApp.getState()
  if (!app.settings?.ui.chatOpen) app.setUi({ chatOpen: true })
  setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus(), 200)
}
