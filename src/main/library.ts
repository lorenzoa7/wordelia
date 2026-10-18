// The library: the books that the app knows. Stored in the app data folder.

import { app } from 'electron'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MANUSCRIPT_DIR, chapterFromFile, countMarkdownWords, markdownToPlain } from '@shared/book'
import { estimatePages } from '@shared/export/pages'
import type { BookManifest, Chapter, LibraryItem } from '@shared/types'
import { readManifest } from './book/store'
import { atomicWrite, readJson, readTextOr, safeJoin } from './fsutil'

const file = (): string => join(app.getPath('userData'), 'library.json')

async function load(): Promise<LibraryItem[]> {
  const items = await readJson<LibraryItem[]>(file(), [])
  return Array.isArray(items) ? items : []
}

async function save(items: LibraryItem[]): Promise<void> {
  await atomicWrite(file(), JSON.stringify(items, null, 2))
}

/** The first sentence or two of the book, for the library card. */
function excerptOf(bodies: string[]): string {
  const text = markdownToPlain(bodies.find((b) => b.trim()) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= 180) return text
  const cut = text.slice(0, 180)
  return cut.slice(0, cut.lastIndexOf(' ')) + '…'
}

/** What the library card shows about the text of a book: words, chapters, pages on screen and the first words. */
export function bookFacts(manifest: BookManifest, chapters: Chapter[]): Pick<LibraryItem, 'title' | 'author' | 'words' | 'chapters' | 'pages' | 'excerpt'> {
  return {
    title: manifest.title,
    author: manifest.author,
    words: chapters.reduce((n, c) => n + countMarkdownWords(c.body), 0),
    chapters: chapters.length,
    pages: estimatePages(chapters, manifest),
    excerpt: excerptOf(chapters.map((c) => c.body))
  }
}

/** Read the facts of a book from its folder, without changes to the folder. Null when it is not a book. */
async function readFacts(root: string): Promise<ReturnType<typeof bookFacts> | null> {
  const manifest = await readManifest(root)
  if (!manifest) return null
  const chapters: Chapter[] = []
  for (const ref of manifest.chapters) {
    const src = await readTextOr(safeJoin(root, `${MANUSCRIPT_DIR}/${ref.file}`), null)
    if (src != null) chapters.push(chapterFromFile(ref.file, src, ref.id))
  }
  return bookFacts(manifest, chapters)
}

const sameRoot = (a: LibraryItem, root: string): boolean => a.root.toLowerCase() === root.toLowerCase()

export async function listLibrary(): Promise<LibraryItem[]> {
  const items = await load()
  let changed = false
  const checked = await Promise.all(
    items.map(async (it) => {
      try {
        await stat(join(it.root, 'wordelia.json'))
      } catch {
        return { ...it, missing: true }
      }
      // A card of an older version has no pages yet: read the book one time.
      if (it.pages == null) {
        const facts = await readFacts(it.root).catch(() => null)
        if (facts) {
          changed = true
          return { ...it, ...facts, missing: false }
        }
      }
      return { ...it, missing: false }
    })
  )
  if (changed) await save(checked.map((it) => ({ ...it, missing: undefined })))
  return checked.sort((a, b) => b.openedAt.localeCompare(a.openedAt))
}

/** Keep the exact page count of the editor while the words of the book are the same; else the estimate. */
function withPages(old: LibraryItem | undefined, next: LibraryItem): LibraryItem {
  if (old?.pagesExact && old.pages != null && old.pagesWords === next.words) return { ...next, pages: old.pages, pagesExact: true, pagesWords: old.pagesWords }
  return { ...next, pagesExact: false, pagesWords: undefined }
}

export async function touchLibrary(item: LibraryItem): Promise<void> {
  const all = await load()
  const old = all.find((i) => sameRoot(i, item.root))
  const items = all.filter((i) => !sameRoot(i, item.root))
  items.unshift(withPages(old, { ...item, missing: undefined }))
  await save(items.slice(0, 50))
}

/** The editor counted the pages of an open book (the white sheets on screen). */
export async function setLibraryPages(root: string, pages: number, words: number): Promise<void> {
  const items = await load()
  const i = items.findIndex((it) => sameRoot(it, root))
  if (i < 0 || (items[i].pagesExact && items[i].pages === pages && items[i].pagesWords === words)) return
  items[i] = { ...items[i], pages, pagesExact: true, pagesWords: words }
  await save(items)
}

/** After a book closes: its card gets the words, the pages and the first words of the saved text. */
export async function refreshLibraryItem(root: string): Promise<void> {
  const items = await load()
  const i = items.findIndex((it) => sameRoot(it, root))
  if (i < 0) return
  const facts = await readFacts(root).catch(() => null)
  if (!facts) return
  items[i] = withPages(items[i], { ...items[i], ...facts })
  await save(items)
}

export async function removeFromLibrary(root: string): Promise<void> {
  const items = (await load()).filter((i) => !sameRoot(i, root))
  await save(items)
}
