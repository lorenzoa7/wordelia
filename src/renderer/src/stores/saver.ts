// Debounced, ordered file writes for the open book.
// A failed write stays in the queue and retries, so a busy file (a sync client) never loses text.

import { invoke } from '@/lib/api'

type Listener = (state: SaveState) => void
export type SaveState = 'saved' | 'saving' | 'error'

/** Why a write failed, in words that the author understands (see `write.status.reasons`) */
export type SaveProblem = 'readOnly' | 'busy' | 'missing' | 'diskFull' | 'other'

const DELAY = 500
/** A file that changes again and again (steady typing) is written at least this often. */
const MAX_WAIT = 2000
const MAX_RETRY_DELAY = 30000

interface Job {
  root: string
  content: string
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pending = new Map<string, Job>()
/** When the oldest write that waits for a file was asked for */
const waitingSince = new Map<string, number>()
const inflight = new Map<string, Promise<boolean>>()
const failed = new Map<string, number>() // key -> next retry delay
/** Text that is only in memory: an editor that waits before it gives its text to the store */
const held = new Set<string>()
const listeners = new Set<Listener>()
let state: SaveState = 'saved'
let lastError = ''

function emit(next: SaveState): void {
  if (next === state) return
  state = next
  for (const l of listeners) l(state)
}

function refresh(): void {
  if (failed.size) emit('error')
  else emit(pending.size || inflight.size || held.size ? 'saving' : 'saved')
}

function schedule(key: string, delay: number): void {
  const t = timers.get(key)
  if (t) clearTimeout(t)
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key)
      void write(key)
    }, delay)
  )
}

/** The kind of a write error, from its code (EPERM, ENOENT…). */
export function saveProblemOf(message: string): SaveProblem {
  const code = /\b(E[A-Z]{3,})\b/.exec(message)?.[1] ?? ''
  if (code === 'EPERM' || code === 'EACCES' || code === 'EROFS') return 'readOnly'
  if (code === 'EBUSY' || code === 'ETXTBSY') return 'busy'
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing'
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'diskFull'
  return 'other'
}

/** Write the pending job of a file. Resolves true when it is on disk. */
function write(key: string): Promise<boolean> {
  const job = pending.get(key)
  if (!job) return inflight.get(key) ?? Promise.resolve(true)
  pending.delete(key)
  waitingSince.delete(key)
  const rel = key.slice(key.indexOf('|') + 1)
  const prev = inflight.get(key) ?? Promise.resolve(true)
  const run = prev
    .then(() => invoke('book:writeFile', job.root, rel, job.content))
    .then(
      () => {
        failed.delete(key)
        return true
      },
      (err: unknown) => {
        lastError = err instanceof Error ? err.message : String(err)
        // Keep the text: a newer job for the same file wins, else retry this one.
        if (!pending.has(key)) pending.set(key, job)
        const delay = Math.min((failed.get(key) ?? 1000) * 2, MAX_RETRY_DELAY)
        failed.set(key, delay)
        schedule(key, delay)
        return false
      }
    )
    .finally(() => {
      if (inflight.get(key) === run) inflight.delete(key)
      refresh()
    })
  inflight.set(key, run)
  refresh()
  return run
}

export const saver = {
  /** Schedule a write. A newer write for the same file replaces the older one. */
  write(root: string, rel: string, content: string, immediate = false): void {
    const key = `${root}|${rel}`
    pending.set(key, { root, content })
    if (immediate) {
      const t = timers.get(key)
      if (t) clearTimeout(t)
      timers.delete(key)
      void write(key)
    } else if (failed.has(key)) {
      // A file that cannot be written now keeps its retry time: new text does not make it try more often.
      if (!timers.has(key)) schedule(key, failed.get(key)!)
    } else {
      const now = Date.now()
      const since = waitingSince.get(key) ?? now
      waitingSince.set(key, since)
      schedule(key, Math.max(0, Math.min(DELAY, MAX_WAIT - (now - since))))
    }
    refresh()
  },

  /**
   * Text of `id` is only in memory now (an editor waits a moment before it gives its text to the
   * store): the status shows that it is not on disk yet. `release` when the editor gave it.
   */
  hold(id: string): void {
    if (held.has(id)) return
    held.add(id)
    refresh()
  },

  release(id: string): void {
    if (!held.delete(id)) return
    refresh()
  },

  isPending(root: string, rel: string): boolean {
    const key = `${root}|${rel}`
    return pending.has(key) || inflight.has(key)
  },

  /** Drop a scheduled write, for example before a rename. */
  cancel(root: string, rel: string): void {
    const key = `${root}|${rel}`
    const t = timers.get(key)
    if (t) clearTimeout(t)
    timers.delete(key)
    pending.delete(key)
    waitingSince.delete(key)
    failed.delete(key)
    refresh()
  },

  /** Try the files that could not be written again, now. */
  retry(): void {
    for (const key of failed.keys()) {
      failed.set(key, 1000)
      schedule(key, 0)
    }
  },

  /** Write everything now. Resolves false if some text could not be saved. */
  async flush(): Promise<boolean> {
    for (const [key, t] of timers) {
      clearTimeout(t)
      timers.delete(key)
    }
    const results = await Promise.all([...new Set([...pending.keys(), ...inflight.keys()])].map(write))
    return results.every(Boolean) && failed.size === 0
  },

  subscribe(l: Listener): () => void {
    listeners.add(l)
    l(state)
    return () => listeners.delete(l)
  },

  get error(): string {
    return lastError
  },

  /** Why the last write failed, in plain words (a key of `write.status.reasons`) */
  get problem(): SaveProblem {
    return saveProblemOf(lastError)
  }
}
