// The state of each thread for the thread list and the title bar: it works, it needs the user
// (proposals of the current replies wait for a decision), or it has a reply that the user did not see yet.

import { useMemo } from 'react'
import clsx from 'clsx'
import { parseProposals } from '@shared/proposals/parse'
import type { ChatMessage, Thread } from '@shared/types'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { useChat } from './chatStore'
import { pendingKeys, currentFrom } from '@shared/proposals/state'
import { SYNC_THREAD_ID } from '@/features/plan/sync'
import './chat.css'

export type ThreadState = 'working' | 'needs-you' | 'unseen'

export interface ThreadStatus {
  state: ThreadState | null
  /** Proposals that wait for a decision */
  pending: number
}

// Messages do not change in place (a change makes a new object), so the count can be kept per object.
const pendingCache = new WeakMap<ChatMessage, number>()

function pendingIn(m: ChatMessage): number {
  if (m.role !== 'assistant' || !m.content.includes('<')) return 0
  let n = pendingCache.get(m)
  if (n === undefined) {
    n = pendingKeys(parseProposals(m.content), m.hunks).length
    pendingCache.set(m, n)
  }
  return n
}

/** The time of the last reply of the AI, or '' when there is none. */
export function lastReplyAt(thread: Thread): string {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    if (thread.messages[i].role === 'assistant') return thread.messages[i].createdAt
  }
  return ''
}

export function threadStatus(thread: Thread, working: boolean): ThreadStatus {
  // Only the current replies count: the proposals of the replies before the last message of the
  // author are old, and their cards keep them. The planning sync has its own review: all count.
  const from = thread.id === SYNC_THREAD_ID ? 0 : currentFrom(thread.messages)
  const pending = thread.messages.reduce((n, m, i) => n + (i >= from ? pendingIn(m) : 0), 0)
  if (working) return { state: 'working', pending }
  if (pending > 0) return { state: 'needs-you', pending }
  const last = lastReplyAt(thread)
  // Threads from before `readAt` existed count as seen.
  if (thread.readAt !== undefined && last && last > thread.readAt) return { state: 'unseen', pending }
  return { state: null, pending }
}

/** Remember that the user saw the thread now. Writes only when there is something new. */
export function markSeen(threadId: string): void {
  const th = useBook.getState().threads.find((t) => t.id === threadId)
  if (!th) return
  const last = lastReplyAt(th)
  if (th.readAt !== undefined && (!last || last <= th.readAt)) return
  useBook.getState().saveThread({ ...th, readAt: new Date().toISOString() })
}

export function useThreadStatuses(): Record<string, ThreadStatus> {
  const threads = useBook((s) => s.threads)
  // The ids of the threads at work, as one string: it changes when a reply starts or ends, not with each word.
  const working = useChat((s) =>
    Object.keys(s.streaming)
      .filter((id) => s.streaming[id])
      .join('\n')
  )
  return useMemo(() => {
    const busy = new Set(working.split('\n'))
    return Object.fromEntries(threads.map((th) => [th.id, threadStatus(th, busy.has(th.id))]))
  }, [threads, working])
}

/** The most important state over all threads, except `working`: what the title bar dot shows. */
export function useChatAttention(exceptId?: string | null): Exclude<ThreadState, 'working'> | null {
  const statuses = useThreadStatuses()
  return useMemo(() => {
    let best: Exclude<ThreadState, 'working'> | null = null
    for (const [id, s] of Object.entries(statuses)) {
      if (id === exceptId) continue
      if (s.state === 'needs-you') return 'needs-you'
      if (s.state === 'unseen') best = 'unseen'
    }
    return best
  }, [statuses, exceptId])
}

/** A colored dot, or a spinner while the thread works. */
export function StatusDot({ state, className }: { state: ThreadState | null; className?: string }): React.JSX.Element {
  const t = useT()
  if (state === 'working') return <span className={clsx('status-dot is-working', className)} role="img" aria-label={t.chat.statusWorking} />
  if (!state) return <span className={clsx('status-dot is-none', className)} aria-hidden />
  return (
    <span
      className={clsx('status-dot', `is-${state}`, className)}
      role="img"
      aria-label={state === 'needs-you' ? t.chat.statusNeedsYouShort : t.chat.statusUnseen}
    />
  )
}

/** For the chat button in the title bar: a dot when the chat is closed and a thread needs the user. */
export function ChatAttentionDot({ hidden }: { hidden?: boolean }): React.JSX.Element | null {
  const t = useT()
  const attention = useChatAttention()
  if (hidden || !attention) return null
  return (
    <span
      className={clsx('chat-toggle-dot', `is-${attention}`)}
      role="img"
      aria-label={attention === 'needs-you' ? t.chat.statusNeedsYouShort : t.chat.statusUnseen}
    />
  )
}
