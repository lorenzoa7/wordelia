// A thread exists only after its first message. "New thread" shows a blank thread (`useChat.blank`):
// it is not in the book, not in the thread list and not on disk. The first message saves it.
// When the user leaves it (the thread list, another thread, another book), it goes away.

import type { Thread } from '@shared/types'
import { useBook } from '@/stores/book'
import { focusComposer, useChat } from './chatStore'
import { NEW_THREAD_TITLE, newThread } from './send'

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

/** Save a change to a thread: in the book, or for the blank thread, in the chat store only. */
export function saveThreadChange(thread: Thread): void {
  if (useChat.getState().blank?.id === thread.id && !hasMessages(thread)) useChat.setState({ blank: thread })
  else useBook.getState().saveThread(thread)
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

// A book opens or closes: show the most recent thread with messages, forget the blank thread,
// and remove the empty threads that older versions saved.
useBook.subscribe((s, prev) => {
  if (s.root === prev.root) return
  useChat.setState({ activeThreadId: latestThread(s.threads)?.id ?? null, blank: null, listOpen: false, editingId: null })
  if (s.root) void removeLeftEmpty(s.root, s.threads)
})
