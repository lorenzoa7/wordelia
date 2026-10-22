// Start an editor's read: the thread of the chapter, the message of the author and the reply.
//
// A read is a chat message. The app sends it in the thread of the chapter ("Leitura · <title>"). One
// thread holds all the reads of a chapter, and it is found again by `Thread.readChapterId`.

import type { ReadRequest, Thread } from '@shared/types'
import { useChat } from '@/features/chat/chatStore'
import { ensureRoute, newThread, sendInThread } from '@/features/chat/send'
import { getT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { makeRoomForComments } from './ui'

/** The name of a chapter in the words of a read. */
export function chapterName(title: string): string {
  return title.trim() || getT().common.untitled
}

/** A read of the last chapter of the book is a read of a chapter in progress, by default. */
export function isLastChapter(chapterId: string): boolean {
  const chapters = useBook.getState().chapters
  return chapters.length > 0 && chapters[chapters.length - 1].id === chapterId
}

/**
 * The thread of the reads of a chapter: the thread that the book has, or a new thread with the title
 * "Leitura · <title>". A new thread is not in the book yet: its first message saves it.
 */
export function readThreadFor(chapterId: string): Thread {
  const { threads, chapters } = useBook.getState()
  const found = threads.find((t) => t.readChapterId === chapterId)
  if (found) return found
  const chapter = chapters.find((c) => c.id === chapterId)
  return { ...newThread(getT().read.threadTitle(chapterName(chapter?.title ?? ''))), readChapterId: chapterId }
}

/**
 * Start a read: show the thread of the chapter, with the chat open, make room for the margin of the
 * comments, and send the message that asks for it. The reply streams in the chat; its comments go to the
 * comment store (useReadSync). While the thread has a reply in progress, this does nothing: one read runs
 * at a time in a thread.
 */
export async function startRead(req: ReadRequest): Promise<void> {
  const book = useBook.getState()
  const chapter = book.chapters.find((c) => c.id === req.chapterId)
  if (!book.manifest || !chapter) return
  const thread = readThreadFor(chapter.id)
  if (useChat.getState().streaming[thread.id]) return
  if (!ensureRoute(thread)) return

  // A selection of spaces only is no selection.
  const selection = req.selection?.text.trim()
  const request: ReadRequest = { chapterId: chapter.id, lens: req.lens, inProgress: req.inProgress, ...(selection ? { selection: { text: selection } } : {}) }
  const text = getT().read.ask(chapterName(chapter.title), req.lens, { selection: Boolean(selection), inProgress: req.inProgress })

  // The chat opens, and the desk makes room for the comments beside the page: one change of the panels.
  makeRoomForComments(useApp.getState().settings?.ui.chatOpen ? {} : { chatOpen: true })
  if (book.threads.some((t) => t.id === thread.id)) useChat.getState().setActiveThread(thread.id)
  else useChat.getState().openBlank(thread)
  await sendInThread(thread.id, text, { read: request })
}

/** True while the read of a chapter has a reply in progress. Its buttons are off meanwhile. */
export function useReadRunning(chapterId: string | undefined): boolean {
  const threadId = useBook((s) => (chapterId ? s.threads.find((t) => t.readChapterId === chapterId)?.id : undefined))
  return useChat((s) => Boolean(threadId && s.streaming[threadId]))
}
