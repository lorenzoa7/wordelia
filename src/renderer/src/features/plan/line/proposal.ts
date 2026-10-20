// Chat proposals for the story line. The Line view shows the proposed board with its changes and
// asks for a decision; the chat card shows the counts. A decision in one place updates the other:
// the states of the proposals are in the thread, as for all proposals.

import { useMemo } from 'react'
import { PLANNING_DIR, entryToFile } from '@shared/book'
import { readFrontmatter, writeFrontmatter } from '@shared/markdown/frontmatter'
import { applyHunk } from '@shared/proposals/apply'
import { hunkKey, parseProposals, type Segment } from '@shared/proposals/parse'
import { STORY_LINE_TYPE, findStoryLine, isStoryLine, parseBoard, serializeBoard } from '@shared/storyline'
import type { ChatMessage, HunkState, Thread } from '@shared/types'
import { getT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { useChat } from '@/features/chat/chatStore'
import { latestThread } from '@/features/chat/threads'
import { applyCreate, createdPath, markAfter, resolveTarget, restoreSnapshot, setHunkStates, snapshotOf } from '@/features/chat/applyProposal'

export type LineSegment = Extract<Segment, { kind: 'edit' }> | Extract<Segment, { kind: 'create' }>

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
  /** The keys that wait for a decision */
  keys: string[]
  /** The body now ('' when the book has no story line) */
  before: string
  /** The body after the proposal; null when an edit does not fit the body any more */
  after: string | null
}

/** The proposals of one message for the story line that wait for a decision, or null. */
export function messageLineProposal(thread: Thread, message: ChatMessage, body: string | null): LineProposal | null {
  if (message.role !== 'assistant' || !/<(edit|create)\s/.test(message.content)) return null
  const states = message.hunks ?? {}
  const segments = parseProposals(message.content)
    .filter((s): s is LineSegment => isLineSegment(s))
    .filter((s) => pendingOf(s, states).length)
  if (!segments.length) return null
  let after: string | null = body ?? ''
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
  return {
    id: `${thread.id}:${message.id}`,
    thread,
    message,
    segments,
    keys: segments.flatMap((s) => pendingOf(s, states)),
    before: body ?? '',
    after
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
  const activeId = useChat((s) => s.activeThreadId)
  return useMemo(() => {
    const story = findStoryLine(entries)
    return lineProposalOf(proposalThread(threads, activeId), story ? story.body : null)
  }, [threads, entries, activeId])
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

/** Accept a proposal for the story line: all its changes, with an Undo toast. */
export async function acceptLineProposal(p: LineProposal): Promise<void> {
  const t = getT()
  const book = useBook.getState()
  const story = findStoryLine(book.entries)
  const keys = Object.fromEntries(p.keys.map((k) => [k, 'accepted' as const]))
  // The text that the board showed, in the canonical form: its parts are applied in the same order
  // as for the preview, and the ids that the parser gives are written.
  if (p.after === null || (story ? story.body !== p.before : p.before !== '')) {
    setHunkStates(p.thread, p.message.id, Object.fromEntries(p.keys.map((k) => [k, 'failed' as const])))
    toast(t.plan.line.reviewStale, { kind: 'error' })
    return
  }
  const body = serializeBoard(parseBoard(p.after), book.chapters)
  const back = (): void => {
    const latest = useBook.getState().threads.find((x) => x.id === p.thread.id)
    if (latest) setHunkStates(latest, p.message.id, Object.fromEntries(p.keys.map((k) => [k, 'pending' as const])))
  }

  if (story) {
    const snap = snapshotOf(`${PLANNING_DIR}/${story.file}`)
    // A rewind of the thread puts back the file that a <create> replaced.
    const replaced: Record<string, string> = {}
    for (const s of p.segments) if (s.kind === 'create' && p.keys.includes(hunkKey(s.index, 0))) replaced[hunkKey(s.index, 0)] = entryToFile(story)
    useBook.getState().updateEntry(story.id, { body })
    setHunkStates(p.thread, p.message.id, keys, replaced)
    markAfter(snap)
    toast(t.plan.line.accepted, {
      ms: 8000,
      action: {
        label: t.common.undo,
        run: () => {
          if (snap && !restoreSnapshot(snap)) {
            toast(t.chat.undoUnsafe, { kind: 'error' })
            return
          }
          back()
        }
      }
    })
    return
  }

  // A new story line: the <create> of the proposal, with its type and the canonical body.
  const create = p.segments.find((s): s is Extract<LineSegment, { kind: 'create' }> => s.kind === 'create')
  if (!create) return
  const { data } = readFrontmatter(create.content)
  const res = await applyCreate(create.file, writeFrontmatter({ ...data, type: STORY_LINE_TYPE }, body))
  if (!res.ok) {
    setHunkStates(p.thread, p.message.id, Object.fromEntries(p.keys.map((k) => [k, 'failed' as const])))
    toast(res.reason, { kind: 'error' })
    return
  }
  setHunkStates(p.thread, p.message.id, keys)
  const file = createdPath(create.file).slice(PLANNING_DIR.length + 1)
  toast(t.plan.line.created, {
    ms: 8000,
    action: {
      label: t.common.undo,
      run: () => {
        const e = useBook.getState().entries.find((x) => x.file === file)
        if (e) void useBook.getState().deleteEntry(e.id)
        back()
      }
    }
  })
}

export function rejectLineProposal(p: LineProposal): void {
  setHunkStates(p.thread, p.message.id, Object.fromEntries(p.keys.map((k) => [k, 'rejected' as const])))
}
