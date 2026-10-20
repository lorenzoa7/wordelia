import { describe, expect, it } from 'vitest'
import {
  addCard,
  addColumn,
  boardStats,
  boardView,
  chapterOf,
  deleteCard,
  deleteColumn,
  diffView,
  findStoryLine,
  hereKey,
  isStoryLine,
  mentionPieces,
  moveColumn,
  parseBoard,
  placeCard,
  renameChapterInBody,
  renameColumn,
  serializeBoard,
  updateCard,
  type Board
} from './storyline'
import type { Entry } from './types'

const BODY = [
  '# Cards',
  '- ^c1 @Elias lights the lamp; a boat is missing.',
  '- ^c2 @Marta climbs the stairs with coffee.',
  '- ^c3 Twenty-two years ago, the first night of @Elias at the lighthouse.',
  '- ^c4 They see the blue boat together.',
  '- ^c5 The visitor wakes up in the lighthouse.',
  '',
  '# By chapter',
  '## The Storm ^k1',
  '^c1 ^c2 ^c3',
  '',
  '## The Visitor ^k2',
  '^c4',
  '',
  '## The Return ^k3',
  '^c5',
  '',
  '# By order',
  '## Twenty-two years before ^k4',
  '^c3',
  '',
  '## The night of the storm ^k5',
  '^c2 ^c1 ^c4',
  ''
].join('\n')

const chapters = [
  { id: 'ch1', title: 'The Storm', file: 'The Storm.md' },
  { id: 'ch2', title: 'The Visitor', file: 'The Visitor.md' }
]

const entry = (name: string, aliases: string[] = []): Pick<Entry, 'id' | 'name' | 'aliases'> => ({ id: `e-${name}`, name, aliases })
const titles = (b: Board, view: 'chapter' | 'order'): string[] => boardView(b, view, chapters).map((c) => c.title)
const ids = (b: Board, view: 'chapter' | 'order', key: string): string[] => boardView(b, view, chapters).find((c) => c.key === key)?.cards.map((c) => c.id) ?? []

describe('parseBoard', () => {
  it('reads cards and the two views', () => {
    const b = parseBoard(BODY)
    expect(b.cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5'])
    expect(b.cards[0].text).toBe('@Elias lights the lamp; a boat is missing.')
    expect(b.chapters.map((c) => [c.id, c.title, c.cards])).toEqual([
      ['k1', 'The Storm', ['c1', 'c2', 'c3']],
      ['k2', 'The Visitor', ['c4']],
      ['k3', 'The Return', ['c5']]
    ])
    expect(b.moments.map((c) => [c.id, c.title, c.cards])).toEqual([
      ['k4', 'Twenty-two years before', ['c3']],
      ['k5', 'The night of the storm', ['c2', 'c1', 'c4']]
    ])
  })

  it('gives new ids to cards and columns without one', () => {
    const b = parseBoard('# Cards\n- ^c7 a\n- b\n\n# By order\n## Night\n^c7')
    expect(b.cards.map((c) => c.id)).toEqual(['c7', 'c8'])
    expect(b.moments[0].id).toBe('k1')
    expect(b.moments[0].cards).toEqual(['c7'])
  })

  it('reads a card that is written under a column', () => {
    const b = parseBoard('# By chapter\n## The Storm\n- @Elias lights the lamp.\n- ^x9 A boat is missing.\n\n# By order\n## Night\n- ^x9 The text of a known card is not read again.')
    expect(b.cards.map((c) => [c.id, c.text])).toEqual([
      ['c1', '@Elias lights the lamp.'],
      ['x9', 'A boat is missing.']
    ])
    expect(b.chapters[0].cards).toEqual(['c1', 'x9'])
    expect(b.moments[0].cards).toEqual(['x9'])
  })

  it('reads the section names in Portuguese and Spanish', () => {
    const pt = parseBoard('# Cartões\n- ^c1 a\n\n# Por capítulo\n## A Tempestade\n^c1\n\n# Por ordem\n## Noite\n^c1')
    expect(pt.chapters[0].cards).toEqual(['c1'])
    expect(pt.moments[0].cards).toEqual(['c1'])
    const es = parseBoard('# Tarjetas\n- ^c1 a\n\n# Por capítulo\n## La tormenta\n^c1\n\n# Por orden\n## Noche\n^c1')
    expect(es.moments[0].title).toBe('Noche')
  })

  it('ignores unknown ids, a second place in one view and other lines', () => {
    const b = parseBoard('# Cards\n- ^c1 a\n- ^c2 b\nSome note.\n\n# By order\n## One\n^c1 ^zz ^c1\n## Two\n^c1, ^c2\n### Not a column')
    expect(b.moments.map((m) => m.cards)).toEqual([['c1'], ['c2']])
  })

  it('reads the old format: moments and links to chapters', () => {
    const b = parseBoard('Lanes: Elias · Marta\n\n## 1\n- Elias: The storm comes. → [[The Storm]]\n- Marta: Coffee.\n\n## 2\n- Elias + Marta: The boat. → [[The Visitor]]')
    expect(b.cards.map((c) => c.text)).toEqual(['Elias: The storm comes.', 'Marta: Coffee.', 'Elias + Marta: The boat.'])
    expect(b.moments.map((m) => [m.title, m.cards.length])).toEqual([
      ['1', 2],
      ['2', 1]
    ])
    expect(ids(b, 'chapter', 'ch:ch1')).toEqual([b.cards[0].id])
    expect(ids(b, 'chapter', 'ch:ch2')).toEqual([b.cards[2].id])
  })

  it('keeps a card text on one line', () => {
    const b = updateCard(parseBoard(BODY), 'c1', '  Two\nlines  ')
    expect(b.cards[0].text).toBe('Two lines')
  })
})

describe('serializeBoard', () => {
  it('writes the canonical form, and reads it back', () => {
    const b = parseBoard(BODY)
    const text = serializeBoard(b, chapters)
    expect(text).toBe(BODY.replace(/\n$/, ''))
    expect(parseBoard(text)).toEqual(b)
  })

  it('writes the written chapters in the order of the book, then the planned ones', () => {
    const b = parseBoard('# Cards\n- ^c1 a\n- ^c2 b\n- ^c3 c\n\n# By chapter\n## Later ^k1\n^c3\n\n## The Visitor ^k2\n^c2\n\n## The Storm ^k3\n^c1')
    const text = serializeBoard(b, chapters)
    expect(text.split('\n').filter((l) => l.startsWith('## '))).toEqual(['## The Storm ^k3', '## The Visitor ^k2', '## Later ^k1'])
  })

  it('leaves out an empty column of a written chapter', () => {
    const b = placeCard(parseBoard(BODY), 'chapter', 'c4', 'ch:ch1', 0, chapters)
    expect(serializeBoard(b, chapters)).not.toContain('## The Visitor')
  })
})

describe('boardView', () => {
  it('shows every written chapter, then the planned chapters', () => {
    const b = parseBoard('# Cards\n- ^c1 a\n\n# By chapter\n## The Return ^k3\n^c1')
    const cols = boardView(b, 'chapter', chapters)
    expect(cols.map((c) => [c.key, c.kind, c.number, c.title])).toEqual([
      ['ch:ch1', 'chapter', 1, 'The Storm'],
      ['ch:ch2', 'chapter', 2, 'The Visitor'],
      ['k3', 'planned', 3, 'The Return']
    ])
  })

  it('matches a heading to a chapter without case, accents, brackets or its number', () => {
    const b = parseBoard('# Cards\n- ^c1 a\n- ^c2 b\n\n# By chapter\n## 1. the störm\n^c1\n## [[The Visitor.md]]\n^c2')
    expect(ids(b, 'chapter', 'ch:ch1')).toEqual(['c1'])
    expect(ids(b, 'chapter', 'ch:ch2')).toEqual(['c2'])
  })

  it('puts cards without a place in the tray, first', () => {
    const b = parseBoard(BODY)
    const order = boardView(b, 'order', chapters)
    expect(order[0]).toMatchObject({ key: 'tray', kind: 'tray' })
    expect(order[0].cards.map((c) => c.id)).toEqual(['c5'])
    expect(boardView(b, 'chapter', chapters)[0].key).toBe('ch:ch1')
  })

  it('shows an empty board of chapters for an empty line', () => {
    const cols = boardView(parseBoard(''), 'chapter', chapters)
    expect(cols.map((c) => [c.key, c.cards.length])).toEqual([
      ['ch:ch1', 0],
      ['ch:ch2', 0]
    ])
    expect(boardView(parseBoard(''), 'order', chapters)).toEqual([])
  })
})

describe('you are here', () => {
  it('is the last chapter of the book, by chapter', () => {
    expect(hereKey(parseBoard(BODY), 'chapter', chapters)).toBe('ch:ch2')
    expect(hereKey(parseBoard(''), 'chapter', [])).toBeNull()
  })

  it('is the moment of the last card of the last chapter with cards in a moment, by order', () => {
    expect(hereKey(parseBoard(BODY), 'order', chapters)).toBe('k5')
    // The last chapter has no card in a moment: the chapter before it counts.
    const b = placeCard(parseBoard(BODY), 'order', 'c4', 'tray', 0, chapters)
    expect(hereKey(b, 'order', chapters)).toBe('k4')
    expect(hereKey(parseBoard(''), 'order', chapters)).toBeNull()
  })
})

describe('changes', () => {
  it('adds a card at the end of a column, with a new id', () => {
    const { board, id } = addCard(parseBoard(BODY), 'chapter', 'ch:ch2', 'Marta finds a ring.', chapters)
    expect(id).toBe('c6')
    expect(ids(board, 'chapter', 'ch:ch2')).toEqual(['c4', 'c6'])
    expect(ids(board, 'order', 'tray')).toEqual(['c5', 'c6'])
  })

  it('adds a card to a chapter that has no column yet', () => {
    const { board, id } = addCard(parseBoard(''), 'chapter', 'ch:ch2', 'a', chapters)
    expect(ids(board, 'chapter', 'ch:ch2')).toEqual([id])
    expect(board.chapters[0].title).toBe('The Visitor')
  })

  it('moves a card in its column and to another column', () => {
    let b = placeCard(parseBoard(BODY), 'chapter', 'c3', 'ch:ch1', 0, chapters)
    expect(ids(b, 'chapter', 'ch:ch1')).toEqual(['c3', 'c1', 'c2'])
    b = placeCard(b, 'order', 'c1', 'k4', 1, chapters)
    expect(ids(b, 'order', 'k4')).toEqual(['c3', 'c1'])
    expect(ids(b, 'order', 'k5')).toEqual(['c2', 'c4'])
    // The other view does not change.
    expect(ids(b, 'chapter', 'ch:ch1')).toEqual(['c3', 'c1', 'c2'])
  })

  it('moves a card to the tray and out of it', () => {
    let b = placeCard(parseBoard(BODY), 'order', 'c2', 'tray', 0, chapters)
    expect(ids(b, 'order', 'tray')).toEqual(['c2', 'c5'])
    b = placeCard(b, 'order', 'c5', 'k4', 0, chapters)
    expect(ids(b, 'order', 'k4')).toEqual(['c5', 'c3'])
  })

  it('deletes a card from both views', () => {
    const b = deleteCard(parseBoard(BODY), 'c1')
    expect(b.cards.map((c) => c.id)).not.toContain('c1')
    expect(serializeBoard(b, chapters)).not.toContain('^c1')
  })

  it('adds, renames, moves and deletes columns', () => {
    let { board: b, id } = addColumn(parseBoard(BODY), 'order', 'The morning after')
    expect(id).toBe('k6')
    expect(titles(b, 'order').slice(1)).toEqual(['Twenty-two years before', 'The night of the storm', 'The morning after'])
    b = renameColumn(b, 'order', 'k6', 'Dawn')
    b = moveColumn(b, 'order', 'k6', 0, chapters)
    expect(titles(b, 'order').slice(1)).toEqual(['Dawn', 'Twenty-two years before', 'The night of the storm'])
    b = deleteColumn(b, 'order', 'k5')
    expect(titles(b, 'order')).toEqual(['', 'Dawn', 'Twenty-two years before'])
    // Its cards go to the tray of the view and keep their chapters.
    expect(ids(b, 'order', 'tray')).toEqual(['c1', 'c2', 'c4', 'c5'])
    expect(ids(b, 'chapter', 'ch:ch1')).toEqual(['c1', 'c2', 'c3'])
  })

  it('moves a planned chapter among the planned chapters only', () => {
    let b = addColumn(parseBoard(BODY), 'chapter', 'The End').board
    b = moveColumn(b, 'chapter', 'k6', 0, chapters)
    expect(titles(b, 'chapter')).toEqual(['The Storm', 'The Visitor', 'The End', 'The Return'])
  })

  it('renames the column of a chapter that gets a new title', () => {
    const next = renameChapterInBody(BODY, 'The Storm', 'The Great Storm')
    expect(next).toContain('## The Great Storm ^k1')
    expect(next.replace('The Great Storm', 'The Storm')).toBe(BODY)
    // Not in "By order", and old links follow too.
    expect(renameChapterInBody('# By order\n## The Storm ^k1', 'The Storm', 'Night')).toBe('# By order\n## The Storm ^k1')
    expect(renameChapterInBody('## 1\n- a → [[the storm]]', 'The Storm', 'Night')).toBe('## 1\n- a → [[Night]]')
  })
})

describe('diffView', () => {
  it('marks every card and column of a first fill as new', () => {
    const cols = diffView(parseBoard(''), parseBoard(BODY), 'order', chapters)
    expect(cols.map((c) => c.mark)).toEqual(['added', 'added', 'added'])
    expect(cols.flatMap((c) => c.cards.map((x) => x.added))).toEqual([true, true, true, true, true])
    // The written chapters exist before: their columns are not new.
    expect(diffView(parseBoard(''), parseBoard(BODY), 'chapter', chapters).map((c) => c.mark)).toEqual(['same', 'same', 'added'])
  })

  it('marks moved, changed and deleted cards, and renamed and deleted columns', () => {
    let after = placeCard(parseBoard(BODY), 'order', 'c1', 'k4', 0, chapters)
    after = updateCard(after, 'c2', '@Marta climbs the stairs with tea.')
    after = deleteCard(after, 'c4')
    after = renameColumn(after, 'order', 'k4', 'Long ago')
    after = deleteColumn(after, 'order', 'k5')
    const cols = diffView(parseBoard(BODY), after, 'order', chapters)
    const k4 = cols.find((c) => c.key === 'k4')!
    expect(k4.mark).toBe('renamed')
    expect(k4.oldTitle).toBe('Twenty-two years before')
    expect(k4.cards.map((c) => [c.card.id, c.moved, c.added])).toEqual([
      ['c1', true, false],
      ['c3', false, false]
    ])
    const k5 = cols.find((c) => c.key === 'k5')!
    expect(k5.mark).toBe('removed')
    expect(k5.cards.map((c) => [c.card.id, c.removed])).toEqual([['c4', true]])
    const tray = cols.find((c) => c.key === 'tray')!
    expect(tray.cards.find((c) => c.card.id === 'c2')).toMatchObject({ moved: true, changed: true, before: '@Marta climbs the stairs with coffee.' })
  })

  it('marks a card that changed its place in its column', () => {
    const after = placeCard(parseBoard(BODY), 'chapter', 'c3', 'ch:ch1', 0, chapters)
    const col = diffView(parseBoard(BODY), after, 'chapter', chapters).find((c) => c.key === 'ch:ch1')!
    expect(col.cards.map((c) => [c.card.id, c.moved])).toEqual([
      ['c3', true],
      ['c1', false],
      ['c2', false]
    ])
  })

  it('marks a card whose place in the other view changed', () => {
    const after = placeCard(parseBoard(BODY), 'order', 'c1', 'k4', 0, chapters)
    const col = diffView(parseBoard(BODY), after, 'chapter', chapters).find((c) => c.key === 'ch:ch1')!
    expect(col.cards.map((c) => [c.card.id, c.moved, c.otherMoved])).toEqual([
      ['c1', false, true],
      ['c2', false, false],
      ['c3', false, false]
    ])
  })

  it('matches cards by their text when a rebuild has new ids', () => {
    const rebuilt = BODY.replace(/\^c(\d)/g, '^n$1')
    const cols = diffView(parseBoard(BODY), parseBoard(rebuilt), 'order', chapters)
    expect(cols.flatMap((c) => c.cards.filter((x) => x.added || x.removed || x.moved))).toEqual([])
  })

  it('counts the changes', () => {
    let after = addCard(parseBoard(BODY), 'chapter', 'ch:ch1', 'new', chapters).board
    after = deleteCard(after, 'c5')
    after = placeCard(after, 'order', 'c1', 'k4', 0, chapters)
    after = updateCard(after, 'c2', 'tea')
    expect(boardStats(parseBoard(BODY), after, chapters)).toEqual({ added: 1, removed: 1, moved: 1, changed: 1 })
  })
})

describe('the entry and mentions', () => {
  it('finds the story line among the entries', () => {
    const e = (file: string, type?: string): Entry => ({ id: file, category: 'Plot', file, name: file, aliases: [], summary: '', image: null, body: '', meta: type ? { type } : {} })
    expect(isStoryLine(e('a.md', 'story-line'))).toBe(true)
    expect(findStoryLine([e('z.md', 'story-line'), e('m.md'), e('b.md', 'story-line')])?.file).toBe('b.md')
    expect(findStoryLine([e('m.md')])).toBeNull()
  })

  it('matches chapters by title and file name, ignoring accents', () => {
    expect(chapterOf('the storm', chapters)).toBe('ch1')
    expect(chapterOf('The Vísitor.md', chapters)).toBe('ch2')
    expect(chapterOf('Nothing', chapters)).toBeNull()
  })

  it('finds the longest mention', () => {
    const entries = [entry('Ana'), entry('Ana Lúcia'), entry('Elias', ['o faroleiro'])]
    expect(mentionPieces('@Ana Lúcia chega', entries)).toEqual([
      { kind: 'mention', entryId: 'e-Ana Lúcia', text: '@Ana Lúcia' },
      { kind: 'text', text: ' chega' }
    ])
    expect(mentionPieces('Com @o faroleiro e @Ninguém.', entries)).toEqual([
      { kind: 'text', text: 'Com ' },
      { kind: 'mention', entryId: 'e-Elias', text: '@o faroleiro' },
      { kind: 'text', text: ' e @Ninguém.' }
    ])
  })
})
