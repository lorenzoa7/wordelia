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

/** The chapter that a link names: by its title or its file name, ignoring case and accents. */
export function chapterOf(link: string, chapters: ChapterRef[]): string | null {
  const want = fold(link).replace(/\.md$/, '')
  const ch = chapters.find((c) => fold(c.title) === want || fold(c.file).replace(/\.md$/, '') === want)
  return ch?.id ?? null
}

/** A heading of "By chapter" without `[[ ]]` and without a number in front ("3. ", "3 · "). */
function headingName(title: string): string {
  return title
    .replace(/^\[\[(.*)\]\]$/, '$1')
    .replace(/^\d+\s*[.·:)\-–—]\s*/, '')
    .trim()
}

/** The chapter of a "By chapter" column, or null for a planned chapter. */
function columnChapter(title: string, chapters: ChapterRef[]): string | null {
  return chapterOf(title, chapters) ?? chapterOf(headingName(title), chapters)
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
const REFS_RE = /^(?:\s*[,·]?\s*\^[A-Za-z0-9_-]+)+\s*[,·]?\s*$/
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

function readDef(raw: string): { id: string | null; text: string; links: string[] } {
  let rest = raw
  let links: string[] = []
  const l = LINKS_RE.exec(rest)
  if (l) {
    links = [...l[1].matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim())
    rest = rest.slice(0, l.index)
  }
  const id = ID_RE.exec(rest)
  return id ? { id: id[1], text: oneLine(rest.slice(id[0].length)), links } : { id: null, text: oneLine(rest), links }
}

export function parseBoard(body: string): Board {
  const lines = body.split(/\r?\n/)
  // The old format has no sections: its "## " headings are moments.
  let section: Section = 'order'
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
      if (item?.[1]) defs.push(readDef(item[1]))
      continue
    }
    if (!column) continue
    if (REFS_RE.test(line)) {
      for (const m of line.matchAll(/\^([A-Za-z0-9_-]+)/g)) column.entries.push({ ref: m[1] })
      continue
    }
    const item = ITEM_RE.exec(line)
    if (!item?.[1]) continue
    const def = readDef(item[1])
    if (def.id && !def.text) column.entries.push({ ref: def.id })
    else if (def.text) column.entries.push({ def })
  }

  // Ids: every id of the body is taken, so a new id never meets an old one.
  const used = [...body.matchAll(/\^([A-Za-z0-9_-]+)/g)].map((m) => m[1])
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
  const build = (raw: RawColumn[]): LineColumn[] => {
    const seenColumns = new Set<string>()
    const placed = new Set<string>()
    return raw.map((c) => {
      const id = c.id && !seenColumns.has(c.id) ? c.id : columnId()
      seenColumns.add(id)
      const ids: string[] = []
      for (const e of c.entries) {
        const card = 'ref' in e ? (known.has(e.ref) ? e.ref : null) : define(e.def)
        if (!card || placed.has(card)) continue
        placed.add(card)
        ids.push(card)
      }
      return { id, title: c.title, cards: ids }
    })
  }
  // "By chapter" first: inline cards there are defined before the moments read them.
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
    const real = chapters.flatMap((ch) => {
      const own = byChapter.filter((c) => columnChapter(c.title, chapters) === ch.id)
      if (!own.length) return []
      const cards = [...new Set(own.flatMap((c) => c.cards))]
      return cards.length ? [{ ...own[0], cards }] : []
    })
    byChapter = [...real, ...byChapter.filter((c) => !columnChapter(c.title, chapters))]
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
    const real = chapters.map((ch, i): ViewColumn => {
      const own = board.chapters.filter((c) => columnChapter(c.title, chapters) === ch.id)
      return { key: `ch:${ch.id}`, kind: 'chapter', title: ch.title, number: i + 1, chapterId: ch.id, columnId: own[0]?.id, cards: take(own.flatMap((c) => c.cards)) }
    })
    const planned = board.chapters
      .filter((c) => !columnChapter(c.title, chapters))
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
      const own = cols.filter((c) => columnChapter(c.title, chapters) === chapterId)
      if (own.length) {
        target = { ...own[0], cards: [...new Set(own.flatMap((c) => c.cards))] }
        cols = cols.filter((c) => !own.includes(c) || c === own[0]).map((c) => (c === own[0] ? target! : c))
      } else {
        target = { id: idMaker(allIds(board), 'k')(), title: ch.title, cards: [] }
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
  const movable = view === 'chapter' ? cols.filter((c) => !columnChapter(c.title, chapters)) : cols
  const col = movable.find((c) => c.id === id)
  if (!col) return board
  const rest = movable.filter((c) => c !== col)
  const at = Math.max(0, Math.min(index, rest.length))
  const moved = [...rest.slice(0, at), col, ...rest.slice(at)]
  return withColumns(board, view, view === 'chapter' ? [...cols.filter((c) => !movable.includes(c)), ...moved] : moved)
}

/** A chapter got a new title: its "By chapter" heading follows (and links of the old format). */
export function renameChapterInBody(body: string, oldTitle: string, newTitle: string): string {
  const old = fold(oldTitle)
  let section: Section = 'order'
  return body
    .split('\n')
    .map((line) => {
      const head = COLUMN_RE.exec(line)
      if (head && section === 'chapter') {
        const id = TRAILING_ID_RE.exec(head[1])
        const title = id ? head[1].slice(0, id.index) : head[1]
        if (fold(title) === old || fold(headingName(title)) === old) return `## ${newTitle}${id ? ` ^${id[1]}` : ''}`
        return line
      }
      const sec = !head && SECTION_RE.exec(line)
      if (sec) section = SECTION.find(([re]) => re.test(sec[1]))?.[1] ?? null
      return line.replace(/\[\[([^\]]+)\]\]/g, (all, inner: string) => (fold(inner) === old ? `[[${newTitle}]]` : all))
    })
    .join('\n')
}

/* ------------------------------------------------------------------ */
/* Differences, for a proposal of the AI                                */
/* ------------------------------------------------------------------ */

export interface DiffCard {
  card: LineCard
  added: boolean
  /** A card that the proposal deletes: it shows where it was */
  removed: boolean
  /** In another column, or in another place of its column */
  moved: boolean
  /** Its place in the other view changed (the line at the bottom of the card) */
  otherMoved: boolean
  changed: boolean
  /** The text before the change */
  before?: string
}

export interface DiffColumn extends Omit<ViewColumn, 'cards'> {
  mark: 'same' | 'added' | 'removed' | 'renamed'
  oldTitle?: string
  cards: DiffCard[]
}

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

/** The proposed view with marks: new, deleted (where they were), moved and changed cards and columns. */
export function diffView(before: Board, after: Board, view: LineView, chapters: ChapterRef[]): DiffColumn[] {
  const cardMap = matchCards(before, after)
  const beforeCards = new Map(before.cards.map((c) => [c.id, c]))
  const kept = new Set(cardMap.values())
  const b = boardView(before, view, chapters)
  const a = boardView(after, view, chapters)
  const colMap = matchColumns(b, a)
  const beforeCol = new Map<string, ViewColumn>(b.map((c) => [c.key, c]))
  const columnOfCard = new Map<string, string>()
  for (const col of b) for (const c of col.cards) columnOfCard.set(c.id, col.key)
  const otherView: LineView = view === 'chapter' ? 'order' : 'chapter'
  const otherBefore = placesOf(before, otherView, chapters)
  const otherAfter = placesOf(after, otherView, chapters)

  const out: DiffColumn[] = a.map((col) => {
    const oldKey = colMap.get(col.key)
    const old = oldKey ? beforeCol.get(oldKey) : undefined
    const oldIndex = new Map((old?.cards ?? []).map((c, i) => [c.id, i]))
    const mapped = col.cards.map((c) => cardMap.get(c.id) ?? '')
    const shuffled = outOfOrder(
      mapped.filter((id) => id && columnOfCard.get(id) === oldKey),
      oldIndex
    )
    const cards: DiffCard[] = col.cards.map((card, i) => {
      const was = mapped[i] ? beforeCards.get(mapped[i]) : undefined
      if (!was) return { card, added: true, removed: false, moved: false, otherMoved: false, changed: false }
      const moved = columnOfCard.get(was.id) !== oldKey || shuffled.has(was.id)
      const otherMoved = otherBefore.get(was.id)?.key !== otherAfter.get(card.id)?.key
      const changed = fold(was.text) !== fold(card.text)
      return { card, added: false, removed: false, moved, otherMoved, changed, ...(changed ? { before: was.text } : {}) }
    })
    // Deleted cards stay where they were, among the cards of their old column.
    if (old) {
      old.cards.forEach((c, i) => {
        if (kept.has(c.id)) return
        cards.splice(Math.min(i, cards.length), 0, { card: c, added: false, removed: true, moved: false, otherMoved: false, changed: false })
      })
    }
    const mark: DiffColumn['mark'] = !old ? 'added' : fold(old.title) !== fold(col.title) && col.kind !== 'tray' ? 'renamed' : 'same'
    return { ...col, mark, ...(mark === 'renamed' ? { oldTitle: old!.title } : {}), cards }
  })
  // Deleted columns stay where they were, with their deleted cards.
  const used = new Set(colMap.values())
  b.forEach((col, i) => {
    if (used.has(col.key) || col.kind === 'tray') return
    const cards = col.cards.filter((c) => !kept.has(c.id)).map((card): DiffCard => ({ card, added: false, removed: true, moved: false, otherMoved: false, changed: false }))
    const prevKey = b
      .slice(0, i)
      .reverse()
      .find((x) => used.has(x.key))?.key
    const afterKey = prevKey ? [...colMap.entries()].find(([, v]) => v === prevKey)?.[0] : undefined
    const at = afterKey ? out.findIndex((x) => x.key === afterKey) + 1 : out[0]?.kind === 'tray' ? 1 : 0
    out.splice(at, 0, { ...col, mark: 'removed', cards })
  })
  return out
}

/** The counts of a proposal: new, deleted, moved (in either view) and changed cards. */
export function boardStats(before: Board, after: Board, chapters: ChapterRef[]): { added: number; removed: number; moved: number; changed: number } {
  const cardMap = matchCards(before, after)
  const kept = new Set(cardMap.values())
  const moved = new Set<string>()
  let changed = 0
  for (const view of ['chapter', 'order'] as const) {
    for (const col of diffView(before, after, view, chapters)) for (const c of col.cards) if (c.moved) moved.add(c.card.id)
  }
  const beforeCards = new Map(before.cards.map((c) => [c.id, c]))
  for (const c of after.cards) {
    const was = cardMap.get(c.id)
    if (was && fold(beforeCards.get(was)!.text) !== fold(c.text)) changed++
  }
  return {
    added: after.cards.filter((c) => !cardMap.has(c.id)).length,
    removed: before.cards.filter((c) => !kept.has(c.id)).length,
    moved: moved.size,
    changed
  }
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
