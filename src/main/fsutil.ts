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

/** Write a file atomically: write a temp file, then rename it over the target. */
export async function atomicWrite(path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.${tmpCounter++}.tmp`
  await writeFile(tmp, content)
  try {
    await rename(tmp, path)
  } catch (err) {
    // On Windows, rename can fail when another program (a sync client) holds the file.
    await writeFile(path, content)
    await rm(tmp, { force: true })
    if ((err as NodeJS.ErrnoException).code !== 'EPERM' && (err as NodeJS.ErrnoException).code !== 'EBUSY') throw err
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
