// What the renderer may touch. The renderer is sandboxed, but a bug or a dropped page must
// not reach files outside the books the user opened.

import { resolve } from 'node:path'
import type { IpcMainInvokeEvent } from 'electron'

const roots = new Set<string>()
const picked = new Set<string>()
const exported = new Set<string>()
let appUrlPrefix = ''

const norm = (p: string): string => resolve(p).toLowerCase()

/** The URL prefix of the app page (dev server or file). */
export function setAppUrl(url: string): void {
  appUrlPrefix = url.startsWith('file:') ? url.replace(/[^/]*$/, '') : new URL(url).origin + '/'
}

export function isAppUrl(url: string): boolean {
  return Boolean(appUrlPrefix) && url.startsWith(appUrlPrefix)
}

/** Only the app page may call IPC. */
export function trustedSender(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  return isAppUrl(url)
}

export function allowRoot(root: string): void {
  roots.add(norm(root))
}

export function assertRoot(root: string): void {
  if (!roots.has(norm(root))) throw new Error('This folder is not an open book.')
}

/** A path that the user chose in a dialog. */
export function allowPicked(path: string): void {
  picked.add(norm(path))
}

export function assertPicked(path: string): void {
  if (process.env['WORDELIA_E2E'] === '1') return
  if (!picked.has(norm(path))) throw new Error('This file was not chosen in a dialog.')
}

export function isPicked(path: string): boolean {
  return picked.has(norm(path))
}

export function allowExported(path: string): void {
  exported.add(norm(path))
}

export function isExported(path: string): boolean {
  return exported.has(norm(path))
}
