// Names of planning notes: the parts of a [[wiki link]], a rename of the links and the mentions,
// duplicate names, the natural order of names, and the category folder of a note. Pure code.

import type { Chapter, Entry } from '../types'
import { mentionPieces, parseBoard, serializeBoard, updateCard } from '../storyline'

/* ------------------------------------------------------------------ */
/* Wiki links                                                           */
/* ------------------------------------------------------------------ */

/** [[Name]], [[Name#Heading]], [[Name|shown text]] and [[Name#Heading|shown text]], like Obsidian. */
export const WIKI_LINK = /\[\[([^[\]\n]{1,200})\]\]/g

export interface WikiTarget {
  /** The name of the note */
  name: string
  /** The heading after "#", or '' */
  heading: string
  /** The text after "|" that shows in the place of the link, or '' */
  alias: string
  /** The length of the name part of the text between the brackets (before "#" or "|") */
  nameLength: number
}

/** The parts of the text between "[[" and "]]". */
export function parseWikiTarget(inner: string): WikiTarget {
  const bar = inner.indexOf('|')
  const target = bar >= 0 ? inner.slice(0, bar) : inner
  const hash = target.indexOf('#')
  const raw = hash >= 0 ? target.slice(0, hash) : target
  return {
    name: raw.trim(),
    heading: hash >= 0 ? target.slice(hash + 1).trim() : '',
    alias: bar >= 0 ? inner.slice(bar + 1).trim() : '',
    nameLength: raw.length
  }
}

/** The key that compares two names: composed accents, one space, no case. */
export function nameKey(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Put `newName` in the [[links]] to `oldName`. The heading and the shown text stay.
 * Returns the text and the number of links that changed.
 */
export function renameLinks(markdown: string, oldName: string, newName: string): { text: string; count: number } {
  const old = nameKey(oldName)
  let count = 0
  const text = markdown.replace(WIKI_LINK, (whole, inner: string) => {
    const t = parseWikiTarget(inner)
    if (!t.name || nameKey(t.name) !== old) return whole
    count++
    return `[[${newName}${inner.slice(t.nameLength)}]]`
  })
  return { text, count }
}

/**
 * Put `newName` in the "@" mentions of a note in the text of a story line card. A mention by an
 * alias stays: the alias still names the note. `entries` are the notes before the rename.
 */
export function renameMentions(text: string, entryId: string, oldName: string, newName: string, entries: Pick<Entry, 'id' | 'name' | 'aliases'>[]): { text: string; count: number } {
  const old = nameKey(oldName)
  let count = 0
  const out = mentionPieces(text, entries)
    .map((p) => {
      if (p.kind !== 'mention' || p.entryId !== entryId || nameKey(p.text.slice(1)) !== old) return p.text
      count++
      return `@${newName}`
    })
    .join('')
  return { text: count ? out : text, count }
}

/** The body of a story line with the mentions of a renamed note changed. Null when no card changes. */
export function renameMentionsInBoard(
  body: string,
  entryId: string,
  oldName: string,
  newName: string,
  entries: Pick<Entry, 'id' | 'name' | 'aliases'>[],
  chapters: Pick<Chapter, 'id' | 'title' | 'file'>[]
): { body: string; count: number } | null {
  let board = parseBoard(body)
  let count = 0
  for (const card of board.cards) {
    const r = renameMentions(card.text, entryId, oldName, newName, entries)
    if (!r.count) continue
    count += r.count
    board = updateCard(board, card.id, r.text)
  }
  return count ? { body: serializeBoard(board, chapters), count } : null
}

/** True when a plain text uses a name as a whole word, in any case. */
export function textUsesName(text: string, name: string): boolean {
  const n = name.trim()
  if (!n) return false
  const body = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'iu').test(text)
}

/* ------------------------------------------------------------------ */
/* Duplicate names                                                      */
/* ------------------------------------------------------------------ */

/** The note that already has this name or alias, other than the note `exceptId`. */
export function nameOwner(entries: Pick<Entry, 'id' | 'name' | 'aliases'>[], name: string, exceptId?: string): Pick<Entry, 'id' | 'name' | 'aliases'> | undefined {
  const key = nameKey(name)
  if (!key) return undefined
  return entries.find((e) => e.id !== exceptId && [e.name, ...e.aliases].some((n) => nameKey(n) === key))
}

/** A name that no note has: the name, or the name with " 2", " 3"... */
export function freeName(name: string, taken: Iterable<string>): string {
  const keys = new Set([...taken].map(nameKey))
  if (!keys.has(nameKey(name))) return name
  for (let i = 2; ; i++) if (!keys.has(nameKey(`${name} ${i}`))) return `${name} ${i}`
}

/* ------------------------------------------------------------------ */
/* Order and folders                                                    */
/* ------------------------------------------------------------------ */

/** The natural order of names: "Note 2" comes before "Note 10". */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) || a.localeCompare(b, undefined, { numeric: true })
}

/** The category folder of a note: the first folder of its path ('' for a note at the root of planning). */
export function topFolder(category: string): string {
  return category.split('/')[0]
}

/** The folders under the category folder ('' for a note in the category folder itself). */
export function subFolder(category: string): string {
  const slash = category.indexOf('/')
  return slash < 0 ? '' : category.slice(slash + 1)
}

/** True when a note is in the category folder or in a folder under it. */
export function inFolder(e: Pick<Entry, 'category'>, folder: string): boolean {
  return e.category === folder || (folder !== '' && e.category.startsWith(`${folder}/`))
}

/** The path of a note file in planning/: "Characters/Marta.md", or "Marta.md" at the root. */
export function entryPath(category: string, fileName: string): string {
  return category ? `${category}/${fileName}` : fileName
}
