// Apply accepted proposals to the book.

import { MANUSCRIPT_DIR, PLANNING_DIR, entryToFile, fileNameFromTitle } from '@shared/book'
import { applyHunk } from '@shared/proposals/apply'
import { hunkKey, type Hunk, type Segment } from '@shared/proposals/parse'
import type { Chapter, Entry, HunkState, Thread } from '@shared/types'
import { useBook } from '@/stores/book'
import { applyToChapter, flushEditor, type ApplyResult } from '@/features/editor/registry'
import { snapshot } from '@/features/history/snapshots'
import { typesetForBook } from '@/lib/typeset'
import { getT } from '@/lib/i18n'

export type Target =
  | { kind: 'chapter'; chapter: Chapter; label: string }
  | { kind: 'entry'; entry: Entry; label: string }
  | { kind: 'new-entry'; rel: string; label: string }
  | { kind: 'unknown'; rel: string; label: string }

function norm(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\.?\//, '')
}

export function resolveTarget(file: string): Target {
  const rel = norm(file)
  // "planning/../manuscript/x.md" must not pass as a planning file.
  if (rel.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return { kind: 'unknown', rel, label: rel }
  const book = useBook.getState()
  if (rel.startsWith(`${MANUSCRIPT_DIR}/`)) {
    const name = rel.slice(MANUSCRIPT_DIR.length + 1)
    const ch = book.chapters.find((c) => c.file.toLowerCase() === name.toLowerCase()) ??
      book.chapters.find((c) => `${c.title}.md`.toLowerCase() === name.toLowerCase())
    if (ch) return { kind: 'chapter', chapter: ch, label: ch.title }
    return { kind: 'unknown', rel, label: name.replace(/\.md$/, '') }
  }
  if (rel.startsWith(`${PLANNING_DIR}/`)) {
    const name = rel.slice(PLANNING_DIR.length + 1)
    const e = book.entries.find((x) => x.file.toLowerCase() === name.toLowerCase())
    if (e) return { kind: 'entry', entry: e, label: e.name }
    return { kind: 'new-entry', rel, label: name.replace(/\.md$/, '').split('/').pop() ?? name }
  }
  return { kind: 'unknown', rel, label: rel }
}

export function applyEditHunk(file: string, hunk: Hunk): ApplyResult {
  const t = resolveTarget(file)
  if (t.kind === 'chapter') return applyToChapter(t.chapter.id, hunk.find, typesetForBook(hunk.replace))
  if (t.kind === 'entry') {
    const e = t.entry
    const inBody = applyHunk(e.body, hunk.find, hunk.replace)
    if (inBody.ok) {
      useBook.getState().updateEntry(e.id, { body: inBody.text })
      return { ok: true }
    }
    // The AI may edit the summary line it saw in the prompt.
    if (e.summary && hunk.find.includes(e.summary.slice(0, 20))) {
      const summary = applyHunk(`summary: ${e.summary}`, hunk.find, hunk.replace)
      if (summary.ok) {
        useBook.getState().updateEntry(e.id, { summary: summary.text.replace(/^summary:\s*/, '') })
        return { ok: true }
      }
    }
    // The reason in the interface language.
    return { ok: false, reason: inBody.code === 'ambiguous' ? getT().chat.entryManyMatches : getT().chat.entryNotFound }
  }
  return { ok: false, reason: getT().chat.fileMissing(t.label) }
}

export async function applyCreate(file: string, content: string): Promise<ApplyResult> {
  const t = resolveTarget(file)
  if (t.kind === 'chapter' || t.kind === 'unknown') {
    return { ok: false, reason: getT().chat.createOnlyEntries }
  }
  if (t.kind === 'entry') {
    // The entry exists already: keep its id, replace its text.
    const merged = content.startsWith('---') ? content : entryToFile({ ...t.entry, body: content })
    await useBook.getState().writeRaw(`${PLANNING_DIR}/${t.entry.file}`, merged)
    return { ok: true }
  }
  // File names from the AI can hold characters that Windows does not allow, for example ":".
  const segs = t.rel.slice(PLANNING_DIR.length + 1).split('/')
  const safe = segs.map((s, i) => (i === segs.length - 1 ? fileNameFromTitle(s.replace(/\.md$/i, '')) : fileNameFromTitle(s, '')))
  await useBook.getState().writeRaw([PLANNING_DIR, ...safe].join('/'), content.endsWith('\n') ? content : content + '\n')
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* Undo for accepted proposals                                          */
/* ------------------------------------------------------------------ */

export type Snapshot = ({ kind: 'chapter'; id: string; body: string } | { kind: 'entry'; id: string; body: string; summary: string }) & {
  /** The text right after the change. Undo is safe only while the text is still this. */
  after?: string
}

function currentText(s: Pick<Snapshot, 'kind' | 'id'>): string | undefined {
  const book = useBook.getState()
  return s.kind === 'chapter' ? book.chapters.find((c) => c.id === s.id)?.body : book.entries.find((e) => e.id === s.id)?.body
}

/** Remember the text after the change. Call it right after the change. */
export function markAfter(s: Snapshot | null): void {
  if (!s) return
  flushEditor()
  s.after = currentText(s)
}

/** The text of a file before a change, so the change can be undone from a toast. */
export function snapshotOf(file: string): Snapshot | null {
  flushEditor()
  const t = resolveTarget(file)
  if (t.kind === 'chapter') {
    const ch = useBook.getState().chapters.find((c) => c.id === t.chapter.id)
    if (ch) snapshot(ch.id, 'Before AI chat change')
    return ch ? { kind: 'chapter', id: ch.id, body: ch.body } : null
  }
  if (t.kind === 'entry') return { kind: 'entry', id: t.entry.id, body: t.entry.body, summary: t.entry.summary }
  return null
}

/** Undo a change. Returns false (and changes nothing) when the text changed after the AI change. */
export function restoreSnapshot(s: Snapshot): boolean {
  flushEditor()
  if (s.after !== undefined && currentText(s) !== s.after) return false
  if (s.kind === 'chapter') useBook.getState().restoreChapter(s.id, s.body)
  else useBook.getState().restoreEntry(s.id, s.body, s.summary)
  return true
}

/* ------------------------------------------------------------------ */
/* Proposal states                                                      */
/* ------------------------------------------------------------------ */

/** Save the state of one or more proposals of a message in its thread. */
export function setHunkStates(thread: Thread, messageId: string, updates: Record<string, HunkState>): void {
  const latest = useBook.getState().threads.find((t) => t.id === thread.id) ?? thread
  const messages = latest.messages.map((m) => (m.id === messageId ? { ...m, hunks: { ...(m.hunks ?? {}), ...updates } } : m))
  useBook.getState().saveThread({ ...latest, messages })
}

/** The keys of the proposals in a message that wait for a decision. */
export function pendingKeys(segments: Segment[], states: Record<string, HunkState> = {}): string[] {
  const keys: string[] = []
  for (const s of segments) {
    if (s.kind === 'create') keys.push(hunkKey(s.index, 0))
    if (s.kind === 'edit') s.hunks.forEach((h, i) => h.complete && keys.push(hunkKey(s.index, i)))
  }
  return keys.filter((k) => !states[k] || states[k] === 'pending')
}

/**
 * Apply every pending proposal of a message, in the order of the message,
 * so an entry that the message creates exists before the message edits it.
 * Chapters get a version in the history before the first change.
 */
export async function acceptPending(segments: Segment[], states: Record<string, HunkState> = {}): Promise<Record<string, HunkState>> {
  const todo = new Set(pendingKeys(segments, states))
  const out: Record<string, HunkState> = {}
  for (const s of segments) {
    if (s.kind === 'create') {
      const key = hunkKey(s.index, 0)
      if (!todo.has(key)) continue
      out[key] = (await applyCreate(s.file, s.content)).ok ? 'accepted' : 'failed'
    } else if (s.kind === 'edit') {
      const keys = s.hunks.map((_, i) => hunkKey(s.index, i))
      if (!keys.some((k) => todo.has(k))) continue
      snapshotOf(s.file)
      for (let i = s.hunks.length - 1; i >= 0; i--) {
        if (!todo.has(keys[i])) continue
        out[keys[i]] = applyEditHunk(s.file, s.hunks[i]).ok ? 'accepted' : 'failed'
      }
    }
  }
  return out
}
