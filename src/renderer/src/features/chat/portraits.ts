// The portraits of the planning entries go with each chat message, so the AI sees how the
// characters, places and things look (shared/prompts/portraits.ts says which ones): sheets with all
// the portraits, small, with the name of the entry under each one, and the entries that the message
// is about at a larger size. The images are made here and kept for the next messages.

import { portraitPlan, type PortraitFocus } from '@shared/prompts/portraits'
import type { Entry, InlineImage } from '@shared/types'
import { invoke } from '@/lib/api'

/** One cell of a sheet: the portrait in a square, the name under it */
const CELL_W = 240
const CELL_H = 284
const PAD = 8
const COLUMNS = 6
/** The long side of a larger portrait */
const LARGE_SIDE = 1024

// The images are for the AI, not for the screen: black text on white, with thin lines between the
// cells, reads best. So these colors do not come from the theme tokens.
const PAPER = '#ffffff'
const INK = '#111111'
const LINE = '#d9d9d9'

const sheetCache = new Map<string, string | null>()
const largeCache = new Map<string, string | null>()

function remember(cache: Map<string, string | null>, key: string, value: string | null, max: number): void {
  cache.delete(key)
  cache.set(key, value)
  if (cache.size > max) cache.delete(cache.keys().next().value as string)
}

async function bitmapOf(root: string, file: string): Promise<ImageBitmap | null> {
  try {
    const bytes = await invoke('book:readAsset', root, file)
    return bytes ? await createImageBitmap(new Blob([bytes as Uint8Array<ArrayBuffer>])) : null
  } catch {
    return null
  }
}

/** The image of a canvas, WebP, in Base64 */
async function canvasData(canvas: HTMLCanvasElement): Promise<string | null> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
  if (!blob) return null
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return url.slice(url.indexOf(',') + 1)
}

/** A name that fits the width, with "…" at the end when it is too long */
function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text
  let s = text
  while (s.length > 1 && g.measureText(`${s}…`).width > width) s = s.slice(0, -1)
  return `${s.trimEnd()}…`
}

async function drawSheet(root: string, list: Entry[]): Promise<string | null> {
  const columns = Math.min(COLUMNS, list.length)
  const rows = Math.ceil(list.length / columns)
  const canvas = document.createElement('canvas')
  canvas.width = columns * CELL_W
  canvas.height = rows * CELL_H
  const g = canvas.getContext('2d')
  if (!g) return null
  g.fillStyle = PAPER
  g.fillRect(0, 0, canvas.width, canvas.height)
  g.imageSmoothingQuality = 'high'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = '600 17px "Segoe UI", Arial, sans-serif'
  g.strokeStyle = LINE
  const square = CELL_W - PAD * 2
  let drawn = 0
  for (const [i, e] of list.entries()) {
    const x = (i % columns) * CELL_W
    const y = Math.floor(i / columns) * CELL_H
    g.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, CELL_H - 1)
    const bitmap = e.image ? await bitmapOf(root, e.image) : null
    if (bitmap) {
      const scale = Math.min(square / bitmap.width, square / bitmap.height)
      const w = bitmap.width * scale
      const h = bitmap.height * scale
      g.drawImage(bitmap, x + PAD + (square - w) / 2, y + PAD + (square - h) / 2, w, h)
      bitmap.close()
      drawn++
    }
    g.fillStyle = INK
    g.fillText(fit(g, e.name, CELL_W - 12), x + CELL_W / 2, y + PAD + square + (CELL_H - PAD - square) / 2)
  }
  return drawn ? canvasData(canvas) : null
}

async function drawLarge(root: string, file: string): Promise<string | null> {
  const bitmap = await bitmapOf(root, file)
  if (!bitmap) return null
  try {
    const scale = Math.min(1, LARGE_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const g = canvas.getContext('2d')
    if (!g) return null
    g.imageSmoothingQuality = 'high'
    g.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvasData(canvas)
  } finally {
    bitmap.close()
  }
}

/** The portraits for one message, with the line that the AI reads before each image. Never fails: no portraits then. */
export async function portraitImages(root: string, entries: Entry[], about: PortraitFocus): Promise<InlineImage[]> {
  try {
    const plan = portraitPlan(entries, about)
    const out: InlineImage[] = []
    for (const [i, sheet] of plan.sheets.entries()) {
      const key = `${root}|${sheet.map((e) => `${e.id}:${e.name}:${e.image}`).join('|')}`
      let data = sheetCache.get(key)
      if (data === undefined) {
        data = await drawSheet(root, sheet)
        remember(sheetCache, key, data, 8)
      }
      const which = plan.sheets.length > 1 ? `, sheet ${i + 1} of ${plan.sheets.length}` : ''
      if (data) out.push({ mime: 'image/webp', data, label: `Portraits of the planning entries${which}. The name of the entry is under each portrait.` })
    }
    for (const e of plan.focus) {
      const key = `${root}|${e.image}`
      let data = largeCache.get(key)
      if (data === undefined) {
        data = await drawLarge(root, e.image!)
        remember(largeCache, key, data, 24)
      }
      if (data) out.push({ mime: 'image/webp', data, label: `The portrait of the planning entry "${e.name}" (planning/${e.file}), larger.` })
    }
    return out
  } catch {
    return []
  }
}
