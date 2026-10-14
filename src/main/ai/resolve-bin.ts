// Find the real executable of a CLI (claude, codex) on this computer.
// On Windows, npm installs `.cmd` shims. Node cannot spawn them without a shell,
// so we read the shim and spawn its target: a native `.exe`, or a `.js` file through
// Electron's own Node (ELECTRON_RUN_AS_NODE).

import { readFile, stat } from 'node:fs/promises'
import { delimiter, dirname, isAbsolute, join } from 'node:path'
import { homedir } from 'node:os'

export interface ResolvedBin {
  /** Program to spawn */
  command: string
  /** Arguments to put before the CLI arguments */
  prefixArgs: string[]
  /** Extra environment */
  env: Record<string, string>
  /** For display */
  path: string
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

function fromTarget(target: string): ResolvedBin {
  if (target.toLowerCase().endsWith('.js') || target.toLowerCase().endsWith('.mjs')) {
    return {
      command: process.execPath,
      prefixArgs: [target],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      path: target
    }
  }
  return { command: target, prefixArgs: [], env: {}, path: target }
}

/** Read an npm `.cmd` shim and return the file it runs. */
async function shimTarget(cmdPath: string): Promise<string | null> {
  let src: string
  try {
    src = await readFile(cmdPath, 'utf8')
  } catch {
    return null
  }
  const dir = dirname(cmdPath)
  // npm shims: "%dp0%\node_modules\pkg\bin\cli.js" or "%~dp0\node_modules\..."
  const re = /"%~?dp0%?\\([^"]+?\.(?:exe|js|mjs|cjs))"/gi
  let m: RegExpExecArray | null
  const found: string[] = []
  while ((m = re.exec(src))) found.push(join(dir, m[1]))
  for (const f of found) if (await isFile(f)) return f
  return null
}

const cache = new Map<string, ResolvedBin | null>()

export function clearBinCache(): void {
  cache.clear()
}

/**
 * Resolve a CLI by name. `extraCandidates` are absolute paths to try after PATH.
 */
export async function resolveBin(
  name: string,
  customPath?: string,
  extraCandidates: string[] = []
): Promise<ResolvedBin | null> {
  const key = `${name}|${customPath ?? ''}`
  if (cache.has(key)) return cache.get(key) ?? null

  const result = await (async (): Promise<ResolvedBin | null> => {
    if (customPath && isAbsolute(customPath) && (await isFile(customPath))) {
      if (customPath.toLowerCase().endsWith('.cmd')) {
        const t = await shimTarget(customPath)
        if (t) return fromTarget(t)
      }
      return fromTarget(customPath)
    }
    const dirs = (process.env.PATH ?? process.env.Path ?? '').split(delimiter).filter(Boolean)
    const isWin = process.platform === 'win32'
    for (const dir of dirs) {
      if (isWin) {
        const exe = join(dir, `${name}.exe`)
        if (await isFile(exe)) return fromTarget(exe)
        const cmd = join(dir, `${name}.cmd`)
        if (await isFile(cmd)) {
          const t = await shimTarget(cmd)
          if (t) return fromTarget(t)
        }
      } else {
        const p = join(dir, name)
        if (await isFile(p)) return fromTarget(p)
      }
    }
    for (const c of extraCandidates) if (await isFile(c)) return fromTarget(c)
    return null
  })()

  cache.set(key, result)
  return result
}

export function claudeCandidates(): string[] {
  const home = homedir()
  const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
  const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
  return [
    join(home, '.local', 'bin', 'claude.exe'),
    join(home, '.local', 'bin', 'claude'),
    join(local, 'Programs', 'claude', 'claude.exe'),
    join(roaming, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    join(roaming, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude'
  ]
}

export function codexCandidates(): string[] {
  const home = homedir()
  const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming')
  return [
    join(roaming, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    join(home, '.local', 'bin', 'codex.exe'),
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex'
  ]
}

/** Environment for a child CLI: the user's environment without variables that change auth or nest sessions. */
export function cleanEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDECODE|CLAUDE_CODE_.*|ELECTRON_RUN_AS_NODE|WORDELIA_.*)$/i.test(k)) continue
    env[k] = v
  }
  return { ...env, ...extra }
}
