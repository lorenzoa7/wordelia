// Background work for a thread: a title from the AI for a new thread, and the digest.
//
// The digest waits for the decisions of the author: it covers the messages up to the first current
// reply with proposals that wait (`digestEnd`). When the author decides the last of them, the digest
// runs again a short time later, so other threads read what is now in the book.

import { buildDigestSystem, buildDigestUser, buildTitleSystem } from '@shared/prompts/background'
import { isUsableReply } from '@shared/prompts/chat'
import { digestEnd } from '@shared/proposals/state'
import type { ModelChoice, Thread } from '@shared/types'
import { runCompletion } from '@/lib/ai'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { SYNC_THREAD_ID } from '@/features/plan/sync'
import { onDecision } from './applyProposal'
import { NEW_THREAD_TITLE } from './chatStore'

/** The time between the last decision and the digest: one digest for a series of decisions. */
const AFTER_DECISION_MS = 2500

const get = (threadId: string): Thread | undefined => useBook.getState().threads.find((t) => t.id === threadId)

function backgroundRoute(): ModelChoice | null {
  const settings = useApp.getState().settings
  return settings?.routes.background ?? settings?.routes.chat ?? null
}

/** Ask the AI for a short title for a new thread. A title that the author set in the meantime stays. */
async function giveTitle(threadId: string): Promise<void> {
  const route = backgroundRoute()
  const t = get(threadId)
  if (!route || !t || t.title !== NEW_THREAD_TITLE || t.messages.length < 2) return
  const first = t.messages[0]
  const r = await runCompletion({
    route,
    purpose: 'background',
    system: buildTitleSystem(),
    messages: [{ role: 'user', content: first.content || first.quotes?.[0]?.text || 'A question about the book' }],
    maxTokens: 60
  }).done
  const now = get(threadId)
  // The author can rename the thread while the AI works: their title wins.
  if (!r.ok || !now || now.title !== NEW_THREAD_TITLE) return
  const title = (r.text.trim().split('\n')[0] ?? '')
    .replace(/^[-*#\s]+/, '')
    .replace(/^["'“]|["'”.]$/g, '')
    .trim()
    .slice(0, 60)
  if (title) useBook.getState().saveThread({ ...now, title })
}

const running = new Set<string>()
const again = new Set<string>()

/** Update the digest of a thread with the messages that it can cover now. */
export async function updateDigest(threadId: string): Promise<void> {
  const route = backgroundRoute()
  if (!route || threadId === SYNC_THREAD_ID) return
  if (running.has(threadId)) {
    again.add(threadId)
    return
  }
  const t = get(threadId)
  if (!t) return
  const end = digestEnd(t.messages)
  const fresh = t.messages.slice(t.digestedCount, end)
  if (fresh.length < 2) return
  running.add(threadId)
  try {
    const r = await runCompletion({
      route,
      purpose: 'background',
      system: buildDigestSystem({ title: useBook.getState().manifest?.title ?? '', chapters: useBook.getState().chapters.map((c) => c.title) }),
      // A failed or empty reply is not part of the conversation.
      messages: [{ role: 'user', content: buildDigestUser(t.digest, fresh.filter((m) => m.role === 'user' || isUsableReply(m))) }],
      maxTokens: 800
    }).done
    const now = get(threadId)
    // A rewind during the request starts the digest again: do not save an old one.
    if (r.ok && now && now.digestedCount === t.digestedCount && now.messages.length >= end) {
      useBook.getState().saveThread({ ...now, digest: r.text.trim(), digestedCount: end })
    }
  } finally {
    running.delete(threadId)
    if (again.delete(threadId)) void updateDigest(threadId)
  }
}

/** Background work after a reply: a title for new threads, and the digest. */
export async function afterReply(threadId: string): Promise<void> {
  await giveTitle(threadId)
  await updateDigest(threadId)
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()

/** The author decided a proposal: when the digest can cover more messages now, update it soon. */
function afterDecision(threadId: string): void {
  if (threadId === SYNC_THREAD_ID) return
  const t = get(threadId)
  if (!t || digestEnd(t.messages) - t.digestedCount < 2) return
  clearTimeout(timers.get(threadId))
  timers.set(
    threadId,
    setTimeout(() => {
      timers.delete(threadId)
      void updateDigest(threadId)
    }, AFTER_DECISION_MS)
  )
}

onDecision(afterDecision)
