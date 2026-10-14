import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { cancelAll } from './ai'
import { handleAssetProtocol, registerAssetScheme } from './assets'
import { unwatchAll } from './book/watcher'
import { registerIpc } from './ipc'
import { getSettings } from './settings'
import { themeOverlay } from './window'
import { loadWindowState, trackWindowState } from './window-state'
import { installContextMenu } from './context-menu'

// Tests use a separate data folder, so they never touch the user's library.
if (process.env['WORDELIA_USER_DATA']) app.setPath('userData', process.env['WORDELIA_USER_DATA'])

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
    title: 'Wordelia',
    icon: join(__dirname, '../../resources/icon.png'),
    backgroundColor: dark ? '#191714' : '#ece5d8',
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'win32' ? themeOverlay(dark ? 'dark' : 'light') : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      spellcheck: true
    }
  })

  win.once('ready-to-show', () => {
    if (saved?.maximized) win.maximize()
    win.show()
  })
  trackWindowState(win)
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
  // Never navigate away from the app.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) e.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // No menu bar: the app has its own title bar. Clipboard shortcuts still work in the page.
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
  handleAssetProtocol()
  registerIpc()
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => {
  cancelAll()
  void unwatchAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
