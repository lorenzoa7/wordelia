// Suggested model routes for a provider, from its model list.

import type { ModelChoice, ModelInfo, ModelRoutes, ProviderId, TaskKind } from '../types'

export const TASK_LABELS: Record<TaskKind, { name: string; hint: string }> = {
  chat: { name: 'Chat', hint: 'Conversations, feedback and proposed edits.' },
  action: { name: 'Actions', hint: 'Polish and the other actions on selected text. Speed matters here.' },
  sync: { name: 'Planning sync', hint: 'Reads chapters and updates the planning.' },
  background: { name: 'Background', hint: 'Thread digests, titles and chapter summaries.' }
}

export const PROVIDER_LABELS: Record<ProviderId, { name: string; kind: string; short: string }> = {
  'claude-code': { name: 'Claude Code', kind: 'Your Claude subscription, through the claude CLI', short: 'Claude' },
  codex: { name: 'Codex', kind: 'Your ChatGPT subscription, through the codex CLI', short: 'Codex' },
  anthropic: { name: 'Anthropic API', kind: 'Pay per use with an API key', short: 'Anthropic' },
  openai: { name: 'OpenAI API', kind: 'Pay per use with an API key', short: 'OpenAI' }
}

function newest(models: ModelInfo[], re: RegExp): ModelInfo | undefined {
  // Model lists come newest first (Anthropic) or sorted by date (OpenAI).
  return models.find((m) => re.test(m.id))
}

export function suggestRoutes(provider: ProviderId, models: ModelInfo[]): ModelRoutes {
  const pick = (m: ModelInfo | undefined, effort?: ModelChoice['effort']): ModelChoice | null =>
    m ? { provider, model: m.id, ...(effort ? { effort } : {}) } : null
  switch (provider) {
    case 'claude-code':
      return {
        chat: { provider, model: 'opus' },
        action: { provider, model: 'sonnet' },
        sync: { provider, model: 'opus' },
        background: { provider, model: 'haiku' }
      }
    case 'anthropic': {
      const opus = newest(models, /^claude-opus/) ?? newest(models, /^claude-fable/)
      const sonnet = newest(models, /^claude-sonnet/) ?? opus
      const haiku = newest(models, /^claude-haiku/) ?? sonnet
      return { chat: pick(opus), action: pick(sonnet), sync: pick(opus), background: pick(haiku, 'low') }
    }
    case 'codex': {
      const def = models.find((m) => m.isDefault) ?? models[0]
      const fast = models.find((m) => m.tier === 'fast') ?? def
      // An empty model id means "the CLI default".
      const base: ModelChoice = def ? { provider, model: def.id } : { provider, model: '' }
      return {
        chat: { ...base, effort: 'medium' },
        action: { ...base, effort: 'low' },
        sync: { ...base, effort: 'medium' },
        background: fast ? { provider, model: fast.id, effort: 'low' } : { ...base, effort: 'low' }
      }
    }
    case 'openai': {
      const best = models.find((m) => m.tier !== 'fast') ?? models[0]
      const fast = models.find((m) => m.tier === 'fast') ?? best
      return { chat: pick(best, 'medium'), action: pick(best, 'low'), sync: pick(best, 'medium'), background: pick(fast, 'low') }
    }
  }
}

export function routeLabel(route: ModelChoice | null, models?: ModelInfo[]): string {
  if (!route) return 'Not set'
  const model = models?.find((m) => m.id === route.model)?.label ?? (route.model || 'Default model')
  return `${PROVIDER_LABELS[route.provider].short} · ${model}${route.effort ? ` · ${route.effort}` : ''}`
}
