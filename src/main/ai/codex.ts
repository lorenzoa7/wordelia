// Codex transport: runs the user's own `codex` CLI.
// Main path: `codex app-server` (JSON-RPC over stdio) for streaming and the model list.
// Fallback: `codex exec --json` (no token streaming).

import { app } from 'electron'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CompletionRequest, CompletionResult, ModelInfo, ProviderStatus, StreamEvent } from '@shared/types'
import { getSettings } from '../settings'
import { cleanEnv, codexCandidates, resolveBin, type ResolvedBin } from './resolve-bin'
import { classifyError, flattenConversation, killTree, runCli, type ProviderTransport } from './transport'
import { latestVersion } from './updates'

async function bin(): Promise<ResolvedBin | null> {
  const s = await getSettings()
  return resolveBin('codex', s.providers.codex.binPath, codexCandidates())
}

async function workDir(): Promise<string> {
  const dir = join(app.getPath('userData'), 'ai-workdir')
  await mkdir(dir, { recursive: true })
  return dir
}

type Json = Record<string, unknown>

/** A short-lived JSON-RPC session with `codex app-server`. */
class AppServer {
  private child: ReturnType<typeof spawn>
  private nextId = 1
  private pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>()
  private buffer = ''
  stderr = ''
  onNotification: (method: string, params: Json) => void = () => {}
  closed: Promise<number | null>

  constructor(b: ResolvedBin, cwd: string) {
    this.child = spawn(b.command, [...b.prefixArgs, 'app-server'], {
      cwd,
      env: cleanEnv(b.env),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child.stdout!.setEncoding('utf8')
    this.child.stdout!.on('data', (chunk: string) => this.onData(chunk))
    this.child.stderr!.setEncoding('utf8')
    this.child.stderr!.on('data', (c: string) => {
      this.stderr += c
    })
    this.child.stdin!.on('error', () => {})
    this.closed = new Promise((resolve) => {
      this.child.on('close', (code) => {
        for (const p of this.pending.values()) p.reject(new Error(this.stderr.trim() || 'codex app-server closed'))
        this.pending.clear()
        resolve(code)
      })
      this.child.on('error', (err) => {
        this.stderr += String(err)
        resolve(-1)
      })
    })
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let nl: number
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim()
      this.buffer = this.buffer.slice(nl + 1)
      if (!line) continue
      let msg: Json
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      if (typeof msg.id === 'number' && ('result' in msg || 'error' in msg)) {
        const p = this.pending.get(msg.id)
        if (!p) continue
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
        else p.resolve((msg.result ?? {}) as Json)
      } else if (typeof msg.method === 'string') {
        if (typeof msg.id === 'number') {
          // A request from the server (for example an approval). We deny all of them.
          this.send({ id: msg.id, result: { decision: 'denied' } })
        } else {
          this.onNotification(msg.method, (msg.params ?? {}) as Json)
        }
      }
    }
  }

  private send(obj: Json): void {
    this.child.stdin!.write(JSON.stringify(obj) + '\n')
  }

  request(method: string, params: Json, timeoutMs = 30000): Promise<Json> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`codex ${method} timed out`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer)
          resolve(v)
        },
        reject: (e) => {
          clearTimeout(timer)
          reject(e)
        }
      })
      this.send({ method, id, params })
    })
  }

  notify(method: string, params?: Json): void {
    this.send(params ? { method, params } : { method })
  }

  async init(): Promise<void> {
    await this.request('initialize', {
      clientInfo: { name: 'wordelia', title: 'Wordelia', version: app.getVersion() }
    })
    this.notify('initialized')
  }

  kill(): void {
    killTree(this.child)
  }
}

let modelCache: { at: number; models: ModelInfo[] } | null = null

export const codex: ProviderTransport = {
  id: 'codex',

  async status(): Promise<ProviderStatus> {
    const b = await bin()
    if (!b) return { provider: 'codex', installed: false, loggedIn: false, detail: 'The codex CLI was not found.' }
    const ver = await runCli(b, ['--version'], { timeoutMs: 15000 })
    const version = ver.stdout.trim().split(/\s+/).pop() || undefined
    const [login, latest] = await Promise.all([runCli(b, ['login', 'status'], { timeoutMs: 15000 }), latestVersion('codex')])
    const out = (login.stdout + login.stderr).trim()
    const loggedIn = login.code === 0 && /logged in/i.test(out) ? true : login.code === 0 ? null : false
    return {
      provider: 'codex',
      installed: true,
      loggedIn,
      version,
      latestVersion: latest,
      account: loggedIn ? out.replace(/^logged in using /i, '') : undefined,
      detail: loggedIn === false ? 'Run "codex login" in a terminal to log in.' : b.path
    }
  },

  async listModels(): Promise<ModelInfo[]> {
    if (modelCache && Date.now() - modelCache.at < 10 * 60 * 1000) return modelCache.models
    const b = await bin()
    if (!b) return []
    const server = new AppServer(b, await workDir())
    try {
      await server.init()
      const res = await server.request('model/list', { limit: 50 })
      const data = (res.data ?? []) as Array<{ id: string; displayName?: string; description?: string; hidden?: boolean; isDefault?: boolean }>
      const models = data
        .filter((m) => !m.hidden)
        .map<ModelInfo>((m) => ({
          id: m.id,
          label: m.displayName ?? m.id,
          description: m.description,
          isDefault: Boolean(m.isDefault),
          tier: /mini|nano|fast|luna/i.test(m.id) ? 'fast' : m.isDefault ? 'best' : 'balanced'
        }))
      modelCache = { at: Date.now(), models }
      return models
    } catch {
      return []
    } finally {
      server.kill()
    }
  },

  async complete(req: CompletionRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult> {
    const b = await bin()
    if (!b) return { ok: false, text: '', error: 'Codex is not installed.', errorKind: 'not-installed' }
    const cwd = await workDir()
    const cancelled: CompletionResult = { ok: false, text: '', error: 'Cancelled.', errorKind: 'cancelled' }
    if (signal.aborted) return cancelled
    const viaServer = await completeWithAppServer(b, cwd, req, onEvent, signal)
    if (viaServer) return viaServer
    // The app-server is missing in this version. Do not start a second run after a cancel.
    if (signal.aborted) return cancelled
    return completeWithExec(b, cwd, req, onEvent, signal)
  }
}

async function completeWithAppServer(
  b: ResolvedBin,
  cwd: string,
  req: CompletionRequest,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal
): Promise<CompletionResult | null> {
  const server = new AppServer(b, cwd)
  let text = ''
  let model: string | undefined
  let usage: CompletionResult['usage']
  let threadId = ''
  let turnId = ''
  const onAbort = (): void => {
    if (threadId && turnId) server.notify('turn/interrupt', { threadId, turnId })
    setTimeout(() => server.kill(), 300)
  }
  signal.addEventListener('abort', onAbort)
  try {
    try {
      await server.init()
    } catch {
      server.kill()
      if (signal.aborted) return { ok: false, text: '', error: 'Cancelled.', errorKind: 'cancelled' }
      return null // app-server is missing in this version: use exec
    }
    const done = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      server.onNotification = (method, params) => {
        if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
          text += params.delta
          onEvent({ type: 'text', delta: params.delta })
        } else if (method === 'thread/tokenUsage/updated') {
          const tu = (params.tokenUsage as Json | undefined)?.total as Json | undefined
          if (tu) {
            usage = { inputTokens: Number(tu.inputTokens ?? 0), outputTokens: Number(tu.outputTokens ?? 0) }
            onEvent({ type: 'usage', ...usage })
          }
        } else if (method === 'item/completed') {
          const item = params.item as Json | undefined
          if (item?.type === 'agentMessage' && typeof item.text === 'string' && !text) {
            text = item.text
            onEvent({ type: 'text', delta: item.text })
          }
        } else if (method === 'error') {
          const err = (params.error as Json | undefined)?.message
          if (params.willRetry) onEvent({ type: 'status', message: 'Retrying…' })
          else resolve({ ok: false, error: String(err ?? 'Codex error') })
        } else if (method === 'turn/completed') {
          const turn = params.turn as Json | undefined
          const status = turn?.status
          if (status === 'completed') resolve({ ok: true })
          else {
            const err = (turn?.error as Json | undefined)?.message
            resolve({ ok: false, error: String(err ?? `Turn ${String(status)}`) })
          }
        }
      }
      void server.closed.then(() => resolve({ ok: false, error: server.stderr.trim() || 'codex app-server stopped' }))
    })

    const threadParams: Json = {
      cwd,
      ephemeral: true,
      sandbox: 'read-only',
      approvalPolicy: 'never',
      baseInstructions: req.system
    }
    if (req.route.model) threadParams.model = req.route.model
    const started = await server.request('thread/start', threadParams)
    threadId = String((started.thread as Json | undefined)?.id ?? '')
    model = typeof started.model === 'string' ? started.model : req.route.model
    onEvent({ type: 'start', model })

    const turnParams: Json = {
      threadId,
      input: [{ type: 'text', text: flattenConversation(req.messages) }]
    }
    if (req.route.effort) turnParams.effort = req.route.effort
    const turn = await server.request('turn/start', turnParams)
    turnId = String((turn.turn as Json | undefined)?.id ?? '')

    const outcome = await done
    if (signal.aborted) return { ok: false, text, model, error: 'Cancelled.', errorKind: 'cancelled' }
    if (outcome.ok) return { ok: true, text, model, usage }
    return { ok: false, text, model, error: outcome.error, errorKind: classifyError(outcome.error ?? '') }
  } catch (err) {
    if (signal.aborted) return { ok: false, text, model, error: 'Cancelled.', errorKind: 'cancelled' }
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, text, model, error: msg, errorKind: classifyError(msg) }
  } finally {
    signal.removeEventListener('abort', onAbort)
    server.kill()
  }
}

async function completeWithExec(
  b: ResolvedBin,
  cwd: string,
  req: CompletionRequest,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal
): Promise<CompletionResult> {
  const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-C', cwd]
  if (req.route.model) args.push('-m', req.route.model)
  if (req.route.effort) args.push('-c', `model_reasoning_effort="${req.route.effort}"`)
  args.push('-')
  const prompt = `<instructions>\n${req.system}\n</instructions>\n\n${flattenConversation(req.messages)}`
  let text = ''
  let error = ''
  let usage: CompletionResult['usage']
  const res = await runCli(b, args, {
    input: prompt,
    cwd,
    signal,
    onLine: (line) => {
      let ev: Json
      try {
        ev = JSON.parse(line)
      } catch {
        return
      }
      if (ev.type === 'item.completed') {
        const item = ev.item as Json | undefined
        if (item?.type === 'agent_message' && typeof item.text === 'string') {
          text += item.text
          onEvent({ type: 'text', delta: item.text })
        }
      } else if (ev.type === 'turn.completed') {
        const u = ev.usage as Json | undefined
        if (u) usage = { inputTokens: Number(u.input_tokens ?? 0), outputTokens: Number(u.output_tokens ?? 0) }
      } else if (ev.type === 'error' || ev.type === 'turn.failed') {
        const e = (ev.error as Json | undefined)?.message ?? ev.message
        error = String(e ?? 'Codex error')
      }
    }
  })
  if (res.aborted) return { ok: false, text, error: 'Cancelled.', errorKind: 'cancelled' }
  if (res.code === 0 && !error) return { ok: true, text, usage }
  const msg = error || res.stderr.trim() || `codex exited with code ${res.code}`
  return { ok: false, text, error: msg, errorKind: classifyError(msg) }
}
