// The newest published version of a CLI provider, from the npm registry.
// Wordelia shows it so the user knows when "claude update" brings new models.

import { net } from 'electron'
import type { ProviderId } from '@shared/types'

const PACKAGES: Partial<Record<ProviderId, string>> = {
  'claude-code': '@anthropic-ai/claude-code',
  codex: '@openai/codex'
}
const TTL = 12 * 60 * 60 * 1000
const cache = new Map<ProviderId, { at: number; version: string | undefined }>()

export async function latestVersion(provider: ProviderId): Promise<string | undefined> {
  const pkg = PACKAGES[provider]
  if (!pkg || process.env.WORDELIA_MOCK_AI === '1') return undefined
  const hit = cache.get(provider)
  if (hit && Date.now() - hit.at < TTL) return hit.version
  let version: string | undefined
  try {
    const res = await Promise.race([
      net.fetch(`https://registry.npmjs.org/${pkg}/latest`, { headers: { accept: 'application/json' } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ])
    if (res.ok) version = ((await res.json()) as { version?: string }).version
  } catch {
    version = undefined
  }
  cache.set(provider, { at: Date.now(), version })
  return version
}
