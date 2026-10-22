import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMENTS_FILE, markdownToPlainBlocks } from '@shared/book'
import { READ_LIMIT_ALL, READ_LIMIT_ONE, parseCommentsFile, serializeComments, type EditorComment } from '@shared/comments'
import { parseProposals } from '@shared/proposals/parse'
import type { ChatMessage, ReadRequest, Thread } from '@shared/types'

interface Call {
  channel: string
  rel: string
  content: string
}
const calls: Call[] = []

vi.mock('@/lib/api', () => ({
  invoke: (channel: string, _root: string, rel: string, content: string) => {
    calls.push({ channel, rel, content })
    return Promise.resolve()
  },
  on: () => () => {}
}))

const { commentRefRank, commentsFromSegments, linkCommentRefs } = await import('./fromReply')
const store = await import('./store')
const { saver } = await import('@/stores/saver')
const { useUi } = await import('@/stores/ui')

const ROOT = '/books/santa-ilha'
const NOW = '2026-10-21T10:00:00.000Z'

/** The comments file as the app last wrote it. */
const onDisk = (): EditorComment[] => {
  const writes = calls.filter((c) => c.channel === 'book:writeFile' && c.rel === COMMENTS_FILE)
  return parseCommentsFile(writes.at(-1)?.content ?? null)
}

function comment(over: Partial<EditorComment> = {}): EditorComment {
  return {
    id: 'cm_aaaaaaaa',
    chapterId: 'ch_one',
    lens: 'style',
    rank: 1,
    text: 'The sentence repeats a word.',
    passage: 'Elias acendeu o farol.',
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

function note(rank: number, lens: string, find: string, text = `Comment ${rank}.`, close = true): string {
  return `<note lens="${lens}" rank="${rank}">\n<find>${find}</find>\n<text>${text}</text>\n${close ? '</note>' : ''}`
}

const CHAPTER = [
  'Elias acendeu o farol antes da tempestade.',
  'Marta olhou o mar e não disse nada.',
  'O visitante dormiu por dois dias.',
  'Ele disse *Andorinha* e depois “Andorinha” de novo.'
].join('\n\n')

function ctx(over: Partial<Parameters<typeof commentsFromSegments>[1]> = {}): Parameters<typeof commentsFromSegments>[1] {
  return { threadId: 'th_read', messageId: 'msg_read', chapterId: 'ch_one', chapterPlain: markdownToPlainBlocks(CHAPTER), limit: READ_LIMIT_ALL, now: NOW, ...over }
}

const fromReply = (reply: string, over: Partial<Parameters<typeof commentsFromSegments>[1]> = {}): EditorComment[] =>
  commentsFromSegments(parseProposals(reply), ctx(over))

describe('commentsFromSegments', () => {
  it('comments come from complete notes only, in rank order, at most the limit', () => {
    const reply = [
      'Uma carta curta.',
      note(3, 'style', 'Marta olhou o mar'),
      note(1, 'structure', 'Elias acendeu o farol'),
      note(2, 'reader', 'O visitante dormiu'),
      note(4, 'proofread', 'dois dias', 'Cut by a stop.', false)
    ].join('\n')
    const list = fromReply(reply)
    expect(list.map((c) => [c.rank, c.lens, c.passage])).toEqual([
      [1, 'structure', 'Elias acendeu o farol'],
      [2, 'reader', 'O visitante dormiu'],
      [3, 'style', 'Marta olhou o mar']
    ])
    expect(fromReply(reply, { limit: 2 }).map((c) => c.rank)).toEqual([1, 2])
    // The key is the place of the note in the reply, not its rank.
    expect(list.map((c) => c.key)).toEqual(['1', '2', '0'])
  })

  it('fills a comment: the message, the key of the segment, the state and the dates', () => {
    const reply = `Carta.\n<note lens="continuity" rank="1">\n<find>Elias acendeu o farol</find>\n<text>Elias não tem fósforos.</text>\n<source file="planning/Characters/Elias.md">Elias perdeu os fósforos.</source>\n</note>`
    const [c] = fromReply(reply, { threadId: 'th_9', messageId: 'msg_9' })
    expect(c).toMatchObject({
      chapterId: 'ch_one',
      lens: 'continuity',
      rank: 1,
      text: 'Elias não tem fósforos.',
      passage: 'Elias acendeu o farol',
      sources: [{ file: 'planning/Characters/Elias.md', quote: 'Elias perdeu os fósforos.' }],
      state: 'open',
      threadId: 'th_9',
      messageId: 'msg_9',
      key: '0',
      createdAt: NOW,
      updatedAt: NOW
    })
    expect(c.id).toMatch(/^cm_[a-z0-9]{8}$/)
  })

  it('a find with italics and straight quotes anchors', () => {
    const list = fromReply([note(1, 'style', '*Andorinha*'), note(2, 'style', '"Andorinha" de novo')].join('\n'))
    expect(list.map((c) => c.passage)).toEqual(['Andorinha', '“Andorinha” de novo'])
  })

  it('a find with other dashes and spaces anchors', () => {
    const chapter = markdownToPlainBlocks('— Entre — disse Marta.\n\nO farol  ficou aceso.\n\nElias -- cansado -- sentou.')
    const reply = [
      note(1, 'proofread', '-- Entre -- disse Marta.'),
      note(2, 'style', 'O farol ficou aceso.'),
      note(3, 'style', 'Elias — cansado — sentou.')
    ].join('\n')
    expect(fromReply(reply, { chapterPlain: chapter }).map((c) => c.passage)).toEqual([
      '— Entre — disse Marta.',
      'O farol  ficou aceso.',
      'Elias -- cansado -- sentou.'
    ])
  })

  it('a note with a passage that is not in the chapter is dropped', () => {
    const list = fromReply([note(1, 'style', 'Uma frase que não existe'), note(2, 'style', 'Marta olhou o mar'), note(3, 'style', '')].join('\n'))
    expect(list.map((c) => c.rank)).toEqual([2])
  })

  it('a passage that is in the chapter two times is kept', () => {
    const chapterPlain = markdownToPlainBlocks('O mar estava calmo.\n\nMarta saiu.\n\nO mar estava calmo.')
    const list = fromReply(note(1, 'style', 'O mar estava calmo.'), { chapterPlain })
    expect(list.map((c) => c.passage)).toEqual(['O mar estava calmo.'])
  })

  it('a find that is not in the selection is dropped', () => {
    const selection = markdownToPlainBlocks('Marta olhou o mar e não disse nada.')
    const reply = [note(1, 'style', 'Elias acendeu o farol'), note(2, 'style', 'Marta olhou o mar')].join('\n')
    expect(fromReply(reply, { selection }).map((c) => [c.rank, c.passage])).toEqual([[2, 'Marta olhou o mar']])
    expect(fromReply(reply).map((c) => c.rank)).toEqual([1, 2])
  })

  it('a note with no words is dropped', () => {
    expect(fromReply(note(1, 'style', 'Marta olhou o mar', '  '))).toEqual([])
  })

  it('gives each comment its own id', () => {
    const ids = fromReply([note(1, 'style', 'Marta olhou o mar'), note(2, 'style', 'O visitante dormiu')].join('\n')).map((c) => c.id)
    expect(new Set(ids).size).toBe(2)
  })
})

const thread = (over: Partial<Thread> = {}): Thread => ({
  id: 'th_read',
  title: 'Leitura · A Tempestade',
  brief: '',
  digest: '',
  digestedCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
  pinned: false,
  route: null,
  messages: [],
  readChapterId: 'ch_one',
  ...over
})

const reply = (content: string, id = 'msg_read'): ChatMessage => ({ id, role: 'assistant', content, createdAt: NOW })
const request = (over: Partial<ReadRequest> = {}): ReadRequest => ({ chapterId: 'ch_one', lens: 'all', inProgress: false, ...over })

const THREE = ['Carta.', note(1, 'continuity', 'Elias acendeu o farol'), note(2, 'structure', 'Marta olhou o mar'), note(3, 'style', 'O visitante dormiu')].join('\n')

beforeEach(() => {
  calls.length = 0
  store.loadComments(ROOT, [])
})

afterEach(async () => {
  await saver.flush()
  for (const t of useUi.getState().toasts) useUi.getState().dismissToast(t.id)
})

describe('the links of a letter to its comments', () => {
  it('each "→ N" of the letter is a link to comment N of the reply', () => {
    const letter = 'The rhythm of the opening (style, → 1), the conflict (→2) and Marta (continuity, →  3).'
    const linked = linkCommentRefs(letter)
    expect(linked).toBe('The rhythm of the opening (style, [→ 1](#comment-1)), the conflict ([→ 2](#comment-2)) and Marta (continuity, [→ 3](#comment-3)).')
    expect(commentRefRank('#comment-12')).toBe(12)
    expect(commentRefRank('https://example.com/#comment-1')).toBeNull()
    expect(commentRefRank(undefined)).toBeNull()
    // Text without arrows stays as it is.
    expect(linkCommentRefs('What works: the lamp.')).toBe('What works: the lamp.')
  })

  it('only "(→ N)" is a link: a bare arrow, code and other links stay as they are', () => {
    expect(linkCommentRefs('Scene 2 → 3 of the plan, and the boat (→ 2).')).toBe('Scene 2 → 3 of the plan, and the boat ([→ 2](#comment-2)).')
    expect(linkCommentRefs('Write `(→ 1)` in the letter.')).toBe('Write `(→ 1)` in the letter.')
    expect(linkCommentRefs('See [the note (→ 1)](https://example.com) and (→ 1).')).toBe('See [the note (→ 1)](https://example.com) and ([→ 1](#comment-1)).')
  })
})

describe('addFromReply', () => {
  it('adds the comments of a reply to the store and writes the file', async () => {
    const added = store.addFromReply(thread(), reply(THREE), request(), CHAPTER)
    expect(added.map((c) => c.rank)).toEqual([1, 2, 3])
    expect(store.useComments.getState().list).toEqual(added)
    await saver.flush()
    expect(onDisk()).toEqual(added)
  })

  it('the same reply twice gives no duplicates', () => {
    store.addFromReply(thread(), reply(THREE), request(), CHAPTER)
    const again = store.addFromReply(thread(), reply(THREE), request(), CHAPTER)
    expect(again).toEqual([])
    expect(store.useComments.getState().list).toHaveLength(3)
  })

  it('a reply that grows adds only the new notes (a stream)', () => {
    const [first, second] = [note(1, 'continuity', 'Elias acendeu o farol'), note(2, 'structure', 'Marta olhou o mar')]
    expect(store.addFromReply(thread(), reply(`Carta.\n${first}\n<note lens="style" rank="3">\n<find>O visitante`), request(), CHAPTER)).toHaveLength(1)
    const list = store.useComments.getState().list
    expect(store.addFromReply(thread(), reply(`Carta.\n${first}\n${second}`), request(), CHAPTER)).toHaveLength(1)
    expect(store.useComments.getState().list).toHaveLength(2)
    // The first comment is the same one, with the same id.
    expect(store.useComments.getState().list[0]).toBe(list[0])
  })

  it('a new reply of the same thread adds its own comments', () => {
    store.addFromReply(thread(), reply(THREE, 'msg_1'), request(), CHAPTER)
    store.addFromReply(thread(), reply(THREE, 'msg_2'), request(), CHAPTER)
    expect(store.useComments.getState().list).toHaveLength(6)
  })

  it('a stream never passes the limit of the read', () => {
    const many = (ranks: number[]): string => ['Carta.', ...ranks.map((r) => note(r, 'style', `Passagem ${r}`))].join('\n')
    const chapter = Array.from({ length: 8 }, (_, i) => `Passagem ${i + 1}.`).join('\n\n')
    const req = request({ lens: 'style' })
    // Notes that arrive in no order: the first three are complete, then the others come.
    store.addFromReply(thread(), reply(many([6, 7, 8])), req, chapter)
    expect(store.useComments.getState().list).toHaveLength(3)
    store.addFromReply(thread(), reply(many([6, 7, 8, 1, 2, 3, 4, 5])), req, chapter)
    expect(store.useComments.getState().list).toHaveLength(READ_LIMIT_ONE)
    // A read that is full adds nothing more.
    expect(store.addFromReply(thread(), reply(many([6, 7, 8, 1, 2, 3, 4, 5])), req, chapter)).toEqual([])
  })

  it('uses the limit for one lens, and a read of the selection only comments on the selection', () => {
    const selection = { text: 'Marta olhou o mar e não disse nada.' }
    const added = store.addFromReply(thread(), reply(THREE), request({ lens: 'structure', selection }), CHAPTER)
    expect(added.map((c) => c.rank)).toEqual([2])
  })

  it('a selection with only spaces is no selection', () => {
    const added = store.addFromReply(thread(), reply(THREE), request({ selection: { text: '  \n ' } }), CHAPTER)
    expect(added).toHaveLength(3)
  })

  it('gives the comments the chapter of the request', () => {
    const added = store.addFromReply(thread(), reply(THREE), request({ chapterId: 'ch_two' }), CHAPTER)
    expect(added.every((c) => c.chapterId === 'ch_two')).toBe(true)
  })
})

describe('setCommentState', () => {
  const three = (): EditorComment[] => [
    comment({ id: 'cm_aaaaaaaa', key: '0' }),
    comment({ id: 'cm_bbbbbbbb', key: '1', state: 'ignored' }),
    comment({ id: 'cm_cccccccc', key: '2', state: 'intentional', reason: 'Elias mente para Marta' })
  ]
  const states = (): Array<[string, string | undefined]> => store.useComments.getState().list.map((c) => [c.state, c.reason])

  it('sets the state and writes the file', async () => {
    store.loadComments(ROOT, three())
    store.setCommentState(['cm_aaaaaaaa', 'cm_bbbbbbbb'], 'done')
    expect(states()).toEqual([['done', undefined], ['done', undefined], ['intentional', 'Elias mente para Marta']])
    await saver.flush()
    expect(onDisk().map((c) => c.state)).toEqual(['done', 'done', 'intentional'])
  })

  it('keeps the reason of an intentional comment, and drops it when the state changes', () => {
    store.loadComments(ROOT, three())
    store.setCommentState(['cm_aaaaaaaa'], 'intentional', ' Elias mente. ')
    store.setCommentState(['cm_cccccccc'], 'open', 'ignored reason')
    expect(states()).toEqual([['intentional', 'Elias mente.'], ['ignored', undefined], ['open', undefined]])
  })

  it('with Undo puts the old states back', async () => {
    store.loadComments(ROOT, three())
    const before = store.useComments.getState().list
    store.setCommentState(['cm_aaaaaaaa', 'cm_bbbbbbbb', 'cm_cccccccc'], 'done')
    const [toast] = useUi.getState().toasts
    expect(toast.message).toBe('3 comments marked as done.')
    expect(toast.action?.label).toBe('Undo')
    toast.action?.run()
    const back = store.useComments.getState().list
    // The Undo is a decision of the writer too: it gets a new time.
    expect(back.map(({ updatedAt: _, ...c }) => c)).toEqual(before.map(({ updatedAt: _, ...c }) => c))
    expect(back.every((c) => c.updatedAt > NOW)).toBe(true)
    await saver.flush()
    expect(onDisk()).toEqual(back)
  })

  it('with Undo runs `onUndo` after the old states are back', () => {
    store.loadComments(ROOT, three())
    const seen: string[][] = []
    store.setCommentState(['cm_aaaaaaaa'], 'done', undefined, { onUndo: () => seen.push(states().map(([s]) => s)) })
    expect(seen).toEqual([])
    useUi.getState().toasts[0].action?.run()
    expect(seen).toEqual([['open', 'ignored', 'intentional']])
  })

  it('Undo leaves a comment alone when the writer changed it again', () => {
    store.loadComments(ROOT, three())
    store.setCommentState(['cm_aaaaaaaa', 'cm_bbbbbbbb'], 'done')
    const [toast] = useUi.getState().toasts
    store.setCommentState(['cm_bbbbbbbb'], 'intentional', 'A choice')
    toast.action?.run()
    expect(states()).toEqual([['open', undefined], ['intentional', 'A choice'], ['intentional', 'Elias mente para Marta']])
  })

  it('Undo after a book switch leaves the new book alone', () => {
    store.loadComments(ROOT, three())
    store.setCommentState(['cm_aaaaaaaa'], 'done')
    const [toast] = useUi.getState().toasts
    store.loadComments('/books/b', [comment({ state: 'done' })])
    toast.action?.run()
    expect(store.useComments.getState().list.map((c) => c.state)).toEqual(['done'])
  })

  it('says it in one sentence for one comment, and does nothing for an id that is not there', () => {
    store.loadComments(ROOT, three())
    store.setCommentState(['cm_aaaaaaaa'], 'ignored')
    expect(useUi.getState().toasts.map((t) => t.message)).toEqual(['Comment ignored.'])
    store.setCommentState(['cm_none'], 'done')
    store.setCommentState([], 'done')
    expect(useUi.getState().toasts).toHaveLength(1)
  })

  it('does not change a comment that already has the state', () => {
    store.loadComments(ROOT, three())
    store.setCommentState(['cm_bbbbbbbb'], 'ignored')
    expect(useUi.getState().toasts).toHaveLength(0)
  })
})

describe('the passage of a comment', () => {
  it('updatePassage sets the new text of the passage', async () => {
    store.loadComments(ROOT, [comment()])
    store.updatePassage('cm_aaaaaaaa', 'Elias acendeu o farol velho.')
    expect(store.useComments.getState().list[0].passage).toBe('Elias acendeu o farol velho.')
    await saver.flush()
    expect(onDisk()[0].passage).toBe('Elias acendeu o farol velho.')
  })

  it('setLost marks a comment lost, and sets it free again', async () => {
    store.loadComments(ROOT, [comment()])
    store.setLost('cm_aaaaaaaa', true)
    expect(store.useComments.getState().list[0].lost).toBe(true)
    store.setLost('cm_aaaaaaaa', false)
    expect(store.useComments.getState().list[0].lost).toBeUndefined()
    await saver.flush()
    expect(onDisk()[0].lost).toBeUndefined()
  })

  it('keeps the time of the last decision of the writer: the editor writes the passage and "lost" by itself', () => {
    store.loadComments(ROOT, [comment()])
    store.updatePassage('cm_aaaaaaaa', 'Elias acendeu o farol velho.')
    store.setLost('cm_aaaaaaaa', true)
    expect(store.useComments.getState().list[0]).toMatchObject({ passage: 'Elias acendeu o farol velho.', lost: true, updatedAt: NOW })
  })

  it('a change that changes nothing writes nothing', async () => {
    store.loadComments(ROOT, [comment()])
    const list = store.useComments.getState().list
    store.updatePassage('cm_aaaaaaaa', list[0].passage)
    store.setLost('cm_aaaaaaaa', false)
    store.updatePassage('cm_none', 'x')
    expect(store.useComments.getState().list).toBe(list)
    await saver.flush()
    expect(calls).toEqual([])
  })
})

describe('loading', () => {
  it('loadComments for another root clears the list', () => {
    store.loadComments('/books/a', [comment()])
    expect(store.useComments.getState().list).toHaveLength(1)
    store.loadComments('/books/b', [])
    expect(store.useComments.getState()).toMatchObject({ root: '/books/b', list: [] })
    store.loadComments(null, [])
    expect(store.useComments.getState()).toMatchObject({ root: null, list: [] })
  })

  it('does not write when it loads', async () => {
    store.loadComments(ROOT, [comment()])
    await saver.flush()
    expect(calls).toEqual([])
  })

  it('a change after a book switch goes to the file of the new book', async () => {
    store.loadComments('/books/a', [comment()])
    store.loadComments('/books/b', [comment({ id: 'cm_bbbbbbbb' })])
    store.setCommentState(['cm_bbbbbbbb'], 'done')
    await saver.flush()
    expect(onDisk().map((c) => c.id)).toEqual(['cm_bbbbbbbb'])
  })

  it('keeps the first of two comments with one id', () => {
    store.loadComments(ROOT, [comment({ text: 'First.' }), comment({ text: 'Second.' }), comment({ id: 'cm_bbbbbbbb' })])
    expect(store.useComments.getState().list.map((c) => c.text)).toEqual(['First.', 'The sentence repeats a word.'])
  })

  it('a comment with no root is not written', async () => {
    store.loadComments(null, [])
    store.putBackComments([comment()])
    await saver.flush()
    expect(calls).toEqual([])
  })
})

describe('a file from a newer Wordelia', () => {
  it('is shown, never written, and the toast says so once', async () => {
    store.loadComments(ROOT, [comment()], 2)
    expect(useUi.getState().toasts.map((t) => t.message)).toEqual([expect.stringContaining('newer version of Wordelia')])
    // Another load of the same file says nothing more.
    store.loadComments(ROOT, [comment()], 2)
    expect(useUi.getState().toasts).toHaveLength(1)
    // The changes stay in memory, and none of them reaches the file.
    store.setCommentState(['cm_aaaaaaaa'], 'done')
    expect(store.useComments.getState().list[0].state).toBe('done')
    store.addFromReply(thread(), reply(THREE), request(), CHAPTER)
    await saver.flush()
    expect(calls).toEqual([])
  })

  it('a book with version 1 after it is written again', async () => {
    store.loadComments(ROOT, [comment()], 2)
    store.loadComments('/books/b', [comment()], 1)
    store.setCommentState(['cm_aaaaaaaa'], 'done')
    await saver.flush()
    expect(onDisk().map((c) => c.state)).toEqual(['done'])
  })
})

describe('a damaged comments file', () => {
  const toasts = (): string[] => useUi.getState().toasts.map((t) => t.message)

  it('is read-only, makes no comments from the replies, is never written, and the toast says so once', async () => {
    store.loadComments(ROOT, [], 1, true)
    expect(store.useComments.getState()).toMatchObject({ readOnly: true, damaged: true, list: [] })
    expect(toasts()).toEqual([expect.stringContaining('ai/comments.json')])
    // Another load of the same file says nothing more.
    store.loadComments(ROOT, [], 1, true)
    expect(toasts()).toHaveLength(1)
    // The saved replies of the reads do not make the comments again over the file: their decisions are in it.
    expect(store.addFromReply(thread(), reply(THREE), request(), CHAPTER)).toEqual([])
    expect(store.useComments.getState().list).toEqual([])
    store.putBackComments([comment()])
    await saver.flush()
    expect(calls.filter((c) => c.rel === COMMENTS_FILE)).toEqual([])
  })

  it('the file that a sync client or the author fixes makes the list normal again', async () => {
    store.loadComments(ROOT, [], 1, true)
    store.commentsChangedOutside(ROOT, '<<<<<<< HEAD')
    expect(store.useComments.getState()).toMatchObject({ readOnly: true, damaged: true })
    store.commentsChangedOutside(ROOT, serializeComments([comment()]))
    expect(store.useComments.getState()).toMatchObject({ readOnly: false, damaged: false, list: [comment()] })
    store.setCommentState(['cm_aaaaaaaa'], 'done')
    await saver.flush()
    expect(onDisk().map((c) => c.state)).toEqual(['done'])
  })

  it('a deleted file is a book with no comments, and the replies make them again', () => {
    store.loadComments(ROOT, [], 1, true)
    store.commentsChangedOutside(ROOT, null)
    expect(store.useComments.getState()).toMatchObject({ readOnly: false, damaged: false })
    expect(store.addFromReply(thread(), reply(THREE), request(), CHAPTER)).toHaveLength(3)
  })

  it('a file of a newer Wordelia that comes after it says that it is newer', () => {
    store.loadComments(ROOT, [], 1, true)
    store.commentsChangedOutside(ROOT, JSON.stringify({ version: 2, items: [] }))
    expect(store.useComments.getState()).toMatchObject({ readOnly: true, damaged: false })
    expect(toasts()).toEqual([expect.stringContaining('ai/comments.json'), expect.stringContaining('newer version of Wordelia')])
  })

  it('a missing file is no damage, and another book is not damaged', () => {
    store.loadComments(ROOT, [], 1, true)
    store.loadComments('/books/b', [])
    expect(store.useComments.getState()).toMatchObject({ readOnly: false, damaged: false })
    expect(toasts()).toHaveLength(1)
  })
})

describe('changes from outside', () => {
  const text = (list: EditorComment[]): string => serializeComments(list)

  it('reloads the list', () => {
    store.loadComments(ROOT, [comment()])
    const other = comment({ id: 'cm_bbbbbbbb', state: 'done' })
    store.commentsChangedOutside(ROOT, text([comment(), other]))
    expect(store.useComments.getState().list.map((c) => c.id)).toEqual(['cm_aaaaaaaa', 'cm_bbbbbbbb'])
    expect(calls).toEqual([])
  })

  it('a deleted file is a book with no comments', () => {
    store.loadComments(ROOT, [comment()])
    store.commentsChangedOutside(ROOT, null)
    expect(store.useComments.getState().list).toEqual([])
  })

  it('a partial write of a sync client changes nothing', () => {
    store.loadComments(ROOT, [comment()])
    store.commentsChangedOutside(ROOT, text([comment()]).slice(0, 60))
    store.commentsChangedOutside(ROOT, '')
    store.commentsChangedOutside(ROOT, '{"version":1}')
    expect(store.useComments.getState().list).toHaveLength(1)
  })

  it('a pending local write is not lost', async () => {
    store.loadComments(ROOT, [comment()])
    store.setCommentState(['cm_aaaaaaaa'], 'done') // waits in the saver
    expect(saver.isPending(ROOT, COMMENTS_FILE)).toBe(true)
    store.commentsChangedOutside(ROOT, text([]))
    expect(store.useComments.getState().list.map((c) => c.state)).toEqual(['done'])
    await saver.flush()
    expect(onDisk().map((c) => c.state)).toEqual(['done'])
  })

  it('a pending local write and a file from outside with a new comment: both are kept', async () => {
    store.loadComments(ROOT, [comment()])
    store.setCommentState(['cm_aaaaaaaa'], 'done') // waits in the saver
    store.commentsChangedOutside(ROOT, text([comment(), comment({ id: 'cm_bbbbbbbb', lens: 'reader' })]))
    const both = (list: EditorComment[]): string[] => list.map((c) => `${c.id}|${c.state}`)
    expect(both(store.useComments.getState().list)).toEqual(['cm_aaaaaaaa|done', 'cm_bbbbbbbb|open'])
    await saver.flush()
    expect(both(onDisk())).toEqual(['cm_aaaaaaaa|done', 'cm_bbbbbbbb|open'])
  })

  it('a pending local write and a newer version of the same comment from outside: the newer one wins', async () => {
    store.loadComments(ROOT, [comment(), comment({ id: 'cm_bbbbbbbb' })])
    store.setCommentState(['cm_aaaaaaaa'], 'done')
    const later = comment({ state: 'ignored', updatedAt: '2099-01-01T00:00:00.000Z' })
    store.commentsChangedOutside(ROOT, text([later]))
    expect(store.useComments.getState().list.map((c) => `${c.id}|${c.state}`)).toEqual(['cm_aaaaaaaa|ignored', 'cm_bbbbbbbb|open'])
    await saver.flush()
    expect(onDisk().map((c) => c.state)).toEqual(['ignored', 'open'])
  })

  it('a lost mark of the editor that waits loses to a decision of the writer from another computer', async () => {
    store.loadComments(ROOT, [comment()])
    store.setLost('cm_aaaaaaaa', true) // the editor did not find the passage; the write waits
    const decided = comment({ state: 'done', passage: 'Elias acendeu o farol velho.', updatedAt: '2026-10-21T11:00:00.000Z' })
    store.commentsChangedOutside(ROOT, text([decided]))
    expect(store.useComments.getState().list).toEqual([decided])
    await saver.flush()
    expect(onDisk()).toEqual([decided])
  })

  it('a file of a newer Wordelia while a local write waits: it wins, the list is read-only, nothing is written', async () => {
    store.loadComments(ROOT, [comment()])
    store.setCommentState(['cm_aaaaaaaa'], 'done')
    store.commentsChangedOutside(ROOT, JSON.stringify({ version: 2, comments: [comment({ id: 'cm_bbbbbbbb' })] }))
    expect(store.useComments.getState()).toMatchObject({ readOnly: true })
    expect(store.useComments.getState().list.map((c) => c.id)).toEqual(['cm_bbbbbbbb'])
    expect(saver.isPending(ROOT, COMMENTS_FILE)).toBe(false)
    await saver.flush()
    expect(calls.filter((c) => c.rel === COMMENTS_FILE)).toEqual([])
  })

  it('a change for another book is ignored', () => {
    store.loadComments(ROOT, [comment()])
    store.commentsChangedOutside('/books/other', text([]))
    expect(store.useComments.getState().list).toHaveLength(1)
  })

  it('a newer file with another shape that arrives keeps the list, says so once and is not written', async () => {
    store.loadComments(ROOT, [comment()])
    const newer = JSON.stringify({ version: 2, items: [{ id: 'x' }] })
    store.commentsChangedOutside(ROOT, newer)
    expect(store.useComments.getState()).toMatchObject({ readOnly: true, list: [comment()] })
    expect(useUi.getState().toasts.map((t) => t.message)).toEqual([expect.stringContaining('newer version of Wordelia')])
    store.commentsChangedOutside(ROOT, newer)
    expect(useUi.getState().toasts).toHaveLength(1)
    store.setCommentState(['cm_aaaaaaaa'], 'done')
    await saver.flush()
    expect(calls).toEqual([])
    // The file goes back to version 1: the comments are written again.
    store.commentsChangedOutside(ROOT, text([comment()]))
    expect(store.useComments.getState().readOnly).toBe(false)
  })

  it('a partial write with no version changes nothing and does not make the list read-only', () => {
    store.loadComments(ROOT, [comment()])
    store.commentsChangedOutside(ROOT, '{"version":2,"comme')
    expect(store.useComments.getState()).toMatchObject({ readOnly: false, list: [comment()] })
    expect(useUi.getState().toasts).toHaveLength(0)
  })

  it('a file of a newer Wordelia that arrives is shown and not written', async () => {
    store.loadComments(ROOT, [comment()])
    store.commentsChangedOutside(ROOT, JSON.stringify({ version: 2, comments: [comment({ id: 'cm_bbbbbbbb' })] }))
    expect(store.useComments.getState().list.map((c) => c.id)).toEqual(['cm_bbbbbbbb'])
    expect(useUi.getState().toasts).toHaveLength(1)
    store.setCommentState(['cm_bbbbbbbb'], 'done')
    await saver.flush()
    expect(calls).toEqual([])
  })
})

describe('the comments of a chapter that goes to the trash', () => {
  const two = (): EditorComment[] => [
    comment({ id: 'cm_aaaaaaaa', chapterId: 'ch_one' }),
    comment({ id: 'cm_bbbbbbbb', chapterId: 'ch_two', state: 'done' }),
    comment({ id: 'cm_cccccccc', chapterId: 'ch_one', lens: 'continuity', state: 'intentional', reason: 'A choice' })
  ]
  const trash = '.wordelia/trash/2026-10-21T10-00-00-000Z comments A Tempestade.md.json'

  it('takeChapterComments takes them out, writes them to the trash and the file', async () => {
    store.loadComments(ROOT, two())
    const taken = store.takeChapterComments('ch_one', trash)
    expect(taken.map((c) => c.id)).toEqual(['cm_aaaaaaaa', 'cm_cccccccc'])
    expect(store.useComments.getState().list.map((c) => c.id)).toEqual(['cm_bbbbbbbb'])
    await saver.flush()
    expect(onDisk().map((c) => c.id)).toEqual(['cm_bbbbbbbb'])
    const kept = calls.find((c) => c.rel === trash)
    expect(kept?.channel).toBe('book:writeFile')
    expect(parseCommentsFile(kept?.content ?? null)).toEqual(taken)
  })

  it('putBackComments brings them back, once', async () => {
    store.loadComments(ROOT, two())
    const taken = store.takeChapterComments('ch_one', trash)
    store.putBackComments(taken)
    store.putBackComments(taken)
    expect(store.useComments.getState().list.map((c) => c.id).sort()).toEqual(['cm_aaaaaaaa', 'cm_bbbbbbbb', 'cm_cccccccc'])
    await saver.flush()
    expect(onDisk().map((c) => c.id).sort()).toEqual(['cm_aaaaaaaa', 'cm_bbbbbbbb', 'cm_cccccccc'])
  })

  it('a chapter with no comments writes nothing', async () => {
    store.loadComments(ROOT, two())
    calls.length = 0
    expect(store.takeChapterComments('ch_none', trash)).toEqual([])
    await saver.flush()
    expect(calls).toEqual([])
  })
})

describe('the comments of replies that leave their thread', () => {
  const three = (): EditorComment[] => [
    comment({ id: 'cm_aaaaaaaa', messageId: 'msg_old' }),
    comment({ id: 'cm_bbbbbbbb', messageId: 'msg_new', key: '1', state: 'done' }),
    comment({ id: 'cm_cccccccc', messageId: 'msg_new', key: '2', lens: 'continuity', state: 'intentional', reason: 'A choice' })
  ]

  it('dropMessageComments takes out the open comments of those replies and writes the file; the decided ones stay', async () => {
    store.loadComments(ROOT, [...three(), comment({ id: 'cm_dddddddd', messageId: 'msg_new', key: '3' })])
    const gone = store.dropMessageComments(['msg_new', 'msg_user'])
    expect(gone.map((c) => c.id)).toEqual(['cm_dddddddd'])
    // A decision of the author is the memory of the chapter: the next read must not write the comment again.
    expect(store.useComments.getState().list.map((c) => c.id)).toEqual(['cm_aaaaaaaa', 'cm_bbbbbbbb', 'cm_cccccccc'])
    expect(store.useComments.getState().list.find((c) => c.id === 'cm_cccccccc')).toMatchObject({ state: 'intentional', reason: 'A choice' })
    await saver.flush()
    expect(onDisk().map((c) => c.id)).toEqual(['cm_aaaaaaaa', 'cm_bbbbbbbb', 'cm_cccccccc'])
    // The Undo of a thread delete puts the open ones back.
    store.putBackComments(gone)
    expect(store.useComments.getState().list.map((c) => c.id)).toEqual(['cm_aaaaaaaa', 'cm_bbbbbbbb', 'cm_cccccccc', 'cm_dddddddd'])
  })

  it('replies without comments, or with decided comments only, write nothing', async () => {
    store.loadComments(ROOT, three())
    calls.length = 0
    expect(store.dropMessageComments(['msg_other'])).toEqual([])
    expect(store.dropMessageComments([])).toEqual([])
    expect(store.dropMessageComments(['msg_new'])).toEqual([])
    expect(store.useComments.getState().list).toHaveLength(3)
    await saver.flush()
    expect(calls).toEqual([])
  })
})
