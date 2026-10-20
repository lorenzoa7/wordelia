// OpenAI API transport (API key of the user), with the official SDK and the Responses API.

import OpenAI from 'openai'
import type { CompletionResult, ModelInfo, ProviderStatus, StreamEvent } from '@shared/types'
import { mainT } from '../i18n'
import { getSecret } from '../settings'
import { classifyError, type ProviderTransport } from './transport'
import { openaiContent, type AiRequest } from './images'

let modelCache: { at: number; models: ModelInfo[] } | null = null
/** False after the API refused reasoning summaries for this key (the organization is not verified). */
let summaryAllowed = true

async function client(): Promise<OpenAI | null> {
  const key = await getSecret('openai')
  return key ? new OpenAI({ apiKey: key }) : null
}

/** Keep chat models only. The list endpoint also returns embedding, audio and image models. */
function isChatModel(id: string): boolean {
  if (!/^(gpt-|o\d|chatgpt-)/.test(id)) return false
  return !/(embedding|tts|whisper|audio|realtime|transcribe|image|dall-e|search|moderation|instruct|-\d{4}-\d{2}-\d{2}$)/.test(id)
}

export const openaiApi: ProviderTransport = {
  id: 'openai',

  async status(): Promise<ProviderStatus> {
    const c = await client()
    const t = (await mainT()).main.ai
    if (!c) return { provider: 'openai', installed: true, loggedIn: false, detail: t.addApiKey }
    try {
      await c.models.list()
      return { provider: 'openai', installed: true, loggedIn: true, detail: t.apiKeyWorks }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { provider: 'openai', installed: true, loggedIn: false, detail: msg.slice(0, 200) }
    }
  },

  async listModels(): Promise<ModelInfo[]> {
    if (modelCache && Date.now() - modelCache.at < 30 * 60 * 1000) return modelCache.models
    const c = await client()
    if (!c) return []
    const out: Array<ModelInfo & { created: number }> = []
    try {
      for await (const m of c.models.list()) {
        if (!isChatModel(m.id)) continue
        out.push({
          id: m.id,
          label: m.id,
          created: m.created,
          tier: /mini|nano/.test(m.id) ? 'fast' : 'best'
        })
      }
    } catch {
      return []
    }
    out.sort((a, b) => b.created - a.created)
    const models = out.map(({ created: _created, ...m }) => m)
    modelCache = { at: Date.now(), models }
    return models
  },

  async complete(req: AiRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult> {
    const c = await client()
    const t = (await mainT()).main.ai
    if (!c) return { ok: false, text: '', error: t.openaiAddKey, errorKind: 'not-logged-in' }
    const model = req.route.model
    let text = ''
    try {
      const create = (summary: boolean) =>
        c.responses.create(
          {
            model,
            instructions: req.system,
            input: req.messages.map((m, i) => (m.role === 'user' && req.images?.[i]?.length ? { role: m.role, content: openaiContent(m.content, req.images[i]) } : { role: m.role, content: m.content })),
            stream: true,
            // Reasoning summaries show what the model thinks about while it works.
            ...(req.route.effort ? { reasoning: { effort: req.route.effort, ...(summary ? { summary: 'auto' as const } : {}) } } : {})
          },
          { signal }
        )
      let stream: Awaited<ReturnType<typeof create>>
      try {
        stream = await create(summaryAllowed && Boolean(req.route.effort))
      } catch (err) {
        // Some organizations must be verified before they get reasoning summaries. Then ask without them.
        if (!(err instanceof OpenAI.BadRequestError) || !/summar|verif/i.test(err.message) || !req.route.effort) throw err
        summaryAllowed = false
        stream = await create(false)
      }
      onEvent({ type: 'start', model })
      let usage: CompletionResult['usage']
      let thinkingSent = false
      for await (const ev of stream) {
        if (ev.type === 'response.output_text.delta') {
          text += ev.delta
          onEvent({ type: 'text', delta: ev.delta })
        } else if (ev.type === 'response.reasoning_summary_text.delta') {
          onEvent({ type: 'thinking', delta: ev.delta })
          thinkingSent = true
        } else if (ev.type === 'response.reasoning_summary_part.added') {
          if (thinkingSent) onEvent({ type: 'thinking', delta: '\n\n' })
        } else if (ev.type === 'response.completed') {
          const u = ev.response.usage
          if (u) {
            usage = { inputTokens: u.input_tokens, outputTokens: u.output_tokens }
            onEvent({ type: 'usage', ...usage })
          }
        } else if (ev.type === 'response.failed') {
          const msg = ev.response.error?.message ?? t.requestFailed
          return { ok: false, text, model, error: msg, errorKind: classifyError(msg) }
        } else if (ev.type === 'error') {
          return { ok: false, text, model, error: ev.message, errorKind: classifyError(ev.message) }
        }
      }
      return { ok: true, text, model, usage }
    } catch (err) {
      if (signal.aborted) return { ok: false, text, model, error: t.cancelled, errorKind: 'cancelled' }
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, text, model, error: msg, errorKind: classifyError(msg) }
    }
  }
}
