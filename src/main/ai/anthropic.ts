// Anthropic API transport (API key of the user), with the official SDK.

import Anthropic from '@anthropic-ai/sdk'
import type { CompletionResult, ModelInfo, ProviderStatus, StreamEvent } from '@shared/types'
import { EFFORT_ORDER, modelLabel } from '@shared/ai/effort'
import { mainT } from '../i18n'
import { getSecret } from '../settings'
import { classifyError, type ProviderTransport } from './transport'
import { anthropicContent, type AiRequest } from './images'

/** Models that support the server-side refusal fallback chain. */
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/

/**
 * Models that always think (adaptive thinking is on by default). Their thinking text is omitted by
 * default; "summarized" only shows it, so the chat can stream what the model thinks about at no extra cost.
 */
const THINKING_MODELS = /^claude-(fable|mythos|opus|sonnet|haiku)-5(-\d{1,2})?$/

let modelCache: { at: number; models: ModelInfo[] } | null = null

async function client(): Promise<Anthropic | null> {
  const key = await getSecret('anthropic')
  return key ? new Anthropic({ apiKey: key }) : null
}

function tierOf(id: string): ModelInfo['tier'] {
  if (/opus|fable/.test(id)) return 'best'
  if (/haiku/.test(id)) return 'fast'
  return 'balanced'
}

export const anthropicApi: ProviderTransport = {
  id: 'anthropic',

  async status(): Promise<ProviderStatus> {
    const c = await client()
    const t = (await mainT()).main.ai
    if (!c) return { provider: 'anthropic', installed: true, loggedIn: false, detail: t.addApiKey }
    try {
      await c.models.list({ limit: 1 })
      return { provider: 'anthropic', installed: true, loggedIn: true, detail: t.apiKeyWorks }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { provider: 'anthropic', installed: true, loggedIn: false, detail: msg.slice(0, 200) }
    }
  },

  async listModels(): Promise<ModelInfo[]> {
    if (modelCache && Date.now() - modelCache.at < 30 * 60 * 1000) return modelCache.models
    const c = await client()
    if (!c) return []
    const out: ModelInfo[] = []
    try {
      for await (const m of c.models.list({ limit: 100 })) {
        if (!m.id.startsWith('claude-')) continue
        // capabilities.effort says which levels the model accepts (Haiku 4.5 has none).
        const caps = (m as unknown as { capabilities?: { effort?: Record<string, { supported?: boolean } | boolean> } }).capabilities
        const effortCaps = caps?.effort
        const efforts = effortCaps
          ? EFFORT_ORDER.filter((e) => typeof effortCaps[e] === 'object' && (effortCaps[e] as { supported?: boolean }).supported)
          : undefined
        out.push({
          id: m.id,
          // "Claude Opus 5.5" → "Opus 5.5"
          label: modelLabel(m.display_name ?? m.id),
          tier: tierOf(m.id),
          contextWindow: (m as unknown as { max_input_tokens?: number }).max_input_tokens,
          ...(efforts ? { efforts: (effortCaps as { supported?: boolean }).supported === false ? [] : efforts } : {})
        })
      }
    } catch {
      return []
    }
    modelCache = { at: Date.now(), models: out }
    return out
  },

  async complete(req: AiRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult> {
    const c = await client()
    const t = (await mainT()).main.ai
    if (!c) return { ok: false, text: '', error: t.anthropicAddKey, errorKind: 'not-logged-in' }
    const model = req.route.model || 'claude-opus-5-5'
    let text = ''
    try {
      const params = {
        model,
        max_tokens: req.maxTokens ?? 32000,
        system: [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }],
        messages: req.messages.map((m, i) => ({ role: m.role, content: m.role === 'user' && req.images?.[i]?.length ? anthropicContent(m.content, req.images[i]) : m.content })),
        ...(req.route.effort ? { output_config: { effort: req.route.effort === 'minimal' ? ('low' as const) : req.route.effort } } : {}),
        ...(THINKING_MODELS.test(model) ? { thinking: { type: 'adaptive' as const, display: 'summarized' as const } } : {})
      }
      onEvent({ type: 'start', model })
      const onText = (delta: string): void => {
        text += delta
        onEvent({ type: 'text', delta })
      }
      let thinkingSent = false
      const onThinking = (delta: string): void => {
        if (!delta) return
        thinkingSent = true
        onEvent({ type: 'thinking', delta })
      }
      // A new thinking block starts a new paragraph.
      const onBlock = (ev: { type: string; content_block?: { type: string } }): void => {
        if (ev.type === 'content_block_start' && ev.content_block?.type === 'thinking' && thinkingSent) onEvent({ type: 'thinking', delta: '\n\n' })
      }
      let final: { model: string; stop_reason: string | null; usage: Anthropic.Usage | Anthropic.Beta.BetaUsage }
      if (FALLBACK_MODELS.test(model)) {
        // Server-side refusal fallback: on a policy decline, the API continues on a fallback model.
        const stream = c.beta.messages.stream(
          { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
          { signal }
        )
        stream.on('text', onText)
        stream.on('thinking', onThinking)
        stream.on('streamEvent', onBlock)
        final = await stream.finalMessage()
      } else {
        const stream = c.messages.stream(params, { signal })
        stream.on('text', onText)
        stream.on('thinking', onThinking)
        stream.on('streamEvent', onBlock)
        final = await stream.finalMessage()
      }
      const usage = {
        inputTokens:
          (final.usage.input_tokens ?? 0) +
          (final.usage.cache_read_input_tokens ?? 0) +
          (final.usage.cache_creation_input_tokens ?? 0),
        outputTokens: final.usage.output_tokens
      }
      onEvent({ type: 'usage', ...usage })
      if (final.stop_reason === 'refusal') {
        return { ok: false, text, model: final.model, error: t.refusal, errorKind: 'other', usage }
      }
      return { ok: true, text, model: final.model, usage }
    } catch (err) {
      if (signal.aborted) return { ok: false, text, model, error: t.cancelled, errorKind: 'cancelled' }
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return { ok: false, text, model, error: t.anthropicKeyRejected, errorKind: 'not-logged-in' }
      }
      if (err instanceof Anthropic.RateLimitError) {
        return { ok: false, text, model, error: t.rateLimit, errorKind: 'rate-limit' }
      }
      if (err instanceof Anthropic.APIConnectionError) {
        return { ok: false, text, model, error: t.anthropicUnreachable, errorKind: 'network' }
      }
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, text, model, error: msg, errorKind: classifyError(msg) }
    }
  }
}
