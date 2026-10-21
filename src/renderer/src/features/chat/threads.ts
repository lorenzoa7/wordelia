// A thread exists only after its first message. "New thread" shows a blank thread (`useChat.blank`):
// it is not in the book and not on disk. The first message saves it. When the user leaves it, it
// goes away, or, when the user gave it a title, a purpose, a model or a draft, it stays in the chat
// store (`useChat.kept`) and shows in the thread list until its first message.

import type { Thread } from '@shared/types'
import { useBook } from '@/stores/book'
import { draftKey, focusComposer, NEW_THREAD_TITLE, switchBook, useChat } from './chatStore'
import { newThread } from './send'

/** A thread with no messages does not show in the thread list or in the mentions. */
export function hasMessages(thread: Thread): boolean {
  return thread.messages.length > 0
}

/** The most recently changed thread with messages. */
export function latestThread(threads: Thread[]): Thread | undefined {
  return threads.reduce<Thread | undefined>((a, b) => (hasMessages(b) && (!a || b.updatedAt > a.updatedAt) ? b : a), undefined)
}

/** Show a new thread. The composer gets the focus. */
export function startThread(): void {
  useChat.getState().openBlank(newThread())
  focusComposer(50)
}

/** The new threads of the open book that wait for their first message: the kept ones, and the one that shows when the user changed it. */
export function keptThreads(): Thread[] {
  const s = useChat.getState()
  return s.kept[useBook.getState().root ?? ''] ?? []
}

/** True for a new thread that is not in the book yet (the blank thread or a kept one). */
export function isUnsaved(id: string): boolean {
  const s = useChat.getState()
  return s.blank?.id === id || keptThreads().some((t) => t.id === id)
}

/** Save a change to a thread: in the book, or for a new thread, in the chat store only. */
export function saveThreadChange(thread: Thread): void {
  const s = useChat.getState()
  if (hasMessages(thread)) return useBook.getState().saveThread(thread)
  if (s.blank?.id === thread.id) return useChat.setState({ blank: thread })
  const root = useBook.getState().root ?? ''
  const kept = s.kept[root] ?? []
  if (kept.some((t) => t.id === thread.id)) return useChat.setState({ kept: { ...s.kept, [root]: kept.map((t) => (t.id === thread.id ? thread : t)) } })
  useBook.getState().saveThread(thread)
}

/** Forget the draft of a thread of the open book (the thread went away). */
export function dropDraft(threadId: string): void {
  const s = useChat.getState()
  const key = draftKey(useBook.getState().root, threadId)
  if (!s.drafts[key]) return
  const drafts = { ...s.drafts }
  delete drafts[key]
  useChat.setState({ drafts })
}

/** An empty thread that older versions saved when the user clicked "New thread": no messages, no purpose, the default title. */
function leftEmpty(thread: Thread): boolean {
  return !hasMessages(thread) && !thread.brief.trim() && thread.title === NEW_THREAD_TITLE && !thread.pinned
}

async function removeLeftEmpty(root: string, threads: Thread[]): Promise<void> {
  // One at a time: each delete changes the list of threads in the book store.
  for (const th of threads.filter(leftEmpty)) {
    if (useBook.getState().root !== root) return
    await useBook.getState().deleteThread(th.id)
  }
}

// A book opens or closes: show the most recent thread with messages, keep the draft of the book that
// closes, and remove the empty threads that older versions saved.
useBook.subscribe((s, prev) => {
  if (s.root === prev.root) return
  switchBook(prev.root, s.root, latestThread(s.threads)?.id ?? null)
  if (s.root) void removeLeftEmpty(s.root, s.threads)
})
