// Rewind a thread: remove messages from a point on. When the removed replies changed the book,
// the user can undo those changes too. Chapters get a version in the history first, and a change
// is undone only where the text of the AI is still unchanged, so later words of the user stay.

import { entryFromFile } from '@shared/book'
import { hunkKey, parseProposals } from '@shared/proposals/parse'
import { revertChanges, type AppliedChange } from '@shared/proposals/revert'
import type { ChatMessage, Thread } from '@shared/types'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { flushEditor } from '@/features/editor/registry'
import { snapshot, SNAPSHOT_EN } from '@/features/history/snapshots'
import { typesetForBook } from '@/lib/typeset'
import { getT } from '@/lib/i18n'
import { createdPath, resolveTarget } from './applyProposal'
import { askRewind, type RewindMode } from './RewindDialog'

export interface EditedFile {
  kind: 'chapter' | 'entry'
  id: string
  label: string
  /** In the order of application */
  changes: AppliedChange[]
}

export interface CreatedEntry {
  /** Path in the book, for example "planning/Characters/Teresa.md" */
  file: string
  label: string
  /** The text that the AI wrote */
  content: string
  /** The entry file from before, when the text of the AI replaced an entry */
  previous?: string
}

/** A portrait that the chat set: the rewind puts the image from before back. */
export interface SetPortrait {
  entryId: string
  label: string
  /** The image of the chat */
  image: string
  /** The image from before ('' for none) */
  previous: string
}

export interface BookChanges {
  edits: EditedFile[]
  creates: CreatedEntry[]
  portraits: SetPortrait[]
  /** Number of accepted proposals */
  total: number
}

/** The accepted proposals of some messages, by file, in the order of application. */
export function bookChangesIn(messages: ChatMessage[]): BookChanges {
  const edits = new Map<string, EditedFile>()
  const creates: CreatedEntry[] = []
  const portraits: SetPortrait[] = []
  let total = 0
  for (const m of messages) {
    if (m.role !== 'assistant' || !m.hunks || !Object.values(m.hunks).includes('accepted')) continue
    const states = m.hunks
    for (const s of parseProposals(m.content)) {
      if (s.kind === 'create') {
        const key = hunkKey(s.index, 0)
        if (states[key] !== 'accepted') continue
        const file = createdPath(s.file)
        creates.push({ file, label: resolveTarget(file).label, content: s.content, ...(m.replaced?.[key] ? { previous: m.replaced[key] } : {}) })
        total++
        continue
      }
      if (s.kind === 'portrait') {
        const key = hunkKey(s.index, 0)
        const target = resolveTarget(s.file)
        if (states[key] !== 'accepted' || target.kind !== 'entry') continue
        portraits.push({ entryId: target.entry.id, label: target.label, image: s.image, previous: m.replaced?.[key] ?? '' })
        total++
        continue
      }
      if (s.kind !== 'edit') continue
      const target = resolveTarget(s.file)
      if (target.kind !== 'chapter' && target.kind !== 'entry') continue
      const id = target.kind === 'chapter' ? target.chapter.id : target.entry.id
      // The card applies the last change of a proposal first.
      for (let i = s.hunks.length - 1; i >= 0; i--) {
        if (states[hunkKey(s.index, i)] !== 'accepted') continue
        const h = s.hunks[i]
        const f = edits.get(id) ?? { kind: target.kind, id, label: target.label, changes: [] }
        // Chapter text got the quotes of the book when it was applied.
        f.changes.push(target.kind === 'chapter' ? { find: typesetForBook(h.find), replace: typesetForBook(h.replace) } : { find: h.find, replace: h.replace })
        edits.set(id, f)
        total++
      }
    }
  }
  return { edits: [...edits.values()], creates, portraits, total }
}

export interface UndoResult {
  undone: number
  failed: number
}

/** Undo accepted proposals in the book, the newest first. */
export async function undoBookChanges(changes: BookChanges): Promise<UndoResult> {
  flushEditor()
  let undone = 0
  let failed = 0
  for (const f of changes.edits) {
    const book = useBook.getState()
    if (f.kind === 'chapter') {
      const ch = book.chapters.find((c) => c.id === f.id)
      if (!ch) {
        failed += f.changes.length
        continue
      }
      const r = revertChanges(ch.body, f.changes)
      undone += r.reverted
      failed += r.failed
      if (r.text !== ch.body) {
        // A version of the chapter as it is now, so the user can go back to it.
        snapshot(ch.id, SNAPSHOT_EN.labels.beforeRestore)
        book.restoreChapter(ch.id, r.text)
      }
      continue
    }
    const e = book.entries.find((x) => x.id === f.id)
    if (!e) {
      failed += f.changes.length
      continue
    }
    let body = e.body
    let summary = e.summary
    for (const c of [...f.changes].reverse()) {
      const inBody = revertChanges(body, [c])
      if (inBody.reverted) {
        body = inBody.text
        undone++
        continue
      }
      // The AI may have changed the summary line.
      const inSummary = revertChanges(`summary: ${summary}`, [c])
      if (inSummary.reverted) {
        summary = inSummary.text.replace(/^summary:\s*/, '').trim()
        undone++
        continue
      }
      failed++
    }
    if (body !== e.body || summary !== e.summary) book.restoreEntry(e.id, body, summary)
  }
  for (const c of [...changes.creates].reverse()) {
    const target = resolveTarget(c.file)
    if (target.kind !== 'entry') {
      failed++
      continue
    }
    const now = target.entry
    const made = entryFromFile(now.file, c.content, now.id)
    // Undo the note only while it is still the text of the AI.
    const same = made.body.trim() === now.body.trim() && (!c.content.startsWith('---') || made.summary === now.summary)
    if (!same) {
      failed++
      continue
    }
    if (c.previous) await useBook.getState().writeRaw(c.file, c.previous)
    // A new note goes to the trash of the book, so nothing is lost for good.
    else await useBook.getState().deleteEntry(now.id)
    undone++
  }
  // A portrait goes back only while the entry still shows the image of the chat.
  for (const p of [...changes.portraits].reverse()) {
    const e = useBook.getState().entries.find((x) => x.id === p.entryId)
    if (!e || e.image !== p.image) {
      failed++
      continue
    }
    useBook.getState().updateEntry(e.id, { image: p.previous || null })
    undone++
  }
  return { undone, failed }
}

/** Keep the first `keep` messages of a thread. The digest starts again when it covered removed messages. */
export function truncateThread(threadId: string, keep: number): Thread | null {
  const th = useBook.getState().threads.find((t) => t.id === threadId)
  if (!th) return null
  const next: Thread = {
    ...th,
    messages: th.messages.slice(0, keep),
    updatedAt: new Date().toISOString(),
    ...(th.digestedCount > keep ? { digest: '', digestedCount: 0 } : {})
  }
  useBook.getState().saveThread(next, true)
  return next
}

/**
 * Remove the messages of a thread from `from` on. A rewind always asks first. Edit and Retry ask
 * only when the removed replies changed the book. Returns false when the user cancels.
 */
export async function confirmAndRewind(thread: Thread, from: number, mode: RewindMode): Promise<boolean> {
  const removed = thread.messages.slice(from)
  const changes = bookChangesIn(removed)
  let undo = false
  if (mode === 'rewind' || changes.total > 0) {
    const after = mode === 'edit' ? removed.length - 1 : removed.length
    const answer = await askRewind({ mode, after, changes })
    if (!answer) return false
    undo = answer.undo
  }
  if (undo && changes.total) {
    const r = await undoBookChanges(changes)
    const t = getT()
    if (r.failed) toast(t.chat.undonePartial(r.undone, r.undone + r.failed), { kind: 'error', ms: 9000 })
    else toast(t.chat.undoneAll(r.undone))
  }
  truncateThread(thread.id, from)
  return true
}
