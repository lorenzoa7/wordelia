// Open a terminal window where the user logs in to a CLI provider.
// Wordelia never sees the login; the CLI stores it.

import { spawn } from 'node:child_process'
import type { ProviderId } from '@shared/types'
import { getSettings } from '../settings'
import { claudeCandidates, codexCandidates, resolveBin } from './resolve-bin'

export async function openLogin(provider: ProviderId): Promise<boolean> {
  if (provider !== 'claude-code' && provider !== 'codex') return false
  const s = await getSettings()
  const bin =
    provider === 'claude-code'
      ? await resolveBin('claude', s.providers['claude-code'].binPath, claudeCandidates())
      : await resolveBin('codex', s.providers.codex.binPath, codexCandidates())
  if (!bin) return false
  const args = provider === 'claude-code' ? ['auth', 'login'] : ['login']
  if (process.platform === 'win32') {
    // A new console window: cmd /k keeps it open so the user can read the result.
    // The outer quotes are removed by cmd /k; the inner quotes keep paths with spaces together.
    const quoted = [bin.command, ...bin.prefixArgs].map((p) => `"${p}"`).join(' ')
    const line = `"${quoted} ${args.join(' ')}"`
    const env: NodeJS.ProcessEnv = { ...process.env, ...bin.env }
    delete env['CLAUDECODE']
    const child = spawn('cmd.exe', ['/c', 'start', '"Wordelia login"', 'cmd.exe', '/k', line], {
      detached: true,
      stdio: 'ignore',
      windowsVerbatimArguments: true,
      env
    })
    child.unref()
    return true
  }
  if (process.platform === 'darwin') {
    const cmd = [bin.command, ...bin.prefixArgs, ...args].map((a) => `'${a.replace(/'/g, "'\''")}'`).join(' ')
    spawn('osascript', ['-e', `tell application "Terminal" to do script "${cmd.replace(/"/g, '\\"')}"`], { detached: true, stdio: 'ignore' }).unref()
    return true
  }
  spawn('x-terminal-emulator', ['-e', bin.command, ...bin.prefixArgs, ...args], { detached: true, stdio: 'ignore' }).unref()
  return true
}
