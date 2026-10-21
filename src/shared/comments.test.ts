import { describe, expect, it } from 'vitest'
import {
  LENSES,
  READ_LIMIT_ALL,
  READ_LIMIT_ONE,
  isLens,
  openCount,
  parseCommentsFile,
  readCommentsFile,
  serializeComments,
  type EditorComment
} from './comments'

function comment(over: Partial<EditorComment> = {}): EditorComment {
  return {
    id: 'cm_aaaaaaaa',
    chapterId: 'ch_one',
    lens: 'structure',
    rank: 1,
    text: 'The storm arrives too early.',
    passage: 'The first wave hit the pier.',
    sources: [{ file: 'manuscript/The Storm.md', quote: 'The first wave hit the pier.' }],
    state: 'open',
    threadId: 'th_read',
    messageId: 'msg_read',
    key: '0',
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    ...over
  }
}

describe('lenses and limits', () => {
  it('lists the five lenses in order', () => {
    expect(LENSES).toEqual(['structure', 'reader', 'style', 'continuity', 'proofread'])
  })

  it('knows a lens when it sees one', () => {
    expect(isLens('style')).toBe(true)
    expect(isLens('plot')).toBe(false)
    expect(isLens('all')).toBe(false)
    expect(isLens(undefined)).toBe(false)
  })

  it('limits a read to 7 comments for all lenses and 5 for one lens', () => {
    expect(READ_LIMIT_ALL).toBe(7)
    expect(READ_LIMIT_ONE).toBe(5)
  })
})

describe('parseCommentsFile', () => {
  it('gives an empty list for a missing file and for text that is not JSON', () => {
    expect(parseCommentsFile(null)).toEqual([])
    expect(parseCommentsFile('not json')).toEqual([])
  })

  it('gives an empty list for JSON of another shape', () => {
    expect(parseCommentsFile('42')).toEqual([])
    expect(parseCommentsFile('{"version":1}')).toEqual([])
    expect(parseCommentsFile('{"version":1,"comments":"x"}')).toEqual([])
  })

  it('drops a comment with an unknown lens and keeps the valid one', () => {
    const good = comment()
    const text = JSON.stringify({ version: 1, comments: [good, { ...comment({ id: 'cm_bbbbbbbb' }), lens: 'plot' }] })
    expect(parseCommentsFile(text)).toEqual([good])
  })

  it('drops items that are not comments', () => {
    const good = comment()
    const text = JSON.stringify({
      version: 1,
      comments: [null, 'text', 7, [], { id: 'cm_x' }, { ...good, state: 'closed' }, { ...good, id: '' }, { ...good, rank: 'first' }, good]
    })
    expect(parseCommentsFile(text)).toEqual([good])
  })

  it('keeps the reason and the lost mark, and drops bad sources only', () => {
    const c = comment({ lens: 'continuity', state: 'intentional', reason: 'Elias lies to Marta', lost: true })
    const text = JSON.stringify({ version: 1, comments: [{ ...c, sources: [...c.sources, { file: 'planning/Notes/Elias.md' }, 'x'] }] })
    expect(parseCommentsFile(text)).toEqual([c])
  })

  it('reads a file with Windows line ends', () => {
    const list = [comment(), comment({ id: 'cm_bbbbbbbb', lens: 'proofread' })]
    expect(parseCommentsFile(serializeComments(list).replace(/\n/g, '\r\n'))).toEqual(list)
  })
})

describe('the text of the file', () => {
  it('a byte order mark at the start is not damage', () => {
    const list = [comment()]
    expect(parseCommentsFile('\uFEFF' + serializeComments(list))).toEqual(list)
    expect(readCommentsFile('\uFEFF' + serializeComments(list)).valid).toBe(true)
  })

  it('when two comments have the same id, the first one wins', () => {
    const first = comment({ text: 'First.' })
    const second = comment({ text: 'Second.' })
    const other = comment({ id: 'cm_bbbbbbbb' })
    expect(parseCommentsFile(JSON.stringify({ version: 1, comments: [first, other, second] }))).toEqual([first, other])
  })

  it('tells the version of the file', () => {
    expect(readCommentsFile(serializeComments([comment()])).version).toBe(1)
    expect(readCommentsFile(JSON.stringify({ version: 2, comments: [comment()] }))).toMatchObject({ version: 2, valid: true, comments: [comment()] })
    // No version, a missing file and a bad version are version 1.
    expect(readCommentsFile(JSON.stringify({ comments: [] })).version).toBe(1)
    expect(readCommentsFile(null).version).toBe(1)
    expect(readCommentsFile(JSON.stringify({ version: 'two', comments: [] })).version).toBe(1)
  })

  it('tells a file with no comments from a text that is not a comments file', () => {
    expect(readCommentsFile(null)).toEqual({ comments: [], version: 1, valid: true })
    expect(readCommentsFile(serializeComments([]))).toEqual({ comments: [], version: 1, valid: true })
    // A partial write of a sync client, and JSON of another shape.
    expect(readCommentsFile(serializeComments([comment()]).slice(0, 80)).valid).toBe(false)
    expect(readCommentsFile('').valid).toBe(false)
    expect(readCommentsFile('{"version":1}').valid).toBe(false)
    expect(readCommentsFile('42').valid).toBe(false)
  })

  it('tells the version of a file with another shape, so a newer file is not taken for version 1', () => {
    expect(readCommentsFile('{"version":2,"items":[]}')).toEqual({ comments: [], version: 2, valid: false })
    expect(readCommentsFile('{"version":3,"comments":{"a":1}}')).toEqual({ comments: [], version: 3, valid: false })
    // No version, a bad version and text that is not an object are version 1.
    expect(readCommentsFile('{"items":[]}')).toEqual({ comments: [], version: 1, valid: false })
    expect(readCommentsFile('{"version":"2","items":[]}').version).toBe(1)
    expect(readCommentsFile('[2]').version).toBe(1)
    expect(readCommentsFile('{"version":2,"items"').version).toBe(1)
  })
})

describe('serializeComments', () => {
  it('writes version 1 as 2-space JSON that ends with a line end', () => {
    const text = serializeComments([comment()])
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('"version": 1')
    expect(text).toContain('\n  "comments": [')
    expect(JSON.parse(text)).toEqual({ version: 1, comments: [comment()] })
  })

  it('writes an empty list', () => {
    expect(JSON.parse(serializeComments([]))).toEqual({ version: 1, comments: [] })
  })

  it('round-trips through parseCommentsFile', () => {
    const list = [
      comment(),
      comment({ id: 'cm_bbbbbbbb', lens: 'continuity', state: 'intentional', reason: 'Elias lies to Marta', rank: 2 }),
      comment({ id: 'cm_cccccccc', lens: 'style', state: 'done', lost: true, sources: [], rank: 3 })
    ]
    expect(parseCommentsFile(serializeComments(list))).toEqual(list)
  })
})

describe('openCount', () => {
  const list = [
    comment({ id: 'a', chapterId: 'ch_one' }),
    comment({ id: 'b', chapterId: 'ch_one', state: 'done' }),
    comment({ id: 'c', chapterId: 'ch_one', state: 'ignored' }),
    comment({ id: 'd', chapterId: 'ch_one', state: 'intentional' }),
    comment({ id: 'e', chapterId: 'ch_one', lost: true }),
    comment({ id: 'f', chapterId: 'ch_two' }),
    comment({ id: 'g', chapterId: 'ch_two' })
  ]

  it('counts the open comments that are not lost', () => {
    expect(openCount(list)).toBe(3)
  })

  it('counts the comments of one chapter when it gets a chapter id', () => {
    expect(openCount(list, 'ch_one')).toBe(1)
    expect(openCount(list, 'ch_two')).toBe(2)
    expect(openCount(list, 'ch_none')).toBe(0)
  })

  it('counts nothing for an empty list', () => {
    expect(openCount([])).toBe(0)
  })
})
