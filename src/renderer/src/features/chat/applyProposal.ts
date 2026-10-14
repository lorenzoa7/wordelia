// Apply accepted proposals to the book.

import { MANUSCRIPT_DIR, PLANNING_DIR, entryToFile } from '@shared/book'
import { applyHunk } from '@shared/proposals/apply'
import type { Hunk } from '@shared/proposals/parse'
import type { Chapter, Entry } from '@shared/types'
import { useBook } from '@/stores/book'
import { applyToChapter, type ApplyResult } from '@/features/editor/registry'

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
  if (t.kind === 'chapter') return applyToChapter(t.chapter.id, hunk.find, hunk.replace)
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
    return inBody
  }
  return { ok: false, reason: `The file "${t.label}" does not exist.` }
}

export async function applyCreate(file: string, content: string): Promise<ApplyResult> {
  const t = resolveTarget(file)
  if (t.kind === 'chapter' || t.kind === 'unknown') {
    return { ok: false, reason: 'The AI can create planning entries only.' }
  }
  if (t.kind === 'entry') {
    // The entry exists already: keep its id, replace its text.
    const merged = content.startsWith('---') ? content : entryToFile({ ...t.entry, body: content })
    await useBook.getState().writeRaw(`${PLANNING_DIR}/${t.entry.file}`, merged)
    return { ok: true }
  }
  await useBook.getState().writeRaw(t.rel, content.endsWith('\n') ? content : content + '\n')
  return { ok: true }
}
