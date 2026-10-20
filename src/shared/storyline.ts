// The story line: the events of the story in lanes (groups of characters) and moments (before,
// after, at the same time). It is a planning entry with `type: story-line` in its front matter;
// its body holds a lanes line, moment headings and event list items:
//
//   Lanes: Elias · Marta · Past (past)
//
//   ## 1
//   - Elias: The storm comes. → [[The Storm]]
//   - Elias + Marta: They see the blue boat. → [[The Visitor]]
//
// The AI changes the body with the usual proposals; the app moves single lines.

import type { Chapter, Entry } from './types'

export const STORY_LINE_TYPE = 'story-line'

export interface StoryEvent {
  /** The lanes of the event: more than one for a meeting, none for the row "Other" */
  lanes: string[]
  text: string
  /** Chapter titles (or file names) from `→ [[…]]` at the end */
  links: string[]
  /** The index of the event in the lines of the body */
  line: number
}

export interface StoryMoment {
  label: string
  /** The index of the heading in the lines of the body */
  line: number
  events: StoryEvent[]
}

export interface StoryLine {
  lanes: string[]
  /** The lane of the past (flashbacks), or null */
  past: string | null
  /** The index of the lanes line, -1 when there is none */
  lanesLine: number
  moments: StoryMoment[]
}

export function isStoryLine(e: Pick<Entry, 'meta'>): boolean {
  return e.meta?.type === STORY_LINE_TYPE
}

/** The story line of a book: the first entry with the type, by file name. */
export function findStoryLine(entries: Entry[]): Entry | null {
  return entries.filter(isStoryLine).sort((a, b) => a.file.localeCompare(b.file))[0] ?? null
}

/** Lower case, without accents: "José" and "jose" are the same name. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

const LANES_RE = /^\s*(?:lanes|trilhas|carriles)\s*:\s*(.*)$/i
const PAST_RE = /\s*\((?:past|passado|pasado)\)\s*$/i
const MOMENT_RE = /^\s*##(?!#)\s*(.+?)\s*$/
const ITEM_RE = /^\s*[-*+]\s+(.*?)\s*$/
const LINKS_RE = /\s*(?:→|->)\s*(\[\[[^\]]+\]\](?:\s*,\s*\[\[[^\]]+\]\])*)\s*$/

/** A lane prefix is a short name: it starts with a letter and is not a sentence. */
function laneLike(name: string): boolean {
  return /^\p{L}/u.test(name) && name.length <= 40 && name.split(/\s+/).length <= 5 && !/[.!?;,]/.test(name)
}

function parseItem(raw: string, line: number, known: string[]): StoryEvent {
  let rest = raw
  let links: string[] = []
  const l = LINKS_RE.exec(rest)
  if (l) {
    links = [...l[1].matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim())
    rest = rest.slice(0, l.index)
  }
  const colon = rest.indexOf(': ')
  if (colon > 0) {
    const parts = rest
      .slice(0, colon)
      .split(' + ')
      .map((p) => p.trim())
    if (parts.every(laneLike)) {
      const lanes = parts.map((p) => known.find((k) => fold(k) === fold(p)) ?? p)
      return { lanes, text: rest.slice(colon + 2).trim(), links, line }
    }
  }
  return { lanes: [], text: rest.trim(), links, line }
}

export function parseStoryLine(body: string): StoryLine {
  const lines = body.split(/\r?\n/)
  const lanes: string[] = []
  let past: string | null = null
  let lanesLine = -1
  const moments: StoryMoment[] = []
  lines.forEach((text, i) => {
    const lanesMatch = lanesLine < 0 && !moments.length ? LANES_RE.exec(text) : null
    if (lanesMatch) {
      lanesLine = i
      for (const part of lanesMatch[1].split('·')) {
        const isPast = PAST_RE.test(part)
        const name = part.replace(PAST_RE, '').trim()
        if (!name || lanes.some((k) => fold(k) === fold(name))) continue
        lanes.push(name)
        if (isPast) past = name
      }
      return
    }
    const moment = MOMENT_RE.exec(text)
    if (moment) {
      moments.push({ label: moment[1], line: i, events: [] })
      return
    }
    const item = ITEM_RE.exec(text)
    if (!item || !moments.length || !item[1]) return
    const event = parseItem(item[1], i, lanes)
    for (const lane of event.lanes) if (!lanes.includes(lane)) lanes.push(lane)
    moments[moments.length - 1].events.push(event)
  })
  return { lanes, past, lanesLine, moments }
}

/** The chapter that a link names: by its title or its file name, ignoring case and accents. */
export function chapterOf(link: string, chapters: Pick<Chapter, 'id' | 'title' | 'file'>[]): string | null {
  const want = fold(link).replace(/\.md$/, '')
  const ch = chapters.find((c) => fold(c.title) === want || fold(c.file).replace(/\.md$/, '') === want)
  return ch?.id ?? null
}

export type Piece = { kind: 'text'; text: string } | { kind: 'mention'; entryId: string; text: string }

/** Split a text into plain parts and mentions: "@" and then the longest entry name or alias that matches. */
export function mentionPieces(text: string, entries: Pick<Entry, 'id' | 'name' | 'aliases'>[]): Piece[] {
  const names = entries
    .flatMap((e) => [e.name, ...e.aliases].filter(Boolean).map((name) => ({ id: e.id, name, folded: fold(name) })))
    .sort((a, b) => b.name.length - a.name.length)
  const out: Piece[] = []
  let plain = ''
  let i = 0
  while (i < text.length) {
    const before = i === 0 ? '' : text[i - 1]
    if (text[i] === '@' && !/[\p{L}\p{N}]/u.test(before)) {
      const hit = names.find((n) => {
        const after = text[i + 1 + n.name.length] ?? ''
        return fold(text.slice(i + 1, i + 1 + n.name.length)) === n.folded && !/[\p{L}\p{N}]/u.test(after)
      })
      if (hit) {
        if (plain) out.push({ kind: 'text', text: plain })
        plain = ''
        out.push({ kind: 'mention', entryId: hit.id, text: text.slice(i, i + 1 + hit.name.length) })
        i += 1 + hit.name.length
        continue
      }
    }
    plain += text[i]
    i++
  }
  if (plain) out.push({ kind: 'text', text: plain })
  return out
}

export interface Placed {
  event: StoryEvent
  moment: number
  /** The sub-column inside the moment */
  sub: number
  /** The rows of the card, from its first lane to its last lane */
  rows: number[]
}

/**
 * Where each card goes. Rows: the lanes, then the past lane, then '' (Other) when an event has no
 * lane. Inside a moment, an event goes into the first sub-column where its rows are free; single
 * events of one cell stack there. So cards never overlap.
 */
export function layoutStoryLine(line: StoryLine): { rows: string[]; subs: number[]; placed: Placed[] } {
  const rows = [...line.lanes.filter((l) => l !== line.past), ...(line.past ? [line.past] : [])]
  if (line.moments.some((m) => m.events.some((e) => !e.lanes.length))) rows.push('')
  const rowOf = (lane: string): number => rows.indexOf(lane)
  const placed: Placed[] = []
  const subs = line.moments.map((m, mi) => {
    const taken: Array<Set<number>> = []
    const cells: Array<Set<number>> = []
    for (const event of m.events) {
      const own = event.lanes.length ? event.lanes.map(rowOf) : [rowOf('')]
      const first = Math.min(...own)
      const last = Math.max(...own)
      const span = Array.from({ length: last - first + 1 }, (_, k) => first + k)
      let sub = own.length === 1 ? cells.findIndex((c) => c.has(first)) : -1
      if (sub < 0) sub = taken.findIndex((t) => span.every((r) => !t.has(r)))
      if (sub < 0) {
        sub = taken.length
        taken.push(new Set())
        cells.push(new Set())
      }
      span.forEach((r) => taken[sub].add(r))
      if (own.length === 1) cells[sub].add(first)
      placed.push({ event, moment: mi, sub, rows: span })
    }
    return Math.max(1, taken.length)
  })
  return { rows, subs, placed }
}

/** The moment of the first event that links to a chapter, or -1. */
export function momentOfChapter(line: StoryLine, chapterId: string, chapters: Pick<Chapter, 'id' | 'title' | 'file'>[]): number {
  return line.moments.findIndex((m) => m.events.some((e) => e.links.some((l) => chapterOf(l, chapters) === chapterId)))
}

/** The text of an event line. */
function eventLine(lanes: string[], text: string, links: string[]): string {
  const prefix = lanes.length ? `${lanes.join(' + ')}: ` : ''
  const tail = links.length ? ` → ${links.map((l) => `[[${l}]]`).join(', ')}` : ''
  return `- ${prefix}${text}${tail}`
}

/**
 * Move one event to another moment and lane (a drag in the Line view). Only its line moves: it
 * goes after the last event of the target moment, with its new lane. The rest of the text stays.
 * A meeting keeps its lanes: a drag moves it to another moment only.
 */
export function moveEvent(body: string, line: StoryLine, event: StoryEvent, toMoment: number, toLane: string): string {
  const lines = body.split(/\r?\n/)
  const target = line.moments[toMoment]
  if (!target) return body
  const lastEvent = target.events.filter((e) => e !== event).at(-1)
  let at = (lastEvent ? lastEvent.line : target.line) + 1
  lines.splice(event.line, 1)
  if (event.line < at) at--
  const lanes = event.lanes.length > 1 ? event.lanes : toLane ? [toLane] : []
  lines.splice(at, 0, eventLine(lanes, event.text, event.links))
  return lines.join('\n')
}

/** A chapter got a new title: its links follow. */
export function renameLinks(body: string, oldTitle: string, newTitle: string): string {
  const old = fold(oldTitle)
  return body.replace(/\[\[([^\]]+)\]\]/g, (all, inner: string) => (fold(inner) === old ? `[[${newTitle}]]` : all))
}
