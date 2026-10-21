// Apply accepted proposals to the book.

import { MANUSCRIPT_DIR, PLANNING_DIR, entryToFile, fileNameFromTitle } from '@shared/book'
import { applyHunk } from '@shared/proposals/apply'
import { hunkKey, type Hunk, type Segment } from '@shared/proposals/parse'
import { pendingKeys } from '@shared/proposals/state'
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
  // A change that the reply did not finish is never applied: its text is cut.
  if (!hunk.complete) return { ok: false, reason: getT().chat.changeIncomplete }
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

/** `previous`: the entry file that the new text replaced, so a rewind can put it back. */
export async function applyCreate(file: string, content: string): Promise<ApplyResult & { previous?: string }> {
  const t = resolveTarget(file)
  if (t.kind === 'chapter' || t.kind === 'unknown') {
    return { ok: false, reason: getT().chat.createOnlyEntries }
  }
  if (t.kind === 'entry') {
    // The entry exists already: keep its id, replace its text.
    const previous = entryToFile(t.entry)
    const merged = content.startsWith('---') ? content : entryToFile({ ...t.entry, body: content })
    await useBook.getState().writeRaw(`${PLANNING_DIR}/${t.entry.file}`, merged)
    return { ok: true, previous }
  }
  await useBook.getState().writeRaw(createdPath(file), content.endsWith('\n') ? content : content + '\n')
  return { ok: true }
}

/**
 * The path where a `<create>` proposal for a new entry goes. File names from the AI can hold
 * characters that Windows does not allow, for example ":".
 */
export function createdPath(file: string): string {
  const t = resolveTarget(file)
  if (t.kind === 'entry') return `${PLANNING_DIR}/${t.entry.file}`
  if (t.kind !== 'new-entry') return norm(file)
  const segs = t.rel.slice(PLANNING_DIR.length + 1).split('/')
  const safe = segs.map((s, i) => (i === segs.length - 1 ? fileNameFromTitle(s.replace(/\.md$/i, '')) : fileNameFromTitle(s, '')))
  return [PLANNING_DIR, ...safe].join('/')
}

/**
 * An image of the chat as the portrait of an entry. The image is already a file of the book
 * (`_assets/…`, relative to planning/). `previous`: the image from before ('' for none).
 */
export function applyPortrait(file: string, image: string): ApplyResult & { previous?: string } {
  const t = resolveTarget(file)
  const rel = norm(image)
  if (!rel.startsWith('_assets/') || rel.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return { ok: false, reason: getT().chat.portraitBadImage }
  if (t.kind !== 'entry') return { ok: false, reason: getT().chat.portraitNoEntry(t.label) }
  const previous = t.entry.image ?? ''
  useBook.getState().updateEntry(t.entry.id, { image: rel })
  return { ok: true, previous }
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

/**
 * Save the state of one or more proposals of a message in its thread.
 * `replaced`: the entry files that accepted `<create>` proposals replaced, by hunk key.
 */
export function setHunkStates(thread: Thread, messageId: string, updates: Record<string, HunkState>, replaced?: Record<string, string>): void {
  const latest = useBook.getState().threads.find((t) => t.id === thread.id)
  // The thread was deleted meanwhile: do not bring it back.
  if (!latest) return
  queueMicrotask(() => decided.forEach((fn) => fn(thread.id)))
  const messages = latest.messages.map((m) =>
    m.id === messageId
      ? {
          ...m,
          hunks: { ...(m.hunks ?? {}), ...updates },
          ...(replaced && Object.keys(replaced).length ? { replaced: { ...(m.replaced ?? {}), ...replaced } } : {})
        }
      : m
  )
  useBook.getState().saveThread({ ...latest, messages })
}

/** The keys of a proposal: one for a new entry or a portrait, one for each change of an edit. */
export function segmentKeys(s: Exclude<Segment, { kind: 'text' }>): string[] {
  return s.kind === 'edit' ? s.hunks.map((_, i) => hunkKey(s.index, i)) : [hunkKey(s.index, 0)]
}

/** The keys of the proposals in a message that wait for a decision. A proposal that the reply did not finish never waits. */
export { pendingKeys }

const decided = new Set<(threadId: string) => void>()

/** Call `fn` after each decision on a proposal of a thread (the digest waits for the decisions). */
export function onDecision(fn: (threadId: string) => void): void {
  decided.add(fn)
}

/**
 * Apply every pending proposal of a message, in the order of the message,
 * so an entry that the message creates exists before the message edits it.
 * Chapters get a version in the history before the first change.
 */
export async function acceptPending(
  segments: Segment[],
  states: Record<string, HunkState> = {}
): Promise<{ states: Record<string, HunkState>; replaced: Record<string, string> }> {
  const todo = new Set(pendingKeys(segments, states))
  const out: Record<string, HunkState> = {}
  const replaced: Record<string, string> = {}
  for (const s of segments) {
    if (s.kind === 'create') {
      const key = hunkKey(s.index, 0)
      if (!todo.has(key)) continue
      const res = await applyCreate(s.file, s.content)
      out[key] = res.ok ? 'accepted' : 'failed'
      if (res.ok && res.previous) replaced[key] = res.previous
    } else if (s.kind === 'portrait') {
      const key = hunkKey(s.index, 0)
      if (!todo.has(key)) continue
      const res = applyPortrait(s.file, s.image)
      out[key] = res.ok ? 'accepted' : 'failed'
      if (res.ok) replaced[key] = res.previous ?? ''
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
  return { states: out, replaced }
}
