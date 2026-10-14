// Local version history of chapters: .wordelia/history/<chapterId>/<time>.md
// The folder is local to this computer (the book .gitignore leaves it out).

import { readdir, readFile, rm } from 'node:fs/promises'
import { countMarkdownWords } from '@shared/book'
import { readFrontmatter, writeFrontmatter } from '@shared/markdown/frontmatter'
import type { HistoryItem } from '@shared/types'
import { atomicWrite, safeJoin } from '../fsutil'

const MAX_PER_CHAPTER = 60

function dir(root: string, chapterId: string): string {
  if (!/^[\w-]+$/.test(chapterId)) throw new Error('Bad chapter id')
  return safeJoin(root, `.wordelia/history/${chapterId}`)
}

export async function saveSnapshot(root: string, chapterId: string, label: string, body: string): Promise<void> {
  const d = dir(root, chapterId)
  const items = await listSnapshots(root, chapterId)
  // Do not store the same text twice in a row.
  if (items[0]) {
    const last = await readSnapshot(root, chapterId, items[0].id)
    if (last === body) return
  }
  const at = new Date().toISOString()
  const id = at.replace(/[:.]/g, '-')
  await atomicWrite(`${d}/${id}.md`, writeFrontmatter({ label, at }, body))
  // Keep the newest versions only.
  for (const old of items.slice(MAX_PER_CHAPTER - 1)) await rm(`${d}/${old.id}.md`, { force: true })
}

export async function listSnapshots(root: string, chapterId: string): Promise<HistoryItem[]> {
  const d = dir(root, chapterId)
  const names = (await readdir(d).catch(() => [] as string[])).filter((n) => n.endsWith('.md')).sort().reverse()
  const out: HistoryItem[] = []
  for (const n of names) {
    try {
      const { data, body } = readFrontmatter(await readFile(`${d}/${n}`, 'utf8'))
      out.push({
        id: n.replace(/\.md$/, ''),
        at: typeof data.at === 'string' ? data.at : '',
        label: typeof data.label === 'string' ? data.label : 'Snapshot',
        words: countMarkdownWords(body)
      })
    } catch {
      /* skip a broken file */
    }
  }
  return out
}

export async function readSnapshot(root: string, chapterId: string, id: string): Promise<string | null> {
  if (!/^[\w-]+$/.test(id)) return null
  try {
    return readFrontmatter(await readFile(`${dir(root, chapterId)}/${id}.md`, 'utf8')).body
  } catch {
    return null
  }
}
