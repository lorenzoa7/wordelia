// Export: PDF (Chromium print), DOCX and text files.

import { BrowserWindow, dialog } from 'electron'
import { writeFile } from 'node:fs/promises'
import type { DocxExportRequest, PdfExportRequest, TextExportRequest } from '@shared/ipc'
import { buildDocx } from './docx'

async function askPath(win: BrowserWindow | undefined, defaultName: string, ext: string, label: string): Promise<string | null> {
  const opts = { title: `Export ${label}`, defaultPath: `${defaultName}.${ext}`, filters: [{ name: label, extensions: [ext] }] }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  return res.canceled || !res.filePath ? null : res.filePath
}

export async function exportText(win: BrowserWindow | undefined, req: TextExportRequest): Promise<string | null> {
  const path = await askPath(win, req.defaultName, req.extension, req.extension === 'md' ? 'Markdown' : 'Text')
  if (!path) return null
  await writeFile(path, req.content, 'utf8')
  return path
}

/** Render print HTML in a hidden window and save it as PDF. The CSS sets page size and margins. */
export async function renderPdf(html: string): Promise<Buffer> {
  const w = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true, contextIsolation: true }
  })
  try {
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    // Wait for web fonts.
    await w.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true', true).catch(() => true)
    const data = await w.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true, generateDocumentOutline: true })
    return data
  } finally {
    w.destroy()
  }
}

export async function exportPdf(win: BrowserWindow | undefined, req: PdfExportRequest): Promise<string | null> {
  const path = await askPath(win, req.defaultName, 'pdf', 'PDF')
  if (!path) return null
  await writeFile(path, await renderPdf(req.html))
  return path
}

export async function exportDocx(win: BrowserWindow | undefined, req: DocxExportRequest): Promise<string | null> {
  const path = await askPath(win, req.defaultName, 'docx', 'Word document')
  if (!path) return null
  await writeFile(path, await buildDocx(req.book))
  return path
}
