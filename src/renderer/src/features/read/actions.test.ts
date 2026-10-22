import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newManifest } from '@shared/book'
import type { EditorComment } from '@shared/comments'
import type { AppSettings, Chapter, Entry, Thread } from '@shared/types'

vi.mock('@/lib/api', () => ({
  invoke: () => Promise.resolve(),
  on: () => () => {}
}))
vi.mock('@/lib/ai', () => ({
  runCompletion: () => ({ id: 'r1', cancel: () => {}, done: Promise.resolve({ ok: true, text: 'A reply.', model: 'opus' }) }),
  describeError: () => ({ message: 'Failed.', kind: 'unknown' })
}))
vi.mock('@/features/chat/summaries', () => ({ summariesFor: async () => ({}) }))
vi.mock('@/features/chat/portraits', () => ({ portraitImages: async () => [] }))
vi.mock('@/features/chat/digest', () => ({ afterReply: async () => {} }))
vi.mock('@/features/editor/registry', () => ({
  flushEditor: () => {},
  getChapterEditor: () => null,
  getActiveEditor: () => null,
  chapterEditors: () => [],
  whenChapterEditor: () => {},
  scrollToPos: () => {}
}))

const { askDoneAfterPolish, updateNoteFor } = await import('./actions')
const { decideComments } = await import('./ui')
const { loadComments, useComments } = await import('./store')
const { useApp } = await import('@/stores/app')
const { useBook } = await import('@/stores/book')
const { useChat } = await import('@/features/chat/chatStore')
const { useUi } = await import('@/stores/ui')
const { getT } = await import('@/lib/i18n')

const ROOT = '/books/santa-ilha'
const NOW = '2026-10-21T10:00:00.000Z'

const chapter: Chapter = { id: 'ch_one', file: 'A Tempestade.md', title: 'A Tempestade', body: 'Elias acendeu a lâmpada do farol.\n\nMarta subiu a escada com o café.', meta: {} }
const marta: Entry = { id: 'en_marta', category: 'Characters', file: 'Characters/Marta.md', name: 'Marta', aliases: [], summary: '', image: null, body: 'Cuida do visitante.', meta: {} }

function comment(over: Partial<EditorComment> = {}): EditorComment {
  return {
    id: 'cm_marta001',
    chapterId: 'ch_one',
    lens: 'continuity',
    rank: 1,
    text: 'Marta already has coffee here.',
    passage: 'Marta subiu a escada',
    sources: [{ file: 'planning/Characters/Marta.md', quote: 'Cuida do visitante.' }],
    state: 'open',
    threadId: 'th_read',
    messageId: 'm_reply',
    key: '0',
    createdAt: NOW,
    updatedAt: NOW,
    ...over
  }
}

const readThread = (): Thread => ({
  id: 'th_read',
  title: 'Read · A Tempestade',
  brief: '',
  digest: '',
  digestedCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
  pinned: false,
  route: null,
  readChapterId: 'ch_one',
  messages: [
    { id: 'm_ask', role: 'user', content: 'Read the chapter.', createdAt: NOW, read: { chapterId: 'ch_one', lens: 'all', inProgress: false } },
    { id: 'm_reply', role: 'assistant', content: 'A letter.', createdAt: NOW }
  ]
})

const toasts = (): string[] => useUi.getState().toasts.map((t) => t.message)

beforeEach(() => {
  useApp.setState({
    settings: { language: 'en', ui: { chatOpen: true }, routes: { chat: { provider: 'claude-code', model: 'opus' } } } as unknown as AppSettings,
    setUi: vi.fn()
  })
  useUi.setState({ toasts: [] })
  useChat.setState({ activeThreadId: null, blank: null, kept: {}, listOpen: false, streaming: {}, drafts: {}, draft: '', draftDoc: null, quotes: [], mentions: [], images: [] })
  useBook.setState({
    root: ROOT,
    manifest: newManifest({ title: 'O Farol de Santa Ilha', author: 'Ana', language: 'pt-BR' }),
    chapters: [chapter],
    entries: [marta],
    activeChapterId: 'ch_one',
    threads: [readThread()]
  })
  loadComments(ROOT, [comment()])
})

describe('"Update the note"', () => {
  it('asks in the thread of the read, with the note as a mention and the passage as a quote', async () => {
    await updateNoteFor(comment())
    const sent = useBook.getState().threads[0].messages[2]
    expect(sent).toMatchObject({ role: 'user', mentions: [{ kind: 'entry', id: 'en_marta', label: 'Marta' }] })
    expect(sent.content).toContain('@Marta')
    expect(sent.quotes?.map((q) => q.text)).toEqual(['Marta subiu a escada'])
    expect(useChat.getState().activeThreadId).toBe('th_read')
  })

  it('while the thread of the read writes a reply, it says so and sends nothing', async () => {
    useChat.setState({ streaming: { th_read: { messageId: 'm_stream', text: 'A le', requestId: 'r1', cancel: () => {} } } })
    await updateNoteFor(comment())
    expect(useBook.getState().threads[0].messages).toHaveLength(2)
    expect(toasts()).toEqual([getT().read.threadBusy])
  })
})

describe('the question after the Polish of a comment', () => {
  it('"Mark as done" closes the comment, with Undo', () => {
    askDoneAfterPolish('cm_marta001')
    const ask = useUi.getState().toasts.at(-1)!
    expect(ask.message).toBe(getT().read.polished)
    ask.action?.run()
    expect(useComments.getState().list[0].state).toBe('done')
    expect(toasts().at(-1)).toBe(getT().read.stateChanged.done(1))
  })

  it('a comment that the author closed meanwhile stays as it is, and no second toast shows', () => {
    askDoneAfterPolish('cm_marta001')
    const ask = useUi.getState().toasts.at(-1)!
    // The author ignores the comment by hand before the click on "Mark as done".
    decideComments(['cm_marta001'], 'ignored')
    const before = toasts()
    ask.action?.run()
    expect(useComments.getState().list[0].state).toBe('ignored')
    expect(toasts()).toEqual(before)
  })

  it('does not ask for a closed comment, or in a comments file of a newer Wordelia', () => {
    loadComments(ROOT, [comment({ state: 'done' })])
    askDoneAfterPolish('cm_marta001')
    expect(toasts()).toEqual([])
    loadComments(ROOT, [comment()], 2)
    useUi.setState({ toasts: [] })
    askDoneAfterPolish('cm_marta001')
    expect(toasts()).toEqual([])
  })
})
