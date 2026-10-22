import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newManifest } from '@shared/book'
import type { EditorComment } from '@shared/comments'
import type { AppSettings, Chapter, ChatMessage, Thread } from '@shared/types'

interface Completion {
  system: string
  messages: Array<{ role: string; content: string }>
}
const completions: Completion[] = []

vi.mock('@/lib/api', () => ({
  invoke: () => Promise.resolve(),
  on: () => () => {}
}))
vi.mock('@/lib/ai', () => ({
  runCompletion: (req: Completion) => {
    completions.push(req)
    return { id: `r${completions.length}`, cancel: () => {}, done: Promise.resolve({ ok: true, text: 'A letter.', model: 'opus' }) }
  },
  describeError: () => ({ message: 'Failed.', kind: 'unknown' })
}))
vi.mock('@/features/chat/summaries', () => ({ summariesFor: async () => ({}) }))
vi.mock('@/features/chat/portraits', () => ({ portraitImages: async () => [] }))
vi.mock('@/features/chat/digest', () => ({ afterReply: async () => {} }))
vi.mock('@/features/chat/rewind', () => ({ confirmAndRewind: async () => true }))
vi.mock('@/features/editor/registry', () => ({ flushEditor: () => {} }))

const { bookTarget, chapterName, isLastChapter, readTarget, readThreadFor, startRead } = await import('./start')
const { sendInThread } = await import('@/features/chat/send')
const { loadComments } = await import('./store')
const { useApp } = await import('@/stores/app')
const { useBook } = await import('@/stores/book')
const { useChat, draftKey } = await import('@/features/chat/chatStore')
const { useUi } = await import('@/stores/ui')
const { getT } = await import('@/lib/i18n')

const ROOT = '/books/santa-ilha'
const NOW = '2026-10-21T10:00:00.000Z'
const READ = { chapterId: 'ch_one', lens: 'all', inProgress: false } as const

const chapter = (id: string, title: string, body: string): Chapter => ({ id, file: `${title}.md`, title, body, meta: {} })

function comment(over: Partial<EditorComment>): EditorComment {
  return {
    id: 'cm_aaaaaaaa',
    chapterId: 'ch_one',
    lens: 'style',
    rank: 1,
    text: 'Weak opening.',
    passage: 'Elias acendeu',
    sources: [],
    state: 'open',
    threadId: 'th_x',
    messageId: 'm_x',
    key: '0',
    createdAt: NOW,
    updatedAt: NOW,
    ...over
  }
}

function plainThread(over: Partial<Thread> = {}): Thread {
  return { id: 'th_plain', title: 'Ideas', brief: '', digest: '', digestedCount: 0, createdAt: NOW, updatedAt: NOW, pinned: false, route: null, messages: [], ...over }
}

const setUi = vi.fn()

/** The settings that the chat needs: a model for the chat, and the chat panel open or closed. */
function settings(over: { chat?: boolean; chatOpen?: boolean } = {}): void {
  useApp.setState({
    settings: {
      language: 'en',
      ui: { chatOpen: over.chatOpen ?? true },
      routes: { chat: over.chat === false ? null : { provider: 'claude-code', model: 'opus' } }
    } as unknown as AppSettings,
    setUi
  })
}

const readThreads = (): Thread[] => useBook.getState().threads.filter((t) => t.readChapterId)

beforeEach(() => {
  completions.length = 0
  setUi.mockClear()
  settings()
  useUi.setState({ toasts: [] })
  useChat.setState({ activeThreadId: null, blank: null, kept: {}, listOpen: false, streaming: {}, drafts: {}, draft: '', draftDoc: null, quotes: [], mentions: [], images: [] })
  useBook.setState({
    root: ROOT,
    manifest: newManifest({ title: 'O Farol de Santa Ilha', author: 'Ana', language: 'pt-BR' }),
    chapters: [chapter('ch_one', 'A Tempestade', 'Elias acendeu a lâmpada do farol.\n\nMarta olhou o mar.'), chapter('ch_two', 'O Visitante', 'O homem do bote azul dormiu por dois dias.')],
    activeChapterId: 'ch_two',
    threads: []
  })
  loadComments(ROOT, [])
})

describe('the thread of the reads of a chapter', () => {
  it('is a new thread "Read · <title>" for the chapter, and the thread of the book once it has one', () => {
    const t = readThreadFor('ch_one')
    expect(t.title).toBe(getT().read.threadTitle('A Tempestade'))
    expect(t.readChapterId).toBe('ch_one')
    expect(t.messages).toEqual([])
    // It is not in the book yet: its first message saves it.
    expect(useBook.getState().threads).toEqual([])
    const saved = plainThread({ id: 'th_saved', readChapterId: 'ch_one', title: 'My own title' })
    useBook.setState({ threads: [plainThread(), saved] })
    expect(readThreadFor('ch_one')).toBe(saved)
    expect(readThreadFor('ch_two').readChapterId).toBe('ch_two')
  })

  it('names a chapter without a title', () => {
    expect(chapterName('  ')).toBe(getT().common.untitled)
    expect(chapterName(' A Tempestade ')).toBe('A Tempestade')
  })

  it('the last chapter of the book is the one in progress', () => {
    expect(isLastChapter('ch_two')).toBe(true)
    expect(isLastChapter('ch_one')).toBe(false)
  })
})

describe('startRead', () => {
  it('sends the message of the read in the new thread of the chapter, and the AI answers in it', async () => {
    await startRead(READ)
    const [thread] = readThreads()
    expect(readThreads()).toHaveLength(1)
    expect(thread.title).toBe(getT().read.threadTitle('A Tempestade'))
    expect(thread.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(thread.messages[0].content).toBe(getT().read.ask('A Tempestade', 'all', { selection: false, inProgress: false }))
    expect(thread.messages[0].read).toEqual(READ)
    expect(thread.messages[1].content).toBe('A letter.')
    // The chat shows this thread: no new thread is waiting.
    expect(useChat.getState().activeThreadId).toBe(thread.id)
    expect(useChat.getState().blank).toBeNull()
    expect(useChat.getState().streaming[thread.id]).toBeUndefined()
  })

  it('the next read of the chapter goes to the same thread', async () => {
    await startRead(READ)
    await startRead({ ...READ, lens: 'style', inProgress: true })
    expect(readThreads()).toHaveLength(1)
    const messages = readThreads()[0].messages
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
    expect(messages[2].read).toEqual({ ...READ, lens: 'style', inProgress: true })
    expect(messages[2].content).toBe(getT().read.ask('A Tempestade', 'style', { selection: false, inProgress: true }))
  })

  it('shows the thread of the chapter when the author is in another thread', async () => {
    await startRead(READ)
    const [thread] = readThreads()
    useBook.setState({ threads: [plainThread(), ...useBook.getState().threads] })
    useChat.getState().setActiveThread('th_plain')
    await startRead(READ)
    expect(useChat.getState().activeThreadId).toBe(thread.id)
    expect(useChat.getState().blank).toBeNull()
    expect(readThreads()[0].messages).toHaveLength(4)
  })

  it('does nothing while the thread has a reply in progress: no message, no request, and the chat stays as it is', async () => {
    await startRead(READ)
    const [thread] = readThreads()
    useBook.setState({ threads: [plainThread(), ...useBook.getState().threads] })
    useChat.getState().setActiveThread('th_plain')
    useChat.setState({ streaming: { [thread.id]: { messageId: 'm_live', text: 'A let', requestId: 'r1', cancel: () => {} } } })
    settings({ chatOpen: false })
    const before = completions.length
    await startRead(READ)
    expect(readThreads()[0].messages).toHaveLength(2)
    expect(completions).toHaveLength(before)
    expect(useChat.getState().activeThreadId).toBe('th_plain')
    expect(setUi).not.toHaveBeenCalled()
  })

  it('a selection of spaces is no selection, and a selection is trimmed', async () => {
    await startRead({ ...READ, selection: { text: '  \n\n ' } })
    await startRead({ ...READ, selection: { text: '\n Marta olhou o mar.  \n\n' } })
    const asked = readThreads()[0].messages.filter((m) => m.role === 'user')
    expect(asked[0].read).toEqual(READ)
    expect(asked[0].content).toBe(getT().read.ask('A Tempestade', 'all', { selection: false, inProgress: false }))
    expect(asked[1].read?.selection).toEqual({ text: 'Marta olhou o mar.' })
    expect(asked[1].content).toBe(getT().read.ask('A Tempestade', 'all', { selection: true, inProgress: false }))
  })

  it('opens the chat when it is closed, and leaves it open otherwise', async () => {
    settings({ chatOpen: false })
    await startRead(READ)
    expect(setUi).toHaveBeenCalledWith({ chatOpen: true })
    setUi.mockClear()
    settings({ chatOpen: true })
    await startRead(READ)
    expect(setUi).not.toHaveBeenCalled()
  })

  it('without a model, the author hears how to connect, and no thread is made', async () => {
    settings({ chat: false })
    await startRead(READ)
    expect(useUi.getState().toasts.map((t) => t.message)).toEqual([getT().chat.connectFirst])
    expect(readThreads()).toEqual([])
    expect(useChat.getState().blank).toBeNull()
    expect(completions).toEqual([])
  })

  it('a chapter that is not in the book is not read', async () => {
    await startRead({ ...READ, chapterId: 'ch_gone' })
    expect(readThreads()).toEqual([])
    expect(completions).toEqual([])
  })

  it('the draft of the thread that the author left stays with it', async () => {
    useBook.setState({ threads: [plainThread()] })
    useChat.setState({ activeThreadId: 'th_plain', draft: 'A question about Marta', draftDoc: null })
    await startRead(READ)
    expect(useChat.getState().draft).toBe('')
    expect(useChat.getState().drafts[draftKey(ROOT, 'th_plain')]?.draft).toBe('A question about Marta')
    // Back in the first thread, the draft is back.
    useChat.getState().setActiveThread('th_plain')
    expect(useChat.getState().draft).toBe('A question about Marta')
  })
})

describe('what the form of a read reads without an editor (the revision list)', () => {
  it('the open chapter, or the first chapter when none is open; never a selection', () => {
    expect(bookTarget()).toEqual({ chapterId: 'ch_two', number: 2, title: 'O Visitante', selection: '' })
    useBook.setState({ activeChapterId: null })
    expect(bookTarget()).toEqual({ chapterId: 'ch_one', number: 1, title: 'A Tempestade', selection: '' })
    // A chapter that left the book is not open any more.
    useBook.setState({ activeChapterId: 'ch_gone' })
    expect(bookTarget()?.chapterId).toBe('ch_one')
    useBook.setState({ chapters: [] })
    expect(bookTarget()).toBeNull()
  })

  it('a chapter with a selection, for the toolbar', () => {
    expect(readTarget('ch_one', '  Marta olhou o mar.  ')).toEqual({ chapterId: 'ch_one', number: 1, title: 'A Tempestade', selection: 'Marta olhou o mar.' })
    expect(readTarget('ch_gone', '')).toBeNull()
  })
})

describe('the reply to a read', () => {
  const lastTurn = (): string => completions[completions.length - 1].messages.at(-1)!.content

  it('the chapter of the read is the open chapter of the prompt, whatever chapter the author has open', async () => {
    await startRead(READ)
    const { system } = completions[0]
    expect(system).toMatch(/<chapter file="manuscript\/A Tempestade\.md" number="1" title="A Tempestade" current="true">/)
    expect(system).not.toMatch(/<chapter file="manuscript\/O Visitante\.md"[^>]*current="true"/)
  })

  it('the turn is the message and the read block, with the earlier comments of that chapter only', async () => {
    loadComments(ROOT, [
      comment({ id: 'cm_aaaaaaaa', passage: 'Elias acendeu' }),
      comment({ id: 'cm_bbbbbbbb', chapterId: 'ch_two', passage: 'O homem do bote' }),
      comment({ id: 'cm_cccccccc', state: 'done', passage: 'Marta olhou', text: 'Who is Marta?' })
    ])
    await startRead({ ...READ, lens: 'continuity', inProgress: true })
    const turn = lastTurn()
    expect(turn.startsWith(getT().read.ask('A Tempestade', 'continuity', { selection: false, inProgress: true }))).toBe(true)
    expect(turn).toContain('<editor_read chapter="manuscript/A Tempestade.md" number="1" lens="continuity" in_progress="yes">')
    expect(turn).toContain('cm_aaaaaaaa [style] "Elias acendeu"')
    expect(turn).toContain('[style] "Marta olhou" — Who is Marta? (done)')
    expect(turn).not.toContain('cm_bbbbbbbb')
    expect(turn).not.toContain('O homem do bote')
  })

  it('a read of a selection sends the selection', async () => {
    await startRead({ ...READ, selection: { text: 'Marta olhou o mar.' } })
    expect(lastTurn()).toMatch(/<selection>\nMarta olhou o mar\.\n<\/selection>/)
  })

  it('a message that is not a read is an ordinary turn: the open chapter, no read block', async () => {
    await startRead(READ)
    const [thread] = readThreads()
    await sendInThread(thread.id, 'Thanks. What about Marta?')
    const { system } = completions[1]
    expect(system).toMatch(/<chapter file="manuscript\/O Visitante\.md"[^>]*current="true"/)
    expect(lastTurn()).not.toContain('<editor_read')
    expect(lastTurn()).toContain('Thanks. What about Marta?')
  })
})

describe('sendInThread', () => {
  it('does nothing for a thread that does not exist, and while the thread works', async () => {
    await sendInThread('th_none', 'Hello')
    expect(completions).toEqual([])
    useBook.setState({ threads: [plainThread()] })
    useChat.setState({ streaming: { th_plain: { messageId: 'm_live', text: '', requestId: 'r1', cancel: () => {} } } })
    await sendInThread('th_plain', 'Hello')
    expect(useBook.getState().threads[0].messages).toEqual([])
  })

  it('keeps the fields that it is given, and gives the message its own id, role and text', async () => {
    useBook.setState({ threads: [plainThread()] })
    const extra: Partial<ChatMessage> = { read: READ, id: 'm_forced', role: 'assistant', content: 'forced' }
    await sendInThread('th_plain', '  Read it.  ', extra)
    const [message] = useBook.getState().threads[0].messages
    expect(message.role).toBe('user')
    expect(message.content).toBe('Read it.')
    expect(message.id).not.toBe('m_forced')
    expect(message.read).toEqual(READ)
  })
})
