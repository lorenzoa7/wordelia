// The list of the "@" mentions: which chapters, notes and threads match the letters after "@".
// Pure functions, so the tests can use them.

import type { Mention } from '@shared/types'

export interface Candidate extends Mention {
  /** The second line: the chapter number, the category of the note, or "Thread" */
  sub?: string
  /** Other names of a note: "@keep" finds Elias, "the keeper" */
  aliases?: string[]
  /** The other name that matched, to show beside the name */
  alias?: string
}

/** Lower case, without accents: "jose" finds "José". */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

/**
 * The candidates for the letters after "@", at most `limit`: names that start with the letters, then
 * other names that start with them, then names and other names that have them inside. A query can
 * have spaces ("Saint I").
 */
export function matchCandidates(all: Candidate[], query: string, limit = 8): Candidate[] {
  const q = fold(query.replace(/^\s+/, ''))
  const hits: Array<{ c: Candidate; rank: number }> = []
  all.forEach((c) => {
    const name = fold(c.label)
    if (name.startsWith(q)) return hits.push({ c, rank: 0 })
    const aliases = c.aliases ?? []
    const start = aliases.find((a) => fold(a).startsWith(q))
    if (start) return hits.push({ c: { ...c, alias: start }, rank: 1 })
    if (name.includes(q)) return hits.push({ c, rank: 2 })
    const inside = aliases.find((a) => fold(a).includes(q))
    if (inside) hits.push({ c: { ...c, alias: inside }, rank: 3 })
  })
  // A stable sort keeps the order of the book inside each rank.
  return hits
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((h) => h.c)
}

/**
 * The query of a mention at the end of the text before the cursor: "@" after a space or at the start
 * of a line, then up to 30 characters. The first character after "@" is not a space, so "a @ b" is
 * not a mention. `￼` stands for a pill that is already in the text.
 */
export function mentionQueryIn(before: string): { text: string; length: number } | null {
  const m = /(^|\s)@((?:[^\s@￼][^@￼\n]{0,29})?)$/.exec(before)
  if (!m) return null
  return { text: m[2], length: m[2].length }
}
