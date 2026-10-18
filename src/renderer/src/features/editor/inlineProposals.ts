// Chat proposals in the text. Every change that the open chat thread proposes for a chapter, and
// that waits for a decision, shows in that chapter as a word diff with Accept and Reject, like a
// suggestion in a word processor. The chat card and the text show the same proposal: a decision in
// one place updates the other.

import { useEffect, useRef } from 'react'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { create } from 'zustand'
import { markdownToPlain } from '@shared/book'
import { findText } from '@shared/proposals/apply'
import { hunkKey, parseProposals } from '@shared/proposals/parse'
import { wordDiff } from '@shared/text/diff'
import type { Thread } from '@shared/types'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { getT } from '@/lib/i18n'
import { typesetForBook } from '@/lib/typeset'
import { useChat } from '@/features/chat/chatStore'
import { applyEditHunk, markAfter, resolveTarget, restoreSnapshot, setHunkStates, snapshotOf } from '@/features/chat/applyProposal'
import { diffDecorations, proposedPlain, textWithMap } from './review'
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
  /** Markdown, as the AI wrote it */
  find: string
  replace: string
}

export function inlineProposalId(threadId: string, messageId: string, key: string): string {
  return `${threadId}:${messageId}:${key}`
}

interface InlineState {
  list: InlineProposal[]
  /** The proposal that "Show in text" points at, for a moment */
  focus: string | null
}

export const useInlineProposals = create<InlineState>(() => ({ list: [], focus: null }))

/** The changes of a thread to chapters and planning entries that wait for a decision. */
export function pendingProposals(thread: Thread): InlineProposal[] {
  const out: InlineProposal[] = []
  for (const m of thread.messages) {
    if (m.role !== 'assistant' || !m.content.includes('<edit')) continue
    const states = m.hunks ?? {}
    for (const seg of parseProposals(m.content)) {
      if (seg.kind !== 'edit') continue
      const target = resolveTarget(seg.file)
      if (target.kind !== 'chapter' && target.kind !== 'entry') continue
      const doc = target.kind === 'chapter' ? { kind: 'chapter' as const, docId: target.chapter.id } : { kind: 'entry' as const, docId: target.entry.id }
      seg.hunks.forEach((h, i) => {
        const key = hunkKey(seg.index, i)
        const state = states[key]
        if (!h.complete || !h.find.trim() || (state && state !== 'pending')) return
        out.push({
          id: inlineProposalId(thread.id, m.id, key),
          threadId: thread.id,
          messageId: m.id,
          key,
          ...doc,
          file: seg.file,
          find: h.find,
          replace: h.replace
        })
      })
    }
  }
  return out
}

function sameList(a: InlineProposal[], b: InlineProposal[]): boolean {
  return a.length === b.length && a.every((p, i) => p.id === b[i].id && p.find === b[i].find && p.replace === b[i].replace && p.docId === b[i].docId)
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
  const needle = markdownToPlain(markdown).trim()
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
  const mine = [...accepted, ...undone].filter((p) => p.docId === docId)
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

/** Keep the list of proposals in the text up to date with the open chat thread. */
export function useInlineProposalSync(): void {
  const threads = useBook((s) => s.threads)
  const files = useBook((s) => s.chapters.map((c) => `${c.id}=${c.file}`).join('|'))
  const activeId = useChat((s) => s.activeThreadId)
  const lastThread = useRef<string | null>(null)
  useEffect(() => {
    // The open thread; with no open thread, the thread with the newest activity.
    const thread = threads.find((t) => t.id === activeId) ?? [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
    const list = thread ? pendingProposals(thread) : []
    const prev = useInlineProposals.getState().list
    if (sameList(prev, list)) return
    // Proposals that left the list because the author accepted them: Ctrl+Z can bring them back.
    for (const p of prev) if (!list.some((x) => x.id === p.id) && stateOf(p) === 'accepted') remember(accepted, p)
    useInlineProposals.setState({ list })
    // A new reply with proposals in the same thread: show the last new one in the text.
    const sameThread = thread?.id === lastThread.current
    const fresh = list.filter((p) => !seen.has(p.id) && p.kind === 'chapter')
    for (const p of list) seen.add(p.id)
    lastThread.current = thread?.id ?? null
    if (sameThread && fresh.length) {
      const p = fresh[fresh.length - 1]
      setTimeout(() => revealProposal(p.docId, p.find, p.id), 200)
    }
  }, [threads, files, activeId])
}

/* ------------------------------------------------------------------ */
/* Decisions from the text                                              */
/* ------------------------------------------------------------------ */

function threadOf(p: InlineProposal): Thread | undefined {
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
        if (latest) setHunkStates(latest, p.messageId, { [p.key]: 'pending' })
      }
    }
  })
}

export function rejectInline(p: InlineProposal): void {
  const thread = threadOf(p)
  if (thread) setHunkStates(thread, p.messageId, { [p.key]: 'rejected' })
}

/* ------------------------------------------------------------------ */
/* "Show in text"                                                       */
/* ------------------------------------------------------------------ */

let focusTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Scroll from where the user is to a chat proposal in its chapter, and mark it for a moment.
 * The proposal shows in the text already. Returns false when the passage is not in the chapter.
 */
export function revealProposal(chapterId: string, find: string, id?: string): boolean {
  if (!chapterHasText(chapterId, find)) return false
  const go = (): void => {
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
    if (id) {
      clearTimeout(focusTimer)
      useInlineProposals.setState({ focus: id })
      focusTimer = setTimeout(() => useInlineProposals.setState({ focus: null }), 1600)
    }
  }
  if (getChapterEditor(chapterId)) {
    go()
  } else {
    // A chapter far from the screen has no editor yet: the active chapter always has one.
    useBook.getState().setActiveChapter(chapterId)
    whenChapterEditor(chapterId, () => setTimeout(go, 60))
  }
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

/** Find the passage of each proposal and draw its diff. Passages that are not found once stay out. */
function build(state: EditorState, list: InlineProposal[], focus: string | null): DecorationSet {
  if (!list.length) return DecorationSet.empty
  const doc = state.doc
  const { text, map } = textWithMap(doc, 0, doc.content.size)
  const taken: Array<{ from: number; to: number }> = []
  const decos: Decoration[] = []
  for (const p of list) {
    const needle = markdownToPlain(p.find).trim()
    if (!needle) continue
    const m = findText(text, needle)
    if (!m || m.count > 1) continue
    const from = map[m.start]
    const to = map[m.end - 1] + 1
    // Two proposals for the same words: show the first.
    if (taken.some((r) => from < r.to && to > r.from)) continue
    taken.push({ from, to })
    const original = textWithMap(doc, from, to).text
    const ops = wordDiff(original, proposedPlain(replaceText(p)))
    decos.push(...diffDecorations(doc, from, to, ops, p.id))
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
  ;(window as unknown as Record<string, unknown>).__inline = { revealProposal, useInlineProposals, useChat }
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
              clearTimeout(timer)
              clearTimeout(first)
            }
          }
        }
      })
    ]
  }
})
