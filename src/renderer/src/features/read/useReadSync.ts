// The comments of a read come from its reply: from the reply while it streams, and from the saved
// replies of the read threads (a reply that ends, a thread file that changes, a book that opens).
//
// `addFromReply` does the work, and it is safe to call again for the same reply. This module decides
// when to call it, and it asks the author about the comments that the AI says are fixed.

import { useEffect } from 'react'
import { parseProposals } from '@shared/proposals/parse'
import type { ChatMessage, ReadRequest, Thread } from '@shared/types'
import { useChat } from '@/features/chat/chatStore'
import { getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { addFromReply, useComments } from './store'
import { decideComments } from './ui'

/** The least time between two parses of a reply that streams, for each thread. */
export const STREAM_PARSE_MS = 300

/**
 * Run a function for each key at most one time in `ms`. A call that comes too early waits for the end of
 * the time and runs one time, so the last state is never lost.
 */
export function makeThrottle(ms: number, now: () => number = Date.now): { call: (key: string, fn: () => void) => void; clear: () => void } {
  const runs = new Map<string, { last: number; timer: ReturnType<typeof setTimeout> | undefined; fn: () => void }>()
  return {
    call(key, fn) {
      const run = runs.get(key) ?? { last: -Infinity, timer: undefined, fn }
      run.fn = fn
      runs.set(key, run)
      if (run.timer) return
      const wait = ms - (now() - run.last)
      if (wait <= 0) {
        run.last = now()
        fn()
        return
      }
      run.timer = setTimeout(() => {
        run.timer = undefined
        run.last = now()
        run.fn()
      }, wait)
    },
    clear() {
      for (const run of runs.values()) clearTimeout(run.timer)
      runs.clear()
    }
  }
}

/** The read of the message of the author before a reply, or undefined when the reply is not the reply to a read. */
export function readBefore(messages: ChatMessage[], index: number): ReadRequest | undefined {
  const asked = messages[index - 1]
  return messages[index]?.role === 'assistant' && asked?.role === 'user' ? asked.read : undefined
}

/** The replies that this module handled, by message id, with the text that it handled. */
const handled = new Map<string, string>()
/** The replies that this module saw while they streamed: only these ask the author about fixed comments. */
const streamed = new Set<string>()

function forget(): void {
  handled.clear()
  streamed.clear()
}

/** A thread of the open book that holds reads of a chapter that is still in the book. */
function readThread(threadId: string): Thread | undefined {
  const { threads, chapters } = useBook.getState()
  const thread = threads.find((t) => t.id === threadId)
  // A deleted chapter does not get its comments back from its saved replies.
  if (!thread?.readChapterId || !chapters.some((c) => c.id === thread.readChapterId)) return undefined
  return thread
}

function ingest(thread: Thread, message: ChatMessage, req: ReadRequest): void {
  const chapter = useBook.getState().chapters.find((c) => c.id === req.chapterId)
  if (chapter) addFromReply(thread, message, req, chapter.body)
}

/** The reply that streams in a thread: its comments so far. */
function ingestStreaming(threadId: string): void {
  const now = useChat.getState().streaming[threadId]
  const thread = readThread(threadId)
  if (!now || !thread) return
  // The reply answers the last message of the thread, a message of the author.
  const req = thread.messages[thread.messages.length - 1]?.read
  if (!req) return
  streamed.add(now.messageId)
  ingest(thread, { id: now.messageId, role: 'assistant', content: now.text, createdAt: '' }, req)
}

/**
 * The AI says that some comments look fixed: ask the author. Nothing closes before the author says yes. The
 * comments of a file of a newer Wordelia cannot change: no question then.
 */
function askAboutFixed(message: ChatMessage, req: ReadRequest): void {
  if (useComments.getState().readOnly) return
  const said = new Set<string>()
  for (const s of parseProposals(message.content)) if (s.kind === 'resolved') s.ids.forEach((id) => said.add(id))
  const open = useComments
    .getState()
    .list.filter((c) => said.has(c.id) && c.chapterId === req.chapterId && c.state === 'open')
    .map((c) => c.id)
  if (!open.length) return
  const t = getT()
  const named = new Set(open)
  // The author can decide about some of them before the click (the margin, the revision list): close only the
  // ones that are still open.
  const run = (): void => {
    const still = useComments
      .getState()
      .list.filter((c) => named.has(c.id) && c.state === 'open')
      .map((c) => c.id)
    if (still.length) decideComments(still, 'done')
  }
  toast(t.read.resolved(open.length), { ms: 14000, action: { label: t.read.markDone(open.length), run } })
}

/**
 * The saved replies of the read threads of the open book. A reply that has not changed since the last time is
 * skipped. With a damaged comments file, no reply counts as handled: they give their comments when the file is
 * good again or goes away.
 */
function ingestSaved(): void {
  if (useComments.getState().damaged) return
  for (const { id } of useBook.getState().threads) {
    const thread = readThread(id)
    if (!thread) continue
    thread.messages.forEach((message, i) => {
      const req = readBefore(thread.messages, i)
      if (!req || handled.get(message.id) === message.content) return
      handled.set(message.id, message.content)
      ingest(thread, message, req)
      if (streamed.delete(message.id)) askAboutFixed(message, req)
    })
  }
}

/**
 * Keep the comment store in step with the replies of the editor's reads. A reply that streams is read at
 * most every `STREAM_PARSE_MS` for each thread. Returns the function that stops it.
 */
export function startReadSync(): () => void {
  const throttle = makeThrottle(STREAM_PARSE_MS)
  forget()
  const offBook = useBook.subscribe((s, prev) => {
    if (s.root !== prev.root) forget()
    if (s.threads !== prev.threads || s.root !== prev.root) ingestSaved()
  })
  const offChat = useChat.subscribe((s, prev) => {
    for (const [threadId, now] of Object.entries(s.streaming)) {
      if (now && now !== prev.streaming[threadId]) throttle.call(threadId, () => ingestStreaming(threadId))
    }
  })
  // A damaged comments file of the open book is good again, or gone. (Another book that opens changes the
  // comment store before the book store: its threads are not here yet.)
  const offComments = useComments.subscribe((s, prev) => {
    if (prev.damaged && !s.damaged && s.root === prev.root && s.root === useBook.getState().root) ingestSaved()
  })
  ingestSaved()
  return () => {
    offBook()
    offChat()
    offComments()
    throttle.clear()
    forget()
  }
}

/** Use it once, in the view of the open book. */
export function useReadSync(): void {
  useEffect(() => startReadSync(), [])
}
