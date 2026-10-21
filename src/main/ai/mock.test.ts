import { describe, expect, it } from 'vitest'
import { markdownToPlainBlocks, newManifest } from '@shared/book'
import type { EditorComment } from '@shared/comments'
import { buildChatSystem } from '@shared/prompts/chat'
import { buildReadTurn } from '@shared/prompts/read'
import { parseProposals } from '@shared/proposals/parse'
import { findText } from '@shared/proposals/apply'
import type { Chapter, Thread } from '@shared/types'
import { mockProvider, readReply } from './mock'

const BODY = [
  'Elias acendeu a lâmpada do farol às seis em ponto, como fazia havia vinte e dois anos. Lá fora, o mar estava agitado.',
  'O vento entrava pelas frestas da janela e fazia a chama tremer. Elias percebeu que faltava o *Andorinha*.',
  '— Sentiu isso? — perguntou Marta, subindo os últimos degraus com uma caneca de café nas mãos.',
  '* * *',
  'Às onze da noite, a luz do farol encontrou um bote.'
].join('\n\n')

const chapter: Chapter = { id: 'ch_one', file: 'A Tempestade.md', title: 'A Tempestade', body: BODY, meta: {} }
const other: Chapter = { id: 'ch_two', file: 'O Visitante.md', title: 'O Visitante', body: 'O homem do bote azul dormiu por dois dias.', meta: {} }
const thread: Thread = { id: 'th_read', title: 'Leitura · A Tempestade', brief: '', digest: '', digestedCount: 0, createdAt: '', updatedAt: '', pinned: false, route: null, messages: [], readChapterId: 'ch_one' }

function systemFor(language: string, openId: string | null = 'ch_one'): string {
  return buildChatSystem({
    book: { manifest: newManifest({ title: 'O Farol', author: 'Ana', language }), writingRules: '', chapters: [chapter, other], entries: [], threads: [thread] },
    thread,
    currentChapterId: openId,
    currentEntryId: null,
    mentions: [],
    quotes: [],
    message: 'x',
    summaries: {},
    manuscriptBudget: 100000
  })
}

function openComment(id: string): EditorComment {
  return {
    id,
    chapterId: 'ch_one',
    lens: 'style',
    rank: 1,
    text: 'Weak opening verb.',
    passage: 'Elias acendeu a lâmpada',
    sources: [],
    state: 'open',
    threadId: 'th_read',
    messageId: 'msg_read',
    key: '0',
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z'
  }
}

const readTurn = (earlier: EditorComment[] = []): string => buildReadTurn('Leitura de editor', { chapterId: 'ch_one', lens: 'all', inProgress: false }, chapter, 0, earlier)

describe('the scripted editor\'s read', () => {
  it('a letter of two lines and three comments on the first three paragraphs', () => {
    const text = readReply(systemFor('Brazilian Portuguese'), readTurn(), false)!
    const segments = parseProposals(text)
    const notes = segments.flatMap((s) => (s.kind === 'note' ? [s] : []))
    expect(notes.map((n) => n.lens)).toEqual(['style', 'structure', 'continuity'])
    expect(notes.map((n) => n.rank)).toEqual([1, 2, 3])
    expect(notes.every((n) => n.complete && n.text !== '')).toBe(true)
    const letter = segments.filter((s) => s.kind === 'text').map((s) => (s.kind === 'text' ? s.text : '')).join('').trim()
    expect(letter.split('\n').filter(Boolean)).toHaveLength(2)
    expect(notes[2].sources).toEqual([{ file: 'planning/Characters/Marta.md', quote: expect.any(String) }])
    expect(notes[0].sources).toEqual([])
    expect(segments.some((s) => s.kind === 'resolved')).toBe(false)
  })

  it('each passage is found again, one time, in the plain text of the chapter', () => {
    const plain = markdownToPlainBlocks(BODY)
    const notes = parseProposals(readReply(systemFor('Brazilian Portuguese'), readTurn(), false)!).flatMap((s) => (s.kind === 'note' ? [s] : []))
    expect(notes.map((n) => n.find)).toEqual([
      'Elias acendeu a lâmpada do farol',
      'O vento entrava pelas frestas da',
      '— Sentiu isso? — perguntou Marta,'
    ])
    for (const n of notes) {
      const found = findText(plain, n.find)
      expect(found, n.find).not.toBeNull()
      expect(found).toMatchObject({ mode: 'exact', count: 1 })
    }
  })

  it('an open comment of the block is said to be fixed', () => {
    const text = readReply(systemFor('Brazilian Portuguese'), readTurn([openComment('cm_open0001'), { ...openComment('cm_open0002'), lens: 'reader' }]), false)!
    const resolved = parseProposals(text).filter((s) => s.kind === 'resolved')
    expect(resolved).toEqual([{ kind: 'resolved', ids: ['cm_open0001'], complete: true, index: 3 }])
  })

  it('a comment that the author decided is not an open one', () => {
    const text = readReply(systemFor('Brazilian Portuguese'), readTurn([{ ...openComment('cm_done0001'), state: 'done' }]), false)!
    expect(parseProposals(text).some((s) => s.kind === 'resolved')).toBe(false)
  })

  it('the language of the book decides the language of the letter', () => {
    const pt = readReply(systemFor('Brazilian Portuguese'), readTurn(), false)!
    const en = readReply(systemFor('English'), readTurn(), true)!
    expect(pt).toContain('O que funciona')
    expect(en).toContain('What works')
    expect(en).toContain('She nurses the visitor through his fever')
  })

  it('a book with no open chapter: a letter, no comments', () => {
    const text = readReply(systemFor('English', null), readTurn(), true)!
    expect(parseProposals(text).some((s) => s.kind === 'note')).toBe(false)
  })

  it('"editor\'s read" outside a read block: the offer of a read of the open chapter', () => {
    const pt = readReply(systemFor('Brazilian Portuguese', 'ch_two'), 'Faça a leitura de editor deste capítulo.', false)!
    expect(parseProposals(pt).filter((s) => s.kind === 'read')).toEqual([{ kind: 'read', chapter: 'manuscript/O Visitante.md', lens: 'structure', complete: true, index: 0 }])
    const en = readReply(systemFor('English'), "Can you give me an editor's read of this chapter?", true)!
    expect(parseProposals(en).filter((s) => s.kind === 'read')).toMatchObject([{ chapter: 'manuscript/A Tempestade.md', lens: 'structure' }])
  })

  it('the words of the offer inside a read block are a read, not an offer', () => {
    const text = readReply(systemFor('Brazilian Portuguese'), readTurn(), false)!
    expect(parseProposals(text).some((s) => s.kind === 'read')).toBe(false)
  })

  it('any other message is left to the other scripted replies', () => {
    expect(readReply(systemFor('English'), 'Please improve the first paragraph.', true)).toBeNull()
    expect(readReply(systemFor('English', null), "An editor's read, please.", true)).toBeNull()
  })
})

describe('the scripted provider', () => {
  async function chat(system: string, content: string): Promise<string> {
    process.env['WORDELIA_MOCK_DELAY'] = '1'
    const req = { route: { provider: 'claude-code' as const, model: 'sonnet' }, system, messages: [{ role: 'user' as const, content }], purpose: 'chat' as const }
    const result = await mockProvider('claude-code').complete(req, () => {}, new AbortController().signal)
    return result.text
  }

  it('a read gets comments, also when its text names the story line or the editor', async () => {
    // The system has no story line, and the read block talks about "the story line" and "edit".
    const text = await chat(systemFor('Brazilian Portuguese'), readTurn())
    const kinds = parseProposals(text).map((s) => s.kind)
    expect(kinds.filter((k) => k === 'note')).toHaveLength(3)
    expect(kinds).not.toContain('create')
    expect(kinds).not.toContain('edit')
  })

  it('a message that asks for a read by an editor gets the offer, not an edit', async () => {
    const text = await chat(systemFor('Brazilian Portuguese'), 'Faça a leitura de editor deste capítulo.')
    expect(parseProposals(text).map((s) => s.kind)).toEqual(['text', 'read'])
  })
})
