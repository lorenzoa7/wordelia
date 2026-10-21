// Chat UI state: active thread, composer draft, quotes, mentions, images and streaming replies.
//
// Each thread has its own draft. The composer fields (`draft`, `draftDoc`, `quotes`, `mentions`,
// `images`) belong to the thread that shows: the new thread (`blank`), else the open thread. When
// another thread shows, the fields go to `drafts` and the fields of the other thread come back.
// The drafts are kept for each book, in memory.

import { create } from 'zustand'
import type { Editor } from '@tiptap/core'
import { newId } from '@shared/book'
import type { ChatImage, Mention, Quote, Thread } from '@shared/types'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { appendMention, docFromText, readDraft, withoutMention, type DraftDoc } from './draft'

/** The stored title of a new thread, in English in every language. The AI gives a title after the first reply. */
export const NEW_THREAD_TITLE = 'New thread'

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

/** The composer of one thread */
export interface ThreadDraft {
  draft: string
  draftDoc: DraftDoc | null
  quotes: Quote[]
  mentions: Mention[]
  images: ChatImage[]
}

const EMPTY: ThreadDraft = { draft: '', draftDoc: null, quotes: [], mentions: [], images: [] }

interface ChatState {
  /** The open thread. While `blank` shows, the thread that was open before it: Esc in the thread list goes back to it. */
  activeThreadId: string | null
  /**
   * The new thread that shows, before its first message. It is not in the book and not on disk:
   * the first message saves it (`sendMessage`). When the user leaves it, it goes away, or it goes to
   * `kept` when the user gave it a title, a purpose, a model or a draft.
   */
  blank: Thread | null
  /** New threads without messages that the user left, by book. They show in the thread list. Not on disk. */
  kept: Record<string, Thread[]>
  /** The chat shows the list of all threads, not the active thread */
  listOpen: boolean
  /** The text of the composer. A mention shows as "@Label" in it. */
  draft: string
  /** The content of the composer, with the mentions in their places. The composer loads it when it shows. */
  draftDoc: DraftDoc | null
  /** Changes when code outside the composer changes the draft. The composer then loads `draftDoc`. */
  draftRev: number
  /** The last change of `draftRev` came from a change of thread: the composer loads the draft without the focus. */
  draftQuiet: boolean
  quotes: Quote[]
  /** The mentions in the draft, each one once */
  mentions: Mention[]
  /** Images for the next message, already saved in the book (images.ts) */
  images: ChatImage[]
  /** The drafts of the threads that do not show, by `draftKey` */
  drafts: Record<string, ThreadDraft>
  /** How many images are still being prepared */
  imagesBusy: number
  /** Thread id to its reply in progress */
  streaming: Record<string, Streaming | undefined>
  /** Message id to the thinking of its reply, for this session only */
  thoughts: Record<string, string>
  /** The user message that is open for editing */
  editingId: string | null
  /** Show a thread. This also closes the thread list and leaves the new thread. */
  setActiveThread(id: string | null): void
  /** Show a new thread without messages. Nothing is saved until its first message. */
  openBlank(thread: Thread): void
  /** Show or hide the thread list. A new thread without changes goes away: an empty thread never stays. */
  setListOpen(open: boolean): void
  /** Forget a kept new thread (or the new thread that shows) and its draft. Returns the draft that went away. */
  discardKept(id: string): ThreadDraft
  /** Put plain text in the composer, in the place of the draft */
  setDraft(v: string): void
  /** The composer changed: keep its content. The composer does not load it again. */
  syncDraft(doc: DraftDoc): void
  removeQuote(id: string): void
  /** Mention a chapter, an entry or a thread at the end of the draft, and show the composer */
  addMention(m: Mention): void
  removeMention(id: string): void
  /** Add an image to the draft of a thread (`owner`, a `draftKey`), by default the draft that shows */
  addImage(image: ChatImage, owner?: string): void
  removeImage(file: string): void
  clearComposer(): void
  setEditing(id: string | null): void
}

/** The key of the draft of a thread in a book */
export function draftKey(root: string | null, threadId: string | null): string {
  return `${root ?? ''}\n${threadId ?? ''}`
}

/** The thread that owns the composer fields: the new thread, else the open thread. */
function ownerOf(s: Pick<ChatState, 'blank' | 'activeThreadId'>): string | null {
  return s.blank?.id ?? s.activeThreadId
}

function fieldsOf(s: ChatState): ThreadDraft {
  return { draft: s.draft, draftDoc: s.draftDoc, quotes: s.quotes, mentions: s.mentions, images: s.images }
}

export function draftIsEmpty(d: ThreadDraft): boolean {
  return !d.draft.trim() && !d.quotes.length && !d.mentions.length && !d.images.length
}

/** A new thread that the user changed: a title, a purpose, a model, a pin or a draft. */
export function worthKeeping(thread: Thread, draft: ThreadDraft = EMPTY): boolean {
  return thread.title !== NEW_THREAD_TITLE || Boolean(thread.brief.trim()) || thread.route !== null || thread.pinned || !draftIsEmpty(draft)
}

/**
 * The state after a change of the thread that shows. The composer fields of the old thread go to
 * `drafts`; the fields of the new thread come back. A new thread that the user changed goes to `kept`.
 * Without an owner before (no thread), the fields stay with the new thread.
 */
function moveTo(s: ChatState, next: Pick<ChatState, 'blank' | 'activeThreadId'>, root = useBook.getState().root): Partial<ChatState> {
  const from = ownerOf(s)
  const to = ownerOf(next)
  const out: Partial<ChatState> = { ...next }
  // The new thread that the user leaves: keep it when the user changed it.
  if (s.blank && s.blank.id !== to && s.blank.id !== next.blank?.id) {
    const list = (s.kept[root ?? ''] ?? []).filter((t) => t.id !== s.blank!.id)
    if (worthKeeping(s.blank, fieldsOf(s)) && !useBook.getState().threads.some((t) => t.id === s.blank!.id)) list.unshift(s.blank)
    out.kept = { ...s.kept, [root ?? '']: list }
  }
  // A kept new thread that shows again leaves the kept list.
  if (next.blank) {
    const kept = (out.kept ?? s.kept)[root ?? ''] ?? []
    if (kept.some((t) => t.id === next.blank!.id)) out.kept = { ...(out.kept ?? s.kept), [root ?? '']: kept.filter((t) => t.id !== next.blank!.id) }
  }
  if (from === to || from === null) return out
  const drafts = { ...s.drafts }
  const fields = fieldsOf(s)
  if (draftIsEmpty(fields)) delete drafts[draftKey(root, from)]
  else drafts[draftKey(root, from)] = fields
  const load = drafts[draftKey(root, to)] ?? EMPTY
  delete drafts[draftKey(root, to)]
  return { ...out, ...load, drafts, draftRev: s.draftRev + 1, draftQuiet: true }
}

export const useChat = create<ChatState>((set, get) => ({
  activeThreadId: null,
  blank: null,
  kept: {},
  listOpen: false,
  draft: '',
  draftDoc: null,
  draftRev: 0,
  draftQuiet: false,
  quotes: [],
  mentions: [],
  images: [],
  drafts: {},
  imagesBusy: 0,
  streaming: {},
  thoughts: {},
  editingId: null,
  setActiveThread(id) {
    set({ ...moveTo(get(), { activeThreadId: id, blank: null }), editingId: null, listOpen: false })
  },
  openBlank(thread) {
    set({ ...moveTo(get(), { activeThreadId: get().activeThreadId, blank: thread }), editingId: null, listOpen: false })
  },
  setListOpen(open) {
    const s = get()
    if (!open) return set({ listOpen: false, editingId: null })
    // A new thread that the user did not change goes away. A changed one stays: Esc goes back to it.
    if (s.blank && !worthKeeping(s.blank, fieldsOf(s))) return set({ ...moveTo(s, { activeThreadId: s.activeThreadId, blank: null }), listOpen: true, editingId: null })
    set({ listOpen: true, editingId: null })
  },
  discardKept(id) {
    const s = get()
    const root = useBook.getState().root
    const kept = { ...s.kept, [root ?? '']: (s.kept[root ?? ''] ?? []).filter((t) => t.id !== id) }
    const drafts = { ...s.drafts }
    const gone = s.blank?.id === id ? fieldsOf(s) : (drafts[draftKey(root, id)] ?? EMPTY)
    delete drafts[draftKey(root, id)]
    if (s.blank?.id === id) {
      // The open thread shows again, with its draft.
      const load = drafts[draftKey(root, s.activeThreadId)] ?? EMPTY
      delete drafts[draftKey(root, s.activeThreadId)]
      set({ ...load, drafts, kept, blank: null, draftRev: s.draftRev + 1, draftQuiet: true })
    } else set({ drafts, kept })
    return gone
  },
  setDraft(v) {
    set({ draftDoc: docFromText(v), draft: v, mentions: [], draftRev: get().draftRev + 1, draftQuiet: false })
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
    set({ draftDoc: doc, draft: text, mentions, draftRev: get().draftRev + 1, draftQuiet: false, listOpen: false })
  },
  removeMention(id) {
    const doc = withoutMention(get().draftDoc ?? docFromText(get().draft), id)
    const { text, mentions } = readDraft(doc)
    set({ draftDoc: doc, draft: text, mentions, draftRev: get().draftRev + 1, draftQuiet: false })
  },
  addImage(image, owner) {
    const s = get()
    const here = draftKey(useBook.getState().root, ownerOf(s))
    if (owner && owner !== here) {
      // The user went to another thread while the image was prepared: it goes to the draft of its thread.
      const d = s.drafts[owner] ?? EMPTY
      return set({ drafts: { ...s.drafts, [owner]: { ...d, images: [...d.images, image] } } })
    }
    set({ images: [...s.images, image], listOpen: false })
  },
  removeImage(file) {
    set({ images: get().images.filter((i) => i.file !== file) })
  },
  clearComposer() {
    set({ draft: '', draftDoc: null, quotes: [], mentions: [], images: [], draftRev: get().draftRev + 1, draftQuiet: false })
  },
  setEditing(id) {
    set({ editingId: id })
  }
}))

/** The key of the draft that shows now */
export function shownDraftKey(): string {
  return draftKey(useBook.getState().root, ownerOf(useChat.getState()))
}

/** Show a new thread when no thread shows (a book without threads). The composer fields stay with it. */
export function ensureBlank(thread: Thread): void {
  const s = useChat.getState()
  if (s.blank || s.activeThreadId || s.listOpen) return
  useChat.setState({ blank: thread })
}

/**
 * A book opens or closes. The draft of the thread that showed stays with its book, and a changed new
 * thread is kept for its book. Then the chat shows `activeThreadId` of the new book with its draft.
 */
export function switchBook(prevRoot: string | null, nextRoot: string | null, activeThreadId: string | null): void {
  const s = useChat.getState()
  const left = moveTo(s, { activeThreadId: null, blank: null }, prevRoot)
  const after = { ...s, ...left } as ChatState
  const drafts = { ...after.drafts }
  const load = drafts[draftKey(nextRoot, activeThreadId)] ?? EMPTY
  delete drafts[draftKey(nextRoot, activeThreadId)]
  useChat.setState({
    ...left,
    ...load,
    drafts,
    activeThreadId,
    blank: null,
    listOpen: false,
    editingId: null,
    draftRev: s.draftRev + 1,
    draftQuiet: true
  })
}

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

/** The editor of the composer, when it shows */
export function composerEditor(): Editor | null {
  return composer && !composer.isDestroyed ? composer : null
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
