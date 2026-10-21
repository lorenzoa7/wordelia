// Send a chat message: build the context, stream the reply, update the digest.
// Also: ask again for the last reply, and send an edited message again.

import { newId, THREADS_DIR } from '@shared/book'
import { buildChatSystem, buildChatUserTurn, chatHistory } from '@shared/prompts/chat'
import { buildReadTurn } from '@shared/prompts/read'
import type { ChatMessage, CompletionResult, Mention, ModelChoice, Thread } from '@shared/types'
import { messagesFor, type Messages } from '@shared/i18n'
import { describeError, runCompletion } from '@/lib/ai'
import { invoke } from '@/lib/api'
import { getT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { flushEditor } from '@/features/editor/registry'
import { useComments } from '@/features/read/store'
import { NEW_THREAD_TITLE, patchStreaming, useChat } from './chatStore'
import { afterReply } from './digest'
import { portraitImages } from './portraits'
import { confirmAndRewind } from './rewind'
import { summariesFor } from './summaries'

export { NEW_THREAD_TITLE }

const HISTORY_LIMIT = 24

/** The stored title of a new thread, in English in every language. afterReply() replaces it with a title from the AI. */
const EN = messagesFor('en')

/** The title to show for a thread. A new thread, and the planning sync thread of an older book, show their title in the interface language. */
export function threadTitle(t: Messages, title: string): string {
  if (title === NEW_THREAD_TITLE) return t.chat.newThread
  if (title === EN.plan.sync.threadTitle) return t.plan.sync.threadTitle
  return title
}

/** The purpose to show for a thread. The purpose of the planning sync thread shows in the interface language. */
export function threadBrief(t: Messages, brief: string): string {
  return brief === EN.plan.sync.threadBrief ? t.plan.sync.threadPurpose : brief
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

/** True when the thread has a model for its reply. Without one, the app says how to connect, and this is false. */
export function ensureRoute(thread: Thread): boolean {
  if (chatRoute(thread)) return true
  connectFirst()
  return false
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

/**
 * Send a message of the author in a thread that the app picks, for example the thread of the reads of a
 * chapter. The text does not come from the composer, so the draft of the author stays as it is. `extra`
 * adds fields to the message (`read`). The thread is in the book, or it is the new thread that shows
 * (`useChat.blank`): the first message saves it. Nothing happens while the thread has a reply in progress.
 */
export async function sendInThread(threadId: string, text: string, extra: Partial<ChatMessage> = {}): Promise<void> {
  const chat = useChat.getState()
  const book = useBook.getState()
  if (!book.manifest) return
  const saved = book.threads.find((t) => t.id === threadId)
  const thread = saved ?? (chat.blank?.id === threadId ? chat.blank : undefined)
  if (!thread || chat.streaming[threadId]) return
  if (!ensureRoute(thread)) return

  const now = new Date().toISOString()
  const userMsg: ChatMessage = { ...extra, id: newId('m'), role: 'user', content: text.trim(), createdAt: now }
  book.saveThread({ ...thread, messages: [...thread.messages, userMsg], updatedAt: now, ...(saved ? {} : { createdAt: now }) }, true)
  if (!saved) useChat.getState().setActiveThread(thread.id)
  await requestReply(threadId)
}

/** The tokens and the cost of a reply: from the result, else from the last `usage` event. */
function usageOf(result: CompletionResult, fromEvents: CompletionResult['usage']): ChatMessage['usage'] {
  const u = result.usage ?? fromEvents
  if (!u || (!u.inputTokens && !u.outputTokens && u.costUsd === undefined)) return undefined
  return {
    ...(u.inputTokens ? { inputTokens: u.inputTokens } : {}),
    ...(u.outputTokens ? { outputTokens: u.outputTokens } : {}),
    ...(typeof u.costUsd === 'number' ? { costUsd: u.costUsd } : {})
  }
}

/**
 * The book closed while the reply streamed (the author went back to the library, or opened another
 * book). The reply goes into the thread file of its book, so it is there when the book opens again.
 */
async function saveToClosedBook(root: string, threadId: string, reply: ChatMessage): Promise<void> {
  const rel = `${THREADS_DIR}/${threadId}.json`
  try {
    const text = await invoke('book:readFile', root, rel)
    if (!text) return
    const thread = JSON.parse(text) as Thread
    if (thread.messages.some((m) => m.id === reply.id)) return
    const next: Thread = { ...thread, messages: [...thread.messages, reply], updatedAt: new Date().toISOString() }
    // The book is open again (the same book): the store saves it.
    if (useBook.getState().root === root) {
      const live = useBook.getState().threads.find((t) => t.id === threadId)
      if (live) useBook.getState().saveThread({ ...live, messages: [...live.messages, reply], updatedAt: next.updatedAt }, true)
      return
    }
    await invoke('book:writeFile', root, rel, JSON.stringify(next, null, 2))
  } catch {
    // The file is gone or cannot be read: the thread was deleted.
  }
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
  const root = fresh.root
  const quotes = last.quotes ?? []
  const mentions = last.mentions ?? []
  const images = last.images ?? []
  const message = last.content
  // A read: the chapter of the read is the open chapter of this reply, whatever chapter the author has open now.
  const read = last.read
  const readChapter = read ? fresh.chapters.find((c) => c.id === read.chapterId) : undefined
  const focusId = readChapter ? readChapter.id : fresh.activeChapterId
  const assistantId = newId('m')
  const t = getT()

  // Show the reply at once, also while long books get their summaries. Stop works in that phase too:
  // it stops the summaries of this message, and the summaries that are done stay in the cache.
  const stop = new AbortController()
  useChat.setState((s) => ({
    streaming: {
      ...s.streaming,
      [threadId]: {
        messageId: assistantId,
        text: '',
        requestId: '',
        cancel: () => {
          stop.abort()
          useChat.setState((st) => ({ streaming: { ...st.streaming, [threadId]: undefined } }))
        }
      }
    }
  }))

  // Long books: summaries of the chapters that do not fit.
  const budget = budgetFor(route)
  const keepFull = new Set<string>()
  const idx = fresh.chapters.findIndex((c) => c.id === focusId)
  for (const i of [idx - 1, idx, idx + 1]) if (fresh.chapters[i]) keepFull.add(fresh.chapters[i].id)
  for (const m of mentions) if (m.kind === 'chapter') keepFull.add(m.id)
  const settingsNow = useApp.getState().settings
  const summaries = root
    ? await summariesFor(root, fresh.chapters, keepFull, budget, settingsNow?.routes.background ?? route, {
        signal: stop.signal,
        onProgress: (done, total) => patchStreaming(threadId, { status: t.chat.summarizing(done, total) })
      })
    : {}
  if (stop.signal.aborted) return
  patchStreaming(threadId, { status: undefined })

  const system = buildChatSystem({
    book: { manifest: fresh.manifest!, writingRules: fresh.writingRules, chapters: fresh.chapters, entries: fresh.entries, threads: fresh.threads },
    thread,
    currentChapterId: focusId,
    currentEntryId: fresh.view === 'plan' ? fresh.activeEntryId : null,
    mentions,
    quotes,
    message,
    summaries,
    manuscriptBudget: budget
  })

  // Thinking is never part of the history: only the text of each message goes back to the AI.
  // The images of earlier messages go too (the main process keeps the most recent ones), so the AI
  // can still talk about them. Failed and empty replies stay out.
  const history = chatHistory(thread.messages.slice(0, -1), HISTORY_LIMIT)
  // The portraits of the notes, so the AI sees how the characters, places and things look.
  const portraits = root
    ? await portraitImages(root, fresh.entries, {
        mentions,
        currentEntryId: fresh.view === 'plan' ? fresh.activeEntryId : null,
        text: [message, ...quotes.map((q) => q.text)].join('\n')
      })
    : []
  if (stop.signal.aborted) return
  const asked = message || (images.length ? 'Here is an image.' : 'What do you think about this passage?')
  // The read block holds the earlier comments of this chapter only.
  const content =
    read && readChapter
      ? buildReadTurn(asked, read, readChapter, idx, useComments.getState().list.filter((c) => c.chapterId === readChapter.id))
      : buildChatUserTurn(asked, quotes, mentions, fresh.threads, fresh.chapters, images)
  const turn = {
    role: 'user' as const,
    content,
    ...(images.length ? { images } : {}),
    ...(portraits.length ? { portraits } : {})
  }
  // A message of the author without a reply before it (the reply failed): one turn of the author.
  const prev = history[history.length - 1]
  if (prev?.role === 'user') {
    history[history.length - 1] = { ...turn, content: `${prev.content}\n\n${turn.content}`, images: [...(prev.images ?? []), ...images] }
    if (!history[history.length - 1].images?.length) delete history[history.length - 1].images
  } else history.push(turn)

  let usage: CompletionResult['usage']
  const handle = runCompletion({ route, purpose: 'chat', system, messages: history, ...(root ? { root } : {}) }, (e, soFar) => {
    if (e.type === 'text') patchStreaming(threadId, { text: soFar })
    else if (e.type === 'thinking') patchStreaming(threadId, (s) => ({ thinking: (s.thinking ?? '') + e.delta }))
    else if (e.type === 'status') patchStreaming(threadId, { status: e.message })
    else if (e.type === 'usage') usage = { inputTokens: e.inputTokens, outputTokens: e.outputTokens, costUsd: e.costUsd }
  })
  patchStreaming(threadId, { requestId: handle.id, cancel: handle.cancel })

  const result = await handle.done
  const thought = useChat.getState().streaming[threadId]?.thinking?.trim()
  useChat.setState((s) => ({
    streaming: { ...s.streaming, [threadId]: undefined },
    ...(thought ? { thoughts: { ...s.thoughts, [assistantId]: thought } } : {})
  }))

  const stopped = !result.ok && result.errorKind === 'cancelled'
  // Stopped before the first word: nothing to keep.
  if (stopped && !result.text.trim()) return
  const used = usageOf(result, usage)
  // A stop is the choice of the author, not an error. An error keeps its kind and the words of the
  // provider, so the chat shows "Details" and the button that fixes it.
  const failed = result.ok || stopped ? null : describeError(result)
  const reply: ChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: result.text,
    createdAt: new Date().toISOString(),
    model: result.model,
    ...(result.provider ? { provider: result.provider } : {}),
    ...(failed ? { error: failed.message, errorKind: failed.kind, ...(failed.detail ? { errorDetail: failed.detail } : {}) } : {}),
    ...(stopped ? { stopped: true } : {}),
    ...(used ? { usage: used } : {})
  }
  // The book closed meanwhile: keep the reply in its book.
  if (root && useBook.getState().root !== root) {
    await saveToClosedBook(root, threadId, reply)
    return
  }
  const latest = useBook.getState().threads.find((th) => th.id === threadId)
  // The thread was deleted while the reply streamed.
  if (!latest) return
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

export function stopReply(threadId: string): void {
  useChat.getState().streaming[threadId]?.cancel()
}
