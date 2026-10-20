// Chat proposals for the story line. The Line view shows the board with the changes of the
// proposal: each change (a card that goes away, a card that comes, a new text, a column) has Apply
// and Reject; "Apply all" and "Reject all" are on the board and in the chat. A decision in one
// place updates the other: the decisions are in the message (`hunks`, with `line:<change id>` keys).
//
// The proposed board is kept in the message at the first decision (`lineAfter`): the changes are
// then always found between the line now and that board, also after some of them are applied.

import { useMemo } from 'react'
import { PLANNING_DIR, entryToFile } from '@shared/book'
import { readFrontmatter } from '@shared/markdown/frontmatter'
import { applyHunk } from '@shared/proposals/apply'
import { hunkKey, parseProposals, type Segment } from '@shared/proposals/parse'
import { STORY_LINE_TYPE, applyBoardChange, findStoryLine, isStoryLine, parseBoard, pendingChanges, type Board, type BoardChange } from '@shared/storyline'
import type { ChatMessage, HunkState, Thread } from '@shared/types'
import { getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { useChat } from '@/features/chat/chatStore'
import { latestThread } from '@/features/chat/threads'
import { markAfter, resolveTarget, restoreSnapshot, snapshotOf } from '@/features/chat/applyProposal'
import { saveBoard } from './model'

export type LineSegment = Extract<Segment, { kind: 'edit' }> | Extract<Segment, { kind: 'create' }>

const LINE = 'line:'

/** True when a proposal changes the story line: an edit of it, or a new text for it (or a new story line). */
export function isLineSegment(seg: Segment): boolean {
  if (seg.kind !== 'edit' && seg.kind !== 'create') return false
  const target = resolveTarget(seg.file)
  if (target.kind === 'entry') return isStoryLine(target.entry)
  return seg.kind === 'create' && target.kind === 'new-entry' && readFrontmatter(seg.content).data.type === STORY_LINE_TYPE
}

/** The keys of a segment that wait for a decision. */
function pendingOf(seg: LineSegment, states: Record<string, HunkState>): string[] {
  const keys = seg.kind === 'create' ? (seg.complete ? [hunkKey(seg.index, 0)] : []) : seg.hunks.flatMap((h, i) => (h.complete ? [hunkKey(seg.index, i)] : []))
  return keys.filter((k) => !states[k] || states[k] === 'pending')
}

export interface LineProposal {
  /** `thread:message`, to know when the proposal on screen changes */
  id: string
  thread: Thread
  message: ChatMessage
  segments: LineSegment[]
  /** The keys of the segments that wait for a decision */
  keys: string[]
  /** The body now ('' when the book has no story line) */
  before: string
  /** The proposed body; null when an edit does not fit the line any more */
  after: string | null
  /** The changes that the author rejected */
  rejected: Set<string>
  /** The changes that wait for a decision */
  changes: BoardChange[]
}

/** The proposals of one message for the story line that wait for a decision, or null. */
export function messageLineProposal(thread: Thread, message: ChatMessage, body: string | null): LineProposal | null {
  if (message.role !== 'assistant' || !/<(edit|create)\s/.test(message.content)) return null
  const states = message.hunks ?? {}
  const segments = parseProposals(message.content)
    .filter((s): s is LineSegment => isLineSegment(s))
    .filter((s) => pendingOf(s, states).length)
  if (!segments.length) return null
  let after: string | null = message.lineAfter ?? body ?? ''
  if (message.lineAfter === undefined) {
    for (const s of segments) {
      if (after === null) break
      if (s.kind === 'create') {
        after = readFrontmatter(s.content).body
        continue
      }
      for (let i = 0; i < s.hunks.length && after !== null; i++) {
        if (!pendingOf(s, states).includes(hunkKey(s.index, i))) continue
        const res = applyHunk(after, s.hunks[i].find, s.hunks[i].replace)
        after = res.ok ? res.text : null
      }
    }
  }
  const rejected = new Set(Object.entries(states).flatMap(([k, v]) => (k.startsWith(LINE) && v === 'rejected' ? [k.slice(LINE.length)] : [])))
  const chapters = useBook.getState().chapters
  return {
    id: `${thread.id}:${message.id}`,
    thread,
    message,
    segments,
    keys: segments.flatMap((s) => pendingOf(s, states)),
    before: body ?? '',
    after,
    rejected,
    changes: after === null ? [] : pendingChanges(parseBoard(body ?? ''), parseBoard(after), chapters, rejected)
  }
}

/** The newest message of a thread with proposals for the story line that wait for a decision. */
export function lineProposalOf(thread: Thread | undefined, body: string | null): LineProposal | null {
  if (!thread) return null
  for (let m = thread.messages.length - 1; m >= 0; m--) {
    const p = messageLineProposal(thread, thread.messages[m], body)
    if (p) return p
  }
  return null
}

/** The thread whose proposals show in the book: the open thread, else the newest one. */
function proposalThread(threads: Thread[], activeId: string | null): Thread | undefined {
  return threads.find((t) => t.id === activeId) ?? latestThread(threads)
}

/** The proposal for the story line that waits for a decision, if any. */
export function useLineProposal(): LineProposal | null {
  const threads = useBook((s) => s.threads)
  const entries = useBook((s) => s.entries)
  const chapters = useBook((s) => s.chapters)
  const activeId = useChat((s) => s.activeThreadId)
  return useMemo(() => {
    const story = findStoryLine(entries)
    return lineProposalOf(proposalThread(threads, activeId), story ? story.body : null)
  }, [threads, entries, chapters, activeId])
}

/** The AI writes a proposal for the story line now. */
export function useLineWriting(): boolean {
  const activeId = useChat((s) => s.activeThreadId)
  const text = useChat((s) => (activeId ? s.streaming[activeId]?.text : undefined))
  const entries = useBook((s) => s.entries)
  return useMemo(() => {
    if (!text || !/<(edit|create)\s/.test(text) || !entries) return false
    // A text that is still coming can have a front matter that is cut.
    return parseProposals(text).some((s) => isLineSegment(s) || (s.kind === 'create' && /^type:\s*["']?story-line/m.test(s.content)))
  }, [text, entries])
}

/* ------------------------------------------------------------------ */
/* Decisions                                                            */
/* ------------------------------------------------------------------ */

/** Change the message of a proposal in its thread: decisions, and the kept proposed line. */
function updateMessage(p: LineProposal, hunks: Record<string, HunkState | undefined>, lineAfter?: string): void {
  const latest = useBook.getState().threads.find((x) => x.id === p.thread.id)
  // The thread was deleted meanwhile: do not bring it back.
  if (!latest) return
  const messages = latest.messages.map((m) => {
    if (m.id !== p.message.id) return m
    const next: Record<string, HunkState> = { ...(m.hunks ?? {}) }
    for (const [k, v] of Object.entries(hunks)) {
      if (v) next[k] = v
      else delete next[k]
    }
    return { ...m, hunks: next, ...(lineAfter !== undefined && m.lineAfter === undefined ? { lineAfter } : {}) }
  })
  useBook.getState().saveThread({ ...latest, messages })
}

/** The board of the line now. */
function boardNow(): Board {
  return parseBoard(findStoryLine(useBook.getState().entries)?.body ?? '')
}

/** When no change waits any more, the proposal is decided: accepted when the author applied a change of it. */
function finishWhenDone(p: LineProposal, decided: Record<string, HunkState>): void {
  if (p.after === null) return
  const rejected = new Set([...p.rejected, ...Object.entries(decided).flatMap(([k, v]) => (v === 'rejected' ? [k.slice(LINE.length)] : []))])
  const left = pendingChanges(boardNow(), parseBoard(p.after), useBook.getState().chapters, rejected)
  if (left.length) return
  const states = { ...(p.message.hunks ?? {}), ...decided }
  const any = Object.entries(states).some(([k, v]) => k.startsWith(LINE) && v === 'accepted')
  updateMessage(p, Object.fromEntries(p.keys.map((k) => [k, any ? 'accepted' : 'rejected'])))
}

/** Apply some changes of a proposal (one card on the board, or all of them). */
export function applyLineChanges(p: LineProposal, ids: string[]): void {
  if (p.after === null) return
  const after = parseBoard(p.after)
  const chapters = useBook.getState().chapters
  let board = boardNow()
  for (const id of ids) {
    // Find the change again on the board now: an earlier change can have done it already.
    const change = pendingChanges(board, after, chapters, p.rejected).find((c) => c.id === id)
    if (change) board = applyBoardChange(board, change, after, chapters)
  }
  saveBoard(board)
  const decided = Object.fromEntries(ids.map((id) => [LINE + id, 'accepted' as const]))
  updateMessage(p, decided, p.after)
  finishWhenDone(p, decided)
}

/** Reject some changes of a proposal. */
export function rejectLineChanges(p: LineProposal, ids: string[]): void {
  const decided = Object.fromEntries(ids.map((id) => [LINE + id, 'rejected' as const]))
  updateMessage(p, decided, p.after ?? undefined)
  finishWhenDone(p, decided)
}

/**
 * Accept all the changes that wait (on the board, in the chat). With no rejected change, the line
 * becomes the proposed line, in the canonical form; else the changes are applied one by one.
 * An Undo toast puts the line back.
 */
export async function acceptLineProposal(p: LineProposal): Promise<void> {
  const t = getT()
  const book = useBook.getState()
  const story = findStoryLine(book.entries)
  if (p.after === null || (story ? story.body !== p.before : p.before !== '')) {
    toast(t.plan.line.reviewStale, { kind: 'error' })
    return
  }
  const snap = story ? snapshotOf(`${PLANNING_DIR}/${story.file}`) : null
  const previous = story ? entryToFile(story) : null
  const ids = p.changes.map((c) => c.id)
  if (!p.rejected.size) saveBoard(parseBoard(p.after))
  else {
    const after = parseBoard(p.after)
    let board = boardNow()
    for (const c of p.changes) board = applyBoardChange(board, c, after, book.chapters)
    saveBoard(board)
  }
  const decided: Record<string, HunkState> = { ...Object.fromEntries(ids.map((id) => [LINE + id, 'accepted' as const])), ...Object.fromEntries(p.keys.map((k) => [k, 'accepted' as const])) }
  updateMessage(p, decided, p.after)
  // A rewind of the thread puts back the file that a <create> replaced.
  if (previous) {
    const latest = useBook.getState().threads.find((x) => x.id === p.thread.id)
    const creates = p.segments.filter((s) => s.kind === 'create').map((s) => hunkKey(s.index, 0))
    if (latest && creates.length) {
      useBook.getState().saveThread({
        ...latest,
        messages: latest.messages.map((m) => (m.id === p.message.id ? { ...m, replaced: { ...(m.replaced ?? {}), ...Object.fromEntries(creates.map((k) => [k, previous])) } } : m))
      })
    }
  }
  markAfter(snap)
  const back = (): void => {
    updateMessage(p, { ...Object.fromEntries(ids.map((id) => [LINE + id, undefined])), ...Object.fromEntries(p.keys.map((k) => [k, 'pending' as const])) })
  }
  toast(story ? t.plan.line.accepted : t.plan.line.created, {
    ms: 8000,
    action: {
      label: t.common.undo,
      run: () => {
        if (!story) {
          const made = findStoryLine(useBook.getState().entries)
          if (made) void useBook.getState().deleteEntry(made.id)
          back()
          return
        }
        if (snap && !restoreSnapshot(snap)) {
          toast(t.chat.undoUnsafe, { kind: 'error' })
          return
        }
        back()
      }
    }
  })
}

/** Reject all the changes that wait. */
export function rejectLineProposal(p: LineProposal): void {
  const decided = Object.fromEntries(p.changes.map((c) => [LINE + c.id, 'rejected' as const]))
  // A proposal with an applied change stays accepted (in part).
  const any = Object.entries(p.message.hunks ?? {}).some(([k, v]) => k.startsWith(LINE) && v === 'accepted')
  const state: HunkState = any ? 'accepted' : 'rejected'
  updateMessage(p, { ...decided, ...Object.fromEntries(p.keys.map((k) => [k, state])) }, p.after ?? undefined)
}

/** The state of the story line proposal of a message, for its chat card. */
export function lineStateOf(message: ChatMessage, segments: LineSegment[]): HunkState {
  const states = message.hunks ?? {}
  const keys = segments.flatMap((s) => (s.kind === 'create' ? [hunkKey(s.index, 0)] : s.hunks.map((_, i) => hunkKey(s.index, i))))
  if (keys.some((k) => !states[k] || states[k] === 'pending')) return 'pending'
  return keys.some((k) => states[k] === 'failed') ? 'failed' : keys.some((k) => states[k] === 'accepted') ? 'accepted' : 'rejected'
}
