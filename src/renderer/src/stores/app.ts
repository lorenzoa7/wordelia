// App-level state: settings, theme, library, AI provider status.

import { create } from 'zustand'
import type { AppSettings, LibraryItem, ModelInfo, ProviderId, ProviderStatus, TaskKind } from '@shared/types'
import { PROVIDER_ORDER as PROVIDERS, readyProviders, repairRoutes, type RouteRepair } from '@shared/ai/routes'
import { invoke } from '@/lib/api'

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
  /** `quiet`: no "Checking…" while the check runs (a check in the background) */
  checkProvider(id: ProviderId, opts?: { quiet?: boolean }): Promise<ProviderStatus>
  checkAllProviders(opts?: { quiet?: boolean }): Promise<void>
  /**
   * Give a route to each task without one, and to each task whose provider is off: the routes of
   * `prefer` when it is ready, else of the first ready provider (repairRoutes). Null: no change.
   */
  autoRoute(prefer?: ProviderId): Promise<RouteRepair | null>
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

  async checkProvider(id, opts) {
    if (!opts?.quiet) set((s) => ({ checking: { ...s.checking, [id]: true } }))
    try {
      const status = await invoke('ai:status', id)
      set((s) => ({ status: { ...s.status, [id]: status } }))
      if (status.installed && status.loggedIn !== false) {
        const models = await invoke('ai:models', id)
        set((s) => ({ models: { ...s.models, [id]: models } }))
      }
      return status
    } finally {
      if (!opts?.quiet) set((s) => ({ checking: { ...s.checking, [id]: false } }))
    }
  },

  async checkAllProviders(opts) {
    const s = get().settings
    const ids = PROVIDERS.filter((p) => s?.providers[p]?.enabled !== false)
    await Promise.all(ids.map((id) => get().checkProvider(id, opts)))
  },

  async autoRoute(prefer) {
    const s = get().settings
    if (!s) return null
    const ready = readyProviders(s, get().status)
    const repair = repairRoutes(s.routes, (p) => s.providers[p]?.enabled !== false, ready, get().models, prefer)
    if (repair) await get().updateSettings({ routes: repair.routes })
    return repair
  },

  routeFor(task) {
    return get().settings?.routes[task] ?? null
  }
}))
