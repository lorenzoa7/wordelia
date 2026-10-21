// Local version history of chapters: .wordelia/history/<chapterId>/<time>.md
// The folder is local to this computer (the book .gitignore leaves it out).

import { readdir, readFile, rm } from 'node:fs/promises'
import { countMarkdownWords } from '@shared/book'
import { readFrontmatter, writeFrontmatter } from '@shared/markdown/frontmatter'
import type { HistoryItem } from '@shared/types'
import { atomicWrite, safeJoin } from '../fsutil'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** A chapter never keeps more versions than this. */
export const MAX_VERSIONS = 400

/**
 * Which versions stay, from the newest to the oldest. A long day of writing must not push out
 * the versions of last month:
 * - the last day: all versions;
 * - up to 7 days: the newest version of each hour;
 * - up to 60 days: the newest version of each day;
 * - older: the newest version of each week.
 * There are never more than `MAX_VERSIONS`. Returns the ids of the versions to delete.
 */
export function versionsToDrop(items: Array<Pick<HistoryItem, 'id' | 'at'>>, now: number): string[] {
  const sorted = [...items].sort((a, b) => b.id.localeCompare(a.id))
  const seen = new Set<string>()
  const drop: string[] = []
  let kept = 0
  for (const it of sorted) {
    const at = Date.parse(it.at)
    const age = now - at
    let bucket: string | null = null
    if (!Number.isFinite(at) || age < DAY) bucket = null
    else if (age < 7 * DAY) bucket = `h${Math.floor(at / HOUR)}`
    else if (age < 60 * DAY) bucket = `d${Math.floor(at / DAY)}`
    else bucket = `w${Math.floor(at / (7 * DAY))}`
    if ((bucket && seen.has(bucket)) || kept >= MAX_VERSIONS) {
      drop.push(it.id)
      continue
    }
    if (bucket) seen.add(bucket)
    kept++
  }
  return drop
}

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
  // Fewer versions for each older day (versionsToDrop).
  for (const old of versionsToDrop([{ id, at }, ...items], Date.now())) await rm(`${d}/${old}.md`, { force: true })
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
