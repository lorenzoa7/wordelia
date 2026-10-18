import { app, BrowserWindow, dialog, Menu, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isAppUrl, setAppUrl } from './security'
import { cancelAll } from './ai'
import { handleAssetProtocol, registerAssetScheme } from './assets'
import { unwatchAll } from './book/watcher'
import { onFlushDone, registerIpc } from './ipc'
import { getSettings } from './settings'
import { themeOverlay } from './window'
import { loadWindowState, trackWindowState } from './window-state'
import { installContextMenu } from './context-menu'
import { mainT } from './i18n'
import { initUpdater, quitForUpdate } from './updater'

// Tests use a separate data folder, so they never touch the user's library.
if (process.env['WORDELIA_USER_DATA']) app.setPath('userData', process.env['WORDELIA_USER_DATA'])

/**
 * Test runs (WORDELIA_E2E) do not show the window: it is fully transparent, lets the mouse through
 * and never takes the focus, so tests do not get in the way of the person at the computer. Chromium
 * must not stop painting a window that it thinks nobody sees, or the screenshots would wait.
 * WORDELIA_E2E_VISIBLE=1 shows it (scripts/shot.mjs --visible).
 */
const HIDDEN_TEST_WINDOW = process.env['WORDELIA_E2E'] === '1' && process.env['WORDELIA_E2E_VISIBLE'] !== '1'
if (HIDDEN_TEST_WINDOW) {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}

registerAssetScheme()

async function createWindow(): Promise<void> {
  const settings = await getSettings()
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && (await import('electron')).nativeTheme.shouldUseDarkColors)
  const saved = loadWindowState()
  const win = new BrowserWindow({
    width: saved?.bounds.width ?? 1440,
    height: saved?.bounds.height ?? 920,
    ...(saved ? { x: saved.bounds.x, y: saved.bounds.y } : {}),
    minWidth: 980,
    minHeight: 640,
    show: false,
    skipTaskbar: HIDDEN_TEST_WINDOW,
    title: 'Wordelia',
    icon: join(__dirname, '../../resources/icon.png'),
    backgroundColor: dark ? '#191714' : '#ece5d8',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'win32' ? themeOverlay(dark ? 'dark' : 'light') : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      spellcheck: true,
      backgroundThrottling: !HIDDEN_TEST_WINDOW
    }
  })

  win.once('ready-to-show', () => {
    if (HIDDEN_TEST_WINDOW) {
      win.setOpacity(0)
      win.setIgnoreMouseEvents(true)
      win.showInactive()
      return
    }
    if (saved?.maximized) win.maximize()
    win.show()
  })
  trackWindowState(win)

  // Before the window closes, let the renderer save the last keystrokes.
  let allowClose = false
  win.on('close', (e) => {
    if (allowClose) return
    e.preventDefault()
    const close = (): void => {
      if (allowClose) return
      allowClose = true
      clearTimeout(timer)
      if (!win.isDestroyed()) win.close()
    }
    const timer = setTimeout(close, 6000)
    onFlushDone(win.webContents.id, async (ok, error) => {
      clearTimeout(timer)
      if (ok) return close()
      // Some text is not on disk yet: ask before closing.
      const t = (await mainT()).main.closeDialog
      if (win.isDestroyed()) return
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        title: 'Wordelia',
        message: t.message,
        detail: `${error || t.fileNotWritten}\n\n${t.syncAppHint}`,
        buttons: [t.keepOpen, t.closeAnyway],
        defaultId: 0,
        cancelId: 0
      })
      if (choice === 1) close()
    })
    win.webContents.send('app:flushRequest', {})
  })
  installContextMenu(win)

  // Developer tools in development only.
  if (!app.isPackaged) {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.control && input.shift && input.key.toLowerCase() === 'i') win.webContents.toggleDevTools()
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Never navigate away from the app: not by a link, and not by a file dropped on the window.
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault()
  })
  win.webContents.on('will-frame-navigate', (e) => {
    if (!isAppUrl(e.url)) e.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    setAppUrl(process.env['ELECTRON_RENDERER_URL'])
    await win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const file = join(__dirname, '../renderer/index.html')
    setAppUrl(pathToFileURL(file).toString())
    await win.loadFile(file)
  }
}

app.whenReady().then(async () => {
  // No menu bar: the app has its own title bar. Clipboard shortcuts still work in the page.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  handleAssetProtocol()
  registerIpc()
  await createWindow()
  void initUpdater()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => {
  cancelAll()
  void unwatchAll()
})

app.on('window-all-closed', () => {
  // After "Restart and update" the updater quits the app and starts the new version.
  if (quitForUpdate()) return
  if (process.platform !== 'darwin') app.quit()
})
