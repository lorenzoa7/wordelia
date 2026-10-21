// Book folder I/O in the main process.

import { mkdir, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import {
  ACTIONS_FILE,
  AI_DIR,
  MANIFEST_FILE,
  MANUSCRIPT_DIR,
  PLANNING_DIR,
  SYNC_STATE_FILE,
  THREADS_DIR,
  WRITING_RULES_FILE,
  chapterFromFile,
  chapterToFile,
  entryFromFile,
  fileNameFromTitle,
  hashText,
  newId,
  newManifest,
  normalizeManifest,
  uniqueName
} from '@shared/book'
import { writingRulesTemplate } from '@shared/ai/defaults'
import { parseBookActions } from '@shared/ai/scopes'
import { chapterWord } from '@shared/export/model'
import type { BookManifest, BookNotice, BookSnapshot, Chapter, Entry, SyncState, Thread } from '@shared/types'
import type { FolderInfo, OpenBookOptions } from '@shared/ipc'
import { hasConflictMarkers, parseManifestText, resolveConflict, salvageManifest } from '@shared/manifest'
import { atomicWrite, readJson, readTextOr, safeJoin } from '../fsutil'

const BOOK_GITIGNORE = '# Wordelia local cache\n.wordelia/\n*.tmp\n'

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const LANGUAGE_NAMES: Record<string, string> = {
  'pt-BR': 'Brazilian Portuguese',
  'pt-PT': 'European Portuguese',
  en: 'English',
  'en-US': 'American English',
  'en-GB': 'British English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian'
}

export function languageName(tag: string): string {
  return LANGUAGE_NAMES[tag] ?? tag
}

export async function createBook(opts: {
  parentDir: string
  title: string
  author: string
  language: string
  /** No first chapter (for imports) */
  empty?: boolean
}): Promise<BookSnapshot> {
  const existing = await readdir(opts.parentDir).catch(() => [] as string[])
  const folder = uniqueName(fileNameFromTitle(opts.title, ''), existing)
  const root = join(opts.parentDir, folder)
  await mkdir(root, { recursive: true })

  const manifest = newManifest({ title: opts.title, author: opts.author, language: opts.language })
  if (!opts.empty) {
    const title = chapterWord(opts.language, 1)
    const first: Chapter = { id: newId('ch'), file: fileNameFromTitle(title), title, body: '', meta: {} }
    manifest.chapters.push({ id: first.id, file: first.file })
    await atomicWrite(join(root, MANUSCRIPT_DIR, first.file), chapterToFile(first))
  }
  await mkdir(join(root, MANUSCRIPT_DIR), { recursive: true })
  await atomicWrite(join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')
  for (const c of manifest.planning.categories) await mkdir(join(root, PLANNING_DIR, c.folder), { recursive: true })
  await mkdir(join(root, THREADS_DIR), { recursive: true })
  await atomicWrite(join(root, WRITING_RULES_FILE), writingRulesTemplate(languageName(opts.language)))
  await atomicWrite(join(root, '.gitignore'), BOOK_GITIGNORE)
  return openBook(root)
}

async function listMarkdown(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = []
  let items: import('node:fs').Dirent[]
  try {
    items = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const it of items) {
    if (it.name.startsWith('.') || it.name.startsWith('_')) continue
    const rel = prefix ? `${prefix}/${it.name}` : it.name
    if (it.isDirectory()) out.push(...(await listMarkdown(join(dir, it.name), rel)))
    else if (it.isFile() && it.name.toLowerCase().endsWith('.md')) out.push(rel)
  }
  return out
}

/** The last manifest that parsed. The app keeps it to repair a damaged wordelia.json. */
export const MANIFEST_COPY = '.wordelia/wordelia.last-good.json'

export type ManifestRead = { state: 'ok'; manifest: BookManifest; text: string } | { state: 'missing' } | { state: 'broken'; text: string }

/** Read wordelia.json. A file that does not parse is 'broken', not 'missing': it must never be replaced without a copy. */
export async function readManifestFile(root: string): Promise<ManifestRead> {
  const text = await readTextOr(join(root, MANIFEST_FILE), null)
  if (text == null) return { state: 'missing' }
  const raw = parseManifestText(text)
  return raw ? { state: 'ok', manifest: normalizeManifest(raw as Partial<BookManifest>), text } : { state: 'broken', text }
}

export async function readManifest(root: string): Promise<BookManifest | null> {
  const r = await readManifestFile(root)
  return r.state === 'ok' ? r.manifest : null
}

/** Keep a copy of a manifest that parses, so a damaged one can come back later. */
export async function keepManifestCopy(root: string, text: string): Promise<void> {
  if (!parseManifestText(text)) return
  await atomicWrite(join(root, MANIFEST_COPY), text).catch(() => {})
}

/** The folder has no wordelia.json, and the writer did not say to make it a book. */
export class NotABookError extends Error {
  readonly code = 'NOT_A_BOOK'
  constructor(root: string) {
    super(`Not a book: ${root}`)
  }
}

/** Copy a damaged manifest to `.wordelia/wordelia.json.broken-<time>`. Returns its path in the book. */
async function backupManifest(root: string, text: string): Promise<string> {
  const backup = `.wordelia/wordelia.json.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`
  await atomicWrite(join(root, backup), text)
  return backup
}

/**
 * Before the app writes the manifest of an open book: when the file on disk does not parse (a git
 * conflict or a sync client wrote it while the book was open), keep a copy of it first.
 */
export async function keepBrokenManifest(root: string): Promise<void> {
  const read = await readManifestFile(root)
  if (read.state === 'broken') await backupManifest(root, read.text)
}

/**
 * A manifest that does not parse. First a copy of it goes to `.wordelia/`. Then the app takes, in this order:
 * one side of a git conflict (this computer first), the last good copy, the parts of the file that it can
 * read, or a new manifest.
 */
async function repairManifest(root: string, text: string, fallback: { title: string; language: string }): Promise<{ manifest: BookManifest; notice: BookNotice }> {
  const backup = await backupManifest(root, text)
  const done = (raw: Record<string, unknown>, from: 'conflict' | 'copy' | 'salvage'): { manifest: BookManifest; notice: BookNotice } => ({
    manifest: normalizeManifest(raw as Partial<BookManifest>),
    notice: { kind: 'manifestRepaired', from, backup }
  })
  if (hasConflictMarkers(text)) {
    for (const side of ['ours', 'theirs'] as const) {
      const raw = parseManifestText(resolveConflict(text, side))
      if (raw) return done(raw, 'conflict')
    }
  }
  const copy = parseManifestText((await readTextOr(join(root, MANIFEST_COPY), null)) ?? '')
  if (copy) return done(copy, 'copy')
  const part = salvageManifest(text)
  if (part) return done({ title: fallback.title, language: fallback.language, ...part }, 'salvage')
  return { manifest: newManifest({ ...fallback, author: '' }), notice: { kind: 'manifestRepaired', from: 'new', backup } }
}

/** How many parent folders `inspectFolder` and `findBookRoot` look at: a book folder is not deeper than this. */
const BOOK_DEPTH = 4

/** The book that a folder is in (the folder itself or a parent), or null. */
export async function findBookRoot(path: string): Promise<string | null> {
  let dir = path
  for (let i = 0; i <= BOOK_DEPTH; i++) {
    if (await exists(join(dir, MANIFEST_FILE))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** What a folder that the writer chose is: a book, a folder inside a book, or another folder. */
export async function inspectFolder(path: string): Promise<FolderInfo> {
  const root = await findBookRoot(path)
  if (root === path) return { kind: 'book' }
  if (root) return { kind: 'inside', root, title: (await readManifest(root))?.title || basename(root) }
  const top = await readdir(path, { withFileTypes: true }).catch(() => [])
  const notes = top.filter((d) => d.isFile() && /\.(md|markdown|txt)$/i.test(d.name) && !d.name.startsWith('.')).length
  return { kind: 'folder', name: basename(path), notes, chapters: (await listMarkdown(join(path, MANUSCRIPT_DIR))).length }
}

export async function openBook(root: string, opts: OpenBookOptions = {}): Promise<BookSnapshot> {
  const read = await readManifestFile(root)
  const notices: BookNotice[] = []
  let manifest: BookManifest
  let manifestChanged = false
  if (read.state === 'ok') {
    manifest = read.manifest
    await keepManifestCopy(root, read.text)
  } else if (read.state === 'broken') {
    const r = await repairManifest(root, read.text, { title: basename(root), language: opts.language ?? 'en' })
    manifest = r.manifest
    notices.push(r.notice)
    manifestChanged = true
  } else {
    // A folder without a manifest becomes a book only when the writer said yes.
    if (!opts.makeBook) throw new NotABookError(root)
    manifest = newManifest({ title: basename(root), author: '', language: opts.language ?? 'en' })
    manifestChanged = true
  }

  // Chapters: manifest order first, then files that other apps added. A chapter whose file is not
  // there now (a sync client did not deliver it yet) keeps its place in the manifest.
  const chapterFiles = await listMarkdown(join(root, MANUSCRIPT_DIR))
  const listed = new Set(manifest.chapters.map((c) => c.file))
  const chapters: Chapter[] = []
  const missing: string[] = []
  for (const ref of manifest.chapters) {
    const src = await readTextOr(safeJoin(root, `${MANUSCRIPT_DIR}/${ref.file}`), null)
    if (src == null) {
      missing.push(ref.file)
      continue
    }
    const ch = chapterFromFile(ref.file, src, ref.id)
    ch.id = ref.id
    chapters.push(ch)
  }
  const added: Chapter[] = []
  for (const file of chapterFiles.sort()) {
    if (listed.has(file)) continue
    const src = (await readTextOr(safeJoin(root, `${MANUSCRIPT_DIR}/${file}`), '')) ?? ''
    added.push(chapterFromFile(file, src, `ch_${hashText(file)}`))
  }
  chapters.push(...added)
  if (added.length) manifestChanged = true
  if (missing.length) notices.push({ kind: 'chaptersMissing', files: missing })
  if (manifestChanged) {
    manifest.chapters = [...manifest.chapters, ...added.map((c) => ({ id: c.id, file: c.file }))]
    const text = JSON.stringify(manifest, null, 2) + '\n'
    await atomicWrite(join(root, MANIFEST_FILE), text)
    await keepManifestCopy(root, text)
  }

  // Planning entries
  const entryFiles = await listMarkdown(join(root, PLANNING_DIR))
  const entries: Entry[] = []
  for (const file of entryFiles) {
    const src = (await readTextOr(safeJoin(root, `${PLANNING_DIR}/${file}`), '')) ?? ''
    entries.push(entryFromFile(file, src, `en_${hashText(file)}`))
  }
  // Categories for folders that other apps made
  const known = new Set(manifest.planning.categories.map((c) => c.folder))
  for (const e of entries) {
    if (e.category && !known.has(e.category) && !e.category.includes('/')) {
      manifest.planning.categories.push({ id: newId('cat'), name: e.category, folder: e.category, icon: 'Folder' })
      known.add(e.category)
    }
  }

  // Threads
  const threads: Thread[] = []
  const threadDir = join(root, THREADS_DIR)
  for (const name of await readdir(threadDir).catch(() => [] as string[])) {
    if (!name.endsWith('.json')) continue
    const t = await readJson<Thread | null>(join(threadDir, name), null)
    if (t && t.id && Array.isArray(t.messages)) threads.push(normalizeThread(t))
  }
  threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  const writingRules = (await readTextOr(join(root, WRITING_RULES_FILE), '')) ?? ''
  const syncState = await readJson<SyncState>(join(root, SYNC_STATE_FILE), { chapters: {}, syncedAt: null })
  // The actions of this book. A book without the file has none.
  const actions = parseBookActions(await readJson<unknown>(join(root, ACTIONS_FILE), null))
  if (!(await exists(join(root, AI_DIR)))) await mkdir(join(root, THREADS_DIR), { recursive: true })

  return { root, manifest, chapters, entries, threads, writingRules, syncState, actions, ...(notices.length ? { notices } : {}) }
}

function normalizeThread(t: Thread): Thread {
  return {
    id: t.id,
    title: t.title || 'Untitled thread',
    brief: t.brief ?? '',
    digest: t.digest ?? '',
    digestedCount: t.digestedCount ?? 0,
    createdAt: t.createdAt ?? new Date().toISOString(),
    updatedAt: t.updatedAt ?? t.createdAt ?? new Date().toISOString(),
    pinned: Boolean(t.pinned),
    route: t.route ?? null,
    messages: t.messages,
    ...(typeof t.readAt === 'string' ? { readAt: t.readAt } : {})
  }
}
