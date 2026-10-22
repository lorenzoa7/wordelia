import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COMMENTS_FILE, normalizeManifest } from '@shared/book'
import { parseCommentsFile, serializeComments, type EditorComment } from '@shared/comments'
import type { BookSnapshot } from '@shared/types'

type Change = { root: string; rel: string; content: string | null }

const writes: Array<{ rel: string; content: string }> = []
/** The listener of `book:externalChange` that the open book gave: the watcher of the main process calls it. */
let external: ((e: Change) => void) | null = null

vi.mock('@/lib/api', () => ({
  invoke: (channel: string, _root: string, rel: string, content: string) => {
    if (channel === 'book:writeFile') writes.push({ rel, content })
    return Promise.resolve()
  },
  on: (channel: string, fn: (e: Change) => void) => {
    if (channel === 'book:externalChange') external = fn
    return () => {
      if (external === fn) external = null
    }
  }
}))

const { useBook } = await import('./book')
const { saver } = await import('./saver')
const { useUi } = await import('./ui')
const { setCommentState, useComments } = await import('@/features/read/store')

const ROOT = '/books/santa-ilha'
const NOW = '2026-10-21T10:00:00.000Z'

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

function snapshot(comments: EditorComment[]): BookSnapshot {
  return {
    root: ROOT,
    manifest: normalizeManifest({ title: 'Santa Ilha', language: 'pt-BR' }),
    chapters: [],
    entries: [],
    threads: [],
    writingRules: '',
    syncState: { chapters: {}, syncedAt: null },
    actions: [],
    comments,
    commentsVersion: 1
  }
}

/** The comments file changed on disk: another computer synced it. */
const fromOutside = (content: string | null): void => external?.({ root: ROOT, rel: COMMENTS_FILE, content })
const commentWrites = (): Array<{ rel: string; content: string }> => writes.filter((w) => w.rel === COMMENTS_FILE)
const states = (list: EditorComment[]): string[] => list.map((c) => `${c.id}|${c.state}`)

describe('the comments file changes outside while a local change of it waits', () => {
  beforeEach(async () => {
    await saver.flush()
    writes.length = 0
    useUi.setState({ toasts: [] })
    useBook.getState().open(snapshot([comment()]))
    // A decision of the author on this computer: its write waits in the saver.
    setCommentState(['cm_aaaaaaaa'], 'done')
    expect(saver.isPending(ROOT, COMMENTS_FILE)).toBe(true)
  })

  it('the two lists merge: the decision of this computer and the new comment of the other one stay, and the merge is written', async () => {
    fromOutside(serializeComments([comment(), comment({ id: 'cm_bbbbbbbb', lens: 'reader' })]))
    expect(states(useComments.getState().list)).toEqual(['cm_aaaaaaaa|done', 'cm_bbbbbbbb|open'])
    await saver.flush()
    expect(states(parseCommentsFile(commentWrites().at(-1)?.content ?? null))).toEqual(['cm_aaaaaaaa|done', 'cm_bbbbbbbb|open'])
  })

  it('a file of a newer Wordelia cancels the write and makes the list read-only', async () => {
    fromOutside(JSON.stringify({ version: 2, comments: [comment({ id: 'cm_bbbbbbbb' })] }))
    expect(useComments.getState()).toMatchObject({ readOnly: true })
    expect(useComments.getState().list.map((c) => c.id)).toEqual(['cm_bbbbbbbb'])
    expect(saver.isPending(ROOT, COMMENTS_FILE)).toBe(false)
    await saver.flush()
    expect(commentWrites()).toEqual([])
  })
})
