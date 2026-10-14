// App-level state: settings, theme, library, AI provider status.

import { create } from 'zustand'
import type { AppSettings, LibraryItem, ModelInfo, ModelRoutes, ProviderId, ProviderStatus, TaskKind } from '@shared/types'
import { suggestRoutes } from '@shared/ai/routes'
import { invoke } from '@/lib/api'

const PROVIDERS: ProviderId[] = ['claude-code', 'codex', 'anthropic', 'openai']

interface AppState {
  settings: AppSettings | null
  resolvedTheme: 'light' | 'dark'
  library: LibraryItem[]
  status: Partial<Record<ProviderId, ProviderStatus>>
  models: Partial<Record<ProviderId, ModelInfo[]>>
  checking: Partial<Record<ProviderId, boolean>>

  init(): Promise<void>
  updateSettings(patch: Partial<AppSettings>): Promise<void>
  setUi(patch: Partial<AppSettings['ui']>): void
  refreshLibrary(): Promise<void>
  checkProvider(id: ProviderId): Promise<ProviderStatus>
  checkAllProviders(): Promise<void>
  /** Fill empty routes with suggestions for the first working provider */
  autoRoute(): Promise<void>
  routeFor(task: TaskKind): AppSettings['routes'][TaskKind]
}

function systemDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.dataset.theme = theme
  void invoke('window:setTheme', theme)
}

export const useApp = create<AppState>((set, get) => ({
  settings: null,
  resolvedTheme: 'light',
  library: [],
  status: {},
  models: {},
  checking: {},

  async init() {
    const settings = await invoke('settings:get')
    const resolved = settings.theme === 'system' ? (systemDark() ? 'dark' : 'light') : settings.theme
    applyTheme(resolved)
    set({ settings, resolvedTheme: resolved })
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().settings?.theme === 'system') {
        const t = systemDark() ? 'dark' : 'light'
        applyTheme(t)
        set({ resolvedTheme: t })
      }
    })
    await get().refreshLibrary()
  },

  async updateSettings(patch) {
    const current = get().settings
    if (current) set({ settings: { ...current, ...patch, ui: { ...current.ui, ...(patch.ui ?? {}) } } })
    const next = await invoke('settings:set', patch)
    const resolved = next.theme === 'system' ? (systemDark() ? 'dark' : 'light') : next.theme
    if (resolved !== get().resolvedTheme) applyTheme(resolved)
    set({ settings: next, resolvedTheme: resolved })
  },

  setUi(patch) {
    const s = get().settings
    if (!s) return
    void get().updateSettings({ ui: { ...s.ui, ...patch } })
  },

  async refreshLibrary() {
    set({ library: await invoke('library:list') })
  },

  async checkProvider(id) {
    set((s) => ({ checking: { ...s.checking, [id]: true } }))
    try {
      const status = await invoke('ai:status', id)
      set((s) => ({ status: { ...s.status, [id]: status } }))
      if (status.installed && status.loggedIn !== false) {
        const models = await invoke('ai:models', id)
        set((s) => ({ models: { ...s.models, [id]: models } }))
      }
      return status
    } finally {
      set((s) => ({ checking: { ...s.checking, [id]: false } }))
    }
  },

  async checkAllProviders() {
    const s = get().settings
    const ids = PROVIDERS.filter((p) => s?.providers[p]?.enabled !== false)
    await Promise.all(ids.map((id) => get().checkProvider(id)))
  },

  async autoRoute() {
    const s = get().settings
    if (!s) return
    const missing = (Object.keys(s.routes) as TaskKind[]).filter((k) => !s.routes[k])
    if (!missing.length) return
    const ready = PROVIDERS.find((p) => {
      const st = get().status[p]
      return st?.installed && st.loggedIn !== false && s.providers[p]?.enabled !== false
    })
    if (!ready) return
    const suggested = suggestRoutes(ready, get().models[ready] ?? [])
    const routes: ModelRoutes = { ...s.routes }
    for (const k of missing) routes[k] = suggested[k]
    await get().updateSettings({ routes })
  },

  routeFor(task) {
    return get().settings?.routes[task] ?? null
  }
}))
