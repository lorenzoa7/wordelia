// Watches open books for changes that other programs make (sync clients, git, editors).

import { watch, type FSWatcher } from 'chokidar'
import { readFile } from 'node:fs/promises'
import { hashText } from '@shared/book'
import { toRel } from '../fsutil'

type Listener = (e: { root: string; rel: string; content: string | null }) => void

const watchers = new Map<string, FSWatcher>()
/**
 * The recent changes of each file (absolute path, lower case): their signatures (a hash of the text, or
 * "deleted") and times. The changes of the app stay here for a while, not only the last one: the event of
 * an earlier change of the app can come after a later one (a note that gets a new name and its old name
 * again, fast). A change of another program takes the place of all of them.
 */
const ownWrites = new Map<string, Array<{ sig: string; at: number }>>()
/** How long a change of the app counts as its own: a late event of it is not a change from outside */
const OWN_FOR_MS = 10_000

export function noteOwnWrite(fullPath: string, content: string | null, now = Date.now()): void {
  const lower = fullPath.toLowerCase()
  const recent = (ownWrites.get(lower) ?? []).filter((x) => now - x.at < OWN_FOR_MS)
  recent.push({ sig: content == null ? 'deleted' : hashText(content), at: now })
  ownWrites.set(lower, recent)
}

/** True when a file event has the signature of a recent change of the app (or of the last change from outside). */
export function isOwnChange(fullPath: string, sig: string, now = Date.now()): boolean {
  return (ownWrites.get(fullPath.toLowerCase()) ?? []).some((x) => x.sig === sig && now - x.at < OWN_FOR_MS)
}

/**
 * What a file event means now: the text of the file, a deletion (`content: null`), or nothing (null). An
 * event can come late: the Undo of a delete puts a file back before the event of the delete comes, and
 * the note left the book although its file is there. So a deletion counts only when the file is not
 * there now. A change of a file that is not there gives nothing: its deletion comes as its own event.
 */
export async function contentNow(full: string, deleted: boolean): Promise<{ content: string | null } | null> {
  try {
    return { content: await readFile(full, 'utf8') }
  } catch {
    return deleted ? { content: null } : null
  }
}

export function watchBook(root: string, listener: Listener): void {
  if (watchers.has(root)) return
  const w = watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
    ignored: (path: string) => /[\\/](\.git|\.wordelia|node_modules)([\\/]|$)/.test(path) || path.endsWith('.tmp'),
    depth: 6
  })
  const handle = async (full: string, deleted: boolean): Promise<void> => {
    const lower = full.toLowerCase()
    if (!/\.(md|json)$/i.test(full)) return
    const now = await contentNow(full, deleted)
    if (!now) return
    const { content } = now
    const signature = content == null ? 'deleted' : hashText(content)
    if (isOwnChange(full, signature)) return
    // A change of another program: a second event of it says nothing new.
    ownWrites.set(lower, [{ sig: signature, at: Date.now() }])
    listener({ root, rel: toRel(root, full), content })
  }
  w.on('add', (p) => void handle(p, false))
  w.on('change', (p) => void handle(p, false))
  w.on('unlink', (p) => void handle(p, true))
  watchers.set(root, w)
}

export async function unwatchBook(root: string): Promise<void> {
  const w = watchers.get(root)
  if (!w) return
  watchers.delete(root)
  await w.close()
}

export async function unwatchAll(): Promise<void> {
  await Promise.all([...watchers.keys()].map(unwatchBook))
}
