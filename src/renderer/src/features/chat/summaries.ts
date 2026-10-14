// Chapter summaries for books that are too long to send in full.
// Cached by content hash in .wordelia/cache/summaries.json (local, not synced).

import { hashText } from '@shared/book'
import { buildSummarySystem } from '@shared/prompts/background'
import { estimateTokens } from '@shared/prompts/context'
import type { Chapter, ModelChoice } from '@shared/types'
import { invoke } from '@/lib/api'
import { runCompletion } from '@/lib/ai'

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

/**
 * Summaries for the chapters that will not fit in full. Missing summaries are made now,
 * three at a time, with the background model.
 */
export async function summariesFor(
  root: string,
  chapters: Chapter[],
  keepFull: Set<string>,
  budget: number,
  route: ModelChoice | null
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
  let changed = false
  for (let i = 0; i < todo.length; i += 3) {
    await Promise.all(
      todo.slice(i, i + 3).map(async (c) => {
        const r = await runCompletion({
          route,
          purpose: 'background',
          system: buildSummarySystem(),
          messages: [{ role: 'user', content: `Chapter "${c.title}":\n\n${c.body}` }],
          maxTokens: 600
        }).done
        if (r.ok && r.text.trim()) {
          out[c.id] = r.text.trim()
          cache[c.id] = { hash: hashText(c.body), summary: r.text.trim() }
          changed = true
        }
      })
    )
  }
  if (changed) await invoke('book:writeFile', root, CACHE_FILE, JSON.stringify(cache))
  return out
}
