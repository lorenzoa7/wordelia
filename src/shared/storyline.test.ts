import { describe, expect, it } from 'vitest'
import { chapterOf, findStoryLine, isStoryLine, layoutStoryLine, mentionPieces, momentOfChapter, moveEvent, parseStoryLine, renameLinks } from './storyline'
import type { Entry } from './types'

const BODY = [
  'Lanes: Elias · Marta · The visitor · Past (past)',
  '',
  '## 1',
  '- Elias: The storm comes; a boat is missing. → [[The Storm]]',
  '- Marta: @Marta brings coffee to the lighthouse. → [[The Storm]]',
  '- Past: Twenty-two years ago, the first night of @Elias at the lighthouse.',
  '',
  '## 2 · The boat',
  '- Elias + Marta: They see the blue boat together. → [[The Visitor]]',
  '- The visitor: A stranger lies in the blue boat.',
  '',
  '## 3',
  '- Elias + Marta + The visitor: The visitor wakes up in the lighthouse.'
].join('\n')

const chapters = [
  { id: 'c1', title: 'The Storm', file: 'The Storm.md' },
  { id: 'c2', title: 'O Visitante', file: 'O Visitante.md' },
  { id: 'c3', title: 'The Visitor', file: 'The Visitor.md' }
]

const entry = (name: string, aliases: string[] = []): Pick<Entry, 'id' | 'name' | 'aliases'> => ({ id: `e-${name}`, name, aliases })

describe('parseStoryLine', () => {
  it('parses lanes, moments and events', () => {
    const line = parseStoryLine(BODY)
    expect(line.lanes).toEqual(['Elias', 'Marta', 'The visitor', 'Past'])
    expect(line.past).toBe('Past')
    expect(line.moments.map((m) => m.label)).toEqual(['1', '2 · The boat', '3'])
    const meeting = line.moments[1].events[0]
    expect(meeting.lanes).toEqual(['Elias', 'Marta'])
    expect(meeting.text).toBe('They see the blue boat together.')
    expect(meeting.links).toEqual(['The Visitor'])
    expect(line.moments[0].events[0].links).toEqual(['The Storm'])
    expect(line.moments[0].events[2].links).toEqual([])
  })

  it('reads the lanes word in three languages', () => {
    const pt = parseStoryLine('Trilhas: Elias · Marta · Passado (passado)\n\n## 1\n- Elias: a')
    expect(pt.lanes).toEqual(['Elias', 'Marta', 'Passado'])
    expect(pt.past).toBe('Passado')
    const es = parseStoryLine('Carriles: Elias · Pasado (pasado)\n\n## 1\n- Elias: a')
    expect(es.lanes).toEqual(['Elias', 'Pasado'])
    expect(es.past).toBe('Pasado')
  })

  it('makes lanes from events without a lanes line', () => {
    const line = parseStoryLine('## 1\n- Marta: a\n- Elias + Marta: b\n## 2\n- The visitor: c')
    expect(line.lanes).toEqual(['Marta', 'Elias', 'The visitor'])
    expect(line.lanesLine).toBe(-1)
    expect(line.past).toBeNull()
  })

  it('adds an unknown lane after the others', () => {
    const line = parseStoryLine('Lanes: Elias · Marta\n\n## 1\n- Teresa: arrives')
    expect(line.lanes).toEqual(['Elias', 'Marta', 'Teresa'])
  })

  it('puts an item without a lane in Other', () => {
    const line = parseStoryLine('Lanes: Elias\n\n## 1\n- 1883: the woods\n- A storm, at night: the boats go home.\n- A storm.')
    expect(line.moments[0].events.map((e) => [e.lanes, e.text])).toEqual([
      [[], '1883: the woods'],
      [[], 'A storm, at night: the boats go home.'],
      [[], 'A storm.']
    ])
    expect(line.lanes).toEqual(['Elias'])
  })

  it('tolerates hand edits', () => {
    const line = parseStoryLine('Lanes:  Elias ·Marta  \n\n##   1  \n* Elias: a   \n  - Marta:   b\n### A note\nSome text.\n## 2\n- Elias: c')
    expect(line.lanes).toEqual(['Elias', 'Marta'])
    expect(line.moments.map((m) => m.label)).toEqual(['1', '2'])
    expect(line.moments[0].events.map((e) => e.text)).toEqual(['a', 'b'])
    expect(line.moments[1].events.map((e) => e.text)).toEqual(['c'])
  })

  it('finds the story line among the entries', () => {
    const e = (file: string, type?: string): Entry => ({ id: file, category: 'Plot', file, name: file, aliases: [], summary: '', image: null, body: '', meta: type ? { type } : {} })
    expect(isStoryLine(e('a.md', 'story-line'))).toBe(true)
    expect(findStoryLine([e('z.md', 'story-line'), e('m.md'), e('b.md', 'story-line')])?.file).toBe('b.md')
    expect(findStoryLine([e('m.md')])).toBeNull()
  })
})

describe('links and mentions', () => {
  it('matches links by title and file name, ignoring accents', () => {
    expect(chapterOf('the storm', chapters)).toBe('c1')
    expect(chapterOf('O Visitánte', chapters)).toBe('c2')
    expect(chapterOf('The Visitor.md', chapters)).toBe('c3')
    expect(chapterOf('A chapter that does not exist', chapters)).toBeNull()
  })

  it('longest mention', () => {
    const entries = [entry('Ana'), entry('Ana Lúcia'), entry('Elias', ['o faroleiro'])]
    expect(mentionPieces('@Ana Lúcia chega', entries)).toEqual([
      { kind: 'mention', entryId: 'e-Ana Lúcia', text: '@Ana Lúcia' },
      { kind: 'text', text: ' chega' }
    ])
    expect(mentionPieces('Com @o faroleiro e @Ninguém.', entries)).toEqual([
      { kind: 'text', text: 'Com ' },
      { kind: 'mention', entryId: 'e-Elias', text: '@o faroleiro' },
      { kind: 'text', text: ' e @Ninguém.' }
    ])
  })
})

describe('layoutStoryLine', () => {
  it('places events in rows and sub-columns', () => {
    const layout = layoutStoryLine(parseStoryLine(BODY))
    expect(layout.rows).toEqual(['Elias', 'Marta', 'The visitor', 'Past'])
    expect(layout.subs).toEqual([1, 1, 1])
    const wake = layout.placed.find((p) => p.event.text.startsWith('The visitor wakes'))
    expect(wake?.rows).toEqual([0, 1, 2])
  })

  it('packs a meeting over a busy lane', () => {
    const layout = layoutStoryLine(parseStoryLine('Lanes: Elias · Marta · The visitor\n\n## 1\n- Elias: a\n- Marta: b\n- Elias + The visitor: c'))
    expect(layout.subs).toEqual([2])
    const c = layout.placed.find((p) => p.event.text === 'c')
    expect(c?.sub).toBe(1)
    expect(c?.rows).toEqual([0, 1, 2])
    expect(layout.placed.find((p) => p.event.text === 'b')?.sub).toBe(0)
  })

  it('stacks single events of one cell in one sub-column', () => {
    const layout = layoutStoryLine(parseStoryLine('Lanes: Elias\n\n## 1\n- Elias: a\n- Elias: b'))
    expect(layout.subs).toEqual([1])
    expect(layout.placed.map((p) => p.sub)).toEqual([0, 0])
  })

  it('adds a row for Other at the bottom', () => {
    const layout = layoutStoryLine(parseStoryLine('Lanes: Elias · Past (past)\n\n## 1\n- A storm.'))
    expect(layout.rows).toEqual(['Elias', 'Past', ''])
    expect(layout.placed[0].rows).toEqual([2])
  })
})

describe('the open chapter and changes', () => {
  it('finds the moment of a chapter', () => {
    const line = parseStoryLine(BODY)
    expect(momentOfChapter(line, 'c3', chapters)).toBe(1)
    expect(momentOfChapter(line, 'c2', chapters)).toBe(-1)
  })

  it('moves an event line', () => {
    const line = parseStoryLine(BODY)
    const event = line.moments[1].events[1]
    const next = moveEvent(BODY, line, event, 2, 'Marta')
    const before = BODY.split('\n')
    const after = next.split('\n')
    expect(after).toHaveLength(before.length)
    expect(after).not.toContain('- The visitor: A stranger lies in the blue boat.')
    expect(after[after.length - 1]).toBe('- Marta: A stranger lies in the blue boat.')
    const moved = parseStoryLine(next)
    expect(moved.moments[2].events.map((e) => e.lanes)).toEqual([['Elias', 'Marta', 'The visitor'], ['Marta']])
  })

  it('keeps the links of a moved event', () => {
    const line = parseStoryLine(BODY)
    const next = moveEvent(BODY, line, line.moments[0].events[0], 2, 'Elias')
    expect(parseStoryLine(next).moments[2].events[1].links).toEqual(['The Storm'])
  })

  it('renames links', () => {
    expect(renameLinks(BODY, 'The Storm', 'The Great Storm').match(/\[\[The Great Storm\]\]/g)).toHaveLength(2)
    expect(renameLinks('- Elias: a → [[the storm]]', 'The Storm', 'Night')).toBe('- Elias: a → [[Night]]')
  })
})
