// App updates from GitHub Releases (electron-updater).
//
// The app looks for a new version at start and every few hours. It downloads the
// installer in the background. The user restarts when they want; the window first
// saves everything (the same close path as always), then the new version installs
// without questions and starts.

import { app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'
import { getSettings, onSettingsChanged } from './settings'

const CHECK_EVERY = 6 * 60 * 60 * 1000
const FIRST_CHECK_AFTER = 15 * 1000

let state: UpdateState = { state: 'idle' }
let installOnClose = false
let timer: ReturnType<typeof setInterval> | null = null

function publish(next: UpdateState): void {
  state = next
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('app:update', state)
}

/** Updates work only in the installed app, not in development or in test runs. */
function supported(): boolean {
  return app.isPackaged && process.env.WORDELIA_E2E !== '1' && process.platform === 'win32'
}

export function updateState(): UpdateState {
  return state
}

export async function checkForUpdate(): Promise<UpdateState> {
  if (!supported()) {
    publish({ state: 'off' })
    return state
  }
  if (state.state === 'downloading' || state.state === 'ready') return state
  publish({ state: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err) {
    publish({ state: 'error', message: err instanceof Error ? err.message : String(err) })
  }
  return state
}

/** Close the window (it saves first); when the app quits, install the new version and start it. */
export function installUpdate(): void {
  if (state.state !== 'ready' || process.env.WORDELIA_UPDATE_TEST === '1') return
  installOnClose = true
  for (const w of BrowserWindow.getAllWindows()) w.close()
}

/**
 * The window stays open after "Restart now" (the writer chose "Keep the window open" because some
 * text was not saved). A later normal quit must not restart the app.
 */
export function cancelUpdateInstall(): void {
  installOnClose = false
}

/** An update that is ready installs when the app quits only while "Download updates automatically" is on. */
function installOnQuit(autoUpdate: boolean): void {
  // WORDELIA_UPDATE_TEST=1: check and download only (scripts/smoke-update.mjs), never install.
  autoUpdater.autoInstallOnAppQuit = autoUpdate && process.env.WORDELIA_UPDATE_TEST !== '1'
}

/** Call from 'window-all-closed'. Returns true when the update takes over the quit. */
export function quitForUpdate(): boolean {
  if (!installOnClose) return false
  // Silent install, then start the app again.
  autoUpdater.quitAndInstall(true, true)
  return true
}

export async function initUpdater(): Promise<void> {
  if (!supported()) {
    state = { state: 'off' }
    return
  }
  autoUpdater.autoDownload = true
  // An update that the user did not install yet goes in when they quit the app.
  installOnQuit((await getSettings()).autoUpdate)
  onSettingsChanged((s) => installOnQuit(s.autoUpdate))
  autoUpdater.on('update-available', (info) => publish({ state: 'downloading', version: info.version, percent: 0 }))
  autoUpdater.on('download-progress', (p) => {
    if (state.state === 'downloading') publish({ ...state, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => publish({ state: 'ready', version: info.version }))
  autoUpdater.on('update-not-available', () => publish({ state: 'none', checkedAt: new Date().toISOString() }))
  autoUpdater.on('error', (err) => publish({ state: 'error', message: err?.message ?? String(err) }))

  const auto = async (): Promise<void> => {
    if ((await getSettings()).autoUpdate) await checkForUpdate()
  }
  setTimeout(() => void auto(), FIRST_CHECK_AFTER)
  timer = setInterval(() => void auto(), CHECK_EVERY)
  app.on('before-quit', () => {
    if (timer) clearInterval(timer)
  })
}
