import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { MANIFEST_COPY, NotABookError, inspectFolder, keepBrokenManifest, openBook } from './store'

const SAMPLE = resolve(__dirname, '../../../e2e/fixtures/sample-book')
let work = ''
let book = ''

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'wordelia-store-'))
  book = join(work, 'O Farol de Santa Ilha')
  await cp(SAMPLE, book, { recursive: true })
})
afterEach(async () => {
  await rm(work, { recursive: true, force: true })
})

const manifestText = (): Promise<string> => readFile(join(book, 'wordelia.json'), 'utf8')
const backups = async (): Promise<string[]> => (await readdir(join(book, '.wordelia')).catch(() => [])).filter((f) => f.startsWith('wordelia.json.broken-'))

describe('a wordelia.json that does not parse', () => {
  it('git conflict markers: one side comes back, and the damaged file stays as a copy', async () => {
    const good = await manifestText()
    const broken = good.replace(/^([ \t]*"title": .*)$/m, '<<<<<<< HEAD\n$1\n=======\n  "title": "O Farol",\n>>>>>>> outro-computador')
    await writeFile(join(book, 'wordelia.json'), broken)
    const snap = await openBook(book)
    expect(snap.manifest.id).toBe('bk_sample01')
    expect(snap.manifest.title).toBe('O Farol de Santa Ilha')
    expect(snap.manifest.language).toBe('pt-BR')
    expect(snap.chapters.map((c) => c.file)).toEqual(['A Tempestade.md', 'O Visitante.md'])
    expect(snap.notices).toEqual([{ kind: 'manifestRepaired', from: 'conflict', backup: expect.stringMatching(/^\.wordelia\/wordelia\.json\.broken-/) }])
    const [copy] = await backups()
    expect(await readFile(join(book, '.wordelia', copy), 'utf8')).toBe(broken)
    expect(JSON.parse(await manifestText()).title).toBe('O Farol de Santa Ilha')
  })

  it('a file that stops in the middle: the last good copy comes back', async () => {
    await openBook(book) // the app keeps a good copy when a book opens
    const good = await manifestText()
    expect(await readFile(join(book, MANIFEST_COPY), 'utf8')).toBe(good)
    await writeFile(join(book, 'wordelia.json'), good.slice(0, 200))
    const snap = await openBook(book)
    expect(snap.notices?.[0]).toMatchObject({ kind: 'manifestRepaired', from: 'copy' })
    expect(snap.manifest.id).toBe('bk_sample01')
    expect(snap.manifest.language).toBe('pt-BR')
    expect(snap.manifest.author).toBe('Ana Exemplo')
  })

  it('no good copy: the parts that can be read come back (id, language, chapter order)', async () => {
    const good = await manifestText()
    // The chapter order in the file is not the order of the file names.
    const swapped = good.replace(/("id": "ch_sample01", "file": "A Tempestade.md" \},)\s*(\{ "id": "ch_sample02", "file": "O Visitante.md" \})/, '$2,\n    $1')
    await writeFile(join(book, 'wordelia.json'), swapped.slice(0, swapped.indexOf('"planning"') + 40))
    const snap = await openBook(book, { language: 'en-US' })
    expect(snap.notices?.[0]).toMatchObject({ kind: 'manifestRepaired', from: 'salvage' })
    expect(snap.manifest.id).toBe('bk_sample01')
    expect(snap.manifest.language).toBe('pt-BR')
    expect(snap.chapters.map((c) => c.file)).toEqual(['O Visitante.md', 'A Tempestade.md'])
  })

  it('a damaged manifest that arrives while the book is open is copied before the app writes over it', async () => {
    await keepBrokenManifest(book)
    expect(await backups()).toEqual([])
    const broken = '<<<<<<< HEAD\n{}\n=======\n'
    await writeFile(join(book, 'wordelia.json'), broken)
    await keepBrokenManifest(book)
    const [copy] = await backups()
    expect(await readFile(join(book, '.wordelia', copy), 'utf8')).toBe(broken)
  })

  it('a byte order mark is not damage', async () => {
    await writeFile(join(book, 'wordelia.json'), '﻿' + (await manifestText()))
    const snap = await openBook(book)
    expect(snap.notices).toBeUndefined()
    expect(await backups()).toEqual([])
  })
})

describe('a chapter file that is missing for now', () => {
  it('keeps its place in the order, and comes back in its place', async () => {
    const file = join(book, 'manuscript', 'A Tempestade.md')
    const text = await readFile(file, 'utf8')
    await rm(file)
    const snap = await openBook(book)
    expect(snap.chapters.map((c) => c.file)).toEqual(['O Visitante.md'])
    expect(snap.notices).toEqual([{ kind: 'chaptersMissing', files: ['A Tempestade.md'] }])
    expect(JSON.parse(await manifestText()).chapters.map((c: { file: string }) => c.file)).toEqual(['A Tempestade.md', 'O Visitante.md'])
    // The sync client delivers the file.
    await writeFile(file, text)
    expect((await openBook(book)).chapters.map((c) => c.file)).toEqual(['A Tempestade.md', 'O Visitante.md'])
  })
})

describe('a folder that is not a book', () => {
  it('does not become a book unless the writer says so', async () => {
    const notes = join(work, 'Notas')
    await mkdir(notes)
    await writeFile(join(notes, 'Ideia.md'), '# Ideia\n')
    await expect(openBook(notes)).rejects.toBeInstanceOf(NotABookError)
    expect(await readdir(notes)).toEqual(['Ideia.md'])
    expect(await inspectFolder(notes)).toEqual({ kind: 'folder', name: 'Notas', notes: 1, chapters: 0 })
    const snap = await openBook(notes, { makeBook: true, language: 'pt-BR' })
    expect(snap.manifest.language).toBe('pt-BR')
  })

  it('a folder inside a book points to the book', async () => {
    expect(await inspectFolder(book)).toEqual({ kind: 'book' })
    expect(await inspectFolder(join(book, 'manuscript'))).toEqual({ kind: 'inside', root: book, title: 'O Farol de Santa Ilha' })
    expect(await inspectFolder(join(book, 'planning', 'Characters'))).toMatchObject({ kind: 'inside', root: book })
  })
})

describe('the threads of a book', () => {
  const msg = (id: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({ id, role: 'user', content: 'Leitura', createdAt: '2026-10-21T10:00:00.000Z', ...over })

  async function writeThread(file: string, t: Record<string, unknown>): Promise<void> {
    await mkdir(join(book, 'ai', 'threads'), { recursive: true })
    await writeFile(join(book, 'ai', 'threads', file), JSON.stringify(t))
  }

  it('a read thread keeps the chapter of its reads and the request of each read', async () => {
    await writeThread('th_read.json', {
      id: 'th_read',
      title: 'Leitura · A Tempestade',
      messages: [
        msg('m1', { read: { chapterId: 'ch_sample01', lens: 'style', inProgress: true, selection: { text: 'Elias acendeu a lâmpada.' } } }),
        msg('m2', { role: 'assistant', content: 'Uma carta curta.' })
      ],
      readChapterId: 'ch_sample01'
    })
    const [thread] = (await openBook(book)).threads
    expect(thread.readChapterId).toBe('ch_sample01')
    expect(thread.messages[0].read).toEqual({ chapterId: 'ch_sample01', lens: 'style', inProgress: true, selection: { text: 'Elias acendeu a lâmpada.' } })
    expect(thread.messages[1]).not.toHaveProperty('read')
  })

  it('a read of the wrong shape and a chapter that is not a text are dropped, and the messages stay', async () => {
    await writeThread('th_bad.json', {
      id: 'th_bad',
      title: 'Conversa',
      messages: [msg('m1', { read: { chapterId: 'ch_sample01', lens: 'plot', inProgress: false } }), msg('m2', { read: 'ler' })],
      readChapterId: 7
    })
    const [thread] = (await openBook(book)).threads
    expect(thread).not.toHaveProperty('readChapterId')
    expect(thread.messages.map((m) => m.id)).toEqual(['m1', 'm2'])
    expect(thread.messages.every((m) => !('read' in m))).toBe(true)
  })
})

describe('the comments of a book', () => {
  const comment = {
    id: 'cm_aaaaaaaa',
    chapterId: 'ch_sample01',
    lens: 'continuity',
    rank: 1,
    text: 'Elias não tem fósforos.',
    passage: 'Elias acendeu o farol',
    sources: [],
    state: 'open',
    threadId: 'th_read',
    messageId: 'msg_read',
    key: '1',
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z'
  }
  const writeComments = async (text: string): Promise<void> => {
    await mkdir(join(book, 'ai'), { recursive: true })
    await writeFile(join(book, 'ai', 'comments.json'), text)
  }

  it('openBook reads ai/comments.json into the snapshot', async () => {
    await writeComments(JSON.stringify({ version: 1, comments: [comment] }))
    const snap = await openBook(book)
    expect(snap.comments).toEqual([comment])
    expect(snap.commentsVersion).toBe(1)
  })

  it('a book with no file, and a file that is bad, have no comments', async () => {
    expect((await openBook(book)).comments).toEqual([])
    await writeComments('{"version":1,"comments":[')
    expect((await openBook(book)).comments).toEqual([])
    await writeComments(JSON.stringify({ version: 1, comments: [{ ...comment, lens: 'plot' }, { id: 'x' }] }))
    expect((await openBook(book)).comments).toEqual([])
  })

  it('a byte order mark is not damage, and the first of two comments with one id wins', async () => {
    await writeComments('\uFEFF' + JSON.stringify({ version: 1, comments: [comment, { ...comment, text: 'Outro.' }] }))
    expect((await openBook(book)).comments).toEqual([comment])
  })

  it('tells the version of a file that a newer Wordelia wrote', async () => {
    await writeComments(JSON.stringify({ version: 2, comments: [comment] }))
    const snap = await openBook(book)
    expect(snap.comments).toEqual([comment])
    expect(snap.commentsVersion).toBe(2)
  })

  it('tells the version of a newer file that has another shape, and it has no comments', async () => {
    await writeComments(JSON.stringify({ version: 2, items: [comment] }))
    const snap = await openBook(book)
    expect(snap.comments).toEqual([])
    expect(snap.commentsVersion).toBe(2)
  })

  it('does not write the file when it opens the book', async () => {
    await openBook(book)
    expect((await readdir(join(book, 'ai'))).includes('comments.json')).toBe(false)
  })
})
