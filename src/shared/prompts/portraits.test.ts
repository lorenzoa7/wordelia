import { describe, expect, it } from 'vitest'
import type { Entry } from '../types'
import { entryBlock, planningIndex } from './context'
import { PORTRAITS_PER_SHEET, portraitPlan } from './portraits'

const entry = (id: string, name: string, image: string | null, category = 'Characters', aliases: string[] = []): Entry => ({
  id,
  category,
  file: `${category}/${name}.md`,
  name,
  aliases,
  summary: '',
  image,
  body: '',
  meta: {}
})

const elias = entry('e1', 'Elias', '_assets/elias.png', 'Characters', ['o faroleiro'])
const marta = entry('e2', 'Marta', '_assets/marta.webp')
const ilha = entry('e3', 'Santa Ilha', null, 'Places')
const farol = entry('e4', 'O Farol', '_assets/farol.jpg', 'Places')
const line = { ...entry('e5', 'Linha da história', '_assets/x.png', 'Plot'), meta: { type: 'story-line' } }
const all = [elias, marta, ilha, farol, line]

describe('the portraits of the notes for the chat', () => {
  it('puts every portrait on a sheet, and nothing in focus when the message names no note', () => {
    const plan = portraitPlan(all, { mentions: [], currentEntryId: null, text: 'Analise as imagens das notas.' })
    expect(plan.sheets.map((s) => s.map((e) => e.name))).toEqual([['Elias', 'Marta', 'O Farol']])
    expect(plan.focus).toEqual([])
  })

  it('shows the notes that the message is about at full size: a mention, the open note, a name or an alias', () => {
    const plan = portraitPlan(all, { mentions: [{ kind: 'entry', id: 'e4', label: 'O Farol' }], currentEntryId: 'e2', text: 'Como o faroleiro se veste?' })
    expect(plan.focus.map((e) => e.name)).toEqual(['O Farol', 'Marta', 'Elias'])
  })

  it('never shows a note without a portrait', () => {
    const plan = portraitPlan(all, { mentions: [{ kind: 'entry', id: 'e3', label: 'Santa Ilha' }], currentEntryId: null, text: 'Santa Ilha' })
    expect(plan.focus).toEqual([])
    expect(plan.sheets.flat()).not.toContain(ilha)
  })

  it(`starts a new sheet after ${PORTRAITS_PER_SHEET} portraits, and keeps at most 4 notes in focus`, () => {
    const many = Array.from({ length: PORTRAITS_PER_SHEET + 3 }, (_, i) => entry(`m${i}`, `Pessoa ${i}`, `_assets/${i}.png`))
    const plan = portraitPlan(many, { mentions: many.slice(0, 6).map((e) => ({ kind: 'entry' as const, id: e.id, label: e.name })), currentEntryId: null, text: '' })
    expect(plan.sheets.map((s) => s.length)).toEqual([PORTRAITS_PER_SHEET, 3])
    expect(plan.focus).toHaveLength(4)
  })
})

describe('the text of the planning says which notes have a portrait', () => {
  it('in the index', () => {
    const index = planningIndex([elias, ilha])
    expect(index).toContain('- planning/Characters/Elias.md: Elias (also: o faroleiro) (has a portrait)')
    expect(index).toContain('- planning/Places/Santa Ilha.md: Santa Ilha\n')
  })

  it('in the full note', () => {
    expect(entryBlock(marta)).toContain('portrait: yes')
    expect(entryBlock(ilha)).not.toContain('portrait')
  })
})
