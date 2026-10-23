import { describe, expect, it } from 'vitest'
import { newManifest } from '../book'
import { READ_LIMIT_ALL, READ_LIMIT_ONE, type EditorComment } from '../comments'
import { parseProposals } from '../proposals/parse'
import type { Chapter, ReadRequest, Thread } from '../types'
import { buildChatSystem } from './chat'
import { READ_MARK, READ_OFFER_RULES, buildReadTurn, parseReadRequest } from './read'

const chapter: Chapter = { id: 'ch_two', file: 'A Tempestade.md', title: 'A Tempestade', body: 'Elias acendeu a lâmpada.', meta: {} }
const request: ReadRequest = { chapterId: 'ch_two', lens: 'all', inProgress: false }
const MESSAGE = 'Leitura de editor do cap. 3 · Todos os olhares'

function comment(over: Partial<EditorComment> = {}): EditorComment {
  return {
    id: 'cm_aaaaaaaa',
    chapterId: 'ch_two',
    lens: 'style',
    rank: 1,
    text: 'Three sentences begin with the same word.',
    passage: 'Elias acendeu a lâmpada.',
    sources: [],
    state: 'open',
    threadId: 'th_read',
    messageId: 'msg_read',
    key: '0',
    createdAt: '2026-10-21T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    ...over
  }
}

const turn = (over: Partial<ReadRequest> = {}, earlier: EditorComment[] = []): string =>
  buildReadTurn(MESSAGE, { ...request, ...over }, chapter, 2, earlier)

// A phrase that only one lens description has.
const STRUCTURE = 'setups and payoffs'
const READER = 'first reader'
const STYLE = 'rhythm, repetition'
const CONTINUITY = 'the story line'
const PROOFREAD = 'typos'

describe('the read block', () => {
  it('follows the message and names the chapter, the lens and the limit', () => {
    const t = turn({ lens: 'style' })
    expect(t.startsWith(`${MESSAGE}\n\n${READ_MARK}`)).toBe(true)
    expect(t).toContain('<editor_read chapter="manuscript/A Tempestade.md" number="3" lens="style" in_progress="no">')
    expect(t.trimEnd().endsWith('</editor_read>')).toBe(true)
    expect(t).toContain(`at most ${READ_LIMIT_ONE} comments`)
    expect(t).toContain(STYLE)
    expect(t).not.toContain(STRUCTURE)
    expect(t).not.toContain(CONTINUITY)
    expect(t).not.toContain(`at most ${READ_LIMIT_ALL} comments`)
  })

  it('all lenses: the limit of seven and the five descriptions', () => {
    const t = turn({ lens: 'all' })
    expect(t).toContain('lens="all"')
    expect(t).toContain(`at most ${READ_LIMIT_ALL} comments`)
    for (const phrase of [STRUCTURE, READER, STYLE, CONTINUITY, PROOFREAD]) expect(t).toContain(phrase)
  })

  it('tells the AI to write a letter, then the comments, and never to rewrite', () => {
    const t = turn()
    expect(t).toMatch(/never use <edit>, <create> or <portrait>/)
    expect(t).toContain('What works')
    expect(t).toContain('at most 3 bullet points')
    expect(t).toContain('What I would look at first')
    expect(t).toContain('(→ N)')
    expect(t).toMatch(/word for word/)
    expect(t).toMatch(/never a whole paragraph/)
  })

  it('the letter and the comments are for the author: no ids of cards or comments, no file paths', () => {
    // A real read named two cards of the story line by their ids ("cards ^c75 and ^c78").
    const t = turn()
    expect(t).toMatch(/never write an id/)
    expect(t).toContain('^c12')
    expect(t).toMatch(/Name a story line card by its words/)
  })

  it('the example note is a note that the parser reads', () => {
    for (const [lens, exampleLens, sources] of [
      ['all', 'continuity', 1],
      ['continuity', 'continuity', 1],
      ['style', 'style', 0]
    ] as const) {
      const example = /<note lens="[a-z]+"[\s\S]*?<\/note>/.exec(turn({ lens }))
      expect(example).not.toBeNull()
      const [seg] = parseProposals(example![0])
      expect(seg).toMatchObject({ kind: 'note', lens: exampleLens, rank: 1, complete: true })
      if (seg.kind !== 'note') throw new Error('not a note')
      expect(seg.find).not.toBe('')
      expect(seg.text).not.toBe('')
      expect(seg.sources).toHaveLength(sources)
      if (sources) expect(seg.sources[0].file).toMatch(/^planning\//)
    }
  })

  it('a read with the continuity lens asks for a source in each comment; the other lenses do not', () => {
    expect(turn({ lens: 'continuity' })).toMatch(/every continuity comment has a <source>/i)
    expect(turn({ lens: 'all' })).toMatch(/every continuity comment has a <source>/i)
    expect(turn({ lens: 'style' })).not.toContain('<source')
  })

  it('does not offer another read inside a read', () => {
    expect(turn()).toMatch(/Do not offer a read with <read\/>/)
  })

  it('a chapter in progress says so', () => {
    const on = turn({ inProgress: true })
    expect(on).toContain('in_progress="yes"')
    expect(on).toContain('The chapter is not finished: do not comment on a missing end; comment on the direction so far.')
    const off = turn({ inProgress: false })
    expect(off).toContain('in_progress="no"')
    expect(off).not.toContain('The chapter is not finished')
  })

  it('a selection limits the comments to it', () => {
    const t = turn({ selection: { text: 'Marta deixou a caneca sobre a mesa.' } })
    expect(t).toContain('Comment only on this part:')
    expect(t).toContain('Marta deixou a caneca sobre a mesa.')
    expect(t).toMatch(/every <find> must be inside it/i)
    expect(turn()).not.toContain('Comment only on this part:')
  })

  it('earlier comments: the open ones with their ids, the others under "Do not repeat these" with the reason', () => {
    const t = turn({}, [
      comment({ id: 'cm_open0001', lens: 'style', passage: 'Elias acendeu a lâmpada.', text: 'Weak opening verb.' }),
      comment({ id: 'cm_open0002', lens: 'structure', passage: 'O vento entrava\npelas frestas.', text: 'The scene has no goal.' }),
      comment({ id: 'cm_done0001', lens: 'reader', state: 'done', passage: 'Marta subiu.', text: 'Who is Marta?' }),
      comment({ id: 'cm_ignr0001', lens: 'proofread', state: 'ignored', passage: 'um bote', text: 'Check "bote".' }),
      comment({ id: 'cm_inte0001', lens: 'continuity', state: 'intentional', reason: 'Elias lies to Marta', passage: 'Não vi nada.', text: 'Elias says he saw nothing.' })
    ])
    const open = t.slice(t.indexOf('Open comments'), t.indexOf('Do not repeat these'))
    expect(open).toContain('cm_open0001 [style] "Elias acendeu a lâmpada." — Weak opening verb.')
    // A line break inside a passage becomes a space: one comment is one line.
    expect(open).toContain('cm_open0002 [structure] "O vento entrava pelas frestas." — The scene has no goal.')
    expect(open).not.toContain('cm_done0001')
    // The example of the tag has neutral ids. A real id in the example would bias the AI toward that comment.
    expect(open).toContain('<resolved ids="cm_1 cm_2"/>')
    expect(open.match(/<resolved[^>]*>/g)).toEqual(['<resolved ids="cm_1 cm_2"/>'])
    expect(t.split('cm_open0001')).toHaveLength(2)
    expect(t.split('cm_open0002')).toHaveLength(2)
    const decided = t.slice(t.indexOf('Do not repeat these'))
    expect(decided).toContain('[reader] "Marta subiu." — Who is Marta? (done)')
    expect(decided).toContain('[proofread] "um bote" — Check "bote". (ignored)')
    expect(decided).toContain('[continuity] "Não vi nada." — Elias says he saw nothing. (intentional: Elias lies to Marta)')
    // The ids of the decided comments are not shown: the AI cannot resolve them.
    expect(decided).not.toContain('cm_done0001')
    // The ids print once, as they are.
    expect(t).not.toContain('ccm_')
  })

  it('no earlier comments: no section for them', () => {
    const t = turn()
    expect(t).not.toContain('Open comments')
    expect(t).not.toContain('Do not repeat these')
    expect(t).not.toContain('<resolved')
  })

  it('only decided comments: no section of open comments', () => {
    const t = turn({}, [comment({ state: 'done' })])
    expect(t).not.toContain('Open comments')
    expect(t).toContain('Do not repeat these')
  })
})

describe('the offer of a read in an ordinary thread', () => {
  const manifest = newManifest({ title: 'O Farol', author: 'Ana', language: 'pt-BR' })
  const thread: Thread = { id: 't1', title: 'Tema', brief: '', digest: '', digestedCount: 0, createdAt: '', updatedAt: '', pinned: false, route: null, messages: [] }

  it('PROTOCOL offers a read with <read/> and says not to read the chapter there', () => {
    const s = buildChatSystem({
      book: { manifest, writingRules: '', chapters: [chapter], entries: [], threads: [thread] },
      thread,
      currentChapterId: chapter.id,
      currentEntryId: null,
      mentions: [],
      quotes: [],
      message: 'Leia o capítulo 1 como editor',
      summaries: {},
      manuscriptBudget: 100000
    })
    expect(s).toContain('<read chapter="manuscript/')
    expect(s).toContain(READ_OFFER_RULES)
    expect(s).toMatch(/do not read the chapter in this conversation/i)
    // The offer comes inside the protocol, before the writing rules.
    expect(s.indexOf(READ_OFFER_RULES)).toBeLessThan(s.indexOf('# Writing rules of the book'))
  })

  it('the offer is a tag that the parser reads', () => {
    const example = /<read chapter="[^"]*" lens="all"\/>/.exec(READ_OFFER_RULES)
    expect(example).not.toBeNull()
    expect(parseProposals(example![0])).toEqual([{ kind: 'read', chapter: 'manuscript/File name.md', lens: 'all', complete: true, index: 0 }])
  })
})

describe('parseReadRequest', () => {
  it('keeps a valid request', () => {
    expect(parseReadRequest({ chapterId: 'ch_two', lens: 'style', inProgress: true, selection: { text: 'Elias.' } })).toEqual({
      chapterId: 'ch_two',
      lens: 'style',
      inProgress: true,
      selection: { text: 'Elias.' }
    })
    expect(parseReadRequest({ chapterId: 'ch_two', lens: 'all', inProgress: false })).toEqual({ chapterId: 'ch_two', lens: 'all', inProgress: false })
  })

  it('drops what is not a request', () => {
    expect(parseReadRequest(undefined)).toBeNull()
    expect(parseReadRequest('read')).toBeNull()
    expect(parseReadRequest({ lens: 'all', inProgress: false })).toBeNull()
    expect(parseReadRequest({ chapterId: '', lens: 'all', inProgress: false })).toBeNull()
    expect(parseReadRequest({ chapterId: 'ch_two', lens: 'plot', inProgress: false })).toBeNull()
    expect(parseReadRequest({ chapterId: 'ch_two', lens: 'all', inProgress: 'no' })).toBeNull()
  })

  it('drops a selection that has no text', () => {
    expect(parseReadRequest({ chapterId: 'ch_two', lens: 'all', inProgress: false, selection: { text: 7 } })).toEqual({
      chapterId: 'ch_two',
      lens: 'all',
      inProgress: false
    })
    expect(parseReadRequest({ chapterId: 'ch_two', lens: 'all', inProgress: false, selection: 'text' })).toEqual({
      chapterId: 'ch_two',
      lens: 'all',
      inProgress: false
    })
  })
})
