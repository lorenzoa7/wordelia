// Transient UI state: dialogs and toasts.

import { create } from 'zustand'

export type SettingsTab = 'general' | 'book' | 'ai' | 'actions' | 'rules'

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'error'
  action?: { label: string; run: () => void }
}

interface UiState {
  settingsOpen: boolean
  settingsTab: SettingsTab
  exportOpen: boolean
  newBookOpen: boolean
  findOpen: boolean
  toasts: Toast[]
  openSettings(tab?: SettingsTab): void
  closeSettings(): void
  setExportOpen(v: boolean): void
  setNewBookOpen(v: boolean): void
  setFindOpen(v: boolean): void
  toast(message: string, opts?: { kind?: Toast['kind']; action?: Toast['action']; ms?: number }): void
  dismissToast(id: number): void
}

let nextToast = 1

export const useUi = create<UiState>((set, get) => ({
  settingsOpen: false,
  settingsTab: 'general',
  exportOpen: false,
  newBookOpen: false,
  findOpen: false,
  toasts: [],
  openSettings(tab) {
    set({ settingsOpen: true, settingsTab: tab ?? get().settingsTab })
  },
  closeSettings() {
    set({ settingsOpen: false })
  },
  setExportOpen(v) {
    set({ exportOpen: v })
  },
  setNewBookOpen(v) {
    set({ newBookOpen: v })
  },
  setFindOpen(v) {
    set({ findOpen: v })
  },
  toast(message, opts = {}) {
    const id = nextToast++
    set({ toasts: [...get().toasts, { id, message, kind: opts.kind ?? 'info', action: opts.action }] })
    setTimeout(() => get().dismissToast(id), opts.ms ?? (opts.kind === 'error' ? 7000 : 3500))
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
}))

export const toast = (message: string, opts?: Parameters<UiState['toast']>[1]): void => useUi.getState().toast(message, opts)
