// Book folder I/O in the main process.

import { mkdir, readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import {
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
import type { BookManifest, BookSnapshot, Chapter, Entry, SyncState, Thread } from '@shared/types'
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
}): Promise<BookSnapshot> {
  const existing = await readdir(opts.parentDir).catch(() => [] as string[])
  const folder = uniqueName(fileNameFromTitle(opts.title, ''), existing)
  const root = join(opts.parentDir, folder)
  await mkdir(root, { recursive: true })

  const manifest = newManifest({ title: opts.title, author: opts.author, language: opts.language })
  const first: Chapter = { id: newId('ch'), file: 'Chapter One.md', title: 'Chapter One', body: '', meta: {} }
  manifest.chapters.push({ id: first.id, file: first.file })

  await atomicWrite(join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')
  await atomicWrite(join(root, MANUSCRIPT_DIR, first.file), chapterToFile(first))
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

export async function readManifest(root: string): Promise<BookManifest | null> {
  const raw = await readJson<Record<string, unknown> | null>(join(root, MANIFEST_FILE), null)
  if (!raw) return null
  return normalizeManifest(raw as Partial<BookManifest>)
}

export async function openBook(root: string): Promise<BookSnapshot> {
  let manifest = await readManifest(root)
  let manifestChanged = false
  if (!manifest) {
    // A folder without a manifest: make it a book.
    manifest = newManifest({ title: basename(root), author: '', language: 'en' })
    manifestChanged = true
  }

  // Chapters: manifest order first, then files that other apps added.
  const chapterFiles = await listMarkdown(join(root, MANUSCRIPT_DIR))
  const listed = new Set(manifest.chapters.map((c) => c.file))
  const chapters: Chapter[] = []
  for (const ref of manifest.chapters) {
    const src = await readTextOr(safeJoin(root, `${MANUSCRIPT_DIR}/${ref.file}`), null)
    if (src == null) {
      manifestChanged = true
      continue
    }
    const ch = chapterFromFile(ref.file, src, ref.id)
    ch.id = ref.id
    chapters.push(ch)
  }
  for (const file of chapterFiles.sort()) {
    if (listed.has(file)) continue
    const src = (await readTextOr(safeJoin(root, `${MANUSCRIPT_DIR}/${file}`), '')) ?? ''
    chapters.push(chapterFromFile(file, src, `ch_${hashText(file)}`))
    manifestChanged = true
  }
  if (manifestChanged) {
    manifest.chapters = chapters.map((c) => ({ id: c.id, file: c.file }))
    await atomicWrite(join(root, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')
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
  if (!(await exists(join(root, AI_DIR)))) await mkdir(join(root, THREADS_DIR), { recursive: true })

  return { root, manifest, chapters, entries, threads, writingRules, syncState }
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
    messages: t.messages
  }
}
