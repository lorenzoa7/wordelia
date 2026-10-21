// Transient UI state: dialogs and toasts.

import { create } from 'zustand'

/** 'book' and 'rules' belong to the open book: without a book, the dialog shows 'general'. */
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
  historyChapterId: string | null
  toasts: Toast[]
  openSettings(tab?: SettingsTab): void
  closeSettings(): void
  setExportOpen(v: boolean): void
  setNewBookOpen(v: boolean): void
  setFindOpen(v: boolean): void
  openHistory(chapterId: string | null): void
  /** Close what belongs to the open book (the find bar, the history, the export): another book opens, or none. */
  resetForBook(): void
  toast(message: string, opts?: { kind?: Toast['kind']; action?: Toast['action']; ms?: number }): void
  dismissToast(id: number): void
  pauseToast(id: number): void
  resumeToast(id: number): void
  /** A search for the find bar from another view (the "In the manuscript" chips of a note). The find bar takes it once. */
  findSeed: { query: string; chapterId: string; n: number } | null
  /** Open the find bar on a chapter with this text, at its first match */
  openFind(query: string, chapterId: string): void
}

let nextToast = 1
const toastTimers = new Map<number, { remaining: number; started: number; timer: ReturnType<typeof setTimeout> | undefined }>()

export const useUi = create<UiState>((set, get) => ({
  settingsOpen: false,
  settingsTab: 'general',
  exportOpen: false,
  newBookOpen: false,
  findOpen: false,
  historyChapterId: null,
  toasts: [],
  openSettings(tab) {
    // No tab (the gear, Ctrl+,): always the first tab, not the last one.
    set({ settingsOpen: true, settingsTab: tab ?? 'general' })
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
  openHistory(chapterId) {
    set({ historyChapterId: chapterId })
  },
  resetForBook() {
    const tab = get().settingsTab
    set({ findOpen: false, historyChapterId: null, exportOpen: false, ...(tab === 'book' || tab === 'rules' ? { settingsOpen: false } : {}) })
  },
  toast(message, opts = {}) {
    const id = nextToast++
    set({ toasts: [...get().toasts, { id, message, kind: opts.kind ?? 'info', action: opts.action }] })
    const ms = opts.ms ?? (opts.action ? 9000 : opts.kind === 'error' ? 7000 : 3500)
    toastTimers.set(id, { remaining: ms, started: Date.now(), timer: setTimeout(() => get().dismissToast(id), ms) })
  },
  pauseToast(id) {
    const t = toastTimers.get(id)
    if (!t || t.timer === undefined) return
    clearTimeout(t.timer)
    t.remaining -= Date.now() - t.started
    t.timer = undefined
  },
  resumeToast(id) {
    const t = toastTimers.get(id)
    if (!t || t.timer !== undefined) return
    t.started = Date.now()
    t.timer = setTimeout(() => get().dismissToast(id), Math.max(1500, t.remaining))
  },
  dismissToast(id) {
    const t = toastTimers.get(id)
    if (t?.timer) clearTimeout(t.timer)
    toastTimers.delete(id)
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
  findSeed: null,
  openFind(query, chapterId) {
    set({ findOpen: true, findSeed: { query, chapterId, n: (get().findSeed?.n ?? 0) + 1 } })
  }
}))

export const toast = (message: string, opts?: Parameters<UiState['toast']>[1]): void => useUi.getState().toast(message, opts)
