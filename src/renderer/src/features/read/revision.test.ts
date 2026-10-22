import { describe, expect, it } from 'vitest'
import type { EditorComment } from '@shared/comments'
import type { Chapter } from '@shared/types'
import { revisionCounts, revisionGroups } from './revision'

const NOW = '2026-10-21T10:00:00.000Z'

const chapter = (id: string, title: string): Chapter => ({ id, file: `${title}.md`, title, body: '', meta: {} })
const CHAPTERS = [chapter('ch_one', 'A Tempestade'), chapter('ch_two', 'O Visitante')]

function comment(over: Partial<EditorComment> = {}): EditorComment {
  return {
    id: 'cm_aaaaaaaa',
    chapterId: 'ch_one',
    lens: 'style',
    rank: 1,
    text: 'Three sentences open the same way.',
    passage: 'Elias acendeu o farol',
    sources: [],
    state: 'open',
    threadId: 'th_read',
    messageId: 'msg_read',
    key: '0',
    createdAt: NOW,
    updatedAt: NOW,
    ...over
  }
}

const LIST = [
  comment({ id: 'cm_b1', chapterId: 'ch_two', lens: 'continuity', state: 'intentional', reason: 'Elias mente para Marta' }),
  comment({ id: 'cm_a2', lens: 'structure', state: 'done' }),
  comment({ id: 'cm_a1', lens: 'style' }),
  comment({ id: 'cm_a3', lens: 'continuity' }),
  comment({ id: 'cm_b2', chapterId: 'ch_two', lens: 'reader', state: 'ignored' }),
  comment({ id: 'cm_a4', lens: 'proofread', state: 'open' })
]

/** The place of each passage in its chapter (the test gives it by id). */
const PLACES: Record<string, number> = { cm_a1: 30, cm_a2: 5, cm_a3: 10, cm_a4: 50, cm_b1: 7, cm_b2: 3 }
const place = (c: EditorComment): number | null => PLACES[c.id] ?? null

describe('the counts of the filters', () => {
  it('count each lens and each state; each filter counts the comments that the other filter lets through', () => {
    const all = revisionCounts(LIST, { lens: 'all', state: 'all' })
    expect(all.lens).toEqual({ all: 6, structure: 1, reader: 1, style: 1, continuity: 2, proofread: 1 })
    expect(all.state).toEqual({ all: 6, open: 3, done: 1, ignored: 1, intentional: 1 })
    const continuity = revisionCounts(LIST, { lens: 'continuity', state: 'open' })
    // The lens counts are of the open comments; the state counts are of the continuity comments.
    expect(continuity.lens).toEqual({ all: 3, structure: 0, reader: 0, style: 1, continuity: 1, proofread: 1 })
    expect(continuity.state).toEqual({ all: 2, open: 1, done: 0, ignored: 0, intentional: 1 })
  })
})

describe('the groups of the list', () => {
  it('one group for each chapter with comments, in book order; open comments first, then by their place in the text', () => {
    const groups = revisionGroups(LIST, CHAPTERS, { lens: 'all', state: 'all' }, place)
    expect(groups.map((g) => [g.chapter.id, g.number])).toEqual([
      ['ch_one', 1],
      ['ch_two', 2]
    ])
    expect(groups[0].rows.map((c) => c.id)).toEqual(['cm_a3', 'cm_a1', 'cm_a4', 'cm_a2'])
    expect(groups[1].rows.map((c) => c.id)).toEqual(['cm_b1', 'cm_b2'])
  })

  it('a comment without a place in the text comes after the others of its state', () => {
    const groups = revisionGroups(LIST, CHAPTERS, { lens: 'all', state: 'open' }, (c) => (c.id === 'cm_a3' ? null : place(c)))
    expect(groups[0].rows.map((c) => c.id)).toEqual(['cm_a1', 'cm_a4', 'cm_a3'])
  })

  it('the filters choose the rows; a chapter without rows has no group', () => {
    const groups = revisionGroups(LIST, CHAPTERS, { lens: 'continuity', state: 'intentional' }, place)
    expect(groups.map((g) => g.chapter.id)).toEqual(['ch_two'])
    expect(groups[0].rows.map((c) => c.id)).toEqual(['cm_b1'])
  })

  it('the header of a chapter counts its comments of each state, in the lens of the filter', () => {
    const [one, two] = revisionGroups(LIST, CHAPTERS, { lens: 'all', state: 'open' }, place)
    expect(one.counts).toEqual({ open: 3, done: 1, ignored: 0, intentional: 0 })
    expect(two).toBeUndefined()
    const [only] = revisionGroups(LIST, CHAPTERS, { lens: 'continuity', state: 'all' }, place)
    expect(only.counts).toEqual({ open: 1, done: 0, ignored: 0, intentional: 0 })
  })

  it('a comment of a chapter that is not in the book has no group', () => {
    const groups = revisionGroups([...LIST, comment({ id: 'cm_gone', chapterId: 'ch_deleted' })], CHAPTERS, { lens: 'all', state: 'all' }, place)
    expect(groups.flatMap((g) => g.rows.map((c) => c.id))).not.toContain('cm_gone')
  })
})
