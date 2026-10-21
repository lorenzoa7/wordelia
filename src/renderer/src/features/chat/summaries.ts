// Chapter summaries for books that are too long to send in full.
// Cached by content hash in .wordelia/cache/summaries.json (local, not synced).

import { hashText } from '@shared/book'
import { buildSummarySystem } from '@shared/prompts/background'
import { estimateTokens } from '@shared/prompts/context'
import type { Chapter, ModelChoice } from '@shared/types'
import { invoke } from '@/lib/api'
import { runCompletion, type RunHandle } from '@/lib/ai'

const CACHE_FILE = '.wordelia/cache/summaries.json'

type Cache = Record<string, { hash: string; summary: string }>

let memory: { root: string; cache: Cache } | null = null

async function load(root: string): Promise<Cache> {
  if (memory?.root === root) return memory.cache
  const text = await invoke('book:readFile', root, CACHE_FILE)
  let cache: Cache = {}
  try {
    cache = text ? (JSON.parse(text) as Cache) : {}
  } catch {
    cache = {}
  }
  memory = { root, cache }
  return cache
}

/** Summaries that are made now, by book, chapter and text: a second message waits for them, it does not ask again. */
const running = new Map<string, { promise: Promise<string | null>; handle: RunHandle; users: number }>()

export interface SummaryOptions {
  /** Stop: the requests that run for this message stop, the summaries that are done stay. */
  signal?: AbortSignal
  /** How many of the missing summaries are done */
  onProgress?: (done: number, total: number) => void
}

/** One summary, or a summary that another message asks for already. */
function summarize(root: string, c: Chapter, route: ModelChoice, signal?: AbortSignal): Promise<string | null> {
  const key = `${root}\n${c.id}\n${hashText(c.body)}`
  let job = running.get(key)
  if (!job) {
    const handle = runCompletion({
      route,
      purpose: 'background',
      system: buildSummarySystem(),
      messages: [{ role: 'user', content: `Chapter "${c.title}":\n\n${c.body}` }],
      maxTokens: 600
    })
    const promise = handle.done.then((r) => (r.ok && r.text.trim() ? r.text.trim() : null)).finally(() => running.delete(key))
    job = { promise, handle, users: 0 }
    running.set(key, job)
  }
  const mine = job
  mine.users++
  return new Promise((resolve) => {
    let settled = false
    const stop = (): void => {
      if (settled) return
      settled = true
      // The request stops only when no other message waits for it.
      if (--mine.users <= 0) mine.handle.cancel()
      resolve(null)
    }
    if (signal?.aborted) return stop()
    signal?.addEventListener('abort', stop, { once: true })
    void mine.promise.then((s) => {
      signal?.removeEventListener('abort', stop)
      if (settled) return
      settled = true
      mine.users--
      resolve(s)
    })
  })
}

/**
 * Summaries for the chapters that will not fit in full. Missing summaries are made now, three at a
 * time, with the background model. Each summary goes to the cache when it is done, so a stop keeps them.
 */
export async function summariesFor(
  root: string,
  chapters: Chapter[],
  keepFull: Set<string>,
  budget: number,
  route: ModelChoice | null,
  opts: SummaryOptions = {}
): Promise<Record<string, string>> {
  const total = chapters.reduce((n, c) => n + estimateTokens(c.body), 0)
  if (total <= budget || !route) return {}
  const cache = await load(root)
  const need = chapters.filter((c) => !keepFull.has(c.id) && c.body.trim())
  const out: Record<string, string> = {}
  const todo: Chapter[] = []
  for (const c of need) {
    const h = hashText(c.body)
    const hit = cache[c.id]
    if (hit && hit.hash === h) out[c.id] = hit.summary
    else todo.push(c)
  }
  if (todo.length) opts.onProgress?.(0, todo.length)
  for (let i = 0; i < todo.length && !opts.signal?.aborted; i += 3) {
    const made = await Promise.all(todo.slice(i, i + 3).map(async (c) => ({ c, summary: await summarize(root, c, route, opts.signal) })))
    let changed = false
    for (const { c, summary } of made) {
      if (!summary) continue
      out[c.id] = summary
      cache[c.id] = { hash: hashText(c.body), summary }
      changed = true
    }
    if (changed) await invoke('book:writeFile', root, CACHE_FILE, JSON.stringify(cache))
    if (!opts.signal?.aborted) opts.onProgress?.(Math.min(todo.length, i + 3), todo.length)
  }
  return out
}
