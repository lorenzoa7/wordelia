import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { cancelAll } from './ai'
import { handleAssetProtocol, registerAssetScheme } from './assets'
import { unwatchAll } from './book/watcher'
import { registerIpc } from './ipc'
import { getSettings } from './settings'
import { themeOverlay } from './window'

// Tests use a separate data folder, so they never touch the user's library.
if (process.env['WORDELIA_USER_DATA']) app.setPath('userData', process.env['WORDELIA_USER_DATA'])

registerAssetScheme()

async function createWindow(): Promise<void> {
  const settings = await getSettings()
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && (await import('electron')).nativeTheme.shouldUseDarkColors)
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
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

  win.once('ready-to-show', () => win.show())

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
