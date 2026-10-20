// Send a chat message: build the context, stream the reply, update the digest.
// Also: ask again for the last reply, and send an edited message again.

import { newId } from '@shared/book'
import { buildChatSystem, buildChatUserTurn, imageLines } from '@shared/prompts/chat'
import { buildDigestSystem, buildDigestUser, buildTitleSystem } from '@shared/prompts/background'
import { proposalSummary } from '@shared/proposals/parse'
import type { ChatMessage, ChatTurn, Mention, ModelChoice, Thread } from '@shared/types'
import { messagesFor, type Messages } from '@shared/i18n'
import { friendlyError, runCompletion } from '@/lib/ai'
import { getT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { flushEditor } from '@/features/editor/registry'
import { patchStreaming, useChat } from './chatStore'
import { confirmAndRewind } from './rewind'
import { summariesFor } from './summaries'

const HISTORY_LIMIT = 24

/** The stored title of a new thread, in English in every language. afterReply() replaces it with a title from the AI. */
const EN = messagesFor('en')

export const NEW_THREAD_TITLE = 'New thread'

/** The title to show for a thread. A new thread, and the planning sync thread of an older book, show their title in the interface language. */
export function threadTitle(t: Messages, title: string): string {
  if (title === NEW_THREAD_TITLE) return t.chat.newThread
  if (title === EN.plan.sync.threadTitle) return t.plan.sync.threadTitle
  return title
}

/** The purpose to show for a thread. The purpose of the planning sync thread shows in the interface language. */
export function threadBrief(t: Messages, brief: string): string {
  return brief === EN.plan.sync.threadBrief ? t.plan.sync.threadBrief : brief
}

/** The label to show for a mention. */
export function mentionLabel(t: Messages, m: Pick<Mention, 'kind' | 'label'>): string {
  return m.kind === 'thread' ? threadTitle(t, m.label) : m.label
}

export function newThread(title = NEW_THREAD_TITLE, brief = ''): Thread {
  const now = new Date().toISOString()
  return { id: newId('th'), title, brief, digest: '', digestedCount: 0, createdAt: now, updatedAt: now, pinned: false, route: null, messages: [], readAt: now }
}

function chatRoute(thread: Thread): ModelChoice | null {
  const s = useApp.getState().settings
  return thread.route ?? s?.routes.chat ?? null
}

function budgetFor(route: ModelChoice): number {
  // Tokens for the manuscript block. All current models have large windows; keep room for the rest.
  if (route.provider === 'claude-code' || route.provider === 'anthropic') return 140000
  return 90000
}

function connectFirst(): void {
  const t = getT()
  toast(t.chat.connectFirst, { action: { label: t.chat.openSettings, run: () => useUi.getState().openSettings('ai') } })
}

/** Send the text of the composer, with its quotes, mentions and images, in the active thread. */
export async function sendMessage(text: string): Promise<void> {
  const chat = useChat.getState()
  const book = useBook.getState()
  if (!book.manifest) return
  const message = text.trim()
  if (!message && !chat.quotes.length && !chat.images.length) return

  // The blank thread (or a new one) is saved with its first message, not before.
  const saved = chat.blank ? undefined : book.threads.find((t) => t.id === chat.activeThreadId)
  const thread = saved ?? chat.blank ?? newThread()
  if (useChat.getState().streaming[thread.id]) return
  if (!chatRoute(thread)) {
    connectFirst()
    return
  }

  const userMsg: ChatMessage = {
    id: newId('m'),
    role: 'user',
    content: message,
    createdAt: new Date().toISOString(),
    ...(chat.quotes.length ? { quotes: chat.quotes } : {}),
    ...(chat.mentions.length ? { mentions: chat.mentions } : {}),
    ...(chat.images.length ? { images: chat.images } : {})
  }
  const now = new Date().toISOString()
  useBook.getState().saveThread({ ...thread, messages: [...thread.messages, userMsg], updatedAt: now, ...(saved ? {} : { createdAt: now }) }, true)
  if (!saved) useChat.getState().setActiveThread(thread.id)
  useChat.getState().clearComposer()
  await requestReply(thread.id)
}

/** Ask the AI to answer the last message of a thread. That message must be a message of the user. */
export async function requestReply(threadId: string): Promise<void> {
  const thread = useBook.getState().threads.find((t) => t.id === threadId)
  if (!thread || !useBook.getState().manifest || useChat.getState().streaming[threadId]) return
  const last = thread.messages[thread.messages.length - 1]
  if (!last || last.role !== 'user') return
  const route = chatRoute(thread)
  if (!route) {
    connectFirst()
    return
  }

  flushEditor()
  const fresh = useBook.getState()
  const quotes = last.quotes ?? []
  const mentions = last.mentions ?? []
  const images = last.images ?? []
  const message = last.content
  const assistantId = newId('m')

  // Show the reply at once, also while long books get their summaries. Stop works in that phase too.
  let stopped = false
  useChat.setState((s) => ({
    streaming: {
      ...s.streaming,
      [threadId]: {
        messageId: assistantId,
        text: '',
        requestId: '',
        cancel: () => {
          stopped = true
          useChat.setState((st) => ({ streaming: { ...st.streaming, [threadId]: undefined } }))
        }
      }
    }
  }))

  // Long books: summaries of the chapters that do not fit.
  const budget = budgetFor(route)
  const keepFull = new Set<string>()
  const idx = fresh.chapters.findIndex((c) => c.id === fresh.activeChapterId)
  for (const i of [idx - 1, idx, idx + 1]) if (fresh.chapters[i]) keepFull.add(fresh.chapters[i].id)
  for (const m of mentions) if (m.kind === 'chapter') keepFull.add(m.id)
  const settingsNow = useApp.getState().settings
  const summaries = fresh.root
    ? await summariesFor(fresh.root, fresh.chapters, keepFull, budget, settingsNow?.routes.background ?? route)
    : {}
  if (stopped) return

  const system = buildChatSystem({
    book: { manifest: fresh.manifest!, writingRules: fresh.writingRules, chapters: fresh.chapters, entries: fresh.entries, threads: fresh.threads },
    thread,
    currentChapterId: fresh.activeChapterId,
    currentEntryId: fresh.view === 'plan' ? fresh.activeEntryId : null,
    mentions,
    quotes,
    message,
    summaries,
    manuscriptBudget: budget
  })

  // Thinking is never part of the history: only the text of each message goes back to the AI.
  // The images of earlier messages go too (the main process keeps the most recent ones), so the AI
  // can still talk about them.
  const history: ChatTurn[] = thread.messages.slice(0, -1).slice(-HISTORY_LIMIT).map((m) => ({
    role: m.role,
    content: m.role === 'assistant' ? proposalSummary(m.content, m.hunks ?? {}) : renderUser(m),
    ...(m.role === 'user' && m.images?.length ? { images: m.images } : {})
  }))
  const asked = message || (images.length ? 'Here is an image.' : 'What do you think about this passage?')
  history.push({ role: 'user', content: buildChatUserTurn(asked, quotes, mentions, fresh.threads, fresh.chapters, images), ...(images.length ? { images } : {}) })

  const handle = runCompletion({ route, purpose: 'chat', system, messages: history, ...(fresh.root ? { root: fresh.root } : {}) }, (e, soFar) => {
    if (e.type === 'text') patchStreaming(threadId, { text: soFar })
    else if (e.type === 'thinking') patchStreaming(threadId, (s) => ({ thinking: (s.thinking ?? '') + e.delta }))
    else if (e.type === 'status') patchStreaming(threadId, { status: e.message })
  })
  patchStreaming(threadId, { requestId: handle.id, cancel: handle.cancel })

  const result = await handle.done
  const thought = useChat.getState().streaming[threadId]?.thinking?.trim()
  useChat.setState((s) => ({
    streaming: { ...s.streaming, [threadId]: undefined },
    ...(thought ? { thoughts: { ...s.thoughts, [assistantId]: thought } } : {})
  }))

  if (!result.ok && !result.text && result.errorKind === 'cancelled') return
  const latest = useBook.getState().threads.find((t) => t.id === threadId)
  // The thread was deleted while the reply streamed.
  if (!latest) return
  const reply: ChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: result.text,
    createdAt: new Date().toISOString(),
    model: result.model,
    ...(result.ok ? {} : { error: friendlyError(result) })
  }
  const done: Thread = { ...latest, messages: [...latest.messages, reply], updatedAt: new Date().toISOString() }
  useBook.getState().saveThread(done, true)

  if (result.ok) void afterReply(done.id)
}

/** Remove the last reply of a thread and ask again. Asks first when that reply changed the book. */
export async function retryLast(threadId: string): Promise<void> {
  const th = useBook.getState().threads.find((t) => t.id === threadId)
  if (!th || useChat.getState().streaming[threadId]) return
  const last = th.messages[th.messages.length - 1]
  if (last?.role === 'assistant' && !(await confirmAndRewind(th, th.messages.length - 1, 'retry'))) return
  await requestReply(threadId)
}

/**
 * Send an edited message again: the message and everything after it leave the thread, the new text
 * takes its place with the same quotes, and the AI answers again. `mentions` are the mentions of the
 * new text; without them, the message keeps its mentions. False: the user cancelled.
 */
export async function resendEdited(threadId: string, messageId: string, text: string, mentions?: Mention[]): Promise<boolean> {
  const th = useBook.getState().threads.find((t) => t.id === threadId)
  if (!th || useChat.getState().streaming[threadId]) return false
  const at = th.messages.findIndex((m) => m.id === messageId)
  const old = th.messages[at]
  if (!old || old.role !== 'user') return false
  if (!chatRoute(th)) {
    connectFirst()
    return false
  }
  if (!(await confirmAndRewind(th, at, 'edit'))) return false
  const kept = useBook.getState().threads.find((t) => t.id === threadId)
  if (!kept) return false
  const { mentions: oldMentions, ...rest } = old
  const keep = mentions ?? oldMentions ?? []
  const edited: ChatMessage = { ...rest, id: newId('m'), content: text.trim(), createdAt: new Date().toISOString(), ...(keep.length ? { mentions: keep } : {}) }
  useBook.getState().saveThread({ ...kept, messages: [...kept.messages, edited], updatedAt: new Date().toISOString() }, true)
  void requestReply(threadId)
  return true
}

function renderUser(m: ChatMessage): string {
  const q = (m.quotes ?? []).map((x) => `> ${x.text.split('\n').join('\n> ')}`).join('\n\n')
  return [imageLines(m.images), q, m.content].filter(Boolean).join('\n\n')
}

/** Background work after a reply: a title for new threads, and the digest. */
async function afterReply(threadId: string): Promise<void> {
  const settings = useApp.getState().settings
  const route = settings?.routes.background ?? settings?.routes.chat
  if (!route) return
  const get = (): Thread | undefined => useBook.getState().threads.find((t) => t.id === threadId)
  let t = get()
  if (!t) return

  if (t.title === NEW_THREAD_TITLE && t.messages.length >= 2) {
    const first = t.messages[0]
    const r = await runCompletion({
      route,
      purpose: 'background',
      system: buildTitleSystem(),
      messages: [{ role: 'user', content: first.content || first.quotes?.[0]?.text || 'A question about the book' }],
      maxTokens: 60
    }).done
    t = get()
    if (r.ok && t) {
      const title = (r.text.trim().split('\n')[0] ?? '')
        .replace(/^[-*#\s]+/, '')
        .replace(/^["'“]|["'”.]$/g, '')
        .trim()
        .slice(0, 60)
      if (title) useBook.getState().saveThread({ ...t, title })
    }
  }

  t = get()
  if (!t) return
  const fresh = t.messages.slice(t.digestedCount)
  if (fresh.length < 2) return
  const r = await runCompletion({
    route,
    purpose: 'background',
    system: buildDigestSystem({ title: useBook.getState().manifest?.title ?? '', chapters: useBook.getState().chapters.map((c) => c.title) }),
    messages: [{ role: 'user', content: buildDigestUser(t.digest, fresh) }],
    maxTokens: 800
  }).done
  t = get()
  if (r.ok && t) {
    useBook.getState().saveThread({ ...t, digest: r.text.trim(), digestedCount: t.messages.length })
  }
}

export function stopReply(threadId: string): void {
  useChat.getState().streaming[threadId]?.cancel()
}
