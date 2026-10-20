// IPC handlers. The contract is in src/shared/ipc.ts.

import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { ASSETS_DIR, CHAT_IMAGES_DIR, fileNameFromTitle, uniqueName } from '@shared/book'
import type { InvokeArgs, InvokeChannel, InvokeResult } from '@shared/ipc'
import { cancel, complete, providerModels, providerStatus } from './ai'
import { openLogin } from './ai/login'
import { createBook, openBook } from './book/store'
import { listSnapshots, readSnapshot, saveSnapshot } from './book/history'
import { noteOwnWrite, unwatchBook, watchBook } from './book/watcher'
import { exportDocx, exportPdf, exportText } from './export'
import { atomicWrite, readTextOr, safeJoin } from './fsutil'
import { mainT } from './i18n'
import { readImport } from './import'
import { bookFacts, listLibrary, refreshLibraryItem, removeFromLibrary, setLibraryPages, touchLibrary } from './library'
import { getSecret, getSettings, setSecret, setSettings } from './settings'
import { assetUrl, registerBookRoot } from './assets'
import { themeOverlay } from './window'
import { setSpellLanguage } from './context-menu'
import { allowExported, allowPicked, allowRoot, assertPicked, assertRoot, isExported, isPicked, trustedSender } from './security'
import { checkForUpdate, installUpdate, updateState } from './updater'

type Handler<C extends InvokeChannel> = (e: IpcMainInvokeEvent, ...args: InvokeArgs<C>) => Promise<InvokeResult<C>> | InvokeResult<C>

function handle<C extends InvokeChannel>(channel: C, fn: Handler<C>): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trustedSender(e)) throw new Error('Untrusted sender')
    return fn(e, ...(args as InvokeArgs<C>))
  })
}

const E2E = process.env['WORDELIA_E2E'] === '1'
/** The largest image of a chat message, in bytes */
const MAX_CHAT_IMAGE = 12 * 1024 * 1024

function defaultBooksDir(): string {
  // Tests set WORDELIA_BOOKS_DIR, so they never write to the user's Documents folder.
  return process.env['WORDELIA_BOOKS_DIR'] || join(app.getPath('documents'), 'Wordelia')
}

const samePath = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

const flushWaiters = new Map<number, (ok: boolean, error: string) => void>()
/** The books that are open in a window, by the id of its web contents: their library cards change when they close. */
const openRoots = new Map<number, string>()

/** Call `fn` when the renderer of `webContentsId` reports that it saved everything (or could not). */
export function onFlushDone(webContentsId: number, fn: (ok: boolean, error: string) => void): void {
  flushWaiters.set(webContentsId, fn)
}

const win = (e: IpcMainInvokeEvent): BrowserWindow | undefined => BrowserWindow.fromWebContents(e.sender) ?? undefined

export function registerIpc(): void {
  handle('library:list', () => listLibrary())
  handle('library:remove', (_e, root) => removeFromLibrary(root))
  handle('library:touch', (_e, item) => touchLibrary(item))
  handle('library:pages', (_e, root, pages, words) => setLibraryPages(root, pages, words))

  handle('book:create', async (e, opts) => {
    if (!E2E && !isPicked(opts.parentDir) && !samePath(opts.parentDir, defaultBooksDir())) {
      throw new Error((await mainT()).main.dialogs.chooseFolderFirst)
    }
    const snap = await createBook(opts)
    await afterOpen(e, snap.root)
    await touchLibrary({
      root: snap.root,
      id: snap.manifest.id,
      ...bookFacts(snap.manifest, snap.chapters),
      openedAt: new Date().toISOString()
    })
    return snap
  })

  handle('book:open', async (e, root) => {
    // A book from the library, or a folder that the user chose.
    const known = (await listLibrary()).some((i) => samePath(i.root, root))
    if (!E2E && !known && !isPicked(root)) throw new Error((await mainT()).main.dialogs.useOpenFolder)
    const snap = await openBook(root)
    await afterOpen(e, root)
    await touchLibrary({
      root,
      id: snap.manifest.id,
      ...bookFacts(snap.manifest, snap.chapters),
      openedAt: new Date().toISOString()
    })
    return snap
  })

  handle('book:close', async (e, root) => {
    if (openRoots.get(e.sender.id) === root) openRoots.delete(e.sender.id)
    await unwatchBook(root)
    // The renderer saved everything before it closed the book: the card gets the new words and pages.
    await refreshLibraryItem(root)
  })

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
    const t = (await mainT()).main.dialogs
    const opts = {
      title: t.chooseImage,
      properties: ['openFile' as const],
      filters: [{ name: t.images, extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] }]
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

  handle('chat:saveImage', async (_e, root, data, name) => {
    assertRoot(root)
    // The renderer makes the image small first (chat/images.ts): a few hundred kilobytes.
    if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_CHAT_IMAGE) throw new Error('This image cannot be added.')
    const stem = String(name).replace(/\.[^.]*$/, '')
    const rel = `${CHAT_IMAGES_DIR}/${Date.now().toString(36)}-${fileNameFromTitle(stem, '.webp')}`
    await mkdir(safeJoin(root, CHAT_IMAGES_DIR), { recursive: true })
    await writeFile(safeJoin(root, rel), data)
    return rel.replace(/^planning\//, '')
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
    const t = (await mainT()).main.dialogs
    const opts = {
      title: t.importBook,
      properties: ['openFile' as const],
      filters: [{ name: t.documents, extensions: ['docx', 'md', 'markdown', 'txt'] }]
    }
    const res = w ? await dialog.showOpenDialog(w, opts) : await dialog.showOpenDialog(opts)
    const file = res.canceled ? null : (res.filePaths[0] ?? null)
    if (file) allowPicked(file)
    return file
  })
  handle('import:pickNotes', async (e) => {
    const w = win(e)
    const t = (await mainT()).main.dialogs
    const opts = {
      title: t.importNotes,
      properties: ['openFile' as const, 'multiSelections' as const],
      filters: [{ name: t.markdownNotes, extensions: ['md', 'markdown', 'txt'] }]
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
  handle('app:updateState', () => updateState())
  handle('app:checkUpdate', () => checkForUpdate())
  handle('app:installUpdate', () => installUpdate())
  handle('app:flushDone', async (e, ok, error) => {
    const fn = flushWaiters.get(e.sender.id)
    flushWaiters.delete(e.sender.id)
    // The window closes with a book open, and its text is on disk: its card gets the new words and pages.
    const root = openRoots.get(e.sender.id)
    if (ok && fn && root) await refreshLibraryItem(root).catch(() => {})
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
  openRoots.set(e.sender.id, root)
  allowRoot(root)
  registerBookRoot(root)
  watchBook(root, (change) => {
    if (!e.sender.isDestroyed()) e.sender.send('book:externalChange', change)
  })
}
