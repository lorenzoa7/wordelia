// Send a chat message: build the context, stream the reply, update the digest.

import { newId } from '@shared/book'
import { buildChatSystem, buildChatUserTurn } from '@shared/prompts/chat'
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
import { useChat } from './chatStore'
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
  return { id: newId('th'), title, brief, digest: '', digestedCount: 0, createdAt: now, updatedAt: now, pinned: false, route: null, messages: [] }
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

export async function sendMessage(text: string): Promise<void> {
  const chat = useChat.getState()
  const book = useBook.getState()
  if (!book.manifest) return
  const message = text.trim()
  if (!message && !chat.quotes.length) return

  let thread = book.threads.find((t) => t.id === chat.activeThreadId)
  if (!thread) {
    thread = newThread()
    useChat.getState().setActiveThread(thread.id)
  }
  if (useChat.getState().streaming[thread.id]) return

  const route = chatRoute(thread)
  if (!route) {
    const t = getT()
    toast(t.chat.connectFirst, { action: { label: t.chat.openSettings, run: () => useUi.getState().openSettings('ai') } })
    return
  }

  flushEditor()
  const fresh = useBook.getState()
  const quotes = chat.quotes
  const mentions = chat.mentions
  const userMsg: ChatMessage = {
    id: newId('m'),
    role: 'user',
    content: message,
    createdAt: new Date().toISOString(),
    ...(quotes.length ? { quotes } : {}),
    ...(mentions.length ? { mentions } : {})
  }
  const assistantId = newId('m')
  const base: Thread = { ...thread, messages: [...thread.messages, userMsg], updatedAt: new Date().toISOString() }
  fresh.saveThread(base, true)
  useChat.getState().clearComposer()

  // Show the "thinking" dots at once, also while long books get their summaries.
  useChat.setState((s) => ({
    streaming: { ...s.streaming, [base.id]: { messageId: assistantId, text: '', requestId: '', cancel: () => {} } }
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

  const system = buildChatSystem({
    book: { manifest: fresh.manifest!, writingRules: fresh.writingRules, chapters: fresh.chapters, entries: fresh.entries, threads: fresh.threads },
    thread: base,
    currentChapterId: fresh.view === 'write' ? fresh.activeChapterId : fresh.activeChapterId,
    currentEntryId: fresh.view === 'plan' ? fresh.activeEntryId : null,
    mentions,
    quotes,
    message,
    summaries,
    manuscriptBudget: budget
  })

  const history: ChatTurn[] = thread.messages.slice(-HISTORY_LIMIT).map((m) => ({
    role: m.role,
    content: m.role === 'assistant' ? proposalSummary(m.content, m.hunks ?? {}) : renderUser(m)
  }))
  history.push({ role: 'user', content: buildChatUserTurn(message || 'What do you think about this passage?', quotes, mentions, fresh.threads, fresh.chapters) })

  const handle = runCompletion({ route, purpose: 'chat', system, messages: history }, (e, soFar) => {
    if (e.type !== 'text') return
    useChat.setState((s) => ({
      streaming: { ...s.streaming, [base.id]: { messageId: assistantId, text: soFar, requestId: handle.id, cancel: handle.cancel } }
    }))
  })
  useChat.setState((s) => ({
    streaming: { ...s.streaming, [base.id]: { messageId: assistantId, text: '', requestId: handle.id, cancel: handle.cancel } }
  }))

  const result = await handle.done
  useChat.setState((s) => ({ streaming: { ...s.streaming, [base.id]: undefined } }))

  const latest = useBook.getState().threads.find((t) => t.id === base.id) ?? base
  const reply: ChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: result.text,
    createdAt: new Date().toISOString(),
    model: result.model,
    ...(result.ok ? {} : { error: friendlyError(result) })
  }
  if (!result.ok && !result.text && result.errorKind === 'cancelled') return
  const done: Thread = { ...latest, messages: [...latest.messages, reply], updatedAt: new Date().toISOString() }
  useBook.getState().saveThread(done, true)

  if (result.ok) void afterReply(done.id)
}

function renderUser(m: ChatMessage): string {
  const q = (m.quotes ?? []).map((x) => `> ${x.text.split('\n').join('\n> ')}`).join('\n\n')
  return q ? `${q}\n\n${m.content}` : m.content
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
