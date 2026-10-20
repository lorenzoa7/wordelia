// AI registry and request lifecycle in the main process.

import type { WebContents } from 'electron'
import type { CompletionRequest, CompletionResult, ModelInfo, ProviderId, ProviderStatus } from '@shared/types'
import { anthropicApi } from './anthropic'
import { loadImages } from './images'
import { claudeCode } from './claude-code'
import { codex } from './codex'
import { mockProvider } from './mock'
import { openaiApi } from './openai'
import { clearBinCache } from './resolve-bin'
import type { ProviderTransport } from './transport'

const transports: Record<ProviderId, ProviderTransport> = {
  'claude-code': claudeCode,
  codex,
  anthropic: anthropicApi,
  openai: openaiApi
}

function transport(id: ProviderId): ProviderTransport {
  // End-to-end tests use a scripted provider, so they never call a real AI.
  if (process.env['WORDELIA_MOCK_AI'] === '1') return mockProvider(id)
  return transports[id]
}

const running = new Map<string, AbortController>()

export async function providerStatus(id: ProviderId): Promise<ProviderStatus> {
  clearBinCache()
  try {
    return await transport(id).status()
  } catch (err) {
    return { provider: id, installed: false, loggedIn: false, detail: String(err) }
  }
}

export async function providerModels(id: ProviderId): Promise<ModelInfo[]> {
  try {
    return await transport(id).listModels()
  } catch {
    return []
  }
}

export async function complete(sender: WebContents, requestId: string, req: CompletionRequest): Promise<CompletionResult> {
  const ac = new AbortController()
  running.set(requestId, ac)
  try {
    return await transport(req.route.provider).complete(
      await loadImages(req),
      (event) => {
        if (!sender.isDestroyed()) sender.send('ai:event', { requestId, event })
      },
      ac.signal
    )
  } catch (err) {
    return { ok: false, text: '', error: err instanceof Error ? err.message : String(err), errorKind: 'other' }
  } finally {
    running.delete(requestId)
  }
}

export function cancel(requestId: string): void {
  running.get(requestId)?.abort()
}

export function cancelAll(): void {
  for (const ac of running.values()) ac.abort()
}
