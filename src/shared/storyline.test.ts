import { describe, expect, it } from 'vitest'
import {
  addCard,
  addColumn,
  applyBoardChange,
  boardChanges,
  boardView,
  chapterOf,
  deleteCard,
  deleteColumn,
  findStoryLine,
  hereKey,
  isStoryLine,
  linkMentions,
  mentionPieces,
  moveColumn,
  applyOrder,
  cascadeRejects,
  impliedChanges,
  liveChanges,
  parseBoard,
  placeCard,
  renameChapterInBody,
  renameColumn,
  reviewView,
  serializeBoard,
  updateCard,
  type Board,
  type BoardChange,
  type ReviewColumn
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
    const night = [{ ...chapters[0], title: 'Night', file: 'Night.md' }, chapters[1]]
    // Not in "By order", and old links follow too.
    expect(renameChapterInBody('# By order\n## The Storm ^k1', 'ch1', chapters, night)).toBe('# By order\n## The Storm ^k1')
    expect(renameChapterInBody('## 1\n- a → [[the storm]]', 'ch1', chapters, night)).toBe('## 1\n- a → [[Night]]')
  })
})

describe('changes of a proposal', () => {
  const kinds = (cur: Board, after: Board): string[] =>
    boardChanges(cur, after, chapters)
      .map((c) => c.id)
      .sort()

  it('a move is a removal from one column and an addition to another', () => {
    const after = placeCard(parseBoard(BODY), 'order', 'c1', 'k4', 0, chapters)
    expect(kinds(parseBoard(BODY), after)).toEqual(['place:order:c1:k4', 'unplace:order:c1:k5'])
  })

  it('a new card goes to its places; a deleted card and a new text are one change each', () => {
    let after = addCard(parseBoard(BODY), 'chapter', 'ch:ch2', 'new', chapters).board
    after = placeCard(after, 'order', 'c6', 'k4', 1, chapters)
    after = deleteCard(after, 'c5')
    after = updateCard(after, 'c2', 'tea')
    expect(kinds(parseBoard(BODY), after)).toEqual(['delete:c5', 'place:chapter:c6:ch:ch2', 'place:order:c6:k4', 'text:c2'])
  })

  it('a card that changes its place in its column is a removal and an addition', () => {
    const after = placeCard(parseBoard(BODY), 'chapter', 'c3', 'ch:ch1', 0, chapters)
    expect(kinds(parseBoard(BODY), after)).toEqual(['place:chapter:c3:ch:ch1', 'unplace:chapter:c3:ch:ch1'])
  })

  it('columns: new, deleted, renamed', () => {
    let after = addColumn(parseBoard(BODY), 'order', 'Dawn').board
    after = renameColumn(after, 'order', 'k4', 'Long ago')
    after = deleteColumn(after, 'order', 'k5')
    expect(kinds(parseBoard(BODY), after).filter((k) => k.startsWith('col'))).toEqual(['col-add:order:k6', 'col-delete:order:k5', 'col-rename:order:k4'])
  })

  it('nothing changes: no change', () => {
    expect(boardChanges(parseBoard(BODY), parseBoard(BODY), chapters)).toEqual([])
    // A rebuild with new ids is the same board.
    expect(boardChanges(parseBoard(BODY), parseBoard(BODY.replace(/\^c(\d)/g, '^n$1')), chapters)).toEqual([])
  })

  it('applies the addition of a move alone: the card moves, and the removal is done too', () => {
    const after = placeCard(parseBoard(BODY), 'order', 'c1', 'k4', 0, chapters)
    let cur = parseBoard(BODY)
    const place = boardChanges(cur, after, chapters).find((c) => c.kind === 'place')!
    cur = applyBoardChange(cur, place, after, chapters)
    expect(ids(cur, 'order', 'k4')).toEqual(['c1', 'c3'])
    expect(boardChanges(cur, after, chapters)).toEqual([])
  })

  it('applies the removal of a move alone: the card goes to the tray', () => {
    const after = placeCard(parseBoard(BODY), 'order', 'c1', 'k4', 0, chapters)
    let cur = parseBoard(BODY)
    cur = applyBoardChange(cur, boardChanges(cur, after, chapters).find((c) => c.kind === 'unplace')!, after, chapters)
    expect(ids(cur, 'order', 'tray')).toEqual(['c1', 'c5'])
    expect(boardChanges(cur, after, chapters).map((c) => c.id)).toEqual(['place:order:c1:k4'])
  })

  it('puts a new card after the card that comes before it', () => {
    const after = addCard(parseBoard(BODY), 'chapter', 'ch:ch1', 'between', chapters, 1).board
    let cur = parseBoard(BODY)
    for (const c of boardChanges(cur, after, chapters)) cur = applyBoardChange(cur, c, after, chapters)
    expect(ids(cur, 'chapter', 'ch:ch1')).toEqual(['c1', 'c6', 'c2', 'c3'])
  })

  it('makes the column of a new card when the card goes there first', () => {
    let after = addColumn(parseBoard(BODY), 'order', 'Dawn').board
    after = placeCard(after, 'order', 'c5', 'k6', 0, chapters)
    let cur = parseBoard(BODY)
    cur = applyBoardChange(cur, boardChanges(cur, after, chapters).find((c) => c.kind === 'place')!, after, chapters)
    expect(boardView(cur, 'order', chapters).map((c) => c.title)).toEqual(['Twenty-two years before', 'The night of the storm', 'Dawn'])
    expect(ids(cur, 'order', 'k6')).toEqual(['c5'])
    expect(boardChanges(cur, after, chapters)).toEqual([])
  })

  it('applies every change of a first fill to an empty line', () => {
    let cur = parseBoard('')
    const after = parseBoard(BODY)
    for (const c of boardChanges(cur, after, chapters)) cur = applyBoardChange(cur, c, after, chapters)
    expect(boardChanges(cur, after, chapters)).toEqual([])
    expect(boardView(cur, 'order', chapters).map((c) => [c.key, c.cards.map((x) => x.id)])).toEqual([
      ['tray', ['c5']],
      ['k4', ['c3']],
      ['k5', ['c2', 'c1', 'c4']]
    ])
  })
})

describe('reviewView', () => {
  const cols = (cur: Board, after: Board, view: 'chapter' | 'order', skip: string[] = []) =>
    reviewView(cur, after, view, chapters, liveChanges(cur, after, boardChanges(cur, after, chapters).filter((c) => !skip.includes(c.id)), chapters))
  const slots = (c: ReviewColumn | undefined): string[][] => (c?.slots ?? []).map((s) => [s.card.id, s.tone])

  it('shows a move as a red card in the old column and a green card in the new one', () => {
    const after = placeCard(parseBoard(BODY), 'order', 'c1', 'k4', 0, chapters)
    const view = cols(parseBoard(BODY), after, 'order')
    expect(slots(view.find((c) => c.key === 'k4'))).toEqual([
      ['c1', 'add'],
      ['c3', 'same']
    ])
    expect(slots(view.find((c) => c.key === 'k5'))).toEqual([
      ['c2', 'same'],
      ['c1', 'remove'],
      ['c4', 'same']
    ])
    expect(view.find((c) => c.key === 'k4')!.slots[0].changes).toEqual(['place:order:c1:k4'])
  })

  it('leaves out a change that the author rejected', () => {
    const after = placeCard(parseBoard(BODY), 'order', 'c1', 'k4', 0, chapters)
    const view = cols(parseBoard(BODY), after, 'order', ['place:order:c1:k4'])
    expect(slots(view.find((c) => c.key === 'k4'))).toEqual([['c3', 'same']])
    expect(slots(view.find((c) => c.key === 'k5'))).toEqual([
      ['c2', 'same'],
      ['c1', 'remove'],
      ['c4', 'same']
    ])
  })

  it('shows a new text on the card, with the text before', () => {
    const after = updateCard(parseBoard(BODY), 'c2', 'tea')
    const slot = cols(parseBoard(BODY), after, 'order')
      .flatMap((c) => c.slots)
      .find((s) => s.card.id === 'c2')!
    expect(slot).toMatchObject({ tone: 'add', changes: ['text:c2'], before: '@Marta climbs the stairs with coffee.' })
    expect(slot.card.text).toBe('tea')
  })

  it('shows a new column with its new cards, and a deleted column in red', () => {
    let after = addColumn(parseBoard(BODY), 'order', 'Dawn').board
    after = addCard(after, 'order', 'k6', 'morning', chapters).board
    after = deleteColumn(after, 'order', 'k4')
    const view = cols(parseBoard(BODY), after, 'order')
    const dawn = view.find((c) => c.key === 'k6')!
    expect([dawn.tone, dawn.changes, slots(dawn)]).toEqual(['add', ['col-add:order:k6'], [['c6', 'add']]])
    expect(view.find((c) => c.key === 'k4')).toMatchObject({ tone: 'remove', changes: ['col-delete:order:k4'] })
    expect(view.map((c) => c.key)).toEqual(['tray', 'k4', 'k5', 'k6'])
  })

  it('counts the changes that the line still needs', () => {
    const after = placeCard(updateCard(parseBoard(BODY), 'c2', 'tea'), 'order', 'c1', 'k4', 0, chapters)
    const all = boardChanges(parseBoard(BODY), after, chapters)
    expect(liveChanges(parseBoard(BODY), after, all, chapters).length).toBe(3)
    // The text is the same now: that change is done.
    expect(liveChanges(updateCard(parseBoard(BODY), 'c2', 'tea'), after, all, chapters).map((c) => c.id)).toEqual(['place:order:c1:k4', 'unplace:order:c1:k5'])
  })
})

describe('a proposal and the decisions of the author', () => {
  /** The changes that the line still needs, after some decisions. */
  const left = (cur: Board, after: Board, all: BoardChange[], decided: string[]): string[] =>
    liveChanges(
      cur,
      after,
      all.filter((c) => !decided.includes(c.id)),
      chapters
    ).map((c) => c.id)

  it('"Apply all" after a rejection keeps every move: the new place first, the removal after it', () => {
    const before = parseBoard(BODY)
    const after = placeCard(updateCard(parseBoard(BODY), 'c2', 'tea'), 'order', 'c1', 'k4', 0, chapters)
    const all = boardChanges(before, after, chapters)
    let cur = before
    for (const c of applyOrder(liveChanges(cur, after, all.filter((x) => x.id !== 'text:c2'), chapters))) {
      if (liveChanges(cur, after, [c], chapters).length) cur = applyBoardChange(cur, c, after, chapters)
    }
    expect(ids(cur, 'order', 'k4')).toEqual(['c1', 'c3'])
    expect(ids(cur, 'order', 'tray')).toEqual(['c5'])
    expect(cur.cards.find((c) => c.id === 'c2')?.text).toBe('@Marta climbs the stairs with coffee.')
  })

  it('a new place ends the old place in the same view', () => {
    const after = placeCard(parseBoard(BODY), 'chapter', 'c3', 'ch:ch1', 0, chapters)
    const all = boardChanges(parseBoard(BODY), after, chapters)
    const place = all.find((c) => c.kind === 'place')!
    expect(impliedChanges(place, all)).toEqual(['unplace:chapter:c3:ch:ch1'])
  })

  it('a rejected reorder does not come back as another card', () => {
    const after = parseBoard(BODY.replace('^c1 ^c2 ^c3', '^c3 ^c2 ^c1'))
    const before = parseBoard(BODY)
    const all = boardChanges(before, after, chapters)
    const moved = [...new Set(all.map((c) => c.cardId))]
    expect(moved.length).toBe(2)
    const [rejected, applied] = moved
    const place = all.find((c) => c.kind === 'place' && c.cardId === applied)!
    const cur = applyBoardChange(before, place, after, chapters)
    const decided = [...all.filter((c) => c.cardId === rejected).map((c) => c.id), place.id, ...impliedChanges(place, all)]
    expect(left(cur, after, all, decided)).toEqual([])
  })

  it('a rejected new column takes the new places in it', () => {
    let after = addColumn(parseBoard(BODY), 'order', 'Dawn').board
    after = placeCard(after, 'order', 'c5', 'k6', 0, chapters)
    const all = boardChanges(parseBoard(BODY), after, chapters)
    expect(cascadeRejects(all.find((c) => c.kind === 'column-add')!, all)).toEqual(['place:order:c5:k6'])
  })

  it('a card that the author makes after the first decision is not a change of the proposal', () => {
    const before = parseBoard(BODY)
    const after = placeCard(parseBoard(BODY), 'order', 'c1', 'k4', 0, chapters)
    const all = boardChanges(before, after, chapters)
    const cur = addCard(before, 'order', 'k5', 'my card', chapters).board
    expect(left(cur, after, all, [])).toEqual(['place:order:c1:k4', 'unplace:order:c1:k5'])
  })

  it('a new card of the proposal does not take a card of the author with its id', () => {
    const before = parseBoard(BODY)
    const after = addCard(parseBoard(BODY), 'order', 'k4', 'the AI card', chapters).board
    const all = boardChanges(before, after, chapters)
    // The author makes c6 too, before the decision.
    let cur = addCard(before, 'order', 'k5', 'my card', chapters).board
    cur = applyBoardChange(cur, all.find((c) => c.kind === 'place')!, after, chapters)
    expect(cur.cards.map((c) => c.text)).toContain('my card')
    expect(cur.cards.map((c) => c.text)).toContain('the AI card')
    expect(ids(cur, 'order', 'k5')).toContain('c6')
  })

  it('new ids of a proposal keep away from the ids of the line now', () => {
    const b = parseBoard('# Cards\n- a new card', ['c1', 'c5'])
    expect(b.cards[0].id).toBe('c6')
  })
})

describe('fixes from the review', () => {
  it('does not hang on a long line of ids with a word at its end', () => {
    const refs = Array.from({ length: 40 }, (_, i) => `^c${i + 1}`).join(' ')
    const start = Date.now()
    parseBoard(`# Cards\n- ^c1 a\n\n# By order\n## Night ^k1\n${refs}.`)
    parseBoard(`# Cards\n- ^c1 a\n\n# By order\n## Night ^k1\n${refs} (flashback)`)
    expect(Date.now() - start).toBeLessThan(200)
  })

  it('reads an id of a card that comes later in the body', () => {
    const b = parseBoard('# By chapter\n## The Storm ^k1\n^c1 ^c2\n\n# By order\n## Night ^k2\n^c2 ^c1\n## Morning ^k3\n- ^c2 Two\n\n# Cards\n- ^c1 One')
    expect(b.cards.map((c) => [c.id, c.text])).toEqual([
      ['c1', 'One'],
      ['c2', 'Two']
    ])
    expect(ids(b, 'chapter', 'ch:ch1')).toEqual(['c1', 'c2'])
    expect(ids(b, 'order', 'k2')).toEqual(['c2', 'c1'])
    expect(ids(b, 'order', 'k3')).toEqual([])
  })

  it('keeps two chapters with one title apart', () => {
    const twins = [
      { id: 'a', title: 'Chapter Three', file: 'Chapter Three.md' },
      { id: 'b', title: 'Chapter Three', file: 'Chapter Three (2).md' }
    ]
    let b = addCard(parseBoard(''), 'chapter', 'ch:a', 'one', twins).board
    b = addCard(b, 'chapter', 'ch:b', 'two', twins).board
    const cols = boardView(b, 'chapter', twins)
    expect(cols.map((c) => [c.key, c.cards.map((x) => x.text)])).toEqual([
      ['ch:a', ['one']],
      ['ch:b', ['two']]
    ])
    // The second one is written with its file name, which is unique.
    expect(serializeBoard(b, twins)).toContain('## Chapter Three (2) ^')
  })

  it('renames the column of one chapter, by its id', () => {
    const before = [...chapters]
    const after = [{ ...chapters[0], title: 'The Great Storm', file: 'The Great Storm.md' }, chapters[1]]
    const next = renameChapterInBody(BODY, 'ch1', before, after)
    expect(next).toContain('## The Great Storm ^k1')
    expect(next.replace('The Great Storm', 'The Storm')).toBe(BODY)
  })

  it('keeps an arrow in the text of a card of the new format', () => {
    const b = parseBoard('# Cards\n- ^c1 reads the map -> [[Old Map]]\n\n# By order\n## Night ^k1\n^c1')
    expect(b.cards[0].text).toBe('reads the map -> [[Old Map]]')
    expect(b.chapters).toEqual([])
  })

  it('shows a deleted card of the tray', () => {
    const after = deleteCard(parseBoard(BODY), 'c5')
    const tray = reviewView(parseBoard(BODY), after, 'order', chapters, boardChanges(parseBoard(BODY), after, chapters)).find((c) => c.key === 'tray')
    expect(tray?.slots.map((c) => [c.card.id, c.tone, c.changes])).toEqual([['c5', 'remove', ['delete:c5']]])
  })

  it('is fast with many chapters', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: `x${i}`, title: `Chapter ${i}`, file: `Chapter ${i}.md` }))
    const body = ['# Cards', ...many.map((_, i) => `- ^c${i + 1} card ${i}`), '', '# By chapter', ...many.flatMap((c, i) => [`## ${c.title} ^k${i + 1}`, `^c${i + 1}`])].join('\n')
    const b = parseBoard(body)
    const start = Date.now()
    for (let i = 0; i < 5; i++) {
      boardView(b, 'chapter', many)
      serializeBoard(b, many)
    }
    expect(Date.now() - start).toBeLessThan(150)
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

  it('marks the names of notes that a text has without @', () => {
    const notes = [entry('Elias'), entry('Marta'), entry('Farol de Santa Ilha', ['o farol']), entry('Ana'), entry('Ana Lúcia')]
    expect(linkMentions('Elias leva Marta ao @Farol de Santa Ilha, e Ana Lúcia espera.', notes)).toBe('@Elias leva @Marta ao @Farol de Santa Ilha, e @Ana Lúcia espera.')
    // Not inside a word, not two times, and an alias in small letters stays as it is.
    expect(linkMentions('Martas e @Elias voltam para o farol.', notes)).toBe('Martas e @Elias voltam para o farol.')
    expect(linkMentions('elias', notes)).toBe('elias')
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
