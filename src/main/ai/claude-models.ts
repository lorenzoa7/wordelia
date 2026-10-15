// The models of the claude CLI. The CLI takes aliases ("opus") and maps each one to the newest
// model of that family that it knows. So the list comes from the installed CLI: its help text
// names the aliases and the effort levels, and a newer CLI brings newer models.

import { app } from 'electron'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { friendlyModelName, parseClaudeHelp } from '@shared/ai/effort'
import type { Effort, ModelInfo } from '@shared/types'
import { atomicWrite, readJson } from '../fsutil'
import type { ResolvedBin } from './resolve-bin'
import { runCli } from './transport'

const KNOWN: Record<string, Omit<ModelInfo, 'id'>> = {
  fable: { label: 'Fable', description: 'The most capable Claude. Slower, and uses more of your plan.', tier: 'best' },
  opus: { label: 'Opus', description: 'Very capable. Best for chat and planning.', tier: 'best' },
  sonnet: { label: 'Sonnet', description: 'Fast and strong. Best for actions.', tier: 'balanced' },
  haiku: { label: 'Haiku', description: 'Fastest. Good for summaries.', tier: 'fast' }
}
const ALWAYS = ['opus', 'sonnet', 'haiku']

interface CliInfo {
  key: string
  aliases: string[]
  /** Empty: the CLI has no --effort option. Undefined: the app could not read the help. */
  efforts: Effort[] | undefined
}

let info: CliInfo | null = null

/** Changes when the CLI program changes, for example after "claude update". */
async function keyOf(b: ResolvedBin): Promise<string> {
  try {
    const s = await stat(b.path)
    return `${b.path}|${s.mtimeMs}|${s.size}`
  } catch {
    return b.path
  }
}


async function cliInfo(b: ResolvedBin): Promise<CliInfo> {
  const key = await keyOf(b)
  if (info?.key === key) return info
  const help = await runCli(b, ['--help'], { timeoutMs: 15000 })
  const text = help.stdout + help.stderr
  // No help text: do not guess, and try again next time.
  if (!text.includes('--model')) return { key, aliases: [], efforts: undefined }
  info = { key, ...parseClaudeHelp(text) }
  return info
}

/* The model that answered for each alias, so the user sees "Opus — Claude Opus 5.5". */

interface Resolved {
  key: string
  models: Record<string, string>
}

const resolvedFile = (): string => join(app.getPath('userData'), 'claude-models.json')

export async function rememberResolved(b: ResolvedBin, alias: string, model: string | undefined): Promise<void> {
  if (!model || !/^[a-z][a-z0-9-]*$/.test(alias) || alias.startsWith('claude-')) return
  const key = await keyOf(b)
  const r = await readJson<Resolved>(resolvedFile(), { key, models: {} })
  const models = r.key === key ? r.models : {}
  if (models[alias] === model) return
  await atomicWrite(resolvedFile(), JSON.stringify({ key, models: { ...models, [alias]: model } }, null, 2))
}

export async function claudeModels(b: ResolvedBin): Promise<ModelInfo[]> {
  const cli = await cliInfo(b)
  const key = await keyOf(b)
  const r = await readJson<Resolved>(resolvedFile(), { key, models: {} })
  const resolved = r.key === key ? r.models : {}
  const order = Object.keys(KNOWN)
  const aliases = [...new Set([...cli.aliases, ...ALWAYS])].sort((a, b) => {
    const x = order.indexOf(a)
    const y = order.indexOf(b)
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y)
  })
  return aliases.map((id) => ({
    id,
    ...(KNOWN[id] ?? { label: id.charAt(0).toUpperCase() + id.slice(1), tier: 'balanced' as const }),
    contextWindow: 200000,
    ...(cli.efforts !== undefined ? { efforts: cli.efforts } : {}),
    ...(resolved[id] ? { resolvedLabel: friendlyModelName(resolved[id]) } : {})
  }))
}
