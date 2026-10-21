// OpenAI API transport (API key of the user), with the official SDK and the Responses API.

import OpenAI from 'openai'
import type { CompletionResult, ModelInfo, ProviderStatus, StreamEvent } from '@shared/types'
import { mainT } from '../i18n'
import { getSecret } from '../settings'
import { isGeneralOpenAiModel, openaiEfforts, openaiModelLabel } from '@shared/ai/openai'
import { failure, keyStatus, type ProviderTransport } from './transport'
import { openaiContent, type AiRequest } from './images'

let modelCache: { at: number; models: ModelInfo[] } | null = null
/** False after the API refused reasoning summaries for this key (the organization is not verified). */
let summaryAllowed = true
/** Models that refused a reasoning effort. The app sends them none. */
const noEffort = new Set<string>()

async function client(): Promise<OpenAI | null> {
  const key = await getSecret('openai')
  return key ? new OpenAI({ apiKey: key }) : null
}

/** Keep chat models only. The list endpoint also returns embedding, audio and image models. */
function isChatModel(id: string): boolean {
  if (!/^(gpt-|o\d|chatgpt-)/.test(id)) return false
  return !/(embedding|tts|whisper|audio|realtime|transcribe|image|dall-e|search|research|computer-use|moderation|instruct|-\d{4}-\d{2}-\d{2}$)/.test(id)
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
      return keyStatus('openai', err, err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError)
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
        const efforts = openaiEfforts(m.id)
        out.push({
          id: m.id,
          label: openaiModelLabel(m.id),
          created: m.created,
          tier: /mini|nano/.test(m.id) ? 'fast' : isGeneralOpenAiModel(m.id) ? 'best' : 'balanced',
          ...(efforts ? { efforts } : {})
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
      // 'summary': the effort and a summary of the reasoning; 'effort': the effort only; 'none': no reasoning settings.
      type Reasoning = 'summary' | 'effort' | 'none'
      const create = (mode: Reasoning) =>
        c.responses.create(
          {
            model,
            instructions: req.system,
            input: req.messages.map((m, i) => (m.role === 'user' && req.images?.[i]?.length ? { role: m.role, content: openaiContent(m.content, req.images[i]) } : { role: m.role, content: m.content })),
            stream: true,
            // Reasoning summaries show what the model thinks about while it works.
            ...(mode !== 'none' && req.route.effort
              ? { reasoning: { effort: req.route.effort === 'minimal' ? ('low' as const) : (req.route.effort as 'low' | 'medium' | 'high'), ...(mode === 'summary' ? { summary: 'auto' as const } : {}) } }
              : {})
          },
          { signal }
        )
      let mode: Reasoning = !req.route.effort || noEffort.has(model) ? 'none' : summaryAllowed ? 'summary' : 'effort'
      let stream: Awaited<ReturnType<typeof create>>
      for (;;) {
        try {
          stream = await create(mode)
          break
        } catch (err) {
          if (!(err instanceof OpenAI.BadRequestError) || mode === 'none') throw err
          if (mode === 'summary' && /summar|verif/i.test(err.message)) {
            // Some organizations must be verified before they get reasoning summaries. Then ask without them.
            summaryAllowed = false
            mode = 'effort'
          } else if (/reasoning|effort/i.test(err.message)) {
            // A model without reasoning rejects the effort. Ask again without it, and remember the model.
            noEffort.add(model)
            mode = 'none'
          } else throw err
        }
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
          return failure(ev.response.error?.message ?? t.requestFailed, { text, model, api: true })
        } else if (ev.type === 'error') {
          return failure(ev.message, { text, model, api: true })
        }
      }
      return { ok: true, text, model, usage }
    } catch (err) {
      if (signal.aborted) return { ok: false, text, model, error: t.cancelled, errorKind: 'cancelled' }
      const r = failure(err instanceof Error ? err.message : String(err), { text, model, api: true })
      if (err instanceof OpenAI.APIConnectionError) return { ...r, errorKind: 'network' }
      if ((err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) && r.errorKind !== 'no-credit') return { ...r, errorKind: 'bad-key' }
      return r
    }
  }
}
