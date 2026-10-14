// IPC handlers. The contract is in src/shared/ipc.ts.

import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { ASSETS_DIR, countMarkdownWords, fileNameFromTitle, markdownToPlain, uniqueName } from '@shared/book'
import type { InvokeArgs, InvokeChannel, InvokeResult } from '@shared/ipc'
import { cancel, complete, providerModels, providerStatus } from './ai'
import { openLogin } from './ai/login'
import { createBook, openBook } from './book/store'
import { listSnapshots, readSnapshot, saveSnapshot } from './book/history'
import { noteOwnWrite, unwatchBook, watchBook } from './book/watcher'
import { exportDocx, exportPdf, exportText } from './export'
import { atomicWrite, readTextOr, safeJoin } from './fsutil'
import { readImport } from './import'
import { listLibrary, removeFromLibrary, touchLibrary } from './library'
import { getSecret, getSettings, setSecret, setSettings } from './settings'
import { assetUrl, registerBookRoot } from './assets'
import { themeOverlay } from './window'
import { setSpellLanguage } from './context-menu'

type Handler<C extends InvokeChannel> = (e: IpcMainInvokeEvent, ...args: InvokeArgs<C>) => Promise<InvokeResult<C>> | InvokeResult<C>

function handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (e, ...args) => fn(e, ...(args as InvokeArgs<C>)))
}

/** The first sentence or two of the book, for the library card. */
function excerptOf(bodies: string[]): string {
  const text = markdownToPlain(bodies.find((b) => b.trim()) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= 180) return text
  const cut = text.slice(0, 180)
  return cut.slice(0, cut.lastIndexOf(' ')) + '…'
}

const flushWaiters = new Map<number, () => void>()

/** Call `fn` when the renderer of `webContentsId` reports that it saved everything. */
export function onFlushDone(webContentsId: number, fn: () => void): void {
  flushWaiters.set(webContentsId, fn)
}

const win = (e: IpcMainInvokeEvent): BrowserWindow | undefined => BrowserWindow.fromWebContents(e.sender) ?? undefined

export function registerIpc(): void {
  handle('library:list', () => listLibrary())
  handle('library:remove', (_e, root) => removeFromLibrary(root))
  handle('library:touch', (_e, item) => touchLibrary(item))

  handle('book:create', async (e, opts) => {
    const snap = await createBook(opts)
    await afterOpen(e, snap.root)
    await touchLibrary({
      root: snap.root,
      id: snap.manifest.id,
      title: snap.manifest.title,
      author: snap.manifest.author,
      words: 0,
      chapters: snap.chapters.length,
      openedAt: new Date().toISOString()
    })
    return snap
  })

  handle('book:open', async (e, root) => {
    const snap = await openBook(root)
    await afterOpen(e, root)
    await touchLibrary({
      root,
      id: snap.manifest.id,
      title: snap.manifest.title,
      author: snap.manifest.author,
      words: snap.chapters.reduce((n, c) => n + countMarkdownWords(c.body), 0),
      chapters: snap.chapters.length,
      openedAt: new Date().toISOString(),
      excerpt: excerptOf(snap.chapters.map((c) => c.body))
    })
    return snap
  })

  handle('book:close', (_e, root) => unwatchBook(root))

  handle('book:pickFolder', async (e, opts) => {
    const w = win(e)
    const props: Array<'openDirectory' | 'createDirectory'> = ['openDirectory', 'createDirectory']
    const res = w
      ? await dialog.showOpenDialog(w, { title: opts.title, properties: props })
      : await dialog.showOpenDialog({ title: opts.title, properties: props })
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  handle('book:writeFile', async (_e, root, rel, content) => {
    const full = safeJoin(root, rel)
    noteOwnWrite(full, content)
    await atomicWrite(full, content)
  })

  handle('book:readFile', (_e, root, rel) => readTextOr(safeJoin(root, rel), null))

  handle('book:deleteFile', async (_e, root, rel) => {
    const full = safeJoin(root, rel)
    noteOwnWrite(full, null)
    await rm(full, { force: true })
  })

  handle('book:renameFile', async (_e, root, from, to) => {
    const a = safeJoin(root, from)
    const b = safeJoin(root, to)
    noteOwnWrite(a, null)
    await mkdir(join(b, '..'), { recursive: true })
    await rename(a, b)
  })

  handle('book:pickImage', async (e) => {
    const w = win(e)
    const opts = {
      title: 'Choose an image',
      properties: ['openFile' as const],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }]
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  handle('book:importAsset', async (_e, root, sourcePath) => {
    const ext = extname(sourcePath).toLowerCase()
    const name = uniqueName(fileNameFromTitle(basename(sourcePath, ext), ext), [])
    const rel = `${ASSETS_DIR}/${Date.now().toString(36)}-${name}`
    await mkdir(safeJoin(root, ASSETS_DIR), { recursive: true })
    await copyFile(sourcePath, safeJoin(root, rel))
    return rel.replace(/^planning\//, '')
  })

  handle('book:reveal', (_e, root, rel) => {
    if (rel) shell.showItemInFolder(safeJoin(root, rel))
    else void shell.openPath(root)
  })

  handle('book:assetUrl', (_e, root, rel) => assetUrl(root, rel))

  handle('history:save', (_e, root, chapterId, label, body) => saveSnapshot(root, chapterId, label, body))
  handle('history:list', (_e, root, chapterId) => listSnapshots(root, chapterId))
  handle('history:read', (_e, root, chapterId, id) => readSnapshot(root, chapterId, id))

  handle('settings:get', () => getSettings())
  handle('settings:set', (_e, patch) => setSettings(patch))

  handle('ai:status', (_e, provider) => providerStatus(provider))
  handle('ai:models', (_e, provider) => providerModels(provider))
  handle('ai:complete', (e, requestId, req) => complete(e.sender, requestId, req))
  handle('ai:cancel', (_e, requestId) => cancel(requestId))
  handle('ai:setKey', (_e, provider, key) => setSecret(provider, key))
  handle('ai:hasKey', async (_e, provider) => Boolean(await getSecret(provider)))
  handle('ai:openLogin', (_e, provider) => openLogin(provider))

  handle('export:pdf', (e, req) => exportPdf(win(e), req))
  handle('export:docx', (e, req) => exportDocx(win(e), req))
  handle('export:text', (e, req) => exportText(win(e), req))

  handle('import:pick', async (e) => {
    const w = win(e)
    const opts = {
      title: 'Import a book',
      properties: ['openFile' as const],
      filters: [{ name: 'Documents', extensions: ['docx', 'md', 'markdown', 'txt'] }]
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  handle('import:read', (_e, path) => readImport(path))

  handle('app:defaultBooksDir', async () => {
    // Tests set WORDELIA_BOOKS_DIR, so they never write to the user's Documents folder.
    const dir = process.env['WORDELIA_BOOKS_DIR'] || join(app.getPath('documents'), 'Wordelia')
    await mkdir(dir, { recursive: true })
    return dir
  })
  handle('app:version', () => app.getVersion())
  handle('app:flushDone', (e) => {
    const fn = flushWaiters.get(e.sender.id)
    flushWaiters.delete(e.sender.id)
    fn?.()
  })

  handle('window:setTheme', (e, theme) => {
    const w = win(e)
    if (w && process.platform === 'win32') w.setTitleBarOverlay(themeOverlay(theme))
    w?.setBackgroundColor(theme === 'dark' ? '#191714' : '#ece5d8')
  })
  handle('window:openExternal', (_e, url) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  handle('window:showItem', (_e, path) => shell.showItemInFolder(path))
  handle('window:setSpellLanguage', (e, tag) => {
    const w = win(e)
    if (w) setSpellLanguage(w, tag)
  })
}

async function afterOpen(e: IpcMainInvokeEvent, root: string): Promise<void> {
  registerBookRoot(root)
  watchBook(root, (change) => {
    if (!e.sender.isDestroyed()) e.sender.send('book:externalChange', change)
  })
}
