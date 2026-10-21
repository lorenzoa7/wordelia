import { spawn, type ChildProcess } from 'node:child_process'
import type { ChatTurn, CompletionResult, ModelInfo, ProviderId, ProviderStatus, StreamEvent } from '@shared/types'
import { classifyError, errorDetail } from '@shared/ai/errors'
import { cleanEnv, type ResolvedBin } from './resolve-bin'
import type { AiRequest } from './images'

export interface ProviderTransport {
  id: ProviderId
  status(): Promise<ProviderStatus>
  listModels(): Promise<ModelInfo[]>
  /** `req.images`: the images of the messages, read from the book (images.ts) */
  complete(req: AiRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult>
}

/**
 * Stop a child process and its children. On Windows, kill() stops only the first process:
 * a CLI wrapper (codex.js) would leave the real program running.
 */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.killed) return
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill())
  } else {
    child.kill()
  }
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  aborted: boolean
}

/**
 * Spawn a CLI, write `input` to stdin, and call `onLine` for each stdout line.
 */
export function runCli(
  bin: ResolvedBin,
  args: string[],
  opts: { input?: string; cwd?: string; signal?: AbortSignal; onLine?: (line: string) => void; timeoutMs?: number }
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(bin.command, [...bin.prefixArgs, ...args], {
      cwd: opts.cwd,
      env: cleanEnv(bin.env),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let buffer = ''
    let aborted = false
    let settled = false
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      if (buffer.trim() && opts.onLine) opts.onLine(buffer)
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      resolve({ code, stdout, stderr, aborted })
    }
    const onAbort = (): void => {
      aborted = true
      killTree(child)
    }
    opts.signal?.addEventListener('abort', onAbort)
    if (opts.signal?.aborted) onAbort()
    const timer = opts.timeoutMs ? setTimeout(() => killTree(child), opts.timeoutMs) : undefined

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!opts.onLine) return
      buffer += chunk
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '')
        buffer = buffer.slice(nl + 1)
        if (line.trim()) opts.onLine(line)
      }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.on('error', (err) => {
      stderr += String(err)
      finish(-1)
    })
    child.on('close', (code) => finish(code))
    child.stdin.on('error', () => {
      /* the process may exit before it reads stdin */
    })
    if (opts.input != null) child.stdin.end(opts.input, 'utf8')
    else child.stdin.end()
  })
}

/**
 * Put a multi-turn conversation in one user message, for CLIs that take one prompt.
 */
export function flattenConversation(messages: ChatTurn[]): string {
  if (messages.length === 1) return messages[0].content
  const history = messages.slice(0, -1)
  const last = messages[messages.length - 1]
  const lines = history.map((m) => `<turn role="${m.role}">\n${m.content}\n</turn>`)
  return [
    '<conversation_so_far>',
    ...lines,
    '</conversation_so_far>',
    '',
    'Continue the conversation. Reply to this new message from the writer:',
    '',
    last.content
  ].join('\n')
}

/** A failed result for an error text of a provider: its kind, and when a usage limit ends. */
export function failure(error: string, opts: { text?: string; model?: string; api?: boolean } = {}): CompletionResult {
  const c = classifyError(error, { api: opts.api })
  return { ok: false, text: opts.text ?? '', model: opts.model, error: errorDetail(error), errorKind: c.kind, ...(c.resets ? { resets: c.resets } : {}) }
}

/**
 * The status of an API key after a failed check. A rejected key and an account without credit are
 * clear. Any other error (no connection, a busy server) says nothing about the key: the app cannot tell.
 */
export function keyStatus(provider: 'anthropic' | 'openai', err: unknown, rejected: boolean): ProviderStatus {
  const msg = err instanceof Error ? err.message : String(err)
  const detail = errorDetail(msg).slice(0, 300)
  const kind = classifyError(msg, { api: true }).kind
  if (kind === 'no-credit') return { provider, installed: true, loggedIn: true, reason: 'no-credit', detail }
  if (rejected || kind === 'bad-key') return { provider, installed: true, loggedIn: false, reason: 'bad-key', detail }
  return { provider, installed: true, loggedIn: null, reason: 'offline', detail }
}
