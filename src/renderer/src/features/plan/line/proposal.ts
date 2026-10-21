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
import { STORY_LINE_TYPE, applyBoardChange, applyOrder, boardChanges, cascadeRejects, findStoryLine, impliedChanges, isStoryLine, linkMentions, liveChanges, parseBoard, type Board, type BoardChange } from '@shared/storyline'
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
  /** The line from which the changes go: kept in the message at the first decision, else the line now */
  base: string
  /** The proposed body; null when an edit does not fit the line any more */
  after: string | null
  /** The proposal was decided in part: its two lines are kept in the message */
  kept: boolean
  /** All the changes of the proposal (between `base` and `after`) */
  all: BoardChange[]
  /** The decisions of the author, by change id */
  decided: Record<string, HunkState>
  /** The changes that wait for a decision and that the line still needs */
  changes: BoardChange[]
}

/** The ids of a body: a new id of a proposal keeps away from them. */
function idsIn(body: string): string[] {
  return [...body.matchAll(/\^([A-Za-z0-9_-]+)/g)].map((m) => m[1])
}

/**
 * The proposed board, parsed: its new ids keep away from the ids of the line it changes. A new or
 * changed card names its notes with "@" (the AI forgets it at times): the author sees the mentions
 * on the board before the decision.
 */
export function proposedBoard(p: Pick<LineProposal, 'after' | 'base' | 'before'>): Board {
  const board = parseBoard(p.after ?? '', [...idsIn(p.base), ...idsIn(p.before)])
  const notes = useBook.getState().entries.filter((e) => !isStoryLine(e))
  const was = new Map(parseBoard(p.base).cards.map((c) => [c.id, c.text]))
  return { ...board, cards: board.cards.map((c) => (was.get(c.id) === c.text ? c : { ...c, text: linkMentions(c.text, notes) })) }
}

/** The proposals of one message for the story line that wait for a decision, or null. */
export function messageLineProposal(thread: Thread, message: ChatMessage, body: string | null): LineProposal | null {
  if (message.role !== 'assistant' || !/<(edit|create)\s/.test(message.content)) return null
  const states = message.hunks ?? {}
  const segments = parseProposals(message.content)
    .filter((s): s is LineSegment => isLineSegment(s))
    .filter((s) => pendingOf(s, states).length)
  if (!segments.length) return null
  const kept = message.lineAfter !== undefined
  const base = kept ? (message.lineBefore ?? body ?? '') : (body ?? '')
  let after: string | null = kept ? message.lineAfter! : base
  if (!kept) {
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
  const decided = Object.fromEntries(Object.entries(states).flatMap(([k, v]) => (k.startsWith(LINE) ? [[k.slice(LINE.length), v]] : [])))
  const chapters = useBook.getState().chapters
  const p = { before: body ?? '', base, after }
  const next = proposedBoard(p)
  // The changes are the changes between the two kept lines: a later change of the line (a card of the
  // author, another proposal, a new chapter title) is not a change of this proposal.
  const all = after === null ? [] : boardChanges(parseBoard(base), next, chapters)
  return {
    id: `${thread.id}:${message.id}`,
    thread,
    message,
    segments,
    keys: segments.flatMap((s) => pendingOf(s, states)),
    ...p,
    kept,
    all,
    decided,
    changes: after === null ? [] : liveChanges(parseBoard(body ?? ''), next, all.filter((c) => !decided[c.id]), chapters)
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

/** Change the message of a proposal in its thread: decisions, and the two kept lines. */
function updateMessage(p: LineProposal, hunks: Record<string, HunkState | undefined>, keep = false): void {
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
    const lines = keep && m.lineAfter === undefined && p.after !== null ? { lineBefore: p.base, lineAfter: p.after } : {}
    return { ...m, hunks: next, ...lines }
  })
  useBook.getState().saveThread({ ...latest, messages })
}

/** The board of the line now. */
function boardNow(): Board {
  return parseBoard(findStoryLine(useBook.getState().entries)?.body ?? '')
}

/** The changes of a proposal that wait, after these decisions, on the line now. */
function waiting(p: LineProposal, decided: Record<string, HunkState>): BoardChange[] {
  if (p.after === null) return []
  return liveChanges(boardNow(), proposedBoard(p), p.all.filter((c) => !decided[c.id]), useBook.getState().chapters)
}

/** When no change waits any more, the proposal is decided: accepted when the author applied a change of it. */
function finishWhenDone(p: LineProposal, decided: Record<string, HunkState>): void {
  if (waiting(p, decided).length) return
  const any = Object.values(decided).some((v) => v === 'accepted')
  updateMessage(p, Object.fromEntries(p.keys.map((k) => [k, any ? 'accepted' : 'rejected'])))
}

/** Apply changes to the line now, in order. A change that the line does not need any more is left out. */
function applyEach(p: LineProposal, changes: BoardChange[]): string[] {
  const after = proposedBoard(p)
  const chapters = useBook.getState().chapters
  let board = boardNow()
  const done: string[] = []
  for (const c of applyOrder(changes)) {
    if (!liveChanges(board, after, [c], chapters).length) continue
    board = applyBoardChange(board, c, after, chapters)
    done.push(c.id, ...impliedChanges(c, p.all))
  }
  saveBoard(board)
  return done
}

/** Apply some changes of a proposal (one card or one column on the board). */
export function applyLineChanges(p: LineProposal, ids: string[]): void {
  if (p.after === null) return
  const done = applyEach(
    p,
    p.all.filter((c) => ids.includes(c.id))
  )
  const decided = { ...p.decided, ...Object.fromEntries([...ids, ...done].map((id) => [id, 'accepted' as const])) }
  updateMessage(p, Object.fromEntries([...ids, ...done].map((id) => [LINE + id, 'accepted' as const])), true)
  finishWhenDone(p, decided)
}

/** Reject some changes of a proposal. A rejected new column takes the new places in it. */
export function rejectLineChanges(p: LineProposal, ids: string[]): void {
  const all = [...ids, ...p.all.filter((c) => ids.includes(c.id)).flatMap((c) => cascadeRejects(c, p.all))]
  const decided = { ...p.decided, ...Object.fromEntries(all.map((id) => [id, 'rejected' as const])) }
  updateMessage(p, Object.fromEntries(all.map((id) => [LINE + id, 'rejected' as const])), true)
  finishWhenDone(p, decided)
}

/**
 * Accept all the changes that wait (on the board, in the chat). Before any decision, the line
 * becomes the proposed line. After a decision, the changes that wait are applied one by one: the
 * proposed line never takes the place of a line that changed since. An Undo toast puts the line back.
 */
export async function acceptLineProposal(p: LineProposal): Promise<void> {
  const t = getT()
  const book = useBook.getState()
  const story = findStoryLine(book.entries)
  if (p.after === null || (story ? story.body : '') !== p.before) {
    toast(t.plan.line.reviewStale, { kind: 'error' })
    return
  }
  const snap = story ? snapshotOf(`${PLANNING_DIR}/${story.file}`) : null
  const previous = story ? entryToFile(story) : null
  const ids = p.changes.map((c) => c.id)
  let done = ids
  if (!p.kept) saveBoard(proposedBoard(p))
  else done = [...ids, ...applyEach(p, p.changes)]
  updateMessage(p, { ...Object.fromEntries(done.map((id) => [LINE + id, 'accepted' as const])), ...Object.fromEntries(p.keys.map((k) => [k, 'accepted' as const])) })
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
    updateMessage(p, { ...Object.fromEntries(done.map((id) => [LINE + id, undefined])), ...Object.fromEntries(p.keys.map((k) => [k, 'pending' as const])) })
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

/** Reject all the changes that wait. A proposal with an applied change stays accepted (in part). */
export function rejectLineProposal(p: LineProposal): void {
  const rejected = Object.fromEntries(p.changes.map((c) => [LINE + c.id, 'rejected' as const]))
  const any = Object.values(p.decided).some((v) => v === 'accepted')
  const state: HunkState = any ? 'accepted' : 'rejected'
  updateMessage(p, { ...rejected, ...Object.fromEntries(p.keys.map((k) => [k, state])) }, true)
}

/** The state of the story line proposal of a message, for its chat card. */
export function lineStateOf(message: ChatMessage, segments: LineSegment[]): HunkState {
  const states = message.hunks ?? {}
  const keys = segments.flatMap((s) => (s.kind === 'create' ? [hunkKey(s.index, 0)] : s.hunks.map((_, i) => hunkKey(s.index, i))))
  if (keys.some((k) => !states[k] || states[k] === 'pending')) return 'pending'
  return keys.some((k) => states[k] === 'failed') ? 'failed' : keys.some((k) => states[k] === 'accepted') ? 'accepted' : 'rejected'
}
