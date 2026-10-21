// Repair of a book manifest (wordelia.json) that does not parse, and the order of chapters whose files
// are missing for now. Pure code.

import type { BookManifest, ChapterRef } from './types'

/** JSON text as an object, or null. A byte order mark at the start is allowed (Notepad writes one). */
export function parseManifestText(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text.replace(/^﻿/, '')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** True when the text has git conflict markers. */
export function hasConflictMarkers(text: string): boolean {
  return /^<{7}( |$)/m.test(text) && /^={7}$/m.test(text) && /^>{7}( |$)/m.test(text)
}

/**
 * One side of each git conflict in the text: 'ours' is the part after "<<<<<<<" (the version of this
 * computer), 'theirs' the part after "=======". A diff3 base part ("|||||||") goes away.
 */
export function resolveConflict(text: string, side: 'ours' | 'theirs'): string {
  const out: string[] = []
  let part: 'none' | 'ours' | 'base' | 'theirs' = 'none'
  for (const line of text.split(/\r\n|\r|\n/)) {
    if (/^<{7}( |$)/.test(line)) part = 'ours'
    else if (part !== 'none' && /^\|{7}( |$)/.test(line)) part = 'base'
    else if (part !== 'none' && /^={7}$/.test(line)) part = 'theirs'
    else if (part !== 'none' && /^>{7}( |$)/.test(line)) part = 'none'
    else if (part === 'none' || part === side) out.push(line)
  }
  return out.join('\n')
}

/** The first string value of a key in JSON text, also in a file that stops in the middle. */
function stringValue(text: string, key: string, prefix = ''): string | undefined {
  const re = new RegExp(`"${key}"\\s*:\\s*"(${prefix}(?:[^"\\\\]|\\\\.)*)"`)
  const m = re.exec(text)
  if (!m) return undefined
  try {
    return JSON.parse(`"${m[1]}"`) as string
  } catch {
    return undefined
  }
}

/** The first complete object value of a key in JSON text, or undefined. */
function objectValue(text: string, key: string): Record<string, unknown> | undefined {
  const m = new RegExp(`"${key}"\\s*:\\s*\\{`).exec(text)
  if (!m) return undefined
  const start = m.index + m[0].length - 1
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      const v = parseManifestText(text.slice(start, i + 1))
      return v ?? undefined
    }
  }
  return undefined
}

/**
 * The parts of a damaged manifest that can still be read: the book id, the title, the author, the
 * language, the chapter order, the typography and the export settings. Null when nothing can be read.
 */
export function salvageManifest(text: string): Partial<BookManifest> | null {
  const out: Partial<BookManifest> & Record<string, unknown> = {}
  const id = stringValue(text, 'id', 'bk_')
  if (id) out.id = id
  for (const key of ['title', 'subtitle', 'author', 'language', 'genre', 'createdAt'] as const) {
    const v = stringValue(text, key)
    if (v !== undefined) out[key] = v
  }
  const chapters: ChapterRef[] = []
  const ref = /\{\s*"id"\s*:\s*"(ch_(?:[^"\\]|\\.)*)"\s*,\s*"file"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}/g
  for (const m of text.matchAll(ref)) {
    try {
      chapters.push({ id: JSON.parse(`"${m[1]}"`) as string, file: JSON.parse(`"${m[2]}"`) as string })
    } catch {
      /* a broken escape: skip this chapter */
    }
  }
  if (chapters.length) out.chapters = chapters
  for (const key of ['planning', 'typography', 'export'] as const) {
    const v = objectValue(text, key)
    if (v) out[key] = v as never
  }
  return Object.keys(out).length ? out : null
}

/**
 * The chapter order to save after a change of `next` (the chapters that are open). Chapters whose files
 * are missing for now (`missing`, by id) keep their places from `prev`: each one stays after the chapter
 * that was before it.
 */
export function keepMissingChapters(next: ChapterRef[], prev: ChapterRef[], missing: ReadonlySet<string>): ChapterRef[] {
  if (!missing.size) return next
  const out = next.filter((r) => !missing.has(r.id))
  const present = new Set(out.map((r) => r.id))
  prev.forEach((r, i) => {
    if (!missing.has(r.id) || present.has(r.id)) return
    // The nearest chapter before it that is still in the book.
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const k = out.findIndex((x) => x.id === prev[j].id)
      if (k >= 0) {
        at = k + 1
        break
      }
    }
    out.splice(at, 0, r)
    present.add(r.id)
  })
  return out
}
