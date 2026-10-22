import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorComment } from '@shared/comments'
import type { ChatMessage, Thread } from '@shared/types'

const calls: Array<{ channel: string; root: string; rel: string }> = []

vi.mock('@/lib/api', () => ({
  invoke: (channel: string, root: string, rel: string) => {
    calls.push({ channel, root, rel })
    return Promise.resolve()
  },
  on: () => () => {}
}))

const { deleteThreadWithComments } = await import('./threads')
const { useBook } = await import('@/stores/book')
const { saver } = await import('@/stores/saver')
const { loadComments, useComments } = await import('@/features/read/store')

const BOOK_A = '/books/santa-ilha'
const BOOK_B = '/books/o-visitante'
const NOW = '2026-10-21T10:00:00.000Z'

const asked: ChatMessage = { id: 'm_ask', role: 'user', content: 'Read the chapter.', createdAt: NOW, read: { chapterId: 'ch_one', lens: 'all', inProgress: false } }
const answer: ChatMessage = { id: 'm_reply', role: 'assistant', content: 'A letter.', createdAt: NOW }
const readThread: Thread = {
  id: 'th_read',
  title: 'Leitura · A Tempestade',
  brief: '',
  digest: '',
  digestedCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
  pinned: false,
  route: null,
  readChapterId: 'ch_one',
  messages: [asked, answer]
}

function comment(over: Partial<EditorComment> = {}): EditorComment {
  return {
    id: 'cm_open0001',
    chapterId: 'ch_one',
    lens: 'style',
    rank: 1,
    text: 'Weak opening.',
    passage: 'Elias acendeu',
    sources: [],
    state: 'open',
    threadId: 'th_read',
    messageId: 'm_reply',
    key: '0',
    createdAt: NOW,
    updatedAt: NOW,
    ...over
  }
}

const ids = (): string[] => useComments.getState().list.map((c) => c.id)

describe('the delete of a read thread', () => {
  beforeEach(async () => {
    await saver.flush()
    loadComments(BOOK_A, [comment(), comment({ id: 'cm_done0001', key: '1', state: 'done' })])
    useBook.setState({ root: BOOK_A, threads: [readThread] })
    calls.length = 0
  })

  it('takes the thread and its open comments away; the decided comments stay; Undo brings them back', async () => {
    const { thread, undo } = await deleteThreadWithComments(readThread)
    expect(thread).toBe(readThread)
    expect(useBook.getState().threads).toEqual([])
    expect(ids()).toEqual(['cm_done0001'])
    expect(await undo()).toBe(true)
    expect(useBook.getState().threads.map((t) => t.id)).toEqual(['th_read'])
    expect(ids()).toEqual(['cm_done0001', 'cm_open0001'])
  })

  it('the Undo after a book switch does nothing in the other book', async () => {
    const { undo } = await deleteThreadWithComments(readThread)
    await saver.flush()
    calls.length = 0
    // Another book opens (useBook.open: the comment store first, then the book store).
    loadComments(BOOK_B, [])
    useBook.setState({ root: BOOK_B, threads: [] })
    const back = await undo()
    // The thread and the comments of book A never go into book B: not in memory, not on disk.
    expect(useBook.getState().threads).toEqual([])
    expect(useComments.getState()).toMatchObject({ root: BOOK_B, list: [] })
    await saver.flush()
    expect(calls).toEqual([])
    expect(back).toBe(false)
  })
})
