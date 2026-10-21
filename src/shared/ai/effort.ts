// Effort levels: names for people, and the levels Wordelia suggests for each task.

import type { Effort, ModelInfo, TaskKind } from '../types'

export const EFFORT_ORDER: Effort[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export const EFFORT_LABELS: Record<Effort, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max'
}

/** Suggested effort for each task: more thought for the chat and the planning, speed for actions. */
export const TASK_EFFORT: Record<TaskKind, Effort> = {
  chat: 'medium',
  action: 'medium',
  sync: 'high',
  background: 'low'
}

/** The supported effort nearest to `wanted` (the same, or the next lower, or the lowest). */
export function nearestEffort(wanted: Effort, model: Pick<ModelInfo, 'efforts'> | undefined): Effort | undefined {
  const list = model?.efforts
  if (!list) return wanted
  if (!list.length) return undefined
  if (list.includes(wanted)) return wanted
  const at = EFFORT_ORDER.indexOf(wanted)
  const lower = list.filter((e) => EFFORT_ORDER.indexOf(e) < at).sort((a, b) => EFFORT_ORDER.indexOf(b) - EFFORT_ORDER.indexOf(a))
  return lower[0] ?? list[0]
}

/** Read effort names from text such as "(low, medium, high, xhigh, max)". */
export function parseEfforts(text: string): Effort[] {
  return text
    .split(/[\s,()|/]+/)
    .map((w) => w.trim().toLowerCase())
    .filter((w): w is Effort => (EFFORT_ORDER as string[]).includes(w))
    .filter((w, i, all) => all.indexOf(w) === i)
    .sort((a, b) => EFFORT_ORDER.indexOf(a) - EFFORT_ORDER.indexOf(b))
}

/** "claude-opus-5-5" → "Claude Opus 5.5". Other ids come back unchanged. */
export function friendlyModelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[[a-z0-9]+\])?$/.exec(id)
  if (!m) return id
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  return `Claude ${family} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

/** The name to show in model lists: "claude-opus-5-5" or "Claude Opus 5.5" → "Opus 5.5". Other names come back unchanged. */
export function modelLabel(idOrName: string): string {
  return friendlyModelName(idOrName.trim()).replace(/^Claude\s+(?=\S)/, '')
}

/** The levels to offer for a model. Null: the model has no effort setting. Unknown models get the common three. */
export function effortChoices(model: Pick<ModelInfo, 'efforts'> | undefined, current?: Effort): Effort[] | null {
  const list = model?.efforts ?? (['low', 'medium', 'high'] as Effort[])
  if (!list.length) return null
  return current && !list.includes(current) ? [...list, current] : list
}

/** Label of the "Default" choice: what happens when Wordelia sends no effort. */
export function defaultEffortLabel(model: Pick<ModelInfo, 'defaultEffort'> | undefined, cli: boolean): string {
  if (model?.defaultEffort) return `Default (${EFFORT_LABELS[model.defaultEffort]})`
  return cli ? 'Default (automatic)' : 'Default (the model decides)'
}

/** Read the model aliases and the effort levels from the help text of the claude CLI. */
export function parseClaudeHelp(help: string): { aliases: string[]; efforts: Effort[] } {
  const flat = help.replace(/\s+/g, ' ')
  const aliasText = /alias for the latest model \(e\.g\. ([^)]*)\)/i.exec(flat)?.[1] ?? ''
  const aliases = [...aliasText.matchAll(/'([a-z][a-z0-9-]*)'/g)].map((m) => m[1])
  const effortText = /--effort <level>[^(]*\(([^)]*)\)/i.exec(flat)?.[1]
  return { aliases, efforts: effortText === undefined ? [] : parseEfforts(effortText) }
}
