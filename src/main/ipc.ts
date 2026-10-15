// IPC handlers. The contract is in src/shared/ipc.ts.

import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
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
import { allowExported, allowPicked, allowRoot, assertPicked, assertRoot, isExported, isPicked, trustedSender } from './security'

type Handler<C extends InvokeChannel> = (e: IpcMainInvokeEvent, ...args: InvokeArgs<C>) => Promise<InvokeResult<C>> | InvokeResult<C>

function handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trustedSender(e)) throw new Error('Untrusted sender')
    return fn(e, ...(args as InvokeArgs<C>))
  })
}

const E2E = process.env['WORDELIA_E2E'] === '1'

function defaultBooksDir(): string {
  // Tests set WORDELIA_BOOKS_DIR, so they never write to the user's Documents folder.
  return process.env['WORDELIA_BOOKS_DIR'] || join(app.getPath('documents'), 'Wordelia')
}

const samePath = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/** The first sentence or two of the book, for the library card. */
function excerptOf(bodies: string[]): string {
  const text = markdownToPlain(bodies.find((b) => b.trim()) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= 180) return text
  const cut = text.slice(0, 180)
  return cut.slice(0, cut.lastIndexOf(' ')) + '…'
}

const flushWaiters = new Map<number, (ok: boolean, error: string) => void>()

/** Call `fn` when the renderer of `webContentsId` reports that it saved everything (or could not). */
export function onFlushDone(webContentsId: number, fn: (ok: boolean, error: string) => void): void {
  flushWaiters.set(webContentsId, fn)
}

const win = (e: IpcMainInvokeEvent): BrowserWindow | undefined => BrowserWindow.fromWebContents(e.sender) ?? undefined

export function registerIpc(): void {
  handle('library:list', () => listLibrary())
  handle('library:remove', (_e, root) => removeFromLibrary(root))
  handle('library:touch', (_e, item) => touchLibrary(item))

  handle('book:create', async (e, opts) => {
    if (!E2E && !isPicked(opts.parentDir) && !samePath(opts.parentDir, defaultBooksDir())) {
      throw new Error('Choose the folder for the book first.')
    }
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
    // A book from the library, or a folder that the user chose.
    const known = (await listLibrary()).some((i) => samePath(i.root, root))
    if (!E2E && !known && !isPicked(root)) throw new Error('Open the folder with the Open folder button.')
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
    const dir = res.canceled ? null : (res.filePaths[0] ?? null)
    if (dir) allowPicked(dir)
    return dir
  })

  handle('book:writeFile', async (_e, root, rel, content) => {
    assertRoot(root)
    const full = safeJoin(root, rel)
    noteOwnWrite(full, content)
    await atomicWrite(full, content)
  })

  handle('book:readFile', (_e, root, rel) => {
    assertRoot(root)
    return readTextOr(safeJoin(root, rel), null)
  })

  handle('book:deleteFile', async (_e, root, rel) => {
    assertRoot(root)
    const full = safeJoin(root, rel)
    noteOwnWrite(full, null)
    await rm(full, { force: true })
  })

  handle('book:renameFile', async (_e, root, from, to) => {
    assertRoot(root)
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
    const file = res.canceled ? null : (res.filePaths[0] ?? null)
    if (file) allowPicked(file)
    return file
  })

  handle('book:importAsset', async (_e, root, sourcePath) => {
    assertRoot(root)
    assertPicked(sourcePath)
    const ext = extname(sourcePath).toLowerCase()
    const name = uniqueName(fileNameFromTitle(basename(sourcePath, ext), ext), [])
    const rel = `${ASSETS_DIR}/${Date.now().toString(36)}-${name}`
    await mkdir(safeJoin(root, ASSETS_DIR), { recursive: true })
    await copyFile(sourcePath, safeJoin(root, rel))
    return rel.replace(/^planning\//, '')
  })

  handle('book:reveal', (_e, root, rel) => {
    assertRoot(root)
    if (rel) shell.showItemInFolder(safeJoin(root, rel))
    else void shell.openPath(root)
  })

  handle('book:assetUrl', (_e, root, rel) => {
    assertRoot(root)
    return assetUrl(root, rel)
  })

  handle('history:save', (_e, root, chapterId, label, body) => {
    assertRoot(root)
    return saveSnapshot(root, chapterId, label, body)
  })
  handle('history:list', (_e, root, chapterId) => {
    assertRoot(root)
    return listSnapshots(root, chapterId)
  })
  handle('history:read', (_e, root, chapterId, id) => {
    assertRoot(root)
    return readSnapshot(root, chapterId, id)
  })

  handle('settings:get', () => getSettings())
  handle('settings:set', (_e, patch) => setSettings(patch))

  handle('ai:status', (_e, provider) => providerStatus(provider))
  handle('ai:models', (_e, provider) => providerModels(provider))
  handle('ai:complete', (e, requestId, req) => complete(e.sender, requestId, req))
  handle('ai:cancel', (_e, requestId) => cancel(requestId))
  handle('ai:setKey', (_e, provider, key) => setSecret(provider, key))
  handle('ai:hasKey', async (_e, provider) => Boolean(await getSecret(provider)))
  handle('ai:openLogin', (_e, provider) => openLogin(provider))
  handle('ai:openUpdate', (_e, provider) => openLogin(provider, 'update'))

  const remember = (path: string | null): string | null => {
    if (path) allowExported(path)
    return path
  }
  handle('export:pdf', async (e, req) => remember(await exportPdf(win(e), req)))
  handle('export:docx', async (e, req) => remember(await exportDocx(win(e), req)))
  handle('export:text', async (e, req) => remember(await exportText(win(e), req)))

  handle('import:pick', async (e) => {
    const w = win(e)
    const opts = {
      title: 'Import a book',
      properties: ['openFile' as const],
      filters: [{ name: 'Documents', extensions: ['docx', 'md', 'markdown', 'txt'] }]
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    const file = res.canceled ? null : (res.filePaths[0] ?? null)
    if (file) allowPicked(file)
    return file
  })
  handle('import:pickNotes', async (e) => {
    const w = win(e)
    const opts = {
      title: 'Import notes into the planning',
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: 'Markdown notes', extensions: ['md', 'markdown', 'txt'] }]
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled) return []
    const out: Array<{ name: string; text: string }> = []
    for (const p of res.filePaths.slice(0, 200)) {
      const text = await readTextOr(p, null)
      if (text != null) out.push({ name: basename(p, extname(p)), text })
    }
    return out
  })

  handle('import:read', (_e, path) => {
    assertPicked(path)
    return readImport(path)
  })

  handle('app:defaultBooksDir', async () => {
    const dir = defaultBooksDir()
    await mkdir(dir, { recursive: true })
    return dir
  })
  handle('app:version', () => app.getVersion())
  handle('app:flushDone', (e, ok, error) => {
    const fn = flushWaiters.get(e.sender.id)
    flushWaiters.delete(e.sender.id)
    fn?.(ok, error)
  })

  handle('window:setTheme', (e, theme) => {
    const w = win(e)
    if (w && process.platform === 'win32') w.setTitleBarOverlay(themeOverlay(theme))
    w?.setBackgroundColor(theme === 'dark' ? '#191714' : '#ece5d8')
  })
  handle('window:openExternal', (_e, url) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  handle('window:showItem', (_e, path) => {
    if (isExported(path)) shell.showItemInFolder(path)
  })
  handle('window:setSpellLanguage', (e, tag) => {
    const w = win(e)
    if (w) setSpellLanguage(w, tag)
  })
}

async function afterOpen(e: IpcMainInvokeEvent, root: string): Promise<void> {
  allowRoot(root)
  registerBookRoot(root)
  watchBook(root, (change) => {
    if (!e.sender.isDestroyed()) e.sender.send('book:externalChange', change)
  })
}
