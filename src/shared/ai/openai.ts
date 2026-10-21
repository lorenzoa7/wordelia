// The models of the OpenAI API: which ones suit the app, their effort levels and their names.

import type { Effort } from '../types'

/**
 * A general chat model: "gpt-5.1", "gpt-5-mini", "gpt-4o", "o3". Not a pro, research, coding or
 * chat-latest model: those are slow, cost much more, or need tools that the app does not give.
 */
export function isGeneralOpenAiModel(id: string): boolean {
  return /^(?:gpt-\d+(?:\.\d+)?o?|o\d+)(?:-mini|-nano)?$/.test(id)
}

/**
 * The effort levels that a model accepts. Reasoning models (o-series, GPT-5 and newer) accept low,
 * medium and high; a pro model only high. Older models and chat-latest models have no effort
 * setting (an empty list). Unknown: undefined.
 */
export function openaiEfforts(id: string): Effort[] | undefined {
  if (/chat-latest|^chatgpt-|^gpt-[34](?:\D|$)/.test(id)) return []
  if (/^gpt-\d+(?:\.\d+)?-pro\b|^o\d+-pro\b/.test(id)) return ['high']
  if (/^o\d/.test(id)) return ['low', 'medium', 'high']
  const major = /^gpt-(\d+)/.exec(id)
  if (major && Number(major[1]) >= 5) return ['low', 'medium', 'high']
  return undefined
}

/** "gpt-5-mini" → "GPT-5 mini", "gpt-5-pro" → "GPT-5 Pro", "o3" → "o3". */
export function openaiModelLabel(id: string): string {
  const [head, ...rest] = id.split('-')
  const name = /^gpt$/i.test(head) && rest.length ? `GPT-${rest.shift()}` : head
  const words = rest.map((w) => (w === 'pro' ? 'Pro' : w))
  return [name, ...words].join(' ')
}
