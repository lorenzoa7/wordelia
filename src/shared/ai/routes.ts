// Suggested model routes for a provider, from its model list.

import type { ModelChoice, ModelInfo, ModelRoutes, ProviderId, TaskKind } from '../types'
import { EFFORT_LABELS, TASK_EFFORT, nearestEffort } from './effort'
import { isGeneralOpenAiModel } from './openai'

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
  // Each task gets an explicit effort, so the user can see it. The model may not support the suggested one.
  const pick = (task: TaskKind, m: ModelInfo | undefined, fallbackId?: string): ModelChoice | null => {
    const id = m?.id ?? fallbackId
    if (id === undefined) return null
    const effort = nearestEffort(TASK_EFFORT[task], m)
    return { provider, model: id, ...(effort ? { effort } : {}) }
  }
  const byId = (id: string): ModelInfo | undefined => models.find((m) => m.id === id)
  switch (provider) {
    case 'claude-code':
      // Aliases: the claude CLI maps each one to the newest model of its family.
      return {
        chat: pick('chat', byId('opus'), 'opus'),
        action: pick('action', byId('sonnet'), 'sonnet'),
        sync: pick('sync', byId('opus'), 'opus'),
        background: pick('background', byId('haiku'), 'haiku')
      }
    case 'anthropic': {
      const opus = newest(models, /^claude-opus/) ?? newest(models, /^claude-fable/)
      const sonnet = newest(models, /^claude-sonnet/) ?? opus
      const haiku = newest(models, /^claude-haiku/) ?? sonnet
      return { chat: pick('chat', opus), action: pick('action', sonnet), sync: pick('sync', opus), background: pick('background', haiku) }
    }
    case 'codex': {
      const def = models.find((m) => m.isDefault) ?? models[0]
      const fast = models.find((m) => m.tier === 'fast') ?? def
      // An empty model id means "the CLI default".
      return {
        chat: pick('chat', def, ''),
        action: pick('action', def, ''),
        sync: pick('sync', def, ''),
        background: pick('background', fast, '')
      }
    }
    case 'openai': {
      // General chat models only: a pro or research model is slow and expensive, or needs tools.
      const general = models.filter((m) => isGeneralOpenAiModel(m.id))
      const best = general.find((m) => m.tier !== 'fast') ?? general[0] ?? models[0]
      const fast = general.find((m) => /-mini$/.test(m.id)) ?? general.find((m) => m.tier === 'fast') ?? best
      return { chat: pick('chat', best), action: pick('action', best), sync: pick('sync', best), background: pick('background', fast) }
    }
  }
}

export function routeLabel(route: ModelChoice | null, models?: ModelInfo[]): string {
  if (!route) return 'Not set'
  const model = models?.find((m) => m.id === route.model)?.label ?? (route.model || 'Default model')
  return `${PROVIDER_LABELS[route.provider].short} · ${model}${route.effort ? ` · ${EFFORT_LABELS[route.effort]}` : ''}`
}
