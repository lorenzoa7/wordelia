// Debounced, ordered file writes for the open book.

import { invoke } from '@/lib/api'

type Listener = (state: SaveState) => void
export type SaveState = 'saved' | 'saving' | 'error'

const DELAY = 500

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const pending = new Map<string, { root: string; content: string }>()
const inflight = new Map<string, Promise<void>>()
const listeners = new Set<Listener>()
let state: SaveState = 'saved'
let lastError = ''

function emit(next: SaveState): void {
  state = next
  for (const l of listeners) l(state)
}

function refresh(): void {
  if (state === 'error') return
  emit(pending.size || inflight.size ? 'saving' : 'saved')
}

async function write(key: string): Promise<void> {
  const job = pending.get(key)
  if (!job) return
  pending.delete(key)
  const rel = key.slice(key.indexOf('|') + 1)
  const prev = inflight.get(key) ?? Promise.resolve()
  const run = prev
    .then(() => invoke('book:writeFile', job.root, rel, job.content))
    .then(
      () => {
        if (state === 'error') state = 'saving'
      },
      (err: unknown) => {
        lastError = err instanceof Error ? err.message : String(err)
        emit('error')
      }
    )
    .finally(() => {
      if (inflight.get(key) === run) inflight.delete(key)
      refresh()
    })
  inflight.set(key, run)
  refresh()
  await run
}

export const saver = {
  /** Schedule a write. A newer write for the same file replaces the older one. */
  write(root: string, rel: string, content: string, immediate = false): void {
    const key = `${root}|${rel}`
    pending.set(key, { root, content })
    const t = timers.get(key)
    if (t) clearTimeout(t)
    if (immediate) {
      timers.delete(key)
      void write(key)
    } else {
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          void write(key)
        }, DELAY)
      )
    }
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
    refresh()
  },

  async flush(): Promise<void> {
    for (const [key, t] of timers) {
      clearTimeout(t)
      timers.delete(key)
    }
    await Promise.all([...pending.keys()].map(write))
    await Promise.all([...inflight.values()])
  },

  subscribe(l: Listener): () => void {
    listeners.add(l)
    l(state)
    return () => listeners.delete(l)
  },

  get error(): string {
    return lastError
  }
}

window.addEventListener('beforeunload', () => {
  void saver.flush()
})
