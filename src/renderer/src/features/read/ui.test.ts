import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorComment } from '@shared/comments'

vi.mock('@/lib/api', () => ({
  invoke: () => Promise.resolve(),
  on: () => () => {}
}))

// The local storage of the app: the "Hide" choice of each book.
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v) })

const store = await import('./store')
const ui = await import('./ui')
const { useCommentMarks } = await import('./marks')
const { useApp } = await import('@/stores/app')
const { useUi } = await import('@/stores/ui')
const { useBook } = await import('@/stores/book')

const ROOT = '/books/santa-ilha'
const NOW = '2026-10-21T10:00:00.000Z'
const setUi = vi.fn()

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

/** The book opens again with the comments that it has now */
function reopen(): void {
  const list = store.useComments.getState().list
  store.loadComments(null, [])
  store.loadComments(ROOT, list)
}

beforeEach(() => {
  memory.clear()
  setUi.mockClear()
  useUi.setState({ toasts: [] })
  // The chapter list is closed: no page to measure in these tests.
  useApp.setState({ settings: { ui: { sidebarOpen: false, chatOpen: true } } as never, setUi })
  useBook.setState({ root: null, chapters: [] })
  store.loadComments(null, [])
})

describe('the room for the margin', () => {
  it('a book that opens with open comments keeps room for them; a book without them does not', () => {
    store.loadComments(ROOT, [comment()])
    expect(ui.useReadUi.getState()).toMatchObject({ root: ROOT, room: true, hidden: false })
    store.loadComments('/books/b', [comment({ state: 'done' })])
    expect(ui.useReadUi.getState()).toMatchObject({ root: '/books/b', room: false, hidden: false })
  })

  it('closing the last open comment gives the room back, and its Undo takes the room again', () => {
    store.loadComments(ROOT, [comment({ id: 'cm_a' }), comment({ id: 'cm_b', key: '1' })])
    ui.useReadUi.setState({ roomTaken: { sidebarWasOpen: true } })
    ui.decideComments(['cm_a'], 'done')
    // A comment is still open: the room stays.
    expect(ui.useReadUi.getState().room).toBe(true)
    ui.decideComments(['cm_b'], 'ignored')
    expect(ui.useReadUi.getState().room).toBe(false)
    // The read had closed the chapter list: it opens again.
    expect(setUi).toHaveBeenCalledWith({ sidebarOpen: true })
    useUi.getState().toasts.at(-1)?.action?.run()
    expect(store.useComments.getState().list.find((c) => c.id === 'cm_b')?.state).toBe('open')
    expect(ui.useReadUi.getState()).toMatchObject({ room: true, hidden: false })
  })

  it('the Undo of a close that kept the room changes nothing in the layout', () => {
    store.loadComments(ROOT, [comment({ id: 'cm_a' }), comment({ id: 'cm_b', key: '1' })])
    ui.decideComments(['cm_a'], 'done')
    ui.hideComments()
    useUi.getState().toasts[0].action?.run()
    expect(ui.useReadUi.getState()).toMatchObject({ room: false, hidden: true })
  })

  it('"Hide" takes the cards and the marks away and is kept for the book; "Show" puts them back', () => {
    store.loadComments(ROOT, [comment()])
    ui.hideComments()
    expect(ui.useReadUi.getState()).toMatchObject({ hidden: true, room: false })
    expect(useCommentMarks.getState().hidden).toBe(true)
    reopen()
    expect(ui.useReadUi.getState()).toMatchObject({ hidden: true, room: false })
    expect(useCommentMarks.getState().hidden).toBe(true)
    ui.makeRoomForComments()
    expect(ui.useReadUi.getState()).toMatchObject({ hidden: false, room: true })
    expect(useCommentMarks.getState().hidden).toBe(false)
    reopen()
    expect(ui.useReadUi.getState()).toMatchObject({ hidden: false, room: true })
  })

  it('makes room with one change of the panels', () => {
    store.loadComments(ROOT, [comment()])
    ui.makeRoomForComments({ chatOpen: true })
    expect(setUi).toHaveBeenCalledTimes(1)
    expect(setUi).toHaveBeenCalledWith({ chatOpen: true })
  })
})

describe('the decisions of the author', () => {
  it('a comments file of a newer Wordelia: a decision changes nothing', () => {
    store.loadComments(ROOT, [comment()], 2)
    useUi.setState({ toasts: [] })
    ui.decideComments(['cm_aaaaaaaa'], 'done')
    expect(store.useComments.getState().list[0].state).toBe('open')
    expect(useUi.getState().toasts).toEqual([])
  })

  it('a comment of a chapter that is not in the book does not count: it never shows', () => {
    const chapter = { id: 'ch_one', file: 'A Tempestade.md', title: 'A Tempestade', body: '', meta: {} }
    useBook.setState({ root: ROOT, chapters: [chapter] })
    // A sync brought back a comment of a deleted chapter.
    const list = [comment({ id: 'cm_a' }), comment({ id: 'cm_gone', key: '1', chapterId: 'ch_deleted' })]
    store.loadComments(ROOT, list)
    expect(ui.openInBook(store.useComments.getState().list, [chapter]).map((c) => c.id)).toEqual(['cm_a'])
    ui.decideComments(['cm_a'], 'done')
    // The last comment that shows is closed: the room goes back. The other comment stays in the file.
    expect(ui.useReadUi.getState().room).toBe(false)
    expect(store.useComments.getState().list.map((c) => c.id)).toEqual(['cm_a', 'cm_gone'])
  })
})

describe('the revision list', () => {
  it('shows the comments of the chapters of the book in all their states, and no comment of a chapter that is not in the book', () => {
    const chapter = { id: 'ch_one', file: 'A Tempestade.md', title: 'A Tempestade', body: '', meta: {} }
    const list = [comment({ id: 'cm_a' }), comment({ id: 'cm_done', key: '1', state: 'done' }), comment({ id: 'cm_gone', key: '2', chapterId: 'ch_deleted' })]
    expect(ui.inBook(list, [chapter]).map((c) => c.id)).toEqual(['cm_a', 'cm_done'])
    expect(ui.openInBook(list, [chapter]).map((c) => c.id)).toEqual(['cm_a'])
  })

  it('closes when another book opens', () => {
    useUi.getState().setRevisionOpen(true)
    expect(useUi.getState().revisionOpen).toBe(true)
    useUi.getState().resetForBook()
    expect(useUi.getState().revisionOpen).toBe(false)
  })
})
