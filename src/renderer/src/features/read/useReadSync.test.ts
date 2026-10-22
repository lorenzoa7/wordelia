import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorComment } from '@shared/comments'
import type { ChatMessage, Chapter, Thread } from '@shared/types'

vi.mock('@/lib/api', () => ({
  invoke: () => Promise.resolve(),
  on: () => () => {}
}))

const { makeThrottle, readBefore, startReadSync, STREAM_PARSE_MS } = await import('./useReadSync')
const { commentsChangedOutside, loadComments, useComments } = await import('./store')
const { decideComments, useReadUi } = await import('./ui')
const { useBook } = await import('@/stores/book')
const { useChat } = await import('@/features/chat/chatStore')
const { useUi } = await import('@/stores/ui')
const { getT } = await import('@/lib/i18n')

const ROOT = '/books/santa-ilha'
const NOW = '2026-10-21T10:00:00.000Z'

const CHAPTER = ['Elias acendeu o farol antes da tempestade.', 'Marta olhou o mar e não disse nada.', 'O visitante dormiu por dois dias.'].join('\n\n')

const chapter = (id: string, title: string): Chapter => ({ id, file: `${title}.md`, title, body: CHAPTER, meta: {} })

function note(rank: number, find: string): string {
  return `<note lens="style" rank="${rank}">\n<find>${find}</find>\n<text>Comment ${rank}.</text>\n</note>`
}

function asked(id = 'm_ask'): ChatMessage {
  return { id, role: 'user', content: 'Read the chapter.', createdAt: NOW, read: { chapterId: 'ch_one', lens: 'all', inProgress: false } }
}

function reply(content: string, id = 'm_reply'): ChatMessage {
  return { id, role: 'assistant', content, createdAt: NOW }
}

function thread(messages: ChatMessage[], over: Partial<Thread> = {}): Thread {
  return { id: 'th_read', title: 'Read · A Tempestade', brief: '', digest: '', digestedCount: 0, createdAt: NOW, updatedAt: NOW, pinned: false, route: null, readChapterId: 'ch_one', messages, ...over }
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
    messageId: 'm_old',
    key: '0',
    createdAt: NOW,
    updatedAt: NOW,
    ...over
  }
}

/** A reply in progress, as `requestReply` puts it in the chat store. */
function stream(text: string, threadId = 'th_read', messageId = 'm_stream'): void {
  useChat.setState({ streaming: { [threadId]: { messageId, text, requestId: 'r1', cancel: () => {} } } })
}

const list = (): EditorComment[] => useComments.getState().list
let stop: (() => void) | null = null

beforeEach(() => {
  vi.useFakeTimers()
  useUi.setState({ toasts: [] })
  useChat.setState({ streaming: {} })
  useBook.setState({ root: ROOT, chapters: [chapter('ch_one', 'A Tempestade'), chapter('ch_two', 'O Visitante')], threads: [] })
  loadComments(ROOT, [])
})

afterEach(() => {
  stop?.()
  stop = null
  vi.useRealTimers()
})

describe('makeThrottle', () => {
  it('runs the first call at once, and a call that comes too early waits and runs one time', () => {
    const t = makeThrottle(300)
    const calls: string[] = []
    t.call('a', () => calls.push('first'))
    t.call('a', () => calls.push('second'))
    t.call('a', () => calls.push('third'))
    expect(calls).toEqual(['first'])
    vi.advanceTimersByTime(299)
    expect(calls).toEqual(['first'])
    vi.advanceTimersByTime(1)
    // The last call wins: the state of that time is the one that counts.
    expect(calls).toEqual(['first', 'third'])
    // After the time, a call runs at once again.
    vi.advanceTimersByTime(300)
    t.call('a', () => calls.push('fourth'))
    expect(calls).toEqual(['first', 'third', 'fourth'])
  })

  it('each key has its own time, and clear cancels what waits', () => {
    const t = makeThrottle(300)
    const calls: string[] = []
    t.call('a', () => calls.push('a1'))
    t.call('b', () => calls.push('b1'))
    t.call('a', () => calls.push('a2'))
    expect(calls).toEqual(['a1', 'b1'])
    t.clear()
    vi.advanceTimersByTime(1000)
    expect(calls).toEqual(['a1', 'b1'])
  })
})

describe('readBefore', () => {
  it('is the read of the message of the author before a reply', () => {
    const messages = [asked(), reply('x'), { ...asked('m_2'), read: undefined, content: 'Thanks.' }, reply('y', 'm_r2')]
    expect(readBefore(messages, 1)).toEqual({ chapterId: 'ch_one', lens: 'all', inProgress: false })
    // The message of the author, a reply to an ordinary message, and the first message: no read.
    expect(readBefore(messages, 0)).toBeUndefined()
    expect(readBefore(messages, 2)).toBeUndefined()
    expect(readBefore(messages, 3)).toBeUndefined()
  })
})

describe('comments from the saved replies of a read thread', () => {
  it('a reply that is in the thread when the book opens gives its comments', () => {
    useBook.setState({ threads: [thread([asked(), reply(`A letter.\n${note(1, 'Marta olhou o mar')}`)])] })
    stop = startReadSync()
    expect(list().map((c) => [c.chapterId, c.threadId, c.messageId, c.passage])).toEqual([['ch_one', 'th_read', 'm_reply', 'Marta olhou o mar']])
  })

  it('a reply that is saved later gives its comments, one time', () => {
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    expect(list()).toEqual([])
    const saved = thread([asked(), reply(`A letter.\n${note(1, 'Marta olhou o mar')}\n${note(2, 'dois dias')}`)])
    useBook.setState({ threads: [saved] })
    expect(list().map((c) => c.passage)).toEqual(['Marta olhou o mar', 'dois dias'])
    // The thread is saved again (a digest, a state of a proposal): no new comments.
    useBook.setState({ threads: [{ ...saved, digest: 'A digest.' }] })
    expect(list()).toHaveLength(2)
  })

  it('a reply to an ordinary message gives no comments, and a thread that is not of a read gives none', () => {
    const plain = { ...asked(), read: undefined, content: 'Thanks.' }
    useBook.setState({
      threads: [
        thread([plain, reply(note(1, 'Marta olhou o mar'))]),
        thread([asked(), reply(note(1, 'dois dias'))], { id: 'th_other', readChapterId: undefined })
      ]
    })
    stop = startReadSync()
    expect(list()).toEqual([])
  })

  it('a thread of a chapter that is gone gets no comments, and gets them when the chapter is back', () => {
    const saved = thread([asked(), reply(note(1, 'Marta olhou o mar'))])
    useBook.setState({ chapters: [chapter('ch_two', 'O Visitante')], threads: [saved] })
    stop = startReadSync()
    expect(list()).toEqual([])
    // The Undo of the delete brings the chapter back, and the thread is saved again.
    useBook.setState({ chapters: [chapter('ch_one', 'A Tempestade'), chapter('ch_two', 'O Visitante')], threads: [{ ...saved }] })
    expect(list().map((c) => c.passage)).toEqual(['Marta olhou o mar'])
  })

  it('a damaged comments file: the saved replies do not make the comments again over it', () => {
    loadComments(ROOT, [], 1, true)
    useBook.setState({ threads: [thread([asked(), reply(`A letter.\n${note(1, 'Marta olhou o mar')}`)])] })
    stop = startReadSync()
    expect(list()).toEqual([])
    // A reply that streams makes none either.
    stream(`A letter.\n${note(1, 'dois dias')}`)
    vi.advanceTimersByTime(1000)
    expect(list()).toEqual([])
  })

  it('a damaged comments file that the author deletes: the saved replies make the comments again', () => {
    loadComments(ROOT, [], 1, true)
    useBook.setState({ threads: [thread([asked(), reply(`A letter.\n${note(1, 'Marta olhou o mar')}`)])] })
    stop = startReadSync()
    commentsChangedOutside(ROOT, null)
    expect(list().map((c) => c.passage)).toEqual(['Marta olhou o mar'])
  })

  it('another book that opens after a damaged file does not get the comments of the replies of the first book', () => {
    loadComments(ROOT, [], 1, true)
    useBook.setState({ threads: [thread([asked(), reply(`A letter.\n${note(1, 'Marta olhou o mar')}`)])] })
    stop = startReadSync()
    // The comment store changes before the book store (useBook.open).
    loadComments('/books/other', [])
    expect(list()).toEqual([])
  })

  it('a book that opens with its own thread: the thread of another book is not used', () => {
    stop = startReadSync()
    // A reply streams for a thread that the open book does not have (the book changed meanwhile).
    stream(note(1, 'Marta olhou o mar'), 'th_closed_book')
    vi.advanceTimersByTime(1000)
    expect(list()).toEqual([])
  })
})

describe('comments from a reply that streams', () => {
  it('reads the reply at the first piece, then at most every 300 ms, and the last text is never lost', () => {
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    const first = `A letter.\n${note(1, 'Marta olhou o mar')}\n`
    stream(first)
    expect(list().map((c) => c.messageId)).toEqual(['m_stream'])
    // More text comes, too early: it waits.
    stream(`${first}${note(2, 'dois dias')}\n`)
    expect(list()).toHaveLength(1)
    vi.advanceTimersByTime(STREAM_PARSE_MS - 1)
    expect(list()).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(list().map((c) => c.passage)).toEqual(['Marta olhou o mar', 'dois dias'])
  })

  it('the saved reply adds what the last parse did not see, and the comments of the stream stay', () => {
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    const first = `A letter.\n${note(1, 'Marta olhou o mar')}\n`
    stream(first)
    stream(`${first}${note(2, 'dois dias')}\n`)
    expect(list()).toHaveLength(1)
    // The reply ends before the timer: it is saved, and the streaming state goes.
    useChat.setState({ streaming: {} })
    useBook.setState({ threads: [thread([asked(), reply(`${first}${note(2, 'dois dias')}\n`, 'm_stream')])] })
    expect(list().map((c) => [c.messageId, c.passage])).toEqual([
      ['m_stream', 'Marta olhou o mar'],
      ['m_stream', 'dois dias']
    ])
    vi.advanceTimersByTime(1000)
    expect(list()).toHaveLength(2)
  })

  it('a stream that stops keeps the comments that were complete', () => {
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    stream(`A letter.\n${note(1, 'Marta olhou o mar')}\n<note lens="style" rank="2">\n<find>dois dias</find>\n<te`)
    expect(list().map((c) => c.passage)).toEqual(['Marta olhou o mar'])
  })
})

describe('comments that look fixed', () => {
  const resolved = (ids: string): string => `<resolved ids="${ids}"/>`

  /** A reply that streams, ends and is saved, as in the app. */
  function finish(content: string): void {
    stream(content)
    useChat.setState({ streaming: {} })
    useBook.setState({ threads: [thread([asked(), reply(content, 'm_stream')])] })
  }

  it('asks the author, and "Mark as done" closes the comments', () => {
    loadComments(ROOT, [comment(), comment({ id: 'cm_open0002', passage: 'dois dias' }), comment({ id: 'cm_other001', chapterId: 'ch_two' }), comment({ id: 'cm_done0001', state: 'done' })])
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    // The AI names two open comments of this chapter, one of another chapter, one decided, and one that does not exist.
    finish(`Fixed.\n${resolved('cm_open0001 cm_open0002 cm_other001 cm_done0001 cm_nothing1')}`)
    const toasts = useUi.getState().toasts
    expect(toasts).toHaveLength(1)
    const t = getT()
    expect(toasts[0].message).toBe(t.read.resolved(2))
    expect(toasts[0].action?.label).toBe(t.read.markDone(2))
    // Nothing closed before the author says yes.
    expect(list().filter((c) => c.state !== 'open').map((c) => c.id)).toEqual(['cm_done0001'])
    toasts[0].action?.run()
    expect(list().filter((c) => c.state === 'done').map((c) => c.id)).toEqual(['cm_open0001', 'cm_open0002', 'cm_done0001'])
    expect(list().find((c) => c.id === 'cm_other001')?.state).toBe('open')
  })

  it('"Mark as done" closes only the comments that are still open when the author clicks', () => {
    loadComments(ROOT, [comment(), comment({ id: 'cm_open0002', passage: 'dois dias' })])
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    finish(`Fixed.\n${resolved('cm_open0001 cm_open0002')}`)
    const [asking] = useUi.getState().toasts
    expect(asking.message).toBe(getT().read.resolved(2))
    // The author ignores one of them in the revision list before the click.
    decideComments(['cm_open0002'], 'ignored')
    asking.action?.run()
    expect(list().map((c) => [c.id, c.state])).toEqual([
      ['cm_open0001', 'done'],
      ['cm_open0002', 'ignored']
    ])
  })

  it('a reply that was not seen while it streamed does not ask (the book opens with an old reply)', () => {
    loadComments(ROOT, [comment()])
    useBook.setState({ threads: [thread([asked(), reply(`Fixed.\n${resolved('cm_open0001')}`)])] })
    stop = startReadSync()
    expect(useUi.getState().toasts).toEqual([])
  })

  it('asks one time for a reply', () => {
    loadComments(ROOT, [comment()])
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    finish(`Fixed.\n${resolved('cm_open0001')}`)
    useBook.setState({ threads: useBook.getState().threads.map((t) => ({ ...t, digest: 'A digest.' })) })
    expect(useUi.getState().toasts).toHaveLength(1)
  })

  it('a comments file of a newer Wordelia does not ask: its comments cannot change', () => {
    loadComments(ROOT, [comment()], 2)
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    finish(`Fixed.\n${resolved('cm_open0001')}`)
    expect(useUi.getState().toasts.filter((t) => t.message === getT().read.resolved(1))).toEqual([])
  })

  it('no open comment named: no toast', () => {
    loadComments(ROOT, [comment({ state: 'done' })])
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    finish(`Fixed.\n${resolved('cm_open0001')}`)
    expect(useUi.getState().toasts).toEqual([])
  })
})

describe('the sync stops', () => {
  it('after the stop function, a new reply gives no comments', () => {
    useBook.setState({ threads: [thread([asked()])] })
    startReadSync()()
    useBook.setState({ threads: [thread([asked(), reply(note(1, 'Marta olhou o mar'))])] })
    expect(list()).toEqual([])
  })

  it('a parse that waits does not run after the stop', () => {
    useBook.setState({ threads: [thread([asked()])] })
    const off = startReadSync()
    const first = `A letter.
${note(1, 'Marta olhou o mar')}
`
    stream(first)
    stream(`${first}${note(2, 'dois dias')}
`)
    off()
    vi.advanceTimersByTime(1000)
    expect(list().map((c) => c.passage)).toEqual(['Marta olhou o mar'])
  })
})

describe('a read reply that leaves its thread', () => {
  it('Retry, Rewind and Edit take the open comments of the removed replies away; the decided ones stay', async () => {
    const { truncateThread } = await import('@/features/chat/rewind')
    const first = reply(note(1, 'Marta olhou o mar'))
    const second = reply(note(1, 'dois dias'), 'm_reply2')
    useBook.setState({ threads: [thread([asked(), first, asked('m_ask2'), second])] })
    loadComments(ROOT, [
      comment({ id: 'cm_first01', messageId: first.id }),
      comment({ id: 'cm_first02', messageId: first.id, key: '1', state: 'ignored' }),
      comment({ id: 'cm_second1', messageId: second.id, state: 'done' }),
      comment({ id: 'cm_second2', messageId: second.id, key: '1', state: 'intentional', reason: 'Elias lies on purpose' })
    ])
    // Retry of the last reply: the thread keeps the first three messages.
    truncateThread('th_read', 3)
    expect(list().map((c) => c.id)).toEqual(['cm_first01', 'cm_first02', 'cm_second1', 'cm_second2'])
    // Rewind to the start.
    truncateThread('th_read', 0)
    expect(list().map((c) => c.id)).toEqual(['cm_first02', 'cm_second1', 'cm_second2'])
    // The new reply of the read gives its own comments; the decisions stay the memory of the chapter.
    stop = startReadSync()
    useBook.setState({ threads: [thread([asked('m_ask3'), reply(note(1, 'Marta olhou o mar'), 'm_reply3')])] })
    expect(list().map((c) => [c.messageId, c.state])).toEqual([
      ['m_reply', 'ignored'],
      ['m_reply2', 'done'],
      ['m_reply2', 'intentional'],
      ['m_reply3', 'open']
    ])
  })
})

describe('the room for the margin after a read', () => {
  /** A reply that streams, ends and is saved, as in the app. */
  function finish(message: ChatMessage): void {
    stream(message.content)
    useChat.setState({ streaming: {} })
    useBook.setState({ threads: [thread([asked(), message])] })
  }

  it('a read that ends with an error and no open comment gives the room back: the margin would be empty', () => {
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    useReadUi.setState({ room: true, roomTaken: { sidebarWasOpen: false } })
    finish({ ...reply('', 'm_stream'), error: 'Failed to authenticate' })
    expect(useReadUi.getState().room).toBe(false)
  })

  it('a read that ends with comments keeps the room', () => {
    useBook.setState({ threads: [thread([asked()])] })
    stop = startReadSync()
    useReadUi.setState({ room: true, roomTaken: { sidebarWasOpen: false } })
    finish(reply(`A letter.\n${note(1, 'Marta olhou o mar')}`, 'm_stream'))
    expect(list()).toHaveLength(1)
    expect(useReadUi.getState().room).toBe(true)
  })
})
