// Planning sync: the AI reads the chapters that changed and proposes planning updates.
// The result goes to a "Planning sync" thread, where the user reviews each proposal.

import { hashText, newId } from '@shared/book'
import { buildSyncSystem, buildSyncUser } from '@shared/prompts/sync'
import { estimateTokens } from '@shared/prompts/context'
import type { Chapter, ChatMessage, Thread } from '@shared/types'
import { friendlyError, runCompletion } from '@/lib/ai'
import { getT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { flushEditor } from '@/features/editor/registry'
import { useChat } from '@/features/chat/chatStore'
import { messagesFor } from '@shared/i18n'

const EN = messagesFor('en')

export const SYNC_THREAD_ID = 'th_planning_sync'
const BATCH_TOKENS = 60000

export function changedChapters(): Chapter[] {
  const { chapters, syncState } = useBook.getState()
  return chapters.filter((c) => c.body.trim() && syncState.chapters[c.id] !== hashText(c.body))
}

function batches(chapters: Chapter[]): Chapter[][] {
  const out: Chapter[][] = []
  let cur: Chapter[] = []
  let size = 0
  for (const c of chapters) {
    const t = estimateTokens(c.body)
    if (cur.length && size + t > BATCH_TOKENS) {
      out.push(cur)
      cur = []
      size = 0
    }
    cur.push(c)
    size += t
  }
  if (cur.length) out.push(cur)
  return out
}

function syncThread(): Thread {
  const existing = useBook.getState().threads.find((t) => t.id === SYNC_THREAD_ID)
  if (existing) return existing
  const now = new Date().toISOString()
  return {
    id: SYNC_THREAD_ID,
    // Stored in English; the chat shows them in the interface language (threadTitle, threadBrief).
    title: EN.plan.sync.threadTitle,
    brief: EN.plan.sync.threadBrief,
    digest: '',
    digestedCount: 0,
    createdAt: now,
    updatedAt: now,
    pinned: true,
    route: null,
    messages: []
  }
}

let running = false

export async function startPlanningSync(opts: { bootstrap?: boolean } = {}): Promise<void> {
  if (running) return
  const t = getT()
  const settings = useApp.getState().settings
  const route = settings?.routes.sync ?? settings?.routes.chat ?? null
  if (!route) {
    toast(t.plan.sync.connectAiFirst, { action: { label: t.plan.sync.openSettings, run: () => useUi.getState().openSettings('ai') } })
    return
  }
  flushEditor()
  const book = useBook.getState()
  if (!book.manifest) return
  const todo = opts.bootstrap ? book.chapters.filter((c) => c.body.trim()) : changedChapters()
  if (!todo.length) {
    toast(t.plan.sync.upToDate)
    return
  }

  running = true
  const app = useApp.getState()
  if (!app.settings?.ui.chatOpen) app.setUi({ chatOpen: true })
  useChat.getState().setActiveThread(SYNC_THREAD_ID)

  try {
    const groups = batches(todo)
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]
      const fresh = useBook.getState()
      const bootstrap = Boolean(opts.bootstrap) || fresh.entries.length < 2
      const label = group.map((c) => `"${c.title}"`).join(', ')
      const userMsg: ChatMessage = {
        id: newId('m'),
        role: 'user',
        content: t.plan.sync.request(bootstrap, group.length, label, i + 1, groups.length),
        createdAt: new Date().toISOString()
      }
      let thread = { ...syncThread(), messages: [...syncThread().messages, userMsg], updatedAt: new Date().toISOString() }
      fresh.saveThread(thread, true)

      const input = {
        book: { manifest: fresh.manifest!, writingRules: fresh.writingRules, chapters: fresh.chapters, entries: fresh.entries, threads: fresh.threads },
        chapters: group,
        categories: fresh.manifest!.planning.categories.map((c) => c.folder),
        bootstrap
      }
      const assistantId = newId('m')
      const handle = runCompletion(
        { route, purpose: 'sync', system: buildSyncSystem(input), messages: [{ role: 'user', content: buildSyncUser(input) }] },
        (e, soFar) => {
          if (e.type === 'text')
            useChat.setState((s) => ({
              streaming: { ...s.streaming, [SYNC_THREAD_ID]: { messageId: assistantId, text: soFar, requestId: handle.id, cancel: handle.cancel } }
            }))
        }
      )
      useChat.setState((s) => ({
        streaming: { ...s.streaming, [SYNC_THREAD_ID]: { messageId: assistantId, text: '', requestId: handle.id, cancel: handle.cancel } }
      }))
      const result = await handle.done
      useChat.setState((s) => ({ streaming: { ...s.streaming, [SYNC_THREAD_ID]: undefined } }))

      thread = useBook.getState().threads.find((t) => t.id === SYNC_THREAD_ID) ?? thread
      const reply: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: result.text,
        createdAt: new Date().toISOString(),
        model: result.model,
        ...(result.ok ? {} : { error: friendlyError(result) })
      }
      useBook.getState().saveThread({ ...thread, messages: [...thread.messages, reply], updatedAt: new Date().toISOString() }, true)
      if (!result.ok) {
        if (result.errorKind !== 'cancelled') toast(friendlyError(result), { kind: 'error' })
        return
      }
      // These chapters are now read. Their proposals wait in the thread.
      const st = useBook.getState()
      const hashes = { ...st.syncState.chapters }
      for (const c of group) {
        const now = st.chapters.find((x) => x.id === c.id)
        if (now) hashes[c.id] = hashText(now.body)
      }
      st.setSyncState({ chapters: hashes, syncedAt: new Date().toISOString() })
    }
    toast(t.plan.sync.done)
  } finally {
    running = false
  }
}
