// Codex transport: runs the user's own `codex` CLI.
// Main path: `codex app-server` (JSON-RPC over stdio) for streaming and the model list.
// Fallback: `codex exec --json` (no token streaming).

import { app } from 'electron'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { CompletionResult, ModelInfo, ProviderStatus, StreamEvent } from '@shared/types'
import { cleanProgramPath } from '@shared/ai/paths'
import { mainT } from '../i18n'
import { getSettings } from '../settings'
import { cleanEnv, codexCandidates, resolveBin, type ResolvedBin } from './resolve-bin'
import { failure, flattenConversation, killTree, runCli, type ProviderTransport } from './transport'
import { allImages, codexInput, type AiRequest } from './images'
import { latestVersion } from './updates'
import { parseEfforts } from '@shared/ai/effort'

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

/**
 * Sends the reasoning of Codex as thinking events. Each reasoning item and each summary part
 * starts a new paragraph. An item that streamed no deltas sends its text when it completes.
 */
class Thinking {
  private items = new Map<string, { streamed: boolean; summary: boolean; part: number }>()
  private sent = false

  constructor(private readonly onEvent: (e: StreamEvent) => void) {}

  private item(id: string): { streamed: boolean; summary: boolean; part: number } {
    let it = this.items.get(id)
    if (!it) {
      it = { streamed: false, summary: false, part: 0 }
      this.items.set(id, it)
    }
    return it
  }

  private emit(delta: string, paragraph: boolean): void {
    if (!delta) return
    this.onEvent({ type: 'thinking', delta: paragraph && this.sent ? `\n\n${delta}` : delta })
    this.sent = true
  }

  summary(itemId: string, part: number, delta: string): void {
    const it = this.item(itemId)
    const paragraph = !it.streamed || (it.summary && part !== it.part)
    it.streamed = true
    it.summary = true
    it.part = part
    this.emit(delta, paragraph)
  }

  raw(itemId: string, delta: string): void {
    const it = this.item(itemId)
    if (it.summary) return
    const paragraph = !it.streamed
    it.streamed = true
    this.emit(delta, paragraph)
  }

  whole(itemId: string, text: string): void {
    const it = this.item(itemId)
    if (it.streamed || !text.trim()) return
    it.streamed = true
    this.emit(text.trim(), true)
  }
}

let modelCache: { at: number; models: ModelInfo[] } | null = null

/** The account of the Codex login, false when the login does not work, or null when the app cannot tell. */
async function accountCheck(b: ResolvedBin): Promise<string | false | null> {
  const server = new AppServer(b, await workDir())
  try {
    await server.init()
    const res = await server.request('account/read', { refreshToken: true }, 15000)
    const acc = res.account as { email?: string; planType?: string; type?: string } | null | undefined
    if (acc) return [acc.email, acc.planType].filter(Boolean).join(' · ') || 'ChatGPT'
    return res.requiresOpenaiAuth === true ? false : null
  } catch {
    return null
  } finally {
    server.kill()
  }
}

export const codex: ProviderTransport = {
  id: 'codex',

  async status(): Promise<ProviderStatus> {
    const b = await bin()
    const t = (await mainT()).main.ai
    if (!b) {
      const custom = cleanProgramPath((await getSettings()).providers.codex.binPath)
      return { provider: 'codex', installed: false, loggedIn: false, detail: t.codexNotFound, ...(custom ? { pathIgnored: true } : {}) }
    }
    const ver = await runCli(b, ['--version'], { timeoutMs: 15000 })
    const version = ver.stdout.trim().split(/\s+/).pop() || undefined
    const [login, latest] = await Promise.all([runCli(b, ['login', 'status'], { timeoutMs: 15000 }), latestVersion('codex')])
    const out = (login.stdout + login.stderr).trim()
    let loggedIn: boolean | null = login.code === 0 && /logged in/i.test(out) ? true : login.code === 0 ? null : false
    let account = loggedIn ? out.replace(/^logged in using /i, '') : undefined
    let detail = loggedIn === false ? t.codexLogin : undefined
    let reason: ProviderStatus['reason']
    // "codex login status" only reads the saved file. Ask the server, which also refreshes the token:
    // an old login can look fine and still fail on the first request.
    if (loggedIn) {
      const live = await accountCheck(b)
      if (live === false) {
        loggedIn = false
        account = undefined
        detail = t.codexExpired
        reason = 'expired'
      } else if (typeof live === 'string') account = live
    }
    return {
      provider: 'codex',
      installed: true,
      loggedIn,
      version,
      latestVersion: latest,
      account,
      path: b.path,
      ...(b.customIgnored ? { pathIgnored: true } : {}),
      ...(detail ? { detail } : {}),
      ...(reason ? { reason } : {})
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
      const data = (res.data ?? []) as Array<{
        id: string
        displayName?: string
        description?: string
        hidden?: boolean
        isDefault?: boolean
        supportedReasoningEfforts?: Array<{ reasoningEffort?: string }>
        defaultReasoningEffort?: string
      }>
      const models = data
        .filter((m) => !m.hidden)
        .map<ModelInfo>((m) => {
          const efforts = m.supportedReasoningEfforts ? parseEfforts(m.supportedReasoningEfforts.map((e) => e.reasoningEffort ?? '').join(' ')) : undefined
          const def = m.defaultReasoningEffort ? parseEfforts(m.defaultReasoningEffort)[0] : undefined
          return {
            id: m.id,
            label: m.displayName ?? m.id,
            description: m.description,
            isDefault: Boolean(m.isDefault),
            tier: /mini|nano|fast|luna/i.test(m.id) ? 'fast' : m.isDefault ? 'best' : 'balanced',
            ...(efforts ? { efforts } : {}),
            ...(def ? { defaultEffort: def } : {})
          }
        })
      modelCache = { at: Date.now(), models }
      return models
    } catch {
      return []
    } finally {
      server.kill()
    }
  },

  async complete(req: AiRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult> {
    const b = await bin()
    const t = (await mainT()).main.ai
    if (!b) return { ok: false, text: '', error: t.codexNotInstalled, errorKind: 'not-installed' }
    const cwd = await workDir()
    const cancelled: CompletionResult = { ok: false, text: '', error: t.cancelled, errorKind: 'cancelled' }
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
  req: AiRequest,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal
): Promise<CompletionResult | null> {
  const t = (await mainT()).main.ai
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
      if (signal.aborted) return { ok: false, text: '', error: t.cancelled, errorKind: 'cancelled' }
      return null // app-server is missing in this version: use exec
    }
    // Reasoning summaries stream as deltas. Raw reasoning text counts only when a model gives no summary.
  const thinking = new Thinking(onEvent)
  const done = new Promise<{ ok: boolean; error?: string }>((resolve) => {
      server.onNotification = (method, params) => {
        if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
          text += params.delta
          onEvent({ type: 'text', delta: params.delta })
        } else if (method === 'item/reasoning/summaryTextDelta' && typeof params.delta === 'string') {
          thinking.summary(String(params.itemId ?? ''), Number(params.summaryIndex ?? 0), params.delta)
        } else if (method === 'item/reasoning/textDelta' && typeof params.delta === 'string') {
          thinking.raw(String(params.itemId ?? ''), params.delta)
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
          } else if (item?.type === 'reasoning') {
            const parts = (Array.isArray(item.summary) ? item.summary : Array.isArray(item.content) ? item.content : []) as unknown[]
            thinking.whole(String(item.id ?? ''), parts.map(String).join('\n\n'))
          }
        } else if (method === 'error') {
          const err = (params.error as Json | undefined)?.message
          if (params.willRetry) onEvent({ type: 'status', message: t.retrying })
          else resolve({ ok: false, error: String(err ?? t.codexError) })
        } else if (method === 'turn/completed') {
          const turn = params.turn as Json | undefined
          const status = turn?.status
          if (status === 'completed') resolve({ ok: true })
          else {
            const err = (turn?.error as Json | undefined)?.message
            resolve({ ok: false, error: String(err ?? t.codexTurn(String(status))) })
          }
        }
      }
      void server.closed.then(() => resolve({ ok: false, error: server.stderr.trim() || t.codexStopped }))
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
      // Images go as files of the book (the app-server reads them).
      input: codexInput(flattenConversation(req.messages), allImages(req))
    }
    if (req.route.effort) turnParams.effort = req.route.effort
    const turn = await server.request('turn/start', turnParams)
    turnId = String((turn.turn as Json | undefined)?.id ?? '')

    const outcome = await done
    if (signal.aborted) return { ok: false, text, model, error: t.cancelled, errorKind: 'cancelled' }
    if (outcome.ok) return { ok: true, text, model, usage }
    return failure(outcome.error ?? '', { text, model })
  } catch (err) {
    if (signal.aborted) return { ok: false, text, model, error: t.cancelled, errorKind: 'cancelled' }
    const msg = err instanceof Error ? err.message : String(err)
    return failure(msg, { text, model })
  } finally {
    signal.removeEventListener('abort', onAbort)
    server.kill()
  }
}

async function completeWithExec(
  b: ResolvedBin,
  cwd: string,
  req: AiRequest,
  onEvent: (e: StreamEvent) => void,
  signal: AbortSignal
): Promise<CompletionResult> {
  const t = (await mainT()).main.ai
  const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-C', cwd]
  if (req.route.model) args.push('-m', req.route.model)
  if (req.route.effort) args.push('-c', `model_reasoning_effort="${req.route.effort}"`)
  for (const image of allImages(req)) args.push('-i', image.path)
  args.push('-')
  const prompt = `<instructions>\n${req.system}\n</instructions>\n\n${flattenConversation(req.messages)}`
  let text = ''
  let error = ''
  let usage: CompletionResult['usage']
  const thinking = new Thinking(onEvent)
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
        } else if (item?.type === 'reasoning' && typeof item.text === 'string') {
          thinking.whole(String(item.id ?? ''), item.text)
        }
      } else if (ev.type === 'turn.completed') {
        const u = ev.usage as Json | undefined
        if (u) usage = { inputTokens: Number(u.input_tokens ?? 0), outputTokens: Number(u.output_tokens ?? 0) }
      } else if (ev.type === 'error' || ev.type === 'turn.failed') {
        const e = (ev.error as Json | undefined)?.message ?? ev.message
        error = String(e ?? t.codexError)
      }
    }
  })
  if (res.aborted) return { ok: false, text, error: t.cancelled, errorKind: 'cancelled' }
  if (res.code === 0 && !error) return { ok: true, text, usage }
  const msg = error || res.stderr.trim() || t.codexExited(res.code)
  return failure(msg, { text })
}
