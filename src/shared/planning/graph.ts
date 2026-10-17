// The planning map: which entries mention which other entries. Pure code.
//
// Entry A links to entry B when the summary or the notes of A use the name or an alias of B,
// or link to B with [[B]]. Optionally, chapters are nodes too: a chapter links to the entries
// that it mentions. The renderer draws the result as a graph (src/renderer/src/features/graph).

import { markdownToPlain } from '../book'
import type { Chapter, Entry } from '../types'

export type MapNodeKind = 'entry' | 'chapter'

export interface MapNode {
  /** The entry id, or `chapter:<chapter id>` */
  id: string
  kind: MapNodeKind
  /** The id of the entry or the chapter */
  ref: string
  label: string
  /** Category folder of an entry; null for a chapter */
  category: string | null
  /** Position of a chapter in the manuscript (0 for the first); -1 for an entry */
  order: number
  /** The name and the aliases (for search) */
  names: string[]
  /** Number of nodes linked to this node */
  degree: number
}

export interface MapEdge {
  /** Node ids, in a fixed order (source < target) */
  source: string
  target: string
  /** Number of mentions, in both directions */
  weight: number
  /** At least one mention is a [[wiki link]] */
  explicit: boolean
}

export interface PlanningMap {
  nodes: MapNode[]
  edges: MapEdge[]
}

export interface MapOptions {
  /** Add these chapters as nodes, linked to the entries that they mention */
  chapters?: Chapter[]
}

/** Names with fewer letters than this do not count as mentions (but [[links]] do). */
export const MIN_NAME_LETTERS = 3

export const CHAPTER_NODE_PREFIX = 'chapter:'

/* ------------------------------------------------------------------ */
/* Text                                                                 */
/* ------------------------------------------------------------------ */

/** One word of a text: letters, marks (accents) and digits. */
const WORD = /[\p{L}\p{M}\p{N}]+/gu

/** Lower case, composed accents. Accents count: "Pará" is not "para". */
function foldWord(s: string): string {
  return s.normalize('NFC').toLowerCase()
}

/** The text between two words of a name, for comparison: one space for any white space. */
function foldGap(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[’‘]/g, "'")
}

/** A full name for [[link]] lookup. */
function foldName(s: string): string {
  return foldGap(s.normalize('NFC').trim()).toLowerCase()
}

/** Fold for search: no case and no accents, so "ines" finds "Inês". */
export function foldSearch(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

interface Word {
  start: number
  end: number
  key: string
}

function words(text: string): Word[] {
  const out: Word[] = []
  WORD.lastIndex = 0
  for (let m = WORD.exec(text); m; m = WORD.exec(text)) out.push({ start: m.index, end: m.index + m[0].length, key: foldWord(m[0]) })
  return out
}

/** [[Name]], [[Name|shown text]], [[Name#Heading]] */
const WIKI_LINK = /\[\[([^[\]\n|#]+)(?:#[^[\]\n|]*)?(?:\|[^[\]\n]*)?\]\]/g

/* ------------------------------------------------------------------ */
/* Name matcher                                                         */
/* ------------------------------------------------------------------ */

interface NamePattern {
  /** Folded words of the name */
  words: string[]
  /** Folded text between the words */
  gaps: string[]
  ids: Set<string>
}

export interface MentionCount {
  /** Mentions, with [[links]] */
  n: number
  explicit: boolean
}

export interface NameMatcher {
  /** Mentions of each entry in a Markdown text. */
  count(markdown: string): Map<string, MentionCount>
}

/** A matcher for the names and aliases of the entries. Whole words, case-insensitive; accents count. */
export function createNameMatcher(entries: Entry[]): NameMatcher {
  // First word of a name -> the names that start with it, longest first.
  const byFirst = new Map<string, NamePattern[]>()
  const patterns = new Map<string, NamePattern>()
  // [[Link]] targets: names first, then aliases.
  const linkByName = new Map<string, string[]>()
  const linkByAlias = new Map<string, string[]>()

  const push = (map: Map<string, string[]>, key: string, id: string): void => {
    const list = map.get(key)
    if (!list) map.set(key, [id])
    else if (!list.includes(id)) list.push(id)
  }

  for (const e of entries) {
    const all = [e.name, ...e.aliases]
    all.forEach((raw, i) => {
      const name = raw.normalize('NFC').trim()
      if (!name) return
      push(i === 0 ? linkByName : linkByAlias, foldName(name), e.id)
      const ws = words(name)
      const letters = ws.reduce((sum, w) => sum + [...w.key].length, 0)
      if (!ws.length || letters < MIN_NAME_LETTERS) return
      const gaps = ws.slice(1).map((w, j) => foldGap(name.slice(ws[j].end, w.start)))
      const key = `${ws.map((w) => w.key).join('\u0001')}\u0002${gaps.join('\u0001')}`
      const known = patterns.get(key)
      if (known) {
        known.ids.add(e.id)
        return
      }
      const p: NamePattern = { words: ws.map((w) => w.key), gaps, ids: new Set([e.id]) }
      patterns.set(key, p)
      const list = byFirst.get(p.words[0]) ?? []
      list.push(p)
      byFirst.set(p.words[0], list)
    })
  }
  for (const list of byFirst.values()) list.sort((a, b) => b.words.length - a.words.length)

  const resolveLink = (target: string): string[] => {
    const key = foldName(target)
    return linkByName.get(key) ?? linkByAlias.get(key) ?? []
  }

  return {
    count(markdown) {
      const found = new Map<string, MentionCount>()
      const add = (id: string, explicit: boolean): void => {
        const c = found.get(id)
        if (c) {
          c.n++
          c.explicit ||= explicit
        } else found.set(id, { n: 1, explicit })
      }
      // [[Links]] count once each. Their text does not count again as a mention.
      const rest = markdown.normalize('NFC').replace(WIKI_LINK, (_m, target: string) => {
        for (const id of resolveLink(target)) add(id, true)
        return ' '
      })
      if (!byFirst.size) return found
      const text = markdownToPlain(rest)
      const ws = words(text)
      for (let i = 0; i < ws.length; i++) {
        const candidates = byFirst.get(ws[i].key)
        if (!candidates) continue
        const hit = candidates.find((p) => {
          if (i + p.words.length > ws.length) return false
          for (let k = 1; k < p.words.length; k++) {
            if (ws[i + k].key !== p.words[k]) return false
            if (foldGap(text.slice(ws[i + k - 1].end, ws[i + k].start)) !== p.gaps[k - 1]) return false
          }
          return true
        })
        if (!hit) continue
        for (const id of hit.ids) add(id, false)
        i += hit.words.length - 1
      }
      return found
    }
  }
}

/* ------------------------------------------------------------------ */
/* Map                                                                  */
/* ------------------------------------------------------------------ */

export function chapterNodeId(chapterId: string): string {
  return CHAPTER_NODE_PREFIX + chapterId
}

/** The text of an entry that can mention other entries: the summary and the notes. */
function entryText(e: Entry): string {
  return `${e.summary}\n\n${e.body}`
}

export function buildPlanningMap(entries: Entry[], options: MapOptions = {}): PlanningMap {
  const matcher = createNameMatcher(entries)
  const nodes: MapNode[] = entries.map((e) => ({
    id: e.id,
    kind: 'entry',
    ref: e.id,
    label: e.name,
    category: e.category,
    order: -1,
    names: [e.name, ...e.aliases].filter((n) => n.trim()),
    degree: 0
  }))
  const edges = new Map<string, MapEdge>()
  const link = (a: string, b: string, c: MentionCount): void => {
    if (a === b) return
    const [source, target] = a < b ? [a, b] : [b, a]
    const key = `${source}\u0000${target}`
    const edge = edges.get(key)
    if (edge) {
      edge.weight += c.n
      edge.explicit ||= c.explicit
    } else edges.set(key, { source, target, weight: c.n, explicit: c.explicit })
  }

  for (const e of entries) {
    for (const [id, c] of matcher.count(entryText(e))) link(e.id, id, c)
  }
  options.chapters?.forEach((ch, i) => {
    const id = chapterNodeId(ch.id)
    nodes.push({ id, kind: 'chapter', ref: ch.id, label: ch.title, category: null, order: i, names: [ch.title], degree: 0 })
    for (const [entryId, c] of matcher.count(ch.body)) link(id, entryId, c)
  })

  return withDegrees(nodes, [...edges.values()])
}

function withDegrees(nodes: MapNode[], edges: MapEdge[]): PlanningMap {
  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }
  return { nodes: nodes.map((n) => ({ ...n, degree: degree.get(n.id) ?? 0 })), edges }
}

/** Keep some nodes, and the edges between them. The degrees count only the kept edges. */
export function filterMap(map: PlanningMap, keep: (n: MapNode) => boolean): PlanningMap {
  const nodes = map.nodes.filter(keep)
  const ids = new Set(nodes.map((n) => n.id))
  return withDegrees(
    nodes,
    map.edges.filter((e) => ids.has(e.source) && ids.has(e.target))
  )
}

/** The neighbors of each node. */
export function adjacency(map: PlanningMap): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>(map.nodes.map((n) => [n.id, new Set<string>()]))
  for (const e of map.edges) {
    out.get(e.source)?.add(e.target)
    out.get(e.target)?.add(e.source)
  }
  return out
}

/**
 * Nodes whose name or alias contains the query, without case and accents.
 * The best match is first: a full name, then the start of a name, then any part; a name before an alias.
 */
export function searchMap(map: PlanningMap, query: string): string[] {
  const q = foldSearch(query)
  if (!q) return []
  const scored: { id: string; score: number; label: string }[] = []
  for (const n of map.nodes) {
    let score = 0
    n.names.forEach((name, i) => {
      const f = foldSearch(name)
      const s = f === q ? 3 : f.startsWith(q) ? 2 : f.includes(q) ? 1 : 0
      // The name counts a little more than an alias
      if (s) score = Math.max(score, s + (i === 0 ? 0.5 : 0))
    })
    if (score) scored.push({ id: n.id, score, label: n.label })
  }
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
  return scored.map((s) => s.id)
}
