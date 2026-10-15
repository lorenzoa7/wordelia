// Claude Code transport: runs the user's own `claude` CLI in print mode.
// See docs/decisions/0002-ai-through-user-clis.md.

import { app } from 'electron'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CompletionRequest, CompletionResult, ModelInfo, ProviderStatus, StreamEvent } from '@shared/types'
import { getSettings } from '../settings'
import { claudeCandidates, resolveBin, type ResolvedBin } from './resolve-bin'
import { classifyError, flattenConversation, runCli, type ProviderTransport } from './transport'
import { latestVersion } from './updates'

const MODELS: ModelInfo[] = [
  { id: 'opus', label: 'Opus', description: 'Most capable. Best for chat and planning.', tier: 'best', contextWindow: 200000 },
  { id: 'sonnet', label: 'Sonnet', description: 'Fast and strong. Best for actions.', tier: 'balanced', contextWindow: 200000 },
  { id: 'haiku', label: 'Haiku', description: 'Fastest. Good for summaries.', tier: 'fast', contextWindow: 200000 }
]

/** Flags that newer CLI versions accept. We drop a flag if an old CLI rejects it. */
const OPTIONAL_FLAGS = ['--safe-mode', '--disable-slash-commands', '--no-session-persistence', '--include-partial-messages']

async function bin(): Promise<ResolvedBin | null> {
  const s = await getSettings()
  return resolveBin('claude', s.providers['claude-code'].binPath, claudeCandidates())
}

async function workDir(): Promise<string> {
  const dir = join(app.getPath('userData'), 'ai-workdir')
  await mkdir(dir, { recursive: true })
  return dir
}

export const claudeCode: ProviderTransport = {
  id: 'claude-code',

  async status(): Promise<ProviderStatus> {
    const b = await bin()
    if (!b) return { provider: 'claude-code', installed: false, loggedIn: false, detail: 'The claude CLI was not found.' }
    const ver = await runCli(b, ['--version'], { timeoutMs: 15000 })
    const version = ver.stdout.trim().split(/\s+/)[0] || undefined
    const [auth, latest] = await Promise.all([runCli(b, ['auth', 'status'], { timeoutMs: 15000 }), latestVersion('claude-code')])
    let loggedIn: boolean | null = null
    let account: string | undefined
    try {
      const j = JSON.parse(auth.stdout) as { loggedIn?: boolean; authMethod?: string; email?: string; account?: { email?: string } }
      loggedIn = Boolean(j.loggedIn)
      account = j.email ?? j.account?.email ?? j.authMethod
    } catch {
      loggedIn = auth.code === 0 ? null : false
    }
    return {
      provider: 'claude-code',
      installed: true,
      loggedIn,
      version,
      latestVersion: latest,
      account,
      detail: loggedIn === false ? 'Run "claude auth login" in a terminal to log in.' : b.path
    }
  },

  async listModels(): Promise<ModelInfo[]> {
    return MODELS
  },

  async complete(req: CompletionRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult> {
    const b = await bin()
    if (!b) return { ok: false, text: '', error: 'Claude Code is not installed.', errorKind: 'not-installed' }
    if (signal.aborted) return { ok: false, text: '', error: 'Cancelled.', errorKind: 'cancelled' }
    const cwd = await workDir()
    const sysFile = join(cwd, `system-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
    await writeFile(sysFile, req.system, 'utf8')

    const baseArgs = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--tools',
      '',
      '--strict-mcp-config',
      '--setting-sources',
      '',
      '--safe-mode',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--system-prompt-file',
      sysFile,
      '--model',
      req.route.model || 'sonnet'
    ]
    if (req.route.effort) baseArgs.push('--effort', req.route.effort)

    const prompt = flattenConversation(req.messages)
    let args = baseArgs
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const res = await runOnce(b, args, prompt, cwd, onEvent, signal)
        if (res.retryWithout) {
          args = dropFlag(args, res.retryWithout)
          continue
        }
        return res.result
      }
      return { ok: false, text: '', error: 'The claude CLI rejected its arguments.', errorKind: 'other' }
    } finally {
      await rm(sysFile, { force: true })
    }
  }
}

function dropFlag(args: string[], flag: string): string[] {
  const i = args.indexOf(flag)
  if (i < 0) return args
  const takesValue = flag === '--effort'
  return [...args.slice(0, i), ...args.slice(i + (takesValue ? 2 : 1))]
}

async function runOnce(
  b: ResolvedBin,
  args: string[],
  prompt: string,
  cwd: string,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal
): Promise<{ result: CompletionResult; retryWithout?: string }> {
  let text = ''
  let streamedText = false
  let model: string | undefined
  let final: { isError: boolean; result?: string; usage?: CompletionResult['usage'] } | null = null
  let assistantError: string | undefined

  const res = await runCli(b, args, {
    input: prompt,
    cwd,
    signal,
    onLine: (line) => {
      let ev: Record<string, unknown>
      try {
        ev = JSON.parse(line)
      } catch {
        return
      }
      if (ev.type === 'system' && ev.subtype === 'init') {
        model = typeof ev.model === 'string' ? ev.model : undefined
        onEvent({ type: 'start', model })
      } else if (ev.type === 'system' && ev.subtype === 'api_retry') {
        onEvent({ type: 'status', message: 'Retrying…' })
      } else if (ev.type === 'stream_event') {
        const e = ev.event as { type?: string; delta?: { type?: string; text?: string } }
        if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) {
          streamedText = true
          text += e.delta.text
          onEvent({ type: 'text', delta: e.delta.text })
        }
      } else if (ev.type === 'assistant') {
        const msg = ev.message as { content?: Array<{ type: string; text?: string }> } | undefined
        if (typeof ev.error === 'string') assistantError = ev.error
        if (!streamedText && msg?.content) {
          const t = msg.content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
          if (t) {
            text += t
            onEvent({ type: 'text', delta: t })
          }
        }
      } else if (ev.type === 'result') {
        const usage = ev.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | undefined
        final = {
          isError: Boolean(ev.is_error),
          result: typeof ev.result === 'string' ? ev.result : undefined,
          usage: usage
            ? {
                inputTokens: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
                outputTokens: usage.output_tokens,
                costUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : undefined
              }
            : undefined
        }
        if (final.usage) onEvent({ type: 'usage', ...final.usage })
      }
    }
  })

  if (res.aborted) return { result: { ok: false, text, model, error: 'Cancelled.', errorKind: 'cancelled' } }

  const unknown = /unknown option '?(--[\w-]+)'?/i.exec(res.stderr)
  if (res.code !== 0 && unknown && OPTIONAL_FLAGS.concat('--effort').includes(unknown[1])) {
    return { result: { ok: false, text: '' }, retryWithout: unknown[1] }
  }

  const done = final as { isError: boolean; result?: string; usage?: CompletionResult['usage'] } | null
  if (done && !done.isError) {
    return { result: { ok: true, text: text || done.result || '', model, usage: done.usage } }
  }
  const error = (done?.result || assistantError || res.stderr.trim() || `claude exited with code ${res.code}`).slice(0, 600)
  return { result: { ok: false, text, model, error, errorKind: classifyError(error) } }
}
