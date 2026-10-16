// Export: PDF (Chromium print), DOCX and text files.

import { BrowserWindow, dialog, net } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DocxExportRequest, FontFaceSpec, PdfExportRequest, TextExportRequest } from '@shared/ipc'
import { mainT } from '../i18n'
import { buildDocx } from './docx'

type ExportKind = 'pdf' | 'docx' | 'markdown' | 'text'

async function askPath(win: BrowserWindow | undefined, defaultName: string, ext: string, kind: ExportKind): Promise<string | null> {
  // End-to-end tests write exports to a folder without a dialog.
  const testDir = process.env['WORDELIA_EXPORT_DIR']
  if (testDir) return join(testDir, `${defaultName}.${ext}`)
  const t = (await mainT()).main.export[kind]
  const opts = { title: t.title, defaultPath: `${defaultName}.${ext}`, filters: [{ name: t.filter, extensions: [ext] }] }
  const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  return res.canceled || !res.filePath ? null : res.filePath
}

export async function exportText(win: BrowserWindow | undefined, req: TextExportRequest): Promise<string | null> {
  const path = await askPath(win, req.defaultName, req.extension, req.extension === 'md' ? 'markdown' : 'text')
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

/** Read the app's own font files and turn them into @font-face rules with data URLs. */
export async function fontFaceCss(fonts: FontFaceSpec[]): Promise<string> {
  const rules: string[] = []
  for (const f of fonts) {
    if (!/^(https?:\/\/localhost|file:)/.test(f.url)) continue
    try {
      const res = await net.fetch(f.url)
      if (!res.ok) continue
      const data = Buffer.from(await res.arrayBuffer()).toString('base64')
      rules.push(
        `@font-face { font-family: '${f.family.replace(/'/g, '')}'; font-style: ${f.style}; font-weight: ${f.weight}; src: url(data:font/woff2;base64,${data}) format('woff2');${f.unicodeRange ? ` unicode-range: ${f.unicodeRange};` : ''} }`
      )
    } catch {
      /* skip a font that does not load */
    }
  }
  return rules.join('\n')
}

export async function exportPdf(win: BrowserWindow | undefined, req: PdfExportRequest): Promise<string | null> {
  const path = await askPath(win, req.defaultName, 'pdf', 'pdf')
  if (!path) return null
  const css = await fontFaceCss(req.fonts ?? [])
  const html = req.html.replace('/* FONT_FACES */', css)
  await writeFile(path, await renderPdf(html))
  return path
}

export async function exportDocx(win: BrowserWindow | undefined, req: DocxExportRequest): Promise<string | null> {
  const path = await askPath(win, req.defaultName, 'docx', 'docx')
  if (!path) return null
  await writeFile(path, await buildDocx(req.book))
  return path
}
