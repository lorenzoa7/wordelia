// App settings and encrypted secrets, in the app data folder.

import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { DEFAULT_ACTIONS, DEFAULT_ACTION_ID } from '@shared/ai/defaults'
import type { AppSettings, ModelRoutes, ProviderId, TaskKind } from '@shared/types'
import { TASK_EFFORT } from '@shared/ai/effort'
import { atomicWrite, readJson } from './fsutil'

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')
const secretsFile = (): string => join(app.getPath('userData'), 'secrets.json')

export function defaultSettings(): AppSettings {
  return {
    version: 3,
    language: 'en',
    autoUpdate: true,
    theme: 'light',
    ui: { sidebarOpen: true, chatOpen: true, focusMode: false, typewriterScroll: false, zoom: 1, chatWidth: 400 },
    editor: { spellcheck: true, showWordCount: true, typewriterSounds: false, dailyGoal: 500 },
    providers: {
      'claude-code': { enabled: true },
      codex: { enabled: true },
      anthropic: { enabled: false },
      openai: { enabled: false }
    },
    routes: { chat: null, action: null, sync: null, background: null },
    actions: DEFAULT_ACTIONS.map((a) => ({ ...a })),
    defaultActionId: DEFAULT_ACTION_ID,
    onboarded: false
  }
}

let cache: AppSettings | null = null

export async function getSettings(): Promise<AppSettings> {
  if (cache) return cache
  const raw = await readJson<Partial<AppSettings>>(settingsFile(), {})
  const d = defaultSettings()
  cache = {
    ...d,
    ...raw,
    ui: { ...d.ui, ...(raw.ui ?? {}) },
    editor: { ...d.editor, ...(raw.editor ?? {}) },
    providers: { ...d.providers, ...(raw.providers ?? {}) },
    routes: migrateRoutes(raw.version, { ...d.routes, ...(raw.routes ?? {}) }),
    actions: Array.isArray(raw.actions) && raw.actions.length ? raw.actions : d.actions,
    language: raw.language === 'pt-BR' || raw.language === 'es' ? raw.language : 'en',
    version: 3
  }
  return cache
}

/**
 * Version 1 sent no effort to Claude Code, so the CLI chose it and the user could not see it.
 * Give those routes the suggested effort of their task.
 */
function migrateRoutes(version: number | undefined, routes: ModelRoutes): ModelRoutes {
  const out = { ...routes }
  if (!version || version < 2) {
    for (const task of Object.keys(out) as TaskKind[]) {
      const r = out[task]
      if (r?.provider === 'claude-code' && !r.effort) out[task] = { ...r, effort: TASK_EFFORT[task] }
    }
  }
  // Version 3: the suggested chat effort went from high to medium (Opus at medium is very good for chat).
  if (!version || version < 3) {
    const chat = out.chat
    if (chat?.provider === 'claude-code' && chat.effort === 'high') out.chat = { ...chat, effort: 'medium' }
  }
  return out
}

export async function setSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings()
  const next: AppSettings = {
    ...current,
    ...patch,
    ui: { ...current.ui, ...(patch.ui ?? {}) },
    editor: { ...current.editor, ...(patch.editor ?? {}) },
    providers: { ...current.providers, ...(patch.providers ?? {}) },
    routes: { ...current.routes, ...(patch.routes ?? {}) }
  }
  cache = next
  await atomicWrite(settingsFile(), JSON.stringify(next, null, 2))
  return next
}

type SecretStore = Partial<Record<ProviderId, string>>

export async function setSecret(provider: ProviderId, value: string | null): Promise<void> {
  const store = await readJson<SecretStore>(secretsFile(), {})
  if (value == null || value === '') delete store[provider]
  else {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('The system key store is not available.')
    store[provider] = safeStorage.encryptString(value).toString('base64')
  }
  await atomicWrite(secretsFile(), JSON.stringify(store))
}

export async function getSecret(provider: ProviderId): Promise<string | null> {
  const store = await readJson<SecretStore>(secretsFile(), {})
  const enc = store[provider]
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}
