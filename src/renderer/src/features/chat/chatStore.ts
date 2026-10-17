// Chat UI state: active thread, composer draft, quotes, mentions and streaming replies.

import { create } from 'zustand'
import type { Editor } from '@tiptap/core'
import { newId } from '@shared/book'
import type { Mention, Quote } from '@shared/types'
import { useApp } from '@/stores/app'
import { appendMention, docFromText, readDraft, withoutMention, type DraftDoc } from './draft'

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
  /** The text of the composer. A mention shows as "@Label" in it. */
  draft: string
  /** The content of the composer, with the mentions in their places. The composer loads it when it shows. */
  draftDoc: DraftDoc | null
  /** Changes when code outside the composer changes the draft. The composer then loads `draftDoc`. */
  draftRev: number
  quotes: Quote[]
  /** The mentions in the draft, each one once */
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
  /** Put plain text in the composer, in the place of the draft */
  setDraft(v: string): void
  /** The composer changed: keep its content. The composer does not load it again. */
  syncDraft(doc: DraftDoc): void
  removeQuote(id: string): void
  /** Mention a chapter, an entry or a thread at the end of the draft, and show the composer */
  addMention(m: Mention): void
  removeMention(id: string): void
  clearComposer(): void
  setEditing(id: string | null): void
}

export const useChat = create<ChatState>((set, get) => ({
  activeThreadId: null,
  listOpen: false,
  draft: '',
  draftDoc: null,
  draftRev: 0,
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
    set({ draftDoc: docFromText(v), draft: v, mentions: [], draftRev: get().draftRev + 1 })
  },
  syncDraft(doc) {
    const { text, mentions } = readDraft(doc)
    set({ draftDoc: doc, draft: text, mentions })
  },
  removeQuote(id) {
    set({ quotes: get().quotes.filter((q) => q.id !== id) })
  },
  addMention(m) {
    // The composer must show: close the thread list.
    if (get().mentions.some((x) => x.id === m.id)) return set({ listOpen: false })
    const doc = appendMention(get().draftDoc ?? docFromText(get().draft), m)
    const { text, mentions } = readDraft(doc)
    set({ draftDoc: doc, draft: text, mentions, draftRev: get().draftRev + 1, listOpen: false })
  },
  removeMention(id) {
    const doc = withoutMention(get().draftDoc ?? docFromText(get().draft), id)
    const { text, mentions } = readDraft(doc)
    set({ draftDoc: doc, draft: text, mentions, draftRev: get().draftRev + 1 })
  },
  clearComposer() {
    set({ draft: '', draftDoc: null, quotes: [], mentions: [], draftRev: get().draftRev + 1 })
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

let composer: Editor | null = null

/** The composer tells the store about its editor, so `focusComposer` can put the cursor at the end of the text. */
export function registerComposer(editor: Editor | null): void {
  composer = editor
}

/** Put the cursor at the end of the composer, after a delay in milliseconds (the composer can be about to show). */
export function focusComposer(delay = 0): void {
  setTimeout(() => {
    if (composer && !composer.isDestroyed) composer.commands.focus('end')
    else document.querySelector<HTMLElement>('.composer-input')?.focus()
  }, delay)
}

/** Quote text in the composer (the Reply action) and open the chat. */
export function addQuote(q: Omit<Quote, 'id'>): void {
  useChat.setState((s) => ({ quotes: [...s.quotes, { ...q, id: newId('q') }], listOpen: false }))
  const app = useApp.getState()
  if (!app.settings?.ui.chatOpen) app.setUi({ chatOpen: true })
  focusComposer(200)
}
