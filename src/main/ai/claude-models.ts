// The models of the claude CLI. The CLI takes aliases ("opus") and maps each one to the newest
// model of that family that it knows. So the list comes from the installed CLI: its help text
// names the aliases and the effort levels, and a newer CLI brings newer models.
//
// The label shows the real model with its version ("Opus 5.5"). To learn it without a request,
// the app starts the CLI once per alias, reads its first event (system/init names the model) and
// stops it at once. The API address points at a closed local port, so no prompt can reach the API.
// This runs in the background, once for each version of the CLI.

import { app, BrowserWindow } from 'electron'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { friendlyModelName, modelLabel, parseClaudeHelp } from '@shared/ai/effort'
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

/* The real model of each alias, for example "opus" → "claude-opus-5-5". */

interface Resolved {
  key: string
  models: Record<string, string>
}

const resolvedFile = (): string => join(app.getPath('userData'), 'claude-models.json')

async function saveResolved(key: string, found: Record<string, string>): Promise<boolean> {
  const r = await readJson<Resolved>(resolvedFile(), { key, models: {} })
  const models = r.key === key ? { ...r.models } : {}
  let changed = r.key !== key
  for (const [alias, model] of Object.entries(found)) {
    if (models[alias] === model) continue
    models[alias] = model
    changed = true
  }
  if (changed) await atomicWrite(resolvedFile(), JSON.stringify({ key, models }, null, 2))
  return changed
}

/** Keep the model that answered for an alias. A real reply is the truth, also after a probe. */
export async function rememberResolved(b: ResolvedBin, alias: string, model: string | undefined): Promise<void> {
  if (!model || !/^[a-z][a-z0-9-]*$/.test(alias) || alias.startsWith('claude-')) return
  if (await saveResolved(await keyOf(b), { [alias]: model })) notifyModelsChanged()
}

/** Flags that an old CLI may not know. The probe drops a flag that the CLI rejects. */
const PROBE_OPTIONAL = ['--no-session-persistence']

/** Read the model of an alias from the first event of the CLI, then stop it. No request reaches the API. */
async function probeAlias(b: ResolvedBin, alias: string, cwd: string): Promise<string | undefined> {
  let args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    alias,
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    '--no-session-persistence',
    '--system-prompt',
    'Reply with OK.'
  ]
  // A closed local port: if the CLI starts a request before it is stopped, the request fails at once.
  const offline: ResolvedBin = { ...b, env: { ...b.env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' } }
  for (let attempt = 0; attempt < 2; attempt++) {
    const ac = new AbortController()
    let model: string | undefined
    const res = await runCli(offline, args, {
      input: 'OK',
      cwd,
      signal: ac.signal,
      timeoutMs: 20000,
      onLine: (line) => {
        if (model) return
        try {
          const ev = JSON.parse(line) as { type?: string; subtype?: string; model?: unknown }
          if (ev.type === 'system' && ev.subtype === 'init' && typeof ev.model === 'string') {
            model = ev.model
            ac.abort()
          }
        } catch {
          /* not an event */
        }
      }
    })
    if (model) return model
    const unknown = /unknown option '?(--[\w-]+)'?/i.exec(res.stderr)
    if (!unknown || !PROBE_OPTIONAL.includes(unknown[1])) return undefined
    args = args.filter((a) => a !== unknown[1])
  }
  return undefined
}

let probing: Promise<void> | null = null
const probedKeys = new Set<string>()

/** Find the real models of the aliases in the background. The windows get `ai:modelsChanged` when the labels change. */
function probeInBackground(b: ResolvedBin, key: string, aliases: string[]): void {
  if (!aliases.length || probing || probedKeys.has(key)) return
  if (process.env['WORDELIA_MOCK_AI'] === '1') return
  probedKeys.add(key)
  probing = (async () => {
    const cwd = join(app.getPath('userData'), 'ai-workdir')
    await mkdir(cwd, { recursive: true })
    const found: Record<string, string> = {}
    await Promise.all(
      aliases.map(async (alias) => {
        const model = await probeAlias(b, alias, cwd).catch(() => undefined)
        if (model) found[alias] = model
      })
    )
    if (Object.keys(found).length && (await saveResolved(key, found))) notifyModelsChanged()
  })()
    .catch(() => {})
    .finally(() => {
      probing = null
    })
}

function notifyModelsChanged(): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('ai:modelsChanged', { provider: 'claude-code' })
}

/** "Opus 5.5" from "claude-opus-5-5". A model id that the app cannot read keeps the plain alias label. */
function versionLabel(model: string | undefined, fallback: string): string {
  if (!model || friendlyModelName(model) === model) return fallback
  return modelLabel(model)
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
  probeInBackground(
    b,
    key,
    aliases.filter((a) => !resolved[a])
  )
  return aliases.map((id) => {
    const known = KNOWN[id] ?? { label: id.charAt(0).toUpperCase() + id.slice(1), tier: 'balanced' as const }
    return {
      id,
      ...known,
      label: versionLabel(resolved[id], known.label),
      contextWindow: 200000,
      ...(cli.efforts !== undefined ? { efforts: cli.efforts } : {})
    }
  })
}
