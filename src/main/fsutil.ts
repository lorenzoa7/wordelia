import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'

/** Join a relative path to a root. Throws if the result leaves the root. */
export function safeJoin(root: string, rel: string): string {
  if (isAbsolute(rel)) throw new Error(`Absolute path not allowed: ${rel}`)
  const full = normalize(join(root, rel))
  const back = relative(root, full)
  if (back.startsWith('..') || isAbsolute(back)) throw new Error(`Path leaves the book folder: ${rel}`)
  return full
}

/** Relative path with forward slashes. */
export function toRel(root: string, full: string): string {
  return relative(root, full).split(sep).join('/')
}

let tmpCounter = 0

const BUSY = new Set(['EPERM', 'EBUSY', 'EACCES'])
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Write a file atomically: write a temp file, then rename it over the target.
 * On Windows a sync client or an antivirus can hold the target for a moment, so the rename
 * retries. If it still fails, the content is written in place (not atomic, but not lost).
 */
export async function atomicWrite(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`
  try {
    await writeFile(tmp, content)
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await rename(tmp, path)
        return
      } catch (err) {
        if (!BUSY.has((err as NodeJS.ErrnoException).code ?? '')) throw err
        await sleep(40 * (attempt + 1))
      }
    }
    // Last resort for a busy target. This throws if the file is still locked.
    await writeFile(path, content)
  } finally {
    await rm(tmp, { force: true }).catch(() => {})
  }
}

export async function readTextOr(path: string, fallback: string | null): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return fallback
  }
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  const text = await readTextOr(path, null)
  if (text == null) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}
