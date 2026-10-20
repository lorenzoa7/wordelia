// The story line: a board of cards (the events of the story) with two views of the same cards.
//   - By chapter: a column for each chapter. The written chapters of the book come first, in the
//     order of the book; planned chapters come after them. A card is an event that the chapter tells.
//   - By order: a column for each moment of the story time. A card goes where the event happens.
// It is a planning entry with `type: story-line` in its front matter. Its body (the author does not
// see it; the AI reads and changes it with proposals):
//
//   # Cards
//   - ^c1 @Elias lights the lamp.
//   - ^c2 @Marta climbs the stairs.
//
//   # By chapter
//   ## The Storm ^k1
//   ^c1 ^c2
//
//   # By order
//   ## The night of the storm ^k2
//   ^c2 ^c1
//
// A "By chapter" heading with the title of a chapter is that chapter; other headings are planned
// chapters. The parser also reads AI text that is not quite canonical, and the old format (lanes,
// moments, `→ [[Chapter]]` links). The app writes the canonical form when the author changes the board.

import type { Chapter, Entry } from './types'

export const STORY_LINE_TYPE = 'story-line'

export type LineView = 'chapter' | 'order'

export interface LineCard {
  id: string
  /** One line of text, with @Name for planning entries */
  text: string
}

export interface LineColumn {
  id: string
  title: string
  /** Card ids, from top to bottom */
  cards: string[]
}

export interface Board {
  /** All cards, in the order in which they were made */
  cards: LineCard[]
  /** The columns of "By chapter", as the body has them */
  chapters: LineColumn[]
  /** The columns of "By order": the moments */
  moments: LineColumn[]
}

type ChapterRef = Pick<Chapter, 'id' | 'title' | 'file'>

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

/** The chapter that a name means: its file name (unique), else its title. Case and accents do not matter. */
type ChapterFinder = (name: string) => string | null

function chapterFinder(chapters: ChapterRef[]): ChapterFinder {
  const byFile = new Map<string, string>()
  const byTitle = new Map<string, string>()
  for (const c of chapters) {
    byFile.set(fold(c.file).replace(/\.md$/, ''), c.id)
    const title = fold(c.title)
    if (!byTitle.has(title)) byTitle.set(title, c.id)
  }
  return (name) => {
    const want = fold(name).replace(/\.md$/, '')
    return byFile.get(want) ?? byTitle.get(want) ?? null
  }
}

/** The chapter that a link names: by its file name or its title, ignoring case and accents. */
export function chapterOf(link: string, chapters: ChapterRef[]): string | null {
  return chapterFinder(chapters)(link)
}

/** A heading of "By chapter" without `[[ ]]` and without a number in front ("3. ", "3 · "). */
export function headingName(title: string): string {
  return title
    .replace(/^\[\[(.*)\]\]$/, '$1')
    .replace(/^\d+\s*[.·:)\-–—]\s*/, '')
    .trim()
}

/** The chapter of a "By chapter" column, or null for a planned chapter. Make it once for many columns. */
function columnChapters(chapters: ChapterRef[]): (title: string) => string | null {
  const find = chapterFinder(chapters)
  return (title) => find(title) ?? find(headingName(title))
}

/** The heading of the column of a chapter: its title, or its file name when another chapter has the same title. */
function headingOf(ch: ChapterRef, chapters: ChapterRef[]): string {
  const twin = chapters.some((c) => c.id !== ch.id && fold(c.title) === fold(ch.title))
  return twin ? ch.file.replace(/\.md$/i, '') : ch.title
}

/** One line of text: no line breaks, no runs of spaces. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function emptyBoard(): Board {
  return { cards: [], chapters: [], moments: [] }
}

/* ------------------------------------------------------------------ */
/* Parse and write                                                      */
/* ------------------------------------------------------------------ */

type Section = 'cards' | 'chapter' | 'order' | null

const SECTION: Array<[RegExp, Section]> = [
  [/^(cards|cart[õo]es|tarjetas|fichas)$/i, 'cards'],
  [/^(by chapter|chapters|por cap[íi]tulos?|cap[íi]tulos)$/i, 'chapter'],
  [/^(by order|by time|in order|order|por ordem|por orden|ordem|orden)$/i, 'order']
]
const SECTION_RE = /^\s*#(?!#)\s*(.+?)\s*$/
const COLUMN_RE = /^\s*##(?!#)\s*(.*?)\s*$/
const ITEM_RE = /^\s*[-*+]\s+(.*?)\s*$/
const ID_RE = /^\^([A-Za-z0-9_-]+)(?:\s+|$)/
const TRAILING_ID_RE = /\s*\^([A-Za-z0-9_-]+)\s*$/
const LINKS_RE = /\s*(?:→|->)\s*(\[\[[^\]]+\]\](?:\s*,\s*\[\[[^\]]+\]\])*)\s*$/
const LANES_RE = /^\s*(?:lanes|trilhas|carriles)\s*:/i

type RawEntry = { ref: string } | { def: { id: string | null; text: string; links: string[] } }
interface RawColumn {
  id: string | null
  title: string
  entries: RawEntry[]
}

/** A generator of new ids: the prefix and the next number that no id of the body has. */
function idMaker(used: Iterable<string>, prefix: string): () => string {
  const taken = new Set(used)
  let n = 0
  for (const id of taken) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(id)
    if (m) n = Math.max(n, Number(m[1]))
  }
  return () => {
    let id: string
    do id = `${prefix}${++n}`
    while (taken.has(id))
    taken.add(id)
    return id
  }
}

/** The ids of a line that has only ids ("^c1 ^c2", also with commas), or null. */
function refsOf(line: string): string[] | null {
  const tokens = line.trim().split(/[\s,·]+/).filter(Boolean)
  if (!tokens.length || !tokens.every((t) => /^\^[A-Za-z0-9_-]+$/.test(t))) return null
  return tokens.map((t) => t.slice(1))
}

/** A card line. Only the old format has "→ [[Chapter]]" links: in the new one, an arrow is text. */
function readDef(raw: string, legacy: boolean): { id: string | null; text: string; links: string[] } {
  let rest = raw
  let links: string[] = []
  const l = legacy ? LINKS_RE.exec(rest) : null
  if (l) {
    links = [...l[1].matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim())
    rest = rest.slice(0, l.index)
  }
  const id = ID_RE.exec(rest)
  return id ? { id: id[1], text: oneLine(rest.slice(id[0].length)), links } : { id: null, text: oneLine(rest), links }
}

/**
 * `taken`: ids that new ids must not have, besides the ids of the body (for a proposal: the ids of
 * the line now, so a new card of the AI never gets the id of a card that it deleted).
 */
export function parseBoard(body: string, taken: Iterable<string> = []): Board {
  const lines = body.split(/\r?\n/)
  // The old format has no sections: its "## " headings are moments.
  let section: Section = 'order'
  const legacy = !lines.some((l) => {
    const m = !COLUMN_RE.test(l) && SECTION_RE.exec(l)
    return m && SECTION.some(([re]) => re.test(m[1]))
  })
  const defs: Array<{ id: string | null; text: string; links: string[] }> = []
  const views: Record<'chapter' | 'order', RawColumn[]> = { chapter: [], order: [] }
  let column: RawColumn | null = null
  for (const line of lines) {
    if (!line.trim() || LANES_RE.test(line)) continue
    const head = COLUMN_RE.exec(line)
    if (head) {
      if (section === 'chapter' || section === 'order') {
        const id = TRAILING_ID_RE.exec(head[1])
        column = { id: id ? id[1] : null, title: oneLine(id ? head[1].slice(0, id.index) : head[1]), entries: [] }
        views[section].push(column)
      } else column = null
      continue
    }
    const sec = SECTION_RE.exec(line)
    if (sec) {
      section = SECTION.find(([re]) => re.test(sec[1]))?.[1] ?? null
      column = null
      continue
    }
    if (section === 'cards') {
      const item = ITEM_RE.exec(line)
      if (item?.[1]) defs.push(readDef(item[1], legacy))
      continue
    }
    if (!column) continue
    const refs = refsOf(line)
    if (refs) {
      for (const ref of refs) column.entries.push({ ref })
      continue
    }
    const item = ITEM_RE.exec(line)
    if (!item?.[1]) continue
    const def = readDef(item[1], legacy)
    if (def.id && !def.text) column.entries.push({ ref: def.id })
    else if (def.text) column.entries.push({ def })
  }

  // Ids: every id of the body is taken, so a new id never meets an old one.
  const used = [...[...body.matchAll(/\^([A-Za-z0-9_-]+)/g)].map((m) => m[1]), ...taken]
  const cardId = idMaker(used, 'c')
  const columnId = idMaker(used, 'k')
  const cards: LineCard[] = []
  const known = new Set<string>()
  const linked: Array<{ id: string; links: string[] }> = []
  const define = (d: { id: string | null; text: string; links: string[] }): string => {
    if (d.id && known.has(d.id)) return d.id
    const id = d.id ?? cardId()
    known.add(id)
    cards.push({ id, text: d.text })
    if (d.links.length) linked.push({ id, links: d.links })
    return id
  }
  for (const d of defs) {
    // The same id two times in "Cards": the second card gets a new id.
    define(d.id && known.has(d.id) ? { ...d, id: cardId() } : d)
  }
  // Every card is known before the columns read their ids: a card can come after its places
  // (for example a card that the AI adds at the end of the body).
  for (const view of [views.chapter, views.order]) {
    for (const c of view) c.entries = c.entries.map((e) => ('def' in e ? { ref: define(e.def) } : e))
  }
  const build = (raw: RawColumn[]): LineColumn[] => {
    const seenColumns = new Set<string>()
    const placed = new Set<string>()
    return raw.map((c) => {
      const id = c.id && !seenColumns.has(c.id) ? c.id : columnId()
      seenColumns.add(id)
      const ids: string[] = []
      for (const e of c.entries) {
        const card = 'ref' in e && known.has(e.ref) ? e.ref : null
        if (!card || placed.has(card)) continue
        placed.add(card)
        ids.push(card)
      }
      return { id, title: c.title, cards: ids }
    })
  }
  const chapters = build(views.chapter)
  const moments = build(views.order)
  // Old links: a card with "→ [[Chapter]]" and no chapter goes to the column of that chapter.
  const inChapter = new Set(chapters.flatMap((c) => c.cards))
  for (const { id, links } of linked) {
    if (inChapter.has(id)) continue
    const name = fold(headingName(links[0]))
    let col = chapters.find((c) => fold(headingName(c.title)) === name)
    if (!col) {
      col = { id: columnId(), title: links[0], cards: [] }
      chapters.push(col)
    }
    col.cards.push(id)
    inChapter.add(id)
  }
  return { cards, chapters, moments }
}

function columnText(c: LineColumn): string {
  const head = `## ${c.title} ^${c.id}`
  return c.cards.length ? `${head}\n${c.cards.map((id) => `^${id}`).join(' ')}` : head
}

/**
 * The canonical body. With the chapters of the book: the written chapters first, in the order of
 * the book (one column each, an empty one left out), then the planned chapters.
 */
export function serializeBoard(board: Board, chapters?: ChapterRef[]): string {
  const known = new Set(board.cards.map((c) => c.id))
  const clean = (c: LineColumn): LineColumn => ({ ...c, cards: c.cards.filter((id) => known.has(id)) })
  let byChapter = board.chapters.map(clean)
  if (chapters) {
    const chapterOfColumn = columnChapters(chapters)
    const real = chapters.flatMap((ch) => {
      const own = byChapter.filter((c) => chapterOfColumn(c.title) === ch.id)
      if (!own.length) return []
      const cards = [...new Set(own.flatMap((c) => c.cards))]
      return cards.length ? [{ ...own[0], cards }] : []
    })
    byChapter = [...real, ...byChapter.filter((c) => !chapterOfColumn(c.title))]
  }
  const parts: string[] = []
  if (board.cards.length) parts.push(`# Cards\n${board.cards.map((c) => `- ^${c.id} ${c.text}`).join('\n')}`)
  if (byChapter.length) parts.push(`# By chapter\n${byChapter.map(columnText).join('\n\n')}`)
  if (board.moments.length) parts.push(`# By order\n${board.moments.map(clean).map(columnText).join('\n\n')}`)
  return parts.join('\n\n')
}

/* ------------------------------------------------------------------ */
/* Views                                                                */
/* ------------------------------------------------------------------ */

export interface ViewColumn {
  /** `ch:<chapter id>` for a written chapter, the column id, or `tray` */
  key: string
  kind: 'chapter' | 'planned' | 'moment' | 'tray'
  /** The title of the chapter or of the column; '' for the tray */
  title: string
  /** By chapter: the number of the chapter, from 1 */
  number?: number
  chapterId?: string
  /** The id of the column in the body (a written chapter can have none yet) */
  columnId?: string
  cards: LineCard[]
}

export const TRAY = 'tray'

/** The columns of a view, as the board shows them: the tray first (when it has cards). */
export function boardView(board: Board, view: LineView, chapters: ChapterRef[]): ViewColumn[] {
  const byId = new Map(board.cards.map((c) => [c.id, c]))
  const placed = new Set<string>()
  const take = (ids: string[]): LineCard[] =>
    ids.flatMap((id) => {
      const card = byId.get(id)
      if (!card || placed.has(id)) return []
      placed.add(id)
      return [card]
    })
  let cols: ViewColumn[]
  if (view === 'chapter') {
    const chapterOfColumn = columnChapters(chapters)
    const real = chapters.map((ch, i): ViewColumn => {
      const own = board.chapters.filter((c) => chapterOfColumn(c.title) === ch.id)
      return { key: `ch:${ch.id}`, kind: 'chapter', title: ch.title, number: i + 1, chapterId: ch.id, columnId: own[0]?.id, cards: take(own.flatMap((c) => c.cards)) }
    })
    const planned = board.chapters
      .filter((c) => !chapterOfColumn(c.title))
      .map((c, i): ViewColumn => ({ key: c.id, kind: 'planned', title: c.title, number: chapters.length + i + 1, columnId: c.id, cards: take(c.cards) }))
    cols = [...real, ...planned]
  } else {
    cols = board.moments.map((c): ViewColumn => ({ key: c.id, kind: 'moment', title: c.title, columnId: c.id, cards: take(c.cards) }))
  }
  const loose = board.cards.filter((c) => !placed.has(c.id))
  return loose.length ? [{ key: TRAY, kind: 'tray', title: '', cards: loose }, ...cols] : cols
}

/**
 * "You are here". By chapter: the last chapter of the book. By order: the moment of the last card
 * of the last chapter that has cards in a moment.
 */
export function hereKey(board: Board, view: LineView, chapters: ChapterRef[]): string | null {
  if (!chapters.length) return null
  if (view === 'chapter') return `ch:${chapters[chapters.length - 1].id}`
  const byChapter = boardView(board, 'chapter', chapters).filter((c) => c.kind === 'chapter')
  const momentOf = new Map<string, string>()
  for (const col of boardView(board, 'order', chapters)) if (col.kind === 'moment') for (const c of col.cards) momentOf.set(c.id, col.key)
  for (let i = byChapter.length - 1; i >= 0; i--) {
    const cards = byChapter[i].cards
    for (let j = cards.length - 1; j >= 0; j--) {
      const m = momentOf.get(cards[j].id)
      if (m) return m
    }
  }
  return null
}

/** The column of each card in a view: its key and title (for the line at the bottom of a card). */
export function placesOf(board: Board, view: LineView, chapters: ChapterRef[]): Map<string, ViewColumn> {
  const out = new Map<string, ViewColumn>()
  for (const col of boardView(board, view, chapters)) if (col.kind !== 'tray') for (const c of col.cards) out.set(c.id, col)
  return out
}

/* ------------------------------------------------------------------ */
/* Changes (pure: each one returns a new board)                         */
/* ------------------------------------------------------------------ */

function columnsOf(board: Board, view: LineView): LineColumn[] {
  return view === 'chapter' ? board.chapters : board.moments
}

function withColumns(board: Board, view: LineView, cols: LineColumn[]): Board {
  return view === 'chapter' ? { ...board, chapters: cols } : { ...board, moments: cols }
}

function allIds(board: Board): string[] {
  return [...board.cards.map((c) => c.id), ...board.chapters.map((c) => c.id), ...board.moments.map((c) => c.id)]
}

/**
 * Put a card at `index` of a column of a view, or in the tray (no place in this view).
 * `index` counts the cards of the column without the moved card.
 */
export function placeCard(board: Board, view: LineView, cardId: string, toKey: string, index: number, chapters: ChapterRef[]): Board {
  let cols = columnsOf(board, view).map((c) => ({ ...c, cards: c.cards.filter((id) => id !== cardId) }))
  if (toKey !== TRAY) {
    let target: LineColumn | undefined
    if (toKey.startsWith('ch:')) {
      const chapterId = toKey.slice(3)
      const ch = chapters.find((c) => c.id === chapterId)
      if (!ch) return board
      // The columns of one chapter become one.
      const chapterOfColumn = columnChapters(chapters)
      const own = cols.filter((c) => chapterOfColumn(c.title) === chapterId)
      if (own.length) {
        target = { ...own[0], cards: [...new Set(own.flatMap((c) => c.cards))] }
        cols = cols.filter((c) => !own.includes(c) || c === own[0]).map((c) => (c === own[0] ? target! : c))
      } else {
        target = { id: idMaker(allIds(board), 'k')(), title: headingOf(ch, chapters), cards: [] }
        cols = [...cols, target]
      }
    } else {
      target = cols.find((c) => c.id === toKey)
      if (!target) return board
    }
    const at = Math.max(0, Math.min(index, target.cards.length))
    target.cards = [...target.cards.slice(0, at), cardId, ...target.cards.slice(at)]
  }
  return withColumns(board, view, cols)
}

/** A new card at the end of a column (or at `index`). */
export function addCard(board: Board, view: LineView, toKey: string, text: string, chapters: ChapterRef[], index = Infinity): { board: Board; id: string } {
  const id = idMaker(allIds(board), 'c')()
  const next = { ...board, cards: [...board.cards, { id, text: oneLine(text) }] }
  return { board: placeCard(next, view, id, toKey, index, chapters), id }
}

export function updateCard(board: Board, id: string, text: string): Board {
  return { ...board, cards: board.cards.map((c) => (c.id === id ? { ...c, text: oneLine(text) } : c)) }
}

/** Delete a card from both views. */
export function deleteCard(board: Board, id: string): Board {
  const out = (cols: LineColumn[]): LineColumn[] => cols.map((c) => ({ ...c, cards: c.cards.filter((x) => x !== id) }))
  return { cards: board.cards.filter((c) => c.id !== id), chapters: out(board.chapters), moments: out(board.moments) }
}

/** A new column at the end: a moment, or a planned chapter. */
export function addColumn(board: Board, view: LineView, title: string): { board: Board; id: string } {
  const id = idMaker(allIds(board), 'k')()
  return { board: withColumns(board, view, [...columnsOf(board, view), { id, title: oneLine(title), cards: [] }]), id }
}

export function renameColumn(board: Board, view: LineView, id: string, title: string): Board {
  return withColumns(
    board,
    view,
    columnsOf(board, view).map((c) => (c.id === id ? { ...c, title: oneLine(title) } : c))
  )
}

/** Delete a column. Its cards lose their place in this view (they go to the tray) and keep the other one. */
export function deleteColumn(board: Board, view: LineView, id: string): Board {
  return withColumns(
    board,
    view,
    columnsOf(board, view).filter((c) => c.id !== id)
  )
}

/**
 * Move a column to `index`. By order: among the moments. By chapter: among the planned chapters
 * (the written chapters keep the order of the book).
 */
export function moveColumn(board: Board, view: LineView, id: string, index: number, chapters: ChapterRef[]): Board {
  const cols = columnsOf(board, view)
  const chapterOfColumn = columnChapters(chapters)
  const movable = view === 'chapter' ? cols.filter((c) => !chapterOfColumn(c.title)) : cols
  const col = movable.find((c) => c.id === id)
  if (!col) return board
  const rest = movable.filter((c) => c !== col)
  const at = Math.max(0, Math.min(index, rest.length))
  const moved = [...rest.slice(0, at), col, ...rest.slice(at)]
  return withColumns(board, view, view === 'chapter' ? [...cols.filter((c) => !movable.includes(c)), ...moved] : moved)
}

/**
 * A chapter got a new title: the "By chapter" headings of that chapter follow (and the links of the
 * old format). `before` and `after` are the chapters of the book before and after the rename.
 */
export function renameChapterInBody(body: string, chapterId: string, before: ChapterRef[], after: ChapterRef[]): string {
  const was = before.find((c) => c.id === chapterId)
  const now = after.find((c) => c.id === chapterId)
  if (!was || !now) return body
  const chapterOfColumn = columnChapters(before)
  const heading = headingOf(now, after)
  const old = fold(was.title)
  let section: Section = 'order'
  return body
    .split('\n')
    .map((line) => {
      const head = COLUMN_RE.exec(line)
      if (head && section === 'chapter') {
        const id = TRAILING_ID_RE.exec(head[1])
        const title = id ? head[1].slice(0, id.index) : head[1]
        return chapterOfColumn(title) === chapterId ? `## ${heading}${id ? ` ^${id[1]}` : ''}` : line
      }
      const sec = !head && SECTION_RE.exec(line)
      if (sec) section = SECTION.find(([re]) => re.test(sec[1]))?.[1] ?? null
      return line.replace(/\[\[([^\]]+)\]\]/g, (all, inner: string) => (fold(inner) === old ? `[[${now.title}]]` : all))
    })
    .join('\n')
}

/* ------------------------------------------------------------------ */
/* Differences, for a proposal of the AI                                */
/* ------------------------------------------------------------------ */

/** For each card of `after`, the id of the same card in `before`: by id, else by its text. */
function matchCards(before: Board, after: Board): Map<string, string> {
  const beforeIds = new Set(before.cards.map((c) => c.id))
  const afterIds = new Set(after.cards.map((c) => c.id))
  const out = new Map<string, string>()
  const free = new Map<string, string[]>()
  for (const c of before.cards) {
    if (afterIds.has(c.id)) continue
    const k = fold(c.text)
    free.set(k, [...(free.get(k) ?? []), c.id])
  }
  for (const c of after.cards) {
    if (beforeIds.has(c.id)) {
      out.set(c.id, c.id)
      continue
    }
    const same = free.get(fold(c.text))
    if (same?.length) out.set(c.id, same.shift()!)
  }
  return out
}

/** For each column key of `after`, the key of the same column in `before`: by key, else by title. */
function matchColumns(before: ViewColumn[], after: ViewColumn[]): Map<string, string> {
  const beforeKeys = new Set(before.map((c) => c.key))
  const afterKeys = new Set(after.map((c) => c.key))
  const out = new Map<string, string>()
  for (const c of after) {
    if (beforeKeys.has(c.key)) out.set(c.key, c.key)
    else {
      const same = before.find((b) => !afterKeys.has(b.key) && ![...out.values()].includes(b.key) && b.kind === c.kind && fold(b.title) === fold(c.title))
      if (same) out.set(c.key, same.key)
    }
  }
  return out
}

/** The cards of a sequence that are not in its longest run in the old order: they moved. */
function outOfOrder(ids: string[], oldIndex: Map<string, number>): Set<string> {
  const seq = ids.filter((id) => oldIndex.has(id))
  // Longest increasing run of old positions, with back links.
  const tails: number[] = []
  const prev: number[] = new Array(seq.length).fill(-1)
  const at: number[] = []
  seq.forEach((id, i) => {
    const v = oldIndex.get(id)!
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (oldIndex.get(seq[tails[mid]])! < v) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
    at[i] = lo
  })
  const keep = new Set<string>()
  let k = tails.length ? tails[tails.length - 1] : -1
  while (k >= 0) {
    keep.add(seq[k])
    k = prev[k]
  }
  return new Set(seq.filter((id) => !keep.has(id)))
}

/* ------------------------------------------------------------------ */
/* Changes of a proposal of the AI                                      */
/* ------------------------------------------------------------------ */

// A proposal is a whole board (the board now with the changes of the AI). The board shows its
// changes one by one, and the author applies or rejects each one: a card that goes away is red
// where it is, a card that comes is green where it goes. A move is two changes: the card leaves
// its column (red) and goes to the other column (green). After a change, the changes are found
// again between the board now and the proposed board, so an applied change is gone.

export type ChangeKind = 'card-add' | 'card-delete' | 'card-text' | 'place' | 'unplace' | 'column-add' | 'column-delete' | 'column-rename' | 'column-move'

export interface BoardChange {
  /** The same while the proposed board stays the same: the decisions of the author use it */
  id: string
  kind: ChangeKind
  view?: LineView
  /** The card in the board now (card-delete, card-text, unplace) */
  cardId?: string
  /** The card in the proposed board (place, card-add, card-text) */
  afterCardId?: string
  /** place, column-add: a column of the proposed board. unplace, column-delete, -rename, -move: a column of the board now */
  column?: string
}

const VIEWS: LineView[] = ['chapter', 'order']

function isMovable(c: Pick<ViewColumn, 'kind'>): boolean {
  return c.kind === 'planned' || c.kind === 'moment'
}

interface ViewMatch {
  /** The columns now and in the proposal */
  now: ViewColumn[]
  next: ViewColumn[]
  /** A column of the proposal → the same column now */
  cols: Map<string, string>
}

function matchView(cur: Board, after: Board, view: LineView, chapters: ChapterRef[]): ViewMatch {
  const now = boardView(cur, view, chapters)
  const next = boardView(after, view, chapters)
  return { now, next, cols: matchColumns(now, next) }
}

/** The column of the board now just after which a column (or a card) of the proposal goes: its nearest earlier neighbor that is there now. */
function anchorBefore<T>(list: T[], at: number, here: (t: T) => string | undefined): string | undefined {
  for (let i = at - 1; i >= 0; i--) {
    const k = here(list[i])
    if (k) return k
  }
  return undefined
}

export function boardChanges(cur: Board, after: Board, chapters: ChapterRef[]): BoardChange[] {
  const cards = matchCards(cur, after)
  const kept = new Set(cards.values())
  const nowText = new Map(cur.cards.map((c) => [c.id, c.text]))
  const out: BoardChange[] = []
  const placedSomewhere = new Set<string>()
  for (const view of VIEWS) {
    const { now, next, cols } = matchView(cur, after, view, chapters)
    const used = new Set(cols.values())
    // Columns
    const nextMovable = next.filter(isMovable)
    const nowMovable = now.filter(isMovable)
    for (const col of nextMovable) if (!cols.has(col.key)) out.push({ id: `col-add:${view}:${col.key}`, kind: 'column-add', view, column: col.key })
    for (const col of nowMovable) if (!used.has(col.key)) out.push({ id: `col-delete:${view}:${col.key}`, kind: 'column-delete', view, column: col.key })
    for (const col of nextMovable) {
      const k = cols.get(col.key)
      const old = k ? nowMovable.find((c) => c.key === k) : undefined
      if (old && old.title !== col.title) out.push({ id: `col-rename:${view}:${old.key}`, kind: 'column-rename', view, column: old.key })
    }
    const nowOrder = new Map(nowMovable.map((c, i) => [c.key, i]))
    const seq = nextMovable.map((c) => cols.get(c.key)).filter((k): k is string => Boolean(k && nowOrder.has(k)))
    for (const k of outOfOrder(seq, nowOrder)) out.push({ id: `col-move:${view}:${k}`, kind: 'column-move', view, column: k })
    // Cards
    const place = new Map<string, string>()
    for (const col of now) if (col.kind !== 'tray') for (const c of col.cards) place.set(c.id, col.key)
    const placedNext = new Set<string>()
    for (const col of next) {
      if (col.kind === 'tray') continue
      const target = cols.get(col.key)
      const old = target ? now.find((c) => c.key === target) : undefined
      const oldIndex = new Map((old?.cards ?? []).map((c, i) => [c.id, i]))
      const stay = col.cards.map((c) => cards.get(c.id)).filter((id): id is string => Boolean(id && place.get(id) === target))
      const shuffled = outOfOrder(stay, oldIndex)
      for (const c of col.cards) {
        placedSomewhere.add(c.id)
        const id = cards.get(c.id)
        if (id) placedNext.add(id)
        const at = id ? place.get(id) : undefined
        // In the same column (not a new one) and in the same order: no change.
        if (id && target && at === target && !shuffled.has(id)) continue
        out.push({ id: `place:${view}:${c.id}:${col.key}`, kind: 'place', view, cardId: id, afterCardId: c.id, column: col.key })
        if (id && at) out.push({ id: `unplace:${view}:${id}:${at}`, kind: 'unplace', view, cardId: id, column: at })
      }
    }
    // A card that leaves its column for the tray (a deleted card has its own change)
    for (const [id, at] of place) {
      if (kept.has(id) && !placedNext.has(id)) out.push({ id: `unplace:${view}:${id}:${at}`, kind: 'unplace', view, cardId: id, column: at })
    }
  }
  for (const c of after.cards) {
    const id = cards.get(c.id)
    if (id && nowText.get(id) !== c.text) out.push({ id: `text:${id}`, kind: 'card-text', cardId: id, afterCardId: c.id })
    if (!id && !placedSomewhere.has(c.id)) out.push({ id: `add:${c.id}`, kind: 'card-add', afterCardId: c.id })
  }
  for (const c of cur.cards) if (!kept.has(c.id)) out.push({ id: `delete:${c.id}`, kind: 'card-delete', cardId: c.id })
  const seen = new Set<string>()
  return out.filter((c) => !seen.has(c.id) && Boolean(seen.add(c.id)))
}

/**
 * Of the changes of a proposal, the ones that the line now still needs. A card that left its column
 * by another way, a column that is there already, a text that is the same: done. A new place is
 * done only by a decision of the author.
 */
export function liveChanges(cur: Board, after: Board, changes: BoardChange[], chapters: ChapterRef[]): BoardChange[] {
  const now = new Map(cur.cards.map((c) => [c.id, c]))
  const next = new Map(after.cards.map((c) => [c.id, c]))
  const places = { chapter: placesOf(cur, 'chapter', chapters), order: placesOf(cur, 'order', chapters) }
  const views = { chapter: matchView(cur, after, 'chapter', chapters), order: matchView(cur, after, 'order', chapters) }
  return changes.filter((c) => {
    const view = c.view ?? 'chapter'
    switch (c.kind) {
      case 'card-text': {
        const a = c.cardId ? now.get(c.cardId) : undefined
        const b = c.afterCardId ? next.get(c.afterCardId) : undefined
        return Boolean(a && b && a.text !== b.text)
      }
      case 'card-delete':
        return Boolean(c.cardId && now.has(c.cardId))
      case 'card-add':
        return !cur.cards.some((x) => x.id === c.afterCardId && x.text === next.get(c.afterCardId!)?.text)
      case 'unplace':
        return Boolean(c.cardId && places[view].get(c.cardId)?.key === c.column)
      case 'place':
        return true
      case 'column-add':
        return !views[view].cols.has(c.column!)
      case 'column-delete':
      case 'column-move':
        return views[view].now.some((x) => x.key === c.column)
      case 'column-rename': {
        const m = views[view]
        const col = m.now.find((x) => x.key === c.column)
        const key = [...m.cols.entries()].find(([, k]) => k === c.column)?.[0]
        const title = m.next.find((x) => x.key === key)?.title
        return Boolean(col && title !== undefined && col.title !== title)
      }
    }
  })
}

/** The changes that a decision on a change also makes: a new place in a view ends the old place there. */
export function impliedChanges(change: BoardChange, all: BoardChange[]): string[] {
  if (change.kind !== 'place') return []
  return all.filter((c) => c.kind === 'unplace' && c.view === change.view && c.cardId !== undefined && c.cardId === change.cardId).map((c) => c.id)
}

/** The changes that go with a rejected change: the cards of a new column that the author rejected. */
export function cascadeRejects(change: BoardChange, all: BoardChange[]): string[] {
  if (change.kind !== 'column-add') return []
  return all.filter((c) => c.kind === 'place' && c.view === change.view && c.column === change.column).map((c) => c.id)
}

const APPLY_ORDER: ChangeKind[] = ['column-add', 'column-rename', 'column-move', 'place', 'card-add', 'card-text', 'unplace', 'card-delete', 'column-delete']

/** The changes in the order in which "Apply all" applies them: columns first, the places, then the removals. */
export function applyOrder(changes: BoardChange[]): BoardChange[] {
  return [...changes].sort((a, b) => APPLY_ORDER.indexOf(a.kind) - APPLY_ORDER.indexOf(b.kind))
}

/**
 * The card of a change in the board now. A card that was there for the proposal keeps its id. A
 * new card of the proposal is the card with its id and its text, when the author applied it before;
 * else it is made (with its id, when that id is free).
 */
function ensureCard(cur: Board, afterCardId: string, after: Board, existing?: string): { board: Board; id: string } | null {
  if (existing && cur.cards.some((c) => c.id === existing)) return { board: cur, id: existing }
  const card = after.cards.find((c) => c.id === afterCardId)
  if (!card) return null
  if (!existing && cur.cards.some((c) => c.id === afterCardId && c.text === card.text)) return { board: cur, id: afterCardId }
  const fresh = allIds(cur).includes(afterCardId) ? idMaker(allIds(cur), 'c')() : afterCardId
  return { board: { ...cur, cards: [...cur.cards, { id: fresh, text: card.text }] }, id: fresh }
}

/** The place among the moving columns now where a column of the proposal goes: after its nearest earlier neighbor. */
function columnIndex(m: ViewMatch, afterKey: string, skip?: string): number {
  const nextMovable = m.next.filter(isMovable)
  const nowMovable = m.now.filter(isMovable).filter((c) => c.key !== skip)
  const anchor = anchorBefore(
    nextMovable,
    nextMovable.findIndex((c) => c.key === afterKey),
    (c) => {
      const k = m.cols.get(c.key)
      return k && k !== skip ? k : undefined
    }
  )
  return anchor ? nowMovable.findIndex((c) => c.key === anchor) + 1 : 0
}

/** The column of the proposal in the board now (written chapters are always there); a new column is made. */
function ensureColumn(cur: Board, view: LineView, afterKey: string, after: Board, chapters: ChapterRef[]): { board: Board; key: string } | null {
  const m = matchView(cur, after, view, chapters)
  if (afterKey.startsWith('ch:')) {
    // A written chapter is always there. Its first card makes its column: with the id of the proposal, when it is free.
    const now = m.now.find((c) => c.key === afterKey)
    const next = m.next.find((c) => c.key === afterKey)
    const ch = chapters.find((c) => `ch:${c.id}` === afterKey)
    if (ch && now && !now.columnId && next?.columnId && !allIds(cur).includes(next.columnId)) {
      return { board: withColumns(cur, view, [...columnsOf(cur, view), { id: next.columnId, title: headingOf(ch, chapters), cards: [] }]), key: afterKey }
    }
    return { board: cur, key: afterKey }
  }
  const mapped = m.cols.get(afterKey)
  if (mapped) return { board: cur, key: mapped }
  const col = m.next.find((c) => c.key === afterKey)
  if (!col) return null
  const index = columnIndex(m, afterKey)
  const taken = allIds(cur).includes(afterKey)
  const id = taken ? idMaker(allIds(cur), 'k')() : afterKey
  let board = withColumns(cur, view, [...columnsOf(cur, view), { id, title: col.title, cards: [] }])
  board = moveColumn(board, view, id, index, chapters)
  return { board, key: id }
}

/** Apply one change to the board now. */
export function applyBoardChange(cur: Board, change: BoardChange, after: Board, chapters: ChapterRef[]): Board {
  const view = change.view ?? 'chapter'
  switch (change.kind) {
    case 'card-text': {
      const text = after.cards.find((c) => c.id === change.afterCardId)?.text
      return text !== undefined && change.cardId ? updateCard(cur, change.cardId, text) : cur
    }
    case 'card-delete':
      return change.cardId ? deleteCard(cur, change.cardId) : cur
    case 'card-add':
      return change.afterCardId ? (ensureCard(cur, change.afterCardId, after)?.board ?? cur) : cur
    case 'unplace':
      return change.cardId ? placeCard(cur, view, change.cardId, TRAY, 0, chapters) : cur
    case 'column-delete': {
      const id = boardView(cur, view, chapters).find((c) => c.key === change.column)?.columnId
      return id ? deleteColumn(cur, view, id) : cur
    }
    case 'column-rename': {
      const m = matchView(cur, after, view, chapters)
      const next = [...m.cols.entries()].find(([, k]) => k === change.column)?.[0]
      const title = m.next.find((c) => c.key === next)?.title
      const id = m.now.find((c) => c.key === change.column)?.columnId
      return title !== undefined && id ? renameColumn(cur, view, id, title) : cur
    }
    case 'column-add':
      return change.column ? (ensureColumn(cur, view, change.column, after, chapters)?.board ?? cur) : cur
    case 'column-move': {
      const m = matchView(cur, after, view, chapters)
      const next = [...m.cols.entries()].find(([, k]) => k === change.column)?.[0]
      const id = m.now.find((c) => c.key === change.column)?.columnId
      return next && id ? moveColumn(cur, view, id, columnIndex(m, next, change.column), chapters) : cur
    }
    case 'place': {
      if (!change.afterCardId || !change.column) return cur
      const card = ensureCard(cur, change.afterCardId, after, change.cardId)
      if (!card) return cur
      const col = ensureColumn(card.board, view, change.column, after, chapters)
      if (!col) return cur
      // After the nearest earlier card of the proposed column that is in the column now.
      const m = matchView(col.board, after, view, chapters)
      const ids = matchCards(col.board, after)
      const next = m.next.find((c) => c.key === change.column)?.cards ?? []
      const there = (m.now.find((c) => c.key === col.key)?.cards ?? []).map((c) => c.id).filter((id) => id !== card.id)
      const anchor = anchorBefore(
        next,
        next.findIndex((c) => c.id === change.afterCardId),
        (c) => {
          const id = ids.get(c.id)
          return id && there.includes(id) ? id : undefined
        }
      )
      return placeCard(col.board, view, card.id, col.key, anchor ? there.indexOf(anchor) + 1 : 0, chapters)
    }
  }
}

export type Tone = 'same' | 'add' | 'remove'

export interface ReviewSlot {
  card: LineCard
  tone: Tone
  /** The changes that this card on screen applies or rejects */
  changes: string[]
  /** The text now, when the change gives a new text */
  before?: string
}

export interface ReviewColumn extends Omit<ViewColumn, 'cards'> {
  tone: Tone
  changes: string[]
  /** A new title (a rename) */
  newTitle?: string
  /** The column changes its place */
  moves?: boolean
  slots: ReviewSlot[]
}

/**
 * A view of the board now with the changes that wait for a decision: red where a card or a column
 * goes away, green where one comes, a new text on its card.
 */
export function reviewView(cur: Board, after: Board, view: LineView, chapters: ChapterRef[], changes: BoardChange[]): ReviewColumn[] {
  const m = matchView(cur, after, view, chapters)
  const ids = matchCards(cur, after)
  const nowText = new Map(cur.cards.map((c) => [c.id, c.text]))
  const nextCards = new Map(after.cards.map((c) => [c.id, c]))
  const mine = changes.filter((c) => !c.view || c.view === view)
  const ghosts = new Set(mine.filter((c) => c.kind === 'place').map((c) => c.afterCardId))

  const out: ReviewColumn[] = m.now.map((col) => {
    const slots: ReviewSlot[] = col.cards.map((card) => {
      const gone = changes.find((c) => c.kind === 'card-delete' && c.cardId === card.id)
      if (gone) return { card, tone: 'remove', changes: [gone.id] }
      const leaves = mine.find((c) => c.kind === 'unplace' && c.cardId === card.id && c.column === col.key)
      if (leaves) return { card, tone: 'remove', changes: [leaves.id] }
      // A new text shows on the card, or on its new place when it moves.
      const text = changes.find((c) => c.kind === 'card-text' && c.cardId === card.id)
      const next = text?.afterCardId ? nextCards.get(text.afterCardId) : undefined
      if (text && next && !ghosts.has(text.afterCardId)) return { card: { id: card.id, text: next.text }, tone: 'add', changes: [text.id], before: card.text }
      return { card, tone: 'same', changes: [] }
    })
    const own = mine.filter((c) => c.column === col.key && c.kind.startsWith('column-'))
    const rename = own.find((c) => c.kind === 'column-rename')
    const next = rename ? [...m.cols.entries()].find(([, k]) => k === col.key)?.[0] : undefined
    return {
      ...col,
      tone: own.some((c) => c.kind === 'column-delete') ? 'remove' : 'same',
      changes: own.map((c) => c.id),
      ...(rename ? { newTitle: m.next.find((c) => c.key === next)?.title } : {}),
      ...(own.some((c) => c.kind === 'column-move') ? { moves: true } : {}),
      slots
    }
  })
  // New columns, after their nearest earlier neighbor.
  for (const c of mine.filter((x) => x.kind === 'column-add')) {
    const col = m.next.find((x) => x.key === c.column)
    if (!col) continue
    const at = m.next.indexOf(col)
    const anchor = anchorBefore(m.next, at, (x) => (out.some((o) => o.key === (m.cols.get(x.key) ?? x.key)) ? (m.cols.get(x.key) ?? x.key) : undefined))
    const index = anchor ? out.findIndex((o) => o.key === anchor) + 1 : out[0]?.kind === 'tray' ? 1 : 0
    out.splice(index, 0, { ...col, tone: 'add', changes: [c.id], slots: [] })
  }
  // New places of cards, after their nearest earlier neighbor in the proposed column.
  for (const col of m.next) {
    if (col.kind === 'tray') continue
    const target = out.find((o) => o.key === (m.cols.get(col.key) ?? col.key))
    if (!target) continue
    col.cards.forEach((card, i) => {
      const place = mine.find((c) => c.kind === 'place' && c.afterCardId === card.id && c.column === col.key)
      if (!place) return
      const id = place.cardId
      const text = id ? changes.find((c) => c.kind === 'card-text' && c.cardId === id) : undefined
      const slot: ReviewSlot = { card, tone: 'add', changes: [place.id, ...(text ? [text.id] : [])], ...(text && id ? { before: nowText.get(id) } : {}) }
      const anchor = anchorBefore(col.cards, i, (x) => {
        const k = target.slots.findIndex((s) => s.tone !== 'remove' && (s.card.id === x.id || s.card.id === ids.get(x.id)))
        return k >= 0 ? String(k) : undefined
      })
      target.slots.splice(anchor !== undefined ? Number(anchor) + 1 : 0, 0, slot)
    })
  }
  // New cards with no place: in the tray.
  const adds = changes.filter((c) => c.kind === 'card-add')
  if (adds.length) {
    let tray = out.find((o) => o.kind === 'tray')
    if (!tray) {
      tray = { key: TRAY, kind: 'tray', title: '', tone: 'same', changes: [], slots: [] }
      out.unshift(tray)
    }
    for (const c of adds) {
      const card = nextCards.get(c.afterCardId!)
      if (card) tray.slots.push({ card, tone: 'add', changes: [c.id] })
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Mentions                                                             */
/* ------------------------------------------------------------------ */

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

/** The text of a card without the "@" of its mentions, for short views. */
export function plainText(text: string): string {
  return text.replace(/(^|[^\p{L}\p{N}])@(?=\p{L})/gu, '$1')
}
