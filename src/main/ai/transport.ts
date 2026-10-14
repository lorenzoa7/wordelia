import { spawn, type ChildProcess } from 'node:child_process'
import type { ChatTurn, CompletionRequest, CompletionResult, ModelInfo, ProviderId, ProviderStatus, StreamEvent } from '@shared/types'
import { cleanEnv, type ResolvedBin } from './resolve-bin'

export interface ProviderTransport {
  id: ProviderId
  status(): Promise<ProviderStatus>
  listModels(): Promise<ModelInfo[]>
  complete(req: CompletionRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult>
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

export function classifyError(text: string): CompletionResult['errorKind'] {
  const t = text.toLowerCase()
  if (/not logged in|please run \/login|login expired|token has expired|could not be refreshed|unauthori[sz]ed|401|invalid api key|authentication/.test(t))
    return 'not-logged-in'
  if (/rate.?limit|session limit|usage limit|429|overloaded|quota/.test(t)) return 'rate-limit'
  if (/enotfound|econnreset|etimedout|network|fetch failed/.test(t)) return 'network'
  return 'other'
}
