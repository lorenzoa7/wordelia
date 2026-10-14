// Watches open books for changes that other programs make (sync clients, git, editors).

import { watch, type FSWatcher } from 'chokidar'
import { readFile } from 'node:fs/promises'
import { hashText } from '@shared/book'
import { toRel } from '../fsutil'

type Listener = (e: { root: string; rel: string; content: string | null }) => void

const watchers = new Map<string, FSWatcher>()
/** Hashes of content that the app wrote itself, per absolute path */
const ownWrites = new Map<string, string>()

export function noteOwnWrite(fullPath: string, content: string | null): void {
  ownWrites.set(fullPath.toLowerCase(), content == null ? 'deleted' : hashText(content))
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
    let content: string | null = null
    if (!deleted) {
      try {
        content = await readFile(full, 'utf8')
      } catch {
        return
      }
    }
    const signature = content == null ? 'deleted' : hashText(content)
    if (ownWrites.get(lower) === signature) return
    ownWrites.set(lower, signature)
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
