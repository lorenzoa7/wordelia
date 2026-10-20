// Planning sync: the AI reads the chapters that changed and proposes planning updates.
//
// The sync is a background job. The chat does not open and does not change its thread. The Plan
// sidebar shows the progress (`useSyncJob`) and, at the end, a card with the result: the count of
// proposed changes, Review, Accept all and Reject all, or the error. When the sidebar is not on
// screen, a toast tells the result.
//
// The proposals stay in the "Planning sync" thread, so the proposal cards, the inline diffs and the
// rewind of the chat work on them. "Review" opens that thread in the chat.

import { create } from 'zustand'
import { hashText, newId } from '@shared/book'
import { buildSyncSystem, buildSyncUser } from '@shared/prompts/sync'
import { estimateTokens } from '@shared/prompts/context'
import { parseProposals, type Segment } from '@shared/proposals/parse'
import type { Chapter, ChatMessage, HunkState, Thread } from '@shared/types'
import { friendlyError, runCompletion } from '@/lib/ai'
import { getT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { flushEditor } from '@/features/editor/registry'
import { useChat } from '@/features/chat/chatStore'
import { acceptPending, pendingKeys, resolveTarget, segmentKeys, setHunkStates } from '@/features/chat/applyProposal'
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

/* ------------------------------------------------------------------ */
/* The job                                                              */
/* ------------------------------------------------------------------ */

export type SyncJob =
  | { state: 'idle' }
  | {
      state: 'running'
      /** The chapters of this part */
      chapters: number
      part: number
      parts: number
      /** The AI writes its reply (before this, it reads) */
      writing: boolean
      /** The complete changes in the reply so far */
      found: number
    }
  /** The sync ended. `messageIds`: the replies of this run in the sync thread. */
  | { state: 'done'; messageIds: string[] }
  /** The sync stopped with an error. `settings`: no AI is connected. */
  | { state: 'failed'; error: string; messageIds: string[]; settings?: boolean; bootstrap?: boolean }

export const useSyncJob = create<SyncJob>(() => ({ state: 'idle' }))

const setJob = (job: SyncJob): void => useSyncJob.setState(job, true)

/** The run in progress: its cancel function, and whether the user cancelled it */
let current: { cancel: () => void; cancelled: boolean } | null = null

/** Stop the sync. The parts that are done keep their proposals. */
export function cancelPlanningSync(): void {
  if (!current) return
  current.cancelled = true
  current.cancel()
}

/** Close the result card. The proposals stay in the sync thread. */
export function dismissSyncResult(): void {
  if (useSyncJob.getState().state !== 'running') setJob({ state: 'idle' })
}

// Another book: stop the sync of the old book and forget its result.
useBook.subscribe((s, prev) => {
  if (s.root === prev.root) return
  cancelPlanningSync()
  setJob({ state: 'idle' })
})

/** The Plan sidebar is on screen, so its card shows the result. */
function sidebarShows(): boolean {
  return useBook.getState().view === 'plan' && (useApp.getState().settings?.ui.sidebarOpen ?? true)
}

/** The proposals of a message that the user can decide: a `<create>` cut off by a cancel does not count. */
function reviewable(m: ChatMessage): Segment[] {
  return parseProposals(m.content).filter((s) => s.kind !== 'create' || s.complete)
}

/** The keys of the complete changes in a reply */
function changeKeys(segments: Segment[]): string[] {
  return pendingKeys(segments.filter((s) => s.kind !== 'create' || s.complete))
}

export interface SyncResult {
  /** Changes that wait for a decision */
  pending: number
  /** All the changes of the run */
  total: number
  /** The names of the notes with pending changes */
  notes: string[]
}

/** The result of a run, from its replies in the sync thread (the thread is the truth). */
export function syncResult(thread: Thread | undefined, messageIds: string[]): SyncResult {
  const out: SyncResult = { pending: 0, total: 0, notes: [] }
  if (!thread) return out
  for (const id of messageIds) {
    const m = thread.messages.find((x) => x.id === id)
    if (!m) continue
    const segments = reviewable(m)
    out.total += changeKeys(segments).length
    const pending = new Set(pendingKeys(segments, m.hunks))
    out.pending += pending.size
    for (const s of segments) {
      if (s.kind === 'text') continue
      const mine = segmentKeys(s).some((k) => pending.has(k))
      const label = resolveTarget(s.file).label
      if (mine && !out.notes.includes(label)) out.notes.push(label)
    }
  }
  return out
}

/** Open the sync thread in the chat, where each change has its card. */
export function reviewSync(): void {
  const app = useApp.getState()
  if (!app.settings?.ui.chatOpen) app.setUi({ chatOpen: true })
  useChat.getState().setActiveThread(SYNC_THREAD_ID)
}

function syncMessages(ids: string[]): { thread: Thread; message: ChatMessage }[] {
  const thread = useBook.getState().threads.find((t) => t.id === SYNC_THREAD_ID)
  if (!thread) return []
  return ids.flatMap((id) => {
    const message = thread.messages.find((m) => m.id === id)
    return message ? [{ thread, message }] : []
  })
}

/** Apply every pending change of the run, reply by reply, in the order of the replies. */
export async function acceptAllSync(ids: string[]): Promise<void> {
  const t = getT()
  let ok = 0
  let failed = 0
  for (const id of ids) {
    // The thread changes after each reply: read it again.
    const [found] = syncMessages([id])
    if (!found) continue
    const segments = reviewable(found.message)
    if (!pendingKeys(segments, found.message.hunks).length) continue
    const { states, replaced } = await acceptPending(segments, found.message.hunks)
    setHunkStates(found.thread, id, states, replaced)
    for (const s of Object.values(states)) {
      if (s === 'accepted') ok++
      else failed++
    }
  }
  if (failed) toast(t.chat.bulkPartial(ok, ok + failed, failed), { kind: 'error' })
  else if (ok) toast(t.plan.sync.accepted(ok))
}

/** Reject every pending change of the run. The toast can undo it. */
export function rejectAllSync(ids: string[]): void {
  const t = getT()
  const done: { id: string; keys: string[] }[] = []
  for (const { thread, message } of syncMessages(ids)) {
    const keys = pendingKeys(reviewable(message), message.hunks)
    if (!keys.length) continue
    setHunkStates(thread, message.id, Object.fromEntries(keys.map((k) => [k, 'rejected' as HunkState])))
    done.push({ id: message.id, keys })
  }
  const n = done.reduce((sum, d) => sum + d.keys.length, 0)
  if (!n) return
  toast(t.plan.sync.rejected(n), {
    ms: 8000,
    action: {
      label: t.common.undo,
      run: () => {
        for (const d of done) {
          const [found] = syncMessages([d.id])
          if (found) setHunkStates(found.thread, d.id, Object.fromEntries(d.keys.map((k) => [k, 'pending' as HunkState])))
        }
      }
    }
  })
}

/** Tell the end of a run. The card in the sidebar shows it; a toast too when the sidebar is not on screen. */
function finish(job: SyncJob): void {
  setJob(job)
  if (sidebarShows()) return
  const t = getT()
  if (job.state === 'failed') {
    toast(job.error, {
      kind: 'error',
      ...(job.settings ? { action: { label: t.plan.sync.openSettings, run: () => useUi.getState().openSettings('ai') } } : {})
    })
    return
  }
  if (job.state !== 'done') return
  const { pending } = syncResult(useBook.getState().threads.find((th) => th.id === SYNC_THREAD_ID), job.messageIds)
  if (pending) toast(t.plan.sync.proposed(pending), { ms: 10000, action: { label: t.plan.sync.review, run: reviewSync } })
  else toast(t.plan.sync.noChanges)
}

export async function startPlanningSync(opts: { bootstrap?: boolean } = {}): Promise<void> {
  if (current) return
  const t = getT()
  const settings = useApp.getState().settings
  const route = settings?.routes.sync ?? settings?.routes.chat ?? null
  if (!route) {
    finish({ state: 'failed', error: t.plan.sync.connectAiFirst, messageIds: [], settings: true, bootstrap: opts.bootstrap })
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

  const root = book.root
  const run = { cancel: (): void => {}, cancelled: false }
  current = run
  // Away from the Plan sidebar (an import starts the sync in the Write view), say where the progress is.
  if (!sidebarShows()) toast(t.plan.sync.started)
  const ids: string[] = []
  const groups = batches(todo)
  // The book of the run is still open
  const same = (): boolean => useBook.getState().root === root
  /** The user cancelled, or the provider stopped the reply */
  let stopped = false

  try {
    for (let i = 0; i < groups.length; i++) {
      if (!same()) return
      if (run.cancelled) {
        stopped = true
        break
      }
      const group = groups[i]
      setJob({ state: 'running', chapters: group.length, part: i + 1, parts: groups.length, writing: false, found: 0 })
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
          if (e.type !== 'text') return
          useChat.setState((s) => ({
            streaming: { ...s.streaming, [SYNC_THREAD_ID]: { messageId: assistantId, text: soFar, requestId: handle.id, cancel: handle.cancel } }
          }))
          // The progress changes only when a change is complete, not with each word.
          const job = useSyncJob.getState()
          const found = changeKeys(parseProposals(soFar)).length
          if (job.state === 'running' && (!job.writing || job.found !== found)) setJob({ ...job, writing: true, found })
        }
      )
      run.cancel = handle.cancel
      useChat.setState((s) => ({
        streaming: { ...s.streaming, [SYNC_THREAD_ID]: { messageId: assistantId, text: '', requestId: handle.id, cancel: handle.cancel } }
      }))
      const result = await handle.done
      useChat.setState((s) => ({ streaming: { ...s.streaming, [SYNC_THREAD_ID]: undefined } }))
      // The book closed meanwhile: its thread is not in the store any more.
      if (!same()) return

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
      ids.push(assistantId)
      if (!result.ok) {
        if (result.errorKind === 'cancelled' || run.cancelled) {
          stopped = true
          break
        }
        // Try again reads the chapters that still wait; a first pass starts again only when no part is done.
        finish({ state: 'failed', error: friendlyError(result), messageIds: ids, bootstrap: Boolean(opts.bootstrap) && i === 0 })
        return
      }
      // These chapters are now read. Their proposals wait in the thread. The hash is of the text that
      // the AI read: a chapter that the author changed while the sync ran still waits for the next sync.
      const st = useBook.getState()
      const hashes = { ...st.syncState.chapters }
      for (const c of group) {
        if (st.chapters.some((x) => x.id === c.id)) hashes[c.id] = hashText(c.body)
      }
      st.setSyncState({ chapters: hashes, syncedAt: new Date().toISOString() })
    }
    if (!same()) return
    if (stopped) {
      // A cancel keeps the changes that are complete; without any, nothing shows.
      const { pending } = syncResult(useBook.getState().threads.find((th) => th.id === SYNC_THREAD_ID), ids)
      setJob(pending ? { state: 'done', messageIds: ids } : { state: 'idle' })
      return
    }
    finish({ state: 'done', messageIds: ids })
  } finally {
    if (current === run) current = null
    // A run that ended without a result (another book) leaves no progress on screen.
    if (useSyncJob.getState().state === 'running') setJob({ state: 'idle' })
  }
}
