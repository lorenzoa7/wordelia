// App settings and encrypted secrets, in the app data folder.

import { app, safeStorage } from 'electron'
import { join } from 'node:path'
import { DEFAULT_ACTIONS, DEFAULT_ACTION_ID } from '@shared/ai/defaults'
import type { AppSettings, ProviderId } from '@shared/types'
import { atomicWrite, readJson } from './fsutil'

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')
const secretsFile = (): string => join(app.getPath('userData'), 'secrets.json')

export function defaultSettings(): AppSettings {
  return {
    version: 1,
    theme: 'light',
    ui: { sidebarOpen: true, chatOpen: true, focusMode: false, typewriterScroll: false, zoom: 1 },
    editor: { spellcheck: true, showWordCount: true, typewriterSounds: false },
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
    routes: { ...d.routes, ...(raw.routes ?? {}) },
    actions: Array.isArray(raw.actions) && raw.actions.length ? raw.actions : d.actions
  }
  return cache
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
