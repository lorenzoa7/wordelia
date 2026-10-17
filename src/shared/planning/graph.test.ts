import { describe, expect, it } from 'vitest'
import type { Chapter, Entry } from '../types'
import { adjacency, buildPlanningMap, chapterNodeId, createNameMatcher, filterMap, foldSearch, searchMap } from './graph'

let seq = 0
function entry(name: string, body = '', extra: Partial<Entry> = {}): Entry {
  const id = extra.id ?? `en_${++seq}`
  return { id, category: 'Characters', file: `Characters/${name}.md`, name, aliases: [], summary: '', image: null, body, meta: {}, ...extra }
}

function chapter(id: string, title: string, body: string): Chapter {
  return { id, file: `${title}.md`, title, body, meta: {} }
}

function counts(entries: Entry[], text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [id, c] of createNameMatcher(entries).count(text)) out[id] = c.n
  return out
}

describe('name matcher', () => {
  it('finds names and aliases as whole words, in any case', () => {
    const marta = entry('Marta', '', { id: 'marta', aliases: ['the nurse'] })
    expect(counts([marta], 'MARTA came in. Then marta left with The Nurse.')).toEqual({ marta: 3 })
  })

  it('does not match inside other words', () => {
    const ana = entry('Ana', '', { id: 'ana' })
    expect(counts([ana], 'Anapolis, banana and Mariana are not Ana. Ana-like is.')).toEqual({ ana: 2 })
  })

  it('ignores names with fewer than 3 letters', () => {
    const al = entry('Al', '', { id: 'al', aliases: ['A.', 'Bo'] })
    expect(counts([al], 'Al and Bo met A. at the door.')).toEqual({})
  })

  it('keeps accents: Pará is not "para", and Inês matches INÊS', () => {
    const para = entry('Pará', '', { id: 'para' })
    const ines = entry('Inês', '', { id: 'ines' })
    expect(counts([para, ines], 'Ela foi para casa. INÊS nasceu no Pará. Ines não.')).toEqual({ para: 1, ines: 1 })
  })

  it('treats accented letters as part of a word, in composed and decomposed text', () => {
    const ana = entry('Ana', '', { id: 'ana' })
    const jose = entry('José', '', { id: 'jose' })
    const decomposed = 'Anã e José e Ana.'.normalize('NFD')
    expect(counts([ana, jose], decomposed)).toEqual({ ana: 1, jose: 1 })
  })

  it('matches names of more than one word, with any white space between the words', () => {
    const isle = entry('Saint Isle', '', { id: 'isle' })
    expect(counts([isle], 'On Saint\nIsle, and on saint   isle. Not on Saint, Isle.')).toEqual({ isle: 2 })
  })

  it('takes the longest name at a position', () => {
    const isle = entry('Saint Isle', '', { id: 'saint-isle' })
    const short = entry('Isle', '', { id: 'isle' })
    expect(counts([isle, short], 'Saint Isle has one isle.')).toEqual({ 'saint-isle': 1, isle: 1 })
  })

  it('reads text inside Markdown marks', () => {
    const marta = entry('Marta', '', { id: 'marta' })
    expect(counts([marta], '## Marta\n\n**Marta** and *Marta*, [Marta]{font="Lora"}.')).toEqual({ marta: 4 })
  })

  it('counts [[wiki links]] once, by name or alias, as explicit links', () => {
    const elias = entry('Elias Rocha', '', { id: 'elias', aliases: ['the keeper'] })
    const m = createNameMatcher([elias]).count('See [[Elias Rocha]], [[the keeper|him]] and [[Elias Rocha#Past]]. Also [[Nobody]].')
    expect(m.get('elias')).toEqual({ n: 3, explicit: true })
    expect(m.size).toBe(1)
  })

  it('counts a [[link]] to a short name', () => {
    const al = entry('Al', '', { id: 'al' })
    expect(createNameMatcher([al]).count('Ask [[Al]].').get('al')).toEqual({ n: 1, explicit: true })
  })

  it('does not read the shown text of a link as a mention', () => {
    const a = entry('Teresa', '', { id: 'teresa' })
    const b = entry('Marta', '', { id: 'marta' })
    expect(counts([a, b], '[[Teresa|Marta’s friend]]')).toEqual({ teresa: 1 })
  })

  it('gives a mention to each entry with the same alias', () => {
    const a = entry('Elias', '', { id: 'a', aliases: ['the old man'] })
    const b = entry('Tomas', '', { id: 'b', aliases: ['The Old Man'] })
    expect(counts([a, b], 'The old man smiled.')).toEqual({ a: 1, b: 1 })
  })
})

describe('buildPlanningMap', () => {
  const elias = entry('Elias', 'The keeper of the lighthouse. Marta helps him on Saint Isle.', { id: 'elias', summary: 'He loves Marta.' })
  const marta = entry('Marta', 'She writes about Elias in a notebook.', { id: 'marta' })
  const isle = entry('Saint Isle', 'A small island.', { id: 'isle', category: 'Places', aliases: ['the island'] })
  const lone = entry('The Swallow', 'A boat.', { id: 'lone', category: 'World' })

  it('links entries that mention each other, with the mentions as the weight', () => {
    const map = buildPlanningMap([elias, marta, isle, lone])
    expect(map.edges).toEqual([
      { source: 'elias', target: 'marta', weight: 3, explicit: false },
      { source: 'elias', target: 'isle', weight: 1, explicit: false }
    ])
  })

  it('keeps entries without links, with degree 0', () => {
    const map = buildPlanningMap([elias, marta, isle, lone])
    const degree = Object.fromEntries(map.nodes.map((n) => [n.id, n.degree]))
    expect(degree).toEqual({ elias: 2, marta: 1, isle: 1, lone: 0 })
    expect(map.nodes.find((n) => n.id === 'isle')).toMatchObject({ kind: 'entry', category: 'Places', names: ['Saint Isle', 'the island'] })
  })

  it('does not link an entry to itself', () => {
    const self = entry('Marta', 'Marta is Marta.', { id: 'self' })
    expect(buildPlanningMap([self]).edges).toEqual([])
  })

  it('adds chapters as nodes when asked, linked to the entries that they mention', () => {
    const chapters = [chapter('c1', 'The Storm', 'Elias lit the lamp. Elias waited for Marta.'), chapter('c2', 'Night', 'Nobody came.')]
    const map = buildPlanningMap([elias, marta], { chapters })
    const c1 = chapterNodeId('c1')
    expect(map.nodes.find((n) => n.id === c1)).toMatchObject({ kind: 'chapter', ref: 'c1', label: 'The Storm', order: 0, category: null, degree: 2 })
    expect(map.nodes.find((n) => n.id === chapterNodeId('c2'))?.degree).toBe(0)
    const fromChapter = map.edges.filter((e) => e.source === c1 || e.target === c1)
    expect(fromChapter.map((e) => [e.source === c1 ? e.target : e.source, e.weight]).sort()).toEqual([
      ['elias', 2],
      ['marta', 1]
    ])
    // Without the option, no chapter nodes.
    expect(buildPlanningMap([elias, marta]).nodes.some((n) => n.kind === 'chapter')).toBe(false)
  })

  it('is fast enough for 300 entries', () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      entry(`Person ${i} Name`, `${'Some words about the story. '.repeat(40)} Person ${(i + 1) % 300} Name and Person ${(i + 7) % 300} Name.`, {
        id: `p${i}`,
        aliases: [`Alias${i}`]
      })
    )
    const t = performance.now()
    const map = buildPlanningMap(many)
    expect(performance.now() - t).toBeLessThan(1500)
    expect(map.edges.length).toBe(600)
  })
})

describe('filterMap, adjacency and searchMap', () => {
  const a = entry('Elias', 'Marta and Saint Isle.', { id: 'a' })
  const b = entry('Marta', '', { id: 'b' })
  const c = entry('Saint Isle', '', { id: 'c', category: 'Places', aliases: ['Ilha de São Inês'] })
  const map = buildPlanningMap([a, b, c])

  it('filters nodes and their edges, and counts the degrees again', () => {
    const only = filterMap(map, (n) => n.category === 'Characters')
    expect(only.nodes.map((n) => [n.id, n.degree])).toEqual([
      ['a', 1],
      ['b', 1]
    ])
    expect(only.edges).toEqual([{ source: 'a', target: 'b', weight: 1, explicit: false }])
  })

  it('gives the neighbors of each node', () => {
    const adj = adjacency(map)
    expect([...(adj.get('a') ?? [])].sort()).toEqual(['b', 'c'])
    expect([...(adj.get('b') ?? [])]).toEqual(['a'])
  })

  it('searches names and aliases without case and accents, best match first', () => {
    expect(searchMap(map, 'marta')).toEqual(['b'])
    expect(searchMap(map, 'sao ines')).toEqual(['c'])
    expect(searchMap(map, 'a')).toEqual(['a', 'b', 'c'])
    expect(searchMap(map, 'i')).toEqual(['c', 'a'])
    expect(searchMap(map, '  ')).toEqual([])
    expect(foldSearch('  Inês  DE  São ')).toBe('ines de sao')
  })
})
