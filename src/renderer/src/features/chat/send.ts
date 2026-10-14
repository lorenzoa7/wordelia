// Send a chat message: build the context, stream the reply, update the digest.

import { newId } from '@shared/book'
import { buildChatSystem, buildChatUserTurn } from '@shared/prompts/chat'
import { buildDigestSystem, buildDigestUser, buildTitleSystem } from '@shared/prompts/background'
import { proposalSummary } from '@shared/proposals/parse'
import type { ChatMessage, ChatTurn, ModelChoice, Thread } from '@shared/types'
import { friendlyError, runCompletion } from '@/lib/ai'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { flushEditor } from '@/features/editor/registry'
import { useChat } from './chatStore'
import { summariesFor } from './summaries'

const HISTORY_LIMIT = 24

export function newThread(title = 'New thread', brief = ''): Thread {
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
    toast('Connect an AI first.', { action: { label: 'Open settings', run: () => useUi.getState().openSettings('ai') } })
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
    content: m.role === 'assistant' ? proposalSummary(m.content) : renderUser(m)
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

  if (t.title === 'New thread' && t.messages.length >= 2) {
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
    system: buildDigestSystem(),
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
