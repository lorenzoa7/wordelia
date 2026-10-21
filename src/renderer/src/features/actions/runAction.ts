// Run an action (for example Polish) on the selection of a chapter, and show its result as a review.
//
// One run and one review in the book at a time: a new run ends the review that is open and stops its
// request. Each run has its own request and its own word counter. Esc and Stop stop the request.
// The action again during a review (the cursor in the passage, or the focus on the review bar) runs
// on the same passage: it is a retry.

import { serializeMarkdown } from '@shared/markdown/serialize'
import { buildActionSystem, buildActionUser, extractRewrite, replyWithoutRewrite, tidyRewrite } from '@shared/prompts/action'
import { contextAround } from '@shared/prompts/context'
import { hasChanges } from '@shared/text/diff'
import type { AiAction, CompletionResult, DocNode, ModelChoice, ProviderId } from '@shared/types'
import { friendlyError, runCompletion, type RunHandle } from '@/lib/ai'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { chapterEditors, getActiveEditor, getChapterEditor, whenChapterEditor, type ChapterEditor } from '@/features/editor/registry'
import { cursorInPassage, dropReview, onReviewEnd, reviewKey, reviewOps, reviewText, textWithMap, useReviewHost, type ReviewData } from '@/features/editor/review'
import { create } from 'zustand'
import { normalizeRange } from './range'
import { SNAPSHOT_EN, snapshot } from '@/features/history/snapshots'
import { actionInstructions, getT } from '@/lib/i18n'
import { typesetForBook } from '@/lib/typeset'
import { nearestEffort } from '@shared/ai/effort'
import { PROVIDER_LABELS } from '@shared/ai/routes'
import { findAction } from './allActions'
import { actionLabel } from './names'

interface ActionRunState {
  running: boolean
  /** Words of the rewrite so far, of the run that works now */
  words: number
  actionId: string | null
}

export const useActionRun = create<ActionRunState>(() => ({ running: false, words: 0, actionId: null }))

interface Run {
  reviewId: string
  handle: RunHandle | null
  stopped: boolean
}

/** The run that works now. Only this run changes the word counter. */
let current: Run | null = null
let seq = 0
/** Reviews whose editor closed while the AI worked, by review id: the result goes back to the chapter. */
const lost = new Map<string, ReviewData>()
/** A finished review whose editor is closed (the Plan view, a chapter far from the screen). It shows again with its editor. */
let waiting: ReviewData | null = null

function stop(run: Run): void {
  run.stopped = true
  run.handle?.cancel()
  if (current === run) {
    current = null
    useActionRun.setState({ running: false, words: 0 })
  }
}

// A review that ends while the AI works stops its request: Esc, Stop, a new review, a reload of the chapter.
onReviewEnd((e) => {
  if (e.lost) {
    // The editor closed: the request goes on, and the change waits for the chapter.
    if (e.data.phase === 'ready') keepForReturn(e.data)
    else lost.set(e.id, e.data)
    return
  }
  if (current && current.reviewId === e.id) stop(current)
})

/** Stop the action that works now, and close the review of the book. */
export function cancelAction(): void {
  if (current) stop(current)
  waiting = null
  const host = useReviewHost.getState().editor
  if (host && !host.isDestroyed) host.commands.rejectReview()
}

/** End every review of the book (a new one starts), without moving the cursor. */
function endReviews(): void {
  waiting = null
  for (const e of chapterEditors()) dropReview(e.editor)
  if (current) stop(current)
}

/** Show a change again when the editor of its chapter is there, if the text of the passage did not change. */
function keepForReturn(data: ReviewData): void {
  if (!data.docId) return
  waiting = data
  whenChapterEditor(data.docId, (e) => {
    if (waiting !== data) return
    waiting = null
    const doc = e.editor.state.doc
    if (data.to > doc.content.size || reviewText(doc, data.from, data.to).text !== data.original) {
      toast(getT().write.action.changedMeanwhile)
      return
    }
    const ops = reviewOps(doc, data.from, data.to, data.proposed)
    if (!hasChanges(ops)) return
    for (const other of chapterEditors()) if (other !== e) dropReview(other.editor)
    e.editor.commands.resumeReview({ ...data, ops, phase: 'ready' })
  })
}

/** False when the provider is not on this computer or not connected; undefined when the app does not know yet. */
export function providerReady(p: ProviderId): boolean | undefined {
  // A provider that this version of the app does not know (a book from a newer version)
  if (!(p in PROVIDER_LABELS)) return false
  const app = useApp.getState()
  if (app.settings?.providers[p]?.enabled === false) return false
  const st = app.status[p]
  return st ? Boolean(st.installed && st.loggedIn !== false) : undefined
}

/**
 * The model of an action: its own model, else the model of Actions. A book from another computer can
 * name a provider that this computer does not have: then the action uses the model of Actions.
 */
export function actionRoute(action: AiAction): ModelChoice | null {
  const settings = useApp.getState().settings
  const task = settings?.routes.action ?? settings?.routes.chat ?? null
  const own = action.route && (providerReady(action.route.provider) !== false || !task) ? action.route : null
  const base = own ?? task
  if (!base) return null
  // The action can set its own effort over the effort of its model setting.
  const baseModel = useApp.getState().models[base.provider]?.find((m) => m.id === base.model)
  const effort = action.effort ? nearestEffort(action.effort, baseModel) : base.effort
  return { provider: base.provider, model: base.model, ...(effort ? { effort } : {}) }
}

/** The review to run again: the cursor is in its passage, or the review bar has the focus. */
function reviewToRetry(): { editor: ChapterEditor; review: ReviewData } | null {
  const host = useReviewHost.getState().editor
  if (!host || host.isDestroyed) return null
  const review = reviewKey.getState(host.state)
  if (!review) return null
  const inBar = Boolean(document.activeElement?.closest('.review-bar'))
  if (!inBar && !(host.view.hasFocus() && cursorInPassage(host.state, review))) return null
  const editor = chapterEditors().find((e) => e.editor === host)
  return editor ? { editor, review } : null
}

interface RunOptions {
  /** The chapter to run in (else the review to retry, else the active chapter) */
  editor?: ChapterEditor
  /** The selection of the author to give back when the review ends without a change */
  selection?: { anchor: number; head: number }
}

/** Run an action on [from, to], or on the selection, or on the paragraph of the cursor. */
export async function runAction(action: AiAction, range?: { from: number; to: number }, opts: RunOptions = {}): Promise<void> {
  const t = getT()
  const retry = !range && !opts.editor ? reviewToRetry() : null
  const active = opts.editor ?? retry?.editor ?? getActiveEditor()
  if (!active || active.editor.isDestroyed) return
  const { editor } = active
  const route = actionRoute(action)
  if (!route) {
    toast(t.write.action.connectFirst, { action: { label: t.write.action.openSettings, run: () => useUi.getState().openSettings('ai') } })
    return
  }
  const hint = (): void => toast(t.write.action.nothingSelected)

  const doc = editor.state.doc
  let from: number
  let to: number
  let selection = opts.selection ?? { anchor: editor.state.selection.anchor, head: editor.state.selection.head }
  if (retry) {
    // The same passage, not the paragraph of the cursor: the cursor is at the end of the passage now.
    ;({ from, to } = retry.review)
    selection = retry.review.selection
  } else {
    ;({ from, to } = range ?? editor.state.selection)
    if (from === to) {
      const $from = editor.state.selection.$from
      if (!$from.parent.isTextblock || !$from.parent.textContent.trim()) return hint()
      from = $from.start()
      to = $from.end()
    }
    ;({ from, to } = normalizeRange(doc, from, to))
    if (from >= to) return hint()
  }

  // The selection as Markdown keeps *italic*, the paragraphs and the scene breaks.
  const slice = doc.slice(from, to, true)
  const selectionDoc = editor.schema.topNodeType.create(null, slice.content)
  const selectionMd = serializeMarkdown(selectionDoc.toJSON() as DocNode).trim()
  if (!selectionMd || !textWithMap(doc, from, to).text.trim()) return hint()

  const full = textWithMap(doc, 0, doc.content.size)
  const startIdx = full.map.findIndex((p) => p >= from)
  const endIdx = full.map.findIndex((p) => p >= to)
  const ctx = contextAround(full.text, startIdx < 0 ? full.text.length : startIdx, endIdx < 0 ? full.text.length : endIdx, action.contextChars)

  const book = useBook.getState()
  const chapterId = active.chapterId
  const chapter = book.chapters.find((c) => c.id === chapterId)
  if (!book.manifest) return
  const input = {
    book: { manifest: book.manifest, writingRules: book.writingRules, entries: book.entries },
    // Built-in instructions that the user did not change go in the interface language, as the settings show them.
    action: { ...action, instructions: actionInstructions(t, action) },
    before: ctx.before,
    selection: selectionMd,
    after: ctx.after,
    chapterTitle: chapter?.title ?? ''
  }

  // One review in the book at a time: the review that is open ends, and its request stops.
  endReviews()
  const id = `review-${++seq}`
  const run: Run = { reviewId: id, handle: null, stopped: false }
  current = run
  useActionRun.setState({ running: true, words: 0, actionId: action.id })
  // Collapse the selection: the review marks show the range, and the selection menu closes.
  // The label is the name as the settings show it, also for a built-in action that moved to the book.
  const label = actionLabel(t, action)
  editor.chain().setTextSelection(to).startReview({ id, from, to, label, actionId: action.id, docId: chapterId, selection }).run()

  const handle = runCompletion(
    {
      route,
      purpose: 'action',
      system: buildActionSystem(input),
      messages: [{ role: 'user', content: buildActionUser(input) }]
    },
    (e, text) => {
      if (current === run && e.type === 'text') useActionRun.setState({ words: (extractRewrite(text).text.match(/\S+/g) ?? []).length })
    }
  )
  run.handle = handle
  const result = await handle.done
  if (current === run) {
    current = null
    useActionRun.setState({ running: false, words: 0 })
  }
  if (run.stopped) return
  finish(result, { id, action, label, chapterId, editor: active, selectionMd })
}

/** The result of a run: a review to decide, or a message. */
function finish(result: CompletionResult, run: { id: string; action: AiAction; label: string; chapterId: string; editor: ChapterEditor; selectionMd: string }): void {
  const t = getT()
  const { id, action, chapterId } = run
  // The book closed, or another book opened, while the AI worked: nothing to show.
  if (!useBook.getState().chapters.some((c) => c.id === chapterId)) {
    lost.delete(id)
    return
  }
  // The editor of the chapter can be gone (the Plan view, a far scroll): the change then waits for it.
  const live = run.editor.editor.isDestroyed ? null : run.editor.editor
  const review = live ? reviewKey.getState(live.state) : (lost.get(id) ?? null)
  lost.delete(id)
  if (!review || review.id !== id) return // ended meanwhile
  const end = (): void => {
    if (live) live.commands.rejectReview()
  }
  const again = { label: t.common.retry, run: () => runAgain(action, chapterId, review) }

  if (!result.ok) {
    end()
    if (result.errorKind === 'cancelled') return
    const connect = result.errorKind === 'not-logged-in' || result.errorKind === 'not-installed'
    toast(friendlyError(result), { kind: 'error', action: connect ? { label: t.write.action.openSettings, run: () => useUi.getState().openSettings('ai') } : again })
    return
  }
  const raw = extractRewrite(result.text).text
  if (!raw.trim()) {
    // No <rewrite> tags: the words of the AI are a message, never text for the book.
    end()
    const said = replyWithoutRewrite(result.text)
    toast(said ? t.write.action.aiSays(clip(said)) : t.write.action.noRewrite, { action: again, ...(said ? { ms: 15000 } : {}) })
    return
  }
  const rewrite = typesetForBook(tidyRewrite(raw, run.selectionMd))
  if (live && !hasChanges(reviewOps(live.state.doc, review.from, review.to, rewrite))) {
    if (window.wordelia.isE2E) console.warn('[action reply]', JSON.stringify(result.text.slice(0, 3000)))
    end()
    toast(t.write.action.nothingToChange)
    return
  }
  // Keep the text before the AI change in the version history. The label stays in English; the history translates it.
  snapshot(chapterId, SNAPSHOT_EN.before(action.name))
  if (live) live.commands.updateReview(id, rewrite, 'ready')
  else keepForReturn({ ...review, proposed: rewrite, phase: 'ready' })
  // The author went to the Plan view meanwhile: say that the change waits in the chapter.
  if (useBook.getState().view !== 'write') {
    const title = useBook.getState().chapters.find((c) => c.id === chapterId)?.title ?? ''
    toast(t.write.action.readyIn(run.label, title), { action: { label: t.write.action.show, run: () => useBook.getState().selectChapter(chapterId) } })
  }
}

/** "Try again" of a message: the same action on the same passage, when its text did not change; else on the selection. */
function runAgain(action: AiAction, chapterId: string, r: ReviewData): void {
  const go = (e: ChapterEditor): void => {
    const doc = e.editor.state.doc
    const same = r.to <= doc.content.size && reviewText(doc, r.from, r.to).text === r.original
    e.editor.commands.focus()
    void runAction(action, same ? { from: r.from, to: r.to } : undefined, { editor: e, ...(same ? { selection: r.selection } : {}) })
  }
  const e = getChapterEditor(chapterId)
  if (e) return go(e)
  useBook.getState().selectChapter(chapterId)
  whenChapterEditor(chapterId, go)
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 240 ? `${one.slice(0, 239).trimEnd()}…` : one
}

/** Retry of the review bar: the action of the review again, on its passage. */
export async function retryAction(): Promise<void> {
  const host = useReviewHost.getState().editor
  const review = host && !host.isDestroyed ? reviewKey.getState(host.state) : null
  const editor = host ? chapterEditors().find((e) => e.editor === host) : undefined
  const action = findAction(review?.actionId ?? useActionRun.getState().actionId)
  if (!review || !action || !editor) return
  await runAction(action, { from: review.from, to: review.to }, { editor, selection: review.selection })
}

// Test runs (WORDELIA_E2E) read the state of the run.
if (typeof window !== 'undefined' && window.wordelia?.isE2E) {
  ;(window as unknown as Record<string, unknown>).__actionRun = useActionRun
}
