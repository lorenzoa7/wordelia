// Chat proposals in the text. Every change that the open chat thread proposes for a chapter, and
// that waits for a decision, shows in that chapter as a word diff with Accept and Reject, like a
// suggestion in a word processor. The chat card and the text show the same proposal: a decision in
// one place updates the other.
//
// - Only the current proposals show: the proposals of the replies after the last message of the
//   author. Older ones stay on their cards; "Show in text" on such a card brings it back to the text.
// - Two proposals for the same words: the newest shows. The card of the older one says so.
// - A change with an empty <find> adds text at the end: it shows after the last paragraph.
// - A new reply takes the author to its change, but never while the author types (typing.ts): then a
//   toast "Changes ready · Show" waits for a click.

import { useEffect } from 'react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { create } from 'zustand'
import { markdownToPlain, markdownToPlainBlocks } from '@shared/book'
import { findText } from '@shared/proposals/apply'
import { hunkKey, parseProposals } from '@shared/proposals/parse'
import { currentFrom } from '@shared/proposals/state'
import { wordDiff } from '@shared/text/diff'
import type { ChatMessage, Thread } from '@shared/types'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { getT } from '@/lib/i18n'
import { typesetForBook } from '@/lib/typeset'
import { useChat } from '@/features/chat/chatStore'
import { applyEditHunk, applyPortrait, markAfter, resolveTarget, restoreSnapshot, setHunkStates, snapshotOf } from '@/features/chat/applyProposal'
import { authorIsBusy } from '@/features/chat/typing'
import { rejectWithUndo } from '@/features/chat/undo'
import { SYNC_THREAD_ID } from '@/features/plan/sync'
import { currentDiffView, diffDecorations, proposedPlain, textWithMap } from './review'
import { useApp } from '@/stores/app'
import { chapterHasText, getChapterEditor, locateInChapter, scrollToPos, whenChapterEditor } from './registry'

export interface InlineProposal {
  /** `thread:message:hunk key` */
  id: string
  threadId: string
  messageId: string
  key: string
  /** A chapter or a planning entry */
  kind: 'chapter' | 'entry'
  /** The id of the chapter or the entry */
  docId: string
  /** The proposal file, as the AI wrote it */
  file: string
  /** Markdown, as the AI wrote it. Empty: the change adds its text at the end. */
  find: string
  replace: string
}

/** An image of the chat that the open thread proposes as the portrait of a note */
export interface PortraitProposal {
  /** `thread:message:hunk key` */
  id: string
  threadId: string
  messageId: string
  key: string
  /** The id of the planning entry */
  docId: string
  file: string
  /** The image, `_assets/…` */
  image: string
}

export function inlineProposalId(threadId: string, messageId: string, key: string): string {
  return `${threadId}:${messageId}:${key}`
}

interface InlineState {
  /** The proposals in the text, the newest first */
  list: InlineProposal[]
  /** Portraits that wait for a decision: the note shows the newest one in its portrait */
  portraits: PortraitProposal[]
  /** The proposal that "Show in text" points at, for a moment */
  focus: string | null
  /** An older proposal (id) whose words a newer pending proposal (id) changes too */
  replaced: Record<string, string>
}

export const useInlineProposals = create<InlineState>(() => ({ list: [], portraits: [], focus: null, replaced: {} }))

/** Old proposals that the author brought back to the text with "Show in text", for this session */
const revived = new Set<string>()

/** Where the current replies of a thread start. The planning sync has its own review: all its proposals are current. */
function currentOf(thread: Thread): number {
  return thread.id === SYNC_THREAD_ID ? 0 : currentFrom(thread.messages)
}

/** The current replies of a thread (the newest first), and the old replies with a proposal that the author brought back. */
function repliesOf(thread: Thread): ChatMessage[] {
  const from = currentOf(thread)
  return thread.messages.filter((m, i) => m.role === 'assistant' && (i >= from || [...revived].some((id) => id.startsWith(`${thread.id}:${m.id}:`)))).reverse()
}

/** The changes of a thread to chapters and planning entries that wait for a decision and show in the text, the newest first. */
export function pendingProposals(thread: Thread): InlineProposal[] {
  const out: InlineProposal[] = []
  const from = currentOf(thread)
  for (const m of repliesOf(thread)) {
    if (!m.content.includes('<edit')) continue
    const states = m.hunks ?? {}
    const old = thread.messages.indexOf(m) < from
    const mine: InlineProposal[] = []
    for (const seg of parseProposals(m.content)) {
      if (seg.kind !== 'edit') continue
      const target = resolveTarget(seg.file)
      if (target.kind !== 'chapter' && target.kind !== 'entry') continue
      const doc = target.kind === 'chapter' ? { kind: 'chapter' as const, docId: target.chapter.id } : { kind: 'entry' as const, docId: target.entry.id }
      seg.hunks.forEach((h, i) => {
        const key = hunkKey(seg.index, i)
        const state = states[key]
        const id = inlineProposalId(thread.id, m.id, key)
        if (!h.complete || (state && state !== 'pending')) return
        if (old && !revived.has(id)) return
        mine.push({ id, threadId: thread.id, messageId: m.id, key, ...doc, file: seg.file, find: h.find.trim() ? h.find : '', replace: h.replace })
      })
    }
    // In one reply, the last change of the same words wins too.
    out.push(...mine.reverse())
  }
  return out
}

/** The portraits that a thread proposes for notes and that wait for a decision, the oldest first. */
export function pendingPortraits(thread: Thread): PortraitProposal[] {
  const out: PortraitProposal[] = []
  for (const m of repliesOf(thread).reverse()) {
    if (!m.content.includes('<portrait')) continue
    for (const seg of parseProposals(m.content)) {
      if (seg.kind !== 'portrait' || !seg.complete || !seg.image) continue
      const target = resolveTarget(seg.file)
      if (target.kind !== 'entry') continue
      const key = hunkKey(seg.index, 0)
      const state = m.hunks?.[key]
      if (state && state !== 'pending') continue
      out.push({ id: inlineProposalId(thread.id, m.id, key), threadId: thread.id, messageId: m.id, key, docId: target.entry.id, file: seg.file, image: seg.image })
    }
  }
  return out
}

/** The plain text of a chapter or a note, as the editor has it, for the places of proposals. */
function plainOf(p: Pick<InlineProposal, 'kind' | 'docId'>): string {
  const book = useBook.getState()
  const body = p.kind === 'chapter' ? book.chapters.find((c) => c.id === p.docId)?.body : book.entries.find((e) => e.id === p.docId)?.body
  return body ? markdownToPlainBlocks(body) : ''
}

/** The changes of a thread to chapters and notes that wait or that the author accepted, the newest first. */
function liveEdits(thread: Thread): InlineProposal[] {
  const out: InlineProposal[] = []
  for (const m of [...thread.messages].reverse()) {
    if (m.role !== 'assistant' || !m.content.includes('<edit')) continue
    const mine: InlineProposal[] = []
    for (const seg of parseProposals(m.content)) {
      if (seg.kind !== 'edit') continue
      const target = resolveTarget(seg.file)
      if (target.kind !== 'chapter' && target.kind !== 'entry') continue
      const doc = target.kind === 'chapter' ? { kind: 'chapter' as const, docId: target.chapter.id } : { kind: 'entry' as const, docId: target.entry.id }
      seg.hunks.forEach((h, i) => {
        const key = hunkKey(seg.index, i)
        const state = m.hunks?.[key]
        if (!h.complete || !h.find.trim() || (state && state !== 'pending' && state !== 'accepted')) return
        mine.push({ id: inlineProposalId(thread.id, m.id, key), threadId: thread.id, messageId: m.id, key, ...doc, file: seg.file, find: h.find, replace: h.replace })
      })
    }
    out.push(...mine.reverse())
  }
  return out
}

/**
 * The older pending proposals whose words a newer proposal of another reply (pending or accepted)
 * changes too: id → id of the newer one. The words meet in the text, or one passage has the other.
 */
function replacedIn(thread: Thread): Record<string, string> {
  const all = liveEdits(thread)
  const out: Record<string, string> = {}
  const texts = new Map<string, string>()
  const places = all.map((p) => {
    const key = `${p.kind}:${p.docId}`
    if (!texts.has(key)) texts.set(key, plainOf(p))
    const needle = markdownToPlainBlocks(p.find)
    const m = findText(texts.get(key)!, needle)
    return { doc: key, needle: needle.replace(/\s+/g, ' ').trim(), range: m && m.count === 1 ? { from: m.start, to: m.end } : null }
  })
  const pending = (p: InlineProposal): boolean => {
    const state = thread.messages.find((m) => m.id === p.messageId)?.hunks?.[p.key]
    return !state || state === 'pending'
  }
  // `all` is the newest first: a proposal is replaced by a newer one that meets its words.
  all.forEach((p, i) => {
    if (!pending(p)) return
    const a = places[i]
    for (let j = 0; j < i; j++) {
      const b = places[j]
      if (b.doc !== a.doc || all[j].messageId === p.messageId) continue
      const meet = a.range && b.range ? b.range.from < a.range.to && a.range.from < b.range.to : false
      if (meet || (a.needle && b.needle && (a.needle.includes(b.needle) || b.needle.includes(a.needle)))) {
        out[p.id] = all[j].id
        return
      }
    }
  })
  return out
}

/** Use the image of a portrait proposal as the portrait of its note. */
export function acceptPortrait(thread: Thread, messageId: string, key: string, file: string, image: string): void {
  const res = applyPortrait(file, image)
  // Keep the image from before, so a rewind of the thread can bring it back.
  setHunkStates(thread, messageId, { [key]: res.ok ? 'accepted' : 'failed' }, res.ok ? { [key]: res.previous ?? '' } : undefined)
  if (!res.ok) toast(res.reason, { kind: 'error' })
  else toast(getT().chat.portraitSet(resolveTarget(file).label))
}

export function acceptPortraitProposal(p: PortraitProposal): void {
  const thread = threadOf(p)
  if (thread) acceptPortrait(thread, p.messageId, p.key, p.file, p.image)
}

export function rejectPortraitProposal(p: PortraitProposal): void {
  const thread = threadOf(p)
  if (thread) rejectWithUndo(thread, p.messageId, [p.key])
}

/* ------------------------------------------------------------------ */
/* A new reply: go to its change                                        */
/* ------------------------------------------------------------------ */

/** Replies that took the author to the place of their changes, or that were there before. */
const opened = new Set<string>()

/**
 * The note of the first change of a reply that is ready: '' for a change to a chapter (it shows in
 * its text by itself), null when no change is ready yet.
 */
function placeOf(content: string): string | null {
  if (!content.includes('<edit') && !content.includes('<portrait')) return null
  for (const seg of parseProposals(content)) {
    if (seg.kind !== 'edit' && seg.kind !== 'portrait') continue
    if (seg.kind === 'edit' ? !seg.hunks.some((h) => h.complete) : !seg.complete) continue
    const target = resolveTarget(seg.file)
    if (target.kind === 'chapter') return ''
    if (target.kind === 'entry') return target.entry.id
  }
  return null
}

/** The new replies of a thread with a change that is ready: the note of the first one to open, if any. */
function newPlace(thread: Thread): string | null {
  let place: string | null = null
  for (const m of thread.messages) {
    if (m.role !== 'assistant' || opened.has(m.id)) continue
    const p = placeOf(m.content)
    if (p === null) continue
    opened.add(m.id)
    if (p) place = p
  }
  return place
}

/** True when the thread shows in the chat now: not a new thread, not the thread list. */
function threadShows(threadId: string): boolean {
  const c = useChat.getState()
  return !c.blank && !c.listOpen && c.activeThreadId === threadId
}

/**
 * Go to the place of a new reply. While the author types, a toast waits instead: the author goes
 * there only with a click on "Show". One toast at a time: a newer reply takes the place of the older toast.
 */
function arrive(go: () => void): void {
  if (!authorIsBusy()) return go()
  const t = getT()
  const ui = useUi.getState()
  for (const old of ui.toasts.filter((x) => x.message === t.chat.changesReady)) ui.dismissToast(old.id)
  ui.toast(t.chat.changesReady, { ms: 12000, action: { label: t.chat.show, run: go } })
}

function sameList(a: InlineProposal[], b: InlineProposal[]): boolean {
  return a.length === b.length && a.every((p, i) => p.id === b[i].id && p.find === b[i].find && p.replace === b[i].replace && p.docId === b[i].docId)
}

function sameMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

/* ------------------------------------------------------------------ */
/* Accepted changes and Ctrl+Z                                          */
/* ------------------------------------------------------------------ */

/** Chapter changes that the author accepted in this session, newest last. Ctrl+Z can undo them. */
const accepted: InlineProposal[] = []
/** Accepted changes that Ctrl+Z took back: they are pending again. Ctrl+Y can bring them back. */
const undone: InlineProposal[] = []
/** Every proposal that showed in the text once: only a new one scrolls into view by itself */
const seen = new Set<string>()

function stateOf(p: InlineProposal): string | undefined {
  const m = threadOf(p)?.messages.find((x) => x.id === p.messageId)
  return m?.hunks?.[p.key]
}

/** The new text as it goes into the document: chapters get the typography of the book. */
function replaceText(p: InlineProposal): string {
  return p.kind === 'chapter' ? typesetForBook(p.replace) : p.replace
}

function remember(list: InlineProposal[], p: InlineProposal): void {
  const i = list.findIndex((x) => x.id === p.id)
  if (i >= 0) list.splice(i, 1)
  list.push(p)
  if (list.length > 30) list.shift()
}

/** Count of a passage in a document, in plain text: 0, 1 or 2 (two or more). */
function countIn(text: string, markdown: string): number {
  const needle = markdownToPlainBlocks(markdown)
  if (!needle) return 0
  const m = findText(text, needle)
  return m ? Math.min(2, m.count) : 0
}

/**
 * The text of a chapter changed. An accepted change whose old words are back (and its new words
 * gone) was undone: it is pending again and shows in the text. An undone change whose new words are
 * back was done again: it is accepted again.
 */
function checkUndo(docId: string, doc: EditorState['doc']): void {
  const mine = [...accepted, ...undone].filter((p) => p.docId === docId && p.find)
  if (!mine.length) return
  const { text } = textWithMap(doc, 0, doc.content.size)
  for (const p of mine) {
    const thread = threadOf(p)
    if (!thread) continue
    const oldBack = countIn(text, p.find) === 1
    const newThere = countIn(text, replaceText(p)) >= 1
    if (accepted.includes(p) && oldBack && !newThere) {
      accepted.splice(accepted.indexOf(p), 1)
      remember(undone, p)
      // The change is in the text again, also when its reply is old now.
      revived.add(p.id)
      setHunkStates(thread, p.messageId, { [p.key]: 'pending' })
    } else if (undone.includes(p) && !oldBack && newThere && stateOf(p) !== 'accepted') {
      undone.splice(undone.indexOf(p), 1)
      remember(accepted, p)
      setHunkStates(thread, p.messageId, { [p.key]: 'accepted' })
    }
  }
}

/**
 * Ctrl+Z when the cursor is not in a text (for example right after Accept in the chat): undo the
 * last accepted change in its chapter. Ctrl+Y or Ctrl+Shift+Z does it again.
 */
export function useProposalUndoKeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      const isUndo = key === 'z' && !e.shiftKey
      const isRedo = key === 'y' || (key === 'z' && e.shiftKey)
      if (!isUndo && !isRedo) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const p = isUndo ? accepted[accepted.length - 1] : undone[undone.length - 1]
      const ed = p && p.kind === 'chapter' ? getChapterEditor(p.docId) : null
      if (!ed) return
      e.preventDefault()
      ed.editor.commands.focus()
      if (isUndo) ed.editor.commands.undo()
      else ed.editor.commands.redo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** The thread whose proposals show in the text: the open thread; with no open thread, the thread with the newest activity. */
function shownThread(threads: Thread[], activeId: string | null): Thread | undefined {
  return threads.find((t) => t.id === activeId) ?? [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

let lastThread: string | null = null

/** Bring the proposals in the text up to date with the open thread. A new reply of the open thread takes the author to its change. */
function refresh(): void {
  const threads = useBook.getState().threads
  const thread = shownThread(threads, useChat.getState().activeThreadId)
  const list = thread ? pendingProposals(thread) : []
  const portraits = thread ? pendingPortraits(thread) : []
  const sameThread = thread?.id === lastThread
  lastThread = thread?.id ?? null
  const state = useInlineProposals.getState()
  const replaced = thread ? replacedIn(thread) : {}
  if (!sameMap(state.replaced, replaced)) useInlineProposals.setState({ replaced })
  if (state.portraits.map((p) => p.id).join('|') !== portraits.map((p) => p.id).join('|')) useInlineProposals.setState({ portraits })

  // A new reply of the thread where the author asked, and that shows in the chat.
  const moves = Boolean(thread && sameThread && thread.id !== SYNC_THREAD_ID && threadShows(thread.id))
  const note = thread ? newPlace(thread) : null

  const prev = state.list
  const changed = !sameList(prev, list)
  if (changed) {
    // Proposals that left the list because the author accepted them: Ctrl+Z can bring them back.
    for (const p of prev) if (!list.some((x) => x.id === p.id) && stateOf(p) === 'accepted') remember(accepted, p)
    useInlineProposals.setState({ list })
  }
  const fresh = list.filter((p) => !seen.has(p.id) && p.kind === 'chapter')
  for (const p of list) seen.add(p.id)
  if (!moves) return
  // The first change of the reply is for a note (or the story line): open its page. Else show the newest change in its chapter.
  if (note) {
    arrive(() => useBook.getState().selectEntry(note))
  } else if (changed && fresh.length) {
    const p = fresh[0]
    arrive(() => setTimeout(() => revealProposal(p.docId, p.find, p.id), 200))
  }
}

/** Keep the list of proposals in the text up to date with the open chat thread. */
export function useInlineProposalSync(): void {
  const threads = useBook((s) => s.threads)
  const files = useBook((s) => s.chapters.map((c) => `${c.id}=${c.file}`).join('|'))
  const activeId = useChat((s) => s.activeThreadId)
  useEffect(refresh, [threads, files, activeId])
}

/** Put an old proposal back in the text (its card has "Show in text"). */
export function reviveProposal(id: string): void {
  if (revived.has(id)) return
  revived.add(id)
  refresh()
}

/* ------------------------------------------------------------------ */
/* Decisions from the text                                              */
/* ------------------------------------------------------------------ */

function threadOf(p: { threadId: string }): Thread | undefined {
  return useBook.getState().threads.find((t) => t.id === p.threadId)
}

export function acceptInline(p: InlineProposal): void {
  const thread = threadOf(p)
  if (!thread) return
  const t = getT()
  const snap = snapshotOf(p.file)
  const res = applyEditHunk(p.file, { find: p.find, replace: p.replace, complete: true })
  setHunkStates(thread, p.messageId, { [p.key]: res.ok ? 'accepted' : 'failed' })
  if (!res.ok) {
    toast(res.reason, { kind: 'error' })
    return
  }
  markAfter(snap)
  const book = useBook.getState()
  const label = (p.kind === 'chapter' ? book.chapters.find((c) => c.id === p.docId)?.title : book.entries.find((e) => e.id === p.docId)?.name) ?? ''
  if (!snap) return
  toast(t.chat.changeApplied(label), {
    ms: 8000,
    action: {
      label: t.common.undo,
      run: () => {
        if (!restoreSnapshot(snap)) {
          toast(t.chat.undoUnsafe, { kind: 'error' })
          return
        }
        const latest = threadOf(p)
        revived.add(p.id)
        if (latest) setHunkStates(latest, p.messageId, { [p.key]: 'pending' })
      }
    }
  })
}

export function rejectInline(p: InlineProposal): void {
  const thread = threadOf(p)
  if (thread) rejectWithUndo(thread, p.messageId, [p.key])
}

/* ------------------------------------------------------------------ */
/* "Show in text"                                                       */
/* ------------------------------------------------------------------ */

let focusTimer: ReturnType<typeof setTimeout> | undefined

function markFocus(id: string | undefined): void {
  if (!id) return
  clearTimeout(focusTimer)
  useInlineProposals.setState({ focus: id })
  focusTimer = setTimeout(() => useInlineProposals.setState({ focus: null }), 1600)
}

/** Open the chapter when it has no editor (another page, or far from the screen), then run `go`. */
function inChapter(chapterId: string, go: () => void): void {
  const book = useBook.getState()
  if (book.view === 'write' && getChapterEditor(chapterId)) go()
  else {
    // Another page (Plan), or a chapter far from the screen, has no editor: open the chapter (the
    // Write view, at the chapter), then go to the change when its editor is there.
    book.selectChapter(chapterId)
    whenChapterEditor(chapterId, () => setTimeout(go, 60))
  }
}

/**
 * Scroll from where the user is to a chat proposal in its chapter, and mark it for a moment.
 * The proposal shows in the text already. Returns false when the passage is not in the chapter.
 * A change with an empty `find` adds text at the end: the chapter scrolls to its end.
 */
export function revealProposal(chapterId: string, find: string, id?: string): boolean {
  if (!find.trim()) {
    if (!useBook.getState().chapters.some((c) => c.id === chapterId)) return false
    inChapter(chapterId, () => {
      const ed = getChapterEditor(chapterId)
      if (!ed) return
      scrollToPos(ed.editor, ed.editor.state.doc.content.size, 'smooth')
      markFocus(id)
    })
    return true
  }
  if (!chapterHasText(chapterId, find)) return false
  inChapter(chapterId, () => {
    const hit = locateInChapter(chapterId, find)
    if (!hit) {
      toast(getT().chat.passageNotFound, { kind: 'error' })
      return
    }
    const { editor } = hit.editor
    const desk = editor.view.dom.closest('.desk') as HTMLElement | null
    // A long way: jump. A short way: glide, from where the user is now.
    const far = desk ? Math.abs(editor.view.coordsAtPos(hit.from).top - desk.getBoundingClientRect().top) > desk.clientHeight * 3 : false
    scrollToPos(editor, hit.from, far ? 'auto' : 'smooth')
    markFocus(id)
  })
  return true
}

/* ------------------------------------------------------------------ */
/* The editor plugin                                                    */
/* ------------------------------------------------------------------ */

export const inlineProposalsKey = new PluginKey<DecorationSet>('inlineProposals')

const SVG_NS = 'http://www.w3.org/2000/svg'
// Phosphor "Check" and "X", bold
const CHECK = 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z'
const CROSS =
  'M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z'

function iconButton(className: string, label: string, text: string, path: string, run: () => void): HTMLElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = className
  b.title = label
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 256 256')
  svg.setAttribute('aria-hidden', 'true')
  const p = document.createElementNS(SVG_NS, 'path')
  p.setAttribute('d', path)
  svg.appendChild(p)
  b.appendChild(svg)
  const span = document.createElement('span')
  span.textContent = text
  b.appendChild(span)
  // Keep the cursor and the selection in the text.
  b.addEventListener('mousedown', (e) => e.preventDefault())
  b.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    run()
  })
  return b
}

function actionsWidget(p: InlineProposal): HTMLElement {
  const t = getT()
  const el = document.createElement('span')
  el.className = 'pm-prop-actions'
  el.setAttribute('contenteditable', 'false')
  el.dataset.prop = p.id
  el.appendChild(iconButton('pm-prop-btn is-accept', t.chat.acceptChange, t.common.accept, CHECK, () => acceptInline(p)))
  el.appendChild(iconButton('pm-prop-btn is-reject', t.chat.rejectChange, t.common.reject, CROSS, () => rejectInline(p)))
  return el
}

/** A change that adds text at the end: the new paragraphs after the last one, with Accept and Reject. */
function appendWidget(p: InlineProposal, focus: boolean): HTMLElement {
  const box = document.createElement('div')
  box.className = `pm-prop pm-prop-append${focus ? ' is-focus' : ''}`
  box.setAttribute('contenteditable', 'false')
  box.dataset.prop = p.id
  const paras = markdownToPlain(replaceText(p))
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
  paras.forEach((text, i) => {
    const para = document.createElement('p')
    const ins = document.createElement('span')
    ins.className = 'ai-ins'
    ins.textContent = text
    para.appendChild(ins)
    if (i === paras.length - 1) para.appendChild(actionsWidget(p))
    box.appendChild(para)
  })
  return box
}

/** Find the passage of each proposal and draw its diff. Passages that are not found once stay out. */
function build(state: EditorState, list: InlineProposal[], focus: string | null): DecorationSet {
  if (!list.length) return DecorationSet.empty
  const doc = state.doc
  const { text, map } = textWithMap(doc, 0, doc.content.size)
  const taken: Array<{ from: number; to: number }> = []
  const decos: Decoration[] = []
  let appended = false
  // The newest first: two proposals for the same words show the newest.
  for (const p of list) {
    if (!p.find) {
      // One addition at the end at a time: the newest.
      if (appended) continue
      appended = true
      decos.push(
        Decoration.widget(doc.content.size, () => appendWidget(p, focus === p.id), {
          side: 1,
          key: `prop-append-${p.id}-${focus === p.id ? 'f' : ''}`,
          ignoreSelection: true,
          stopEvent: () => true
        })
      )
      continue
    }
    // Block by block, like the editor: a list item of a note has no "- " in the text.
    const needle = markdownToPlainBlocks(p.find)
    if (!needle) continue
    const m = findText(text, needle)
    if (!m || m.count > 1) continue
    const from = map[m.start]
    const to = map[m.end - 1] + 1
    if (taken.some((r) => from < r.to && to > r.from)) continue
    taken.push({ from, to })
    const original = textWithMap(doc, from, to).text
    const ops = wordDiff(original, proposedPlain(replaceText(p)))
    decos.push(...diffDecorations(doc, from, to, ops, p.id, currentDiffView()))
    decos.push(Decoration.inline(from, to, { class: `pm-prop${focus === p.id ? ' is-focus' : ''}`, 'data-prop': p.id }))
    decos.push(
      Decoration.widget(to, () => actionsWidget(p), {
        side: 1,
        key: `prop-actions-${p.id}`,
        ignoreSelection: true,
        stopEvent: () => true
      })
    )
  }
  return DecorationSet.create(doc, decos)
}

export interface InlineProposalsOptions {
  /** The chapter or the planning entry of this editor */
  docId: () => string
}

// Test runs (WORDELIA_E2E) can reach the proposals in the text.
if (typeof window !== 'undefined' && window.wordelia?.isE2E) {
  ;(window as unknown as Record<string, unknown>).__inline = { revealProposal, useInlineProposals, useChat, authorIsBusy }
}

export const InlineProposals = Extension.create<InlineProposalsOptions>({
  name: 'inlineProposals',

  addOptions() {
    return { docId: () => '' }
  },

  addProseMirrorPlugins() {
    const opts = this.options
    return [
      new Plugin<DecorationSet>({
        key: inlineProposalsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(inlineProposalsKey) as DecorationSet | undefined
            if (meta) return meta
            return tr.docChanged ? set.map(tr.mapping, tr.doc) : set
          }
        },
        props: {
          decorations: (state) => inlineProposalsKey.getState(state)
        },
        view(view) {
          let timer: ReturnType<typeof setTimeout> | undefined
          const rebuild = (): void => {
            if (view.isDestroyed) return
            const id = opts.docId()
            checkUndo(id, view.state.doc)
            const { list, focus } = useInlineProposals.getState()
            const mine = list.filter((p) => p.docId === id)
            // Nothing to show and nothing shown: no transaction.
            if (!mine.length && inlineProposalsKey.getState(view.state) === DecorationSet.empty) return
            const set = build(view.state, mine, focus)
            view.dispatch(view.state.tr.setMeta(inlineProposalsKey, set).setMeta('addToHistory', false).setMeta('allowDuringReview', true))
          }
          const unsubscribe = useInlineProposals.subscribe(rebuild)
          // A new view of the changes (words, stacked, new): draw the proposals again.
          const unsubscribeView = useApp.subscribe((s, prev) => {
            if (s.settings?.editor.diffView !== prev.settings?.editor.diffView) rebuild()
          })
          // After the editor is ready.
          const first = setTimeout(rebuild, 0)
          return {
            update(v, prev) {
              // The user typed: find the passages again after a pause. A passage that changed drops out.
              if (v.state.doc === prev.doc) return
              clearTimeout(timer)
              timer = setTimeout(rebuild, 250)
            },
            destroy() {
              unsubscribe()
              unsubscribeView()
              clearTimeout(timer)
              clearTimeout(first)
            }
          }
        }
      })
    ]
  }
})
