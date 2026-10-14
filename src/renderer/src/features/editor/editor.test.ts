import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import type { DocNode } from '@shared/types'
import { schemaExtensions } from './extensions'
import { sliceFromMarkdown, textWithMap } from './review'
import { normalizeRange } from '../actions/range'

const schema = getSchema(schemaExtensions())

function docOf(md: string): EditorState {
  return EditorState.create({ schema, doc: schema.nodeFromJSON(parseMarkdown(md)) })
}

/** Position of the n-th occurrence of a text in the document */
function posOf(state: EditorState, text: string): number {
  const { text: plain, map } = textWithMap(state.doc, 0, state.doc.content.size)
  const i = plain.indexOf(text)
  if (i < 0) throw new Error(`not found: ${text}`)
  return map[i]
}

describe('schema and Markdown', () => {
  it('round-trips a chapter through the editor schema', () => {
    const md = 'Um *dois* **três**.\n\n— Fala — disse ele.\n\n* * *\n\nCentral.\n{align=center}\n'
    const doc = schema.nodeFromJSON(parseMarkdown(md))
    expect(serializeMarkdown(doc.toJSON() as DocNode)).toBe(md)
  })

  it('keeps font spans through the schema', () => {
    const md = 'Texto [grande]{font="Lora" size=16} aqui.\n'
    const doc = schema.nodeFromJSON(parseMarkdown(md))
    expect(serializeMarkdown(doc.toJSON() as DocNode)).toBe(md)
  })
})

describe('textWithMap', () => {
  it('joins blocks with a blank line and maps positions', () => {
    const st = docOf('Primeiro.\n\nSegundo.')
    const { text, map } = textWithMap(st.doc, 0, st.doc.content.size)
    expect(text).toBe('Primeiro.\n\nSegundo.')
    expect(st.doc.textBetween(map[0], map[0] + 1)).toBe('P')
    expect(st.doc.textBetween(map[11], map[11] + 1)).toBe('S')
  })
})

describe('selection to Markdown', () => {
  it('serializes a selection inside one paragraph (needs the parent nodes)', () => {
    const st = docOf('Ele disse *algo* bonito.')
    const from = posOf(st, 'disse')
    const to = posOf(st, 'bonito') + 'bonito'.length
    const slice = st.doc.slice(from, to, true)
    const md = serializeMarkdown(schema.topNodeType.create(null, slice.content).toJSON() as DocNode).trim()
    expect(md).toBe('disse *algo* bonito')
  })
})

describe('normalizeRange', () => {
  it('drops the empty start of the next paragraph', () => {
    const st = docOf('Primeiro parágrafo.\n\nSegundo parágrafo.')
    const from = posOf(st, 'parágrafo.')
    const startOfSecond = posOf(st, 'Segundo')
    const r = normalizeRange(st.doc, from, startOfSecond)
    expect(st.doc.textBetween(r.from, r.to)).toBe('parágrafo.')
  })

  it('drops the empty end of the previous paragraph', () => {
    const st = docOf('Primeiro.\n\nSegundo parágrafo.')
    const endOfFirst = posOf(st, '.') + 1
    const to = posOf(st, ' parágrafo')
    const r = normalizeRange(st.doc, endOfFirst, to)
    expect(st.doc.textBetween(r.from, r.to)).toBe('Segundo')
  })

  it('keeps a normal selection', () => {
    const st = docOf('Um dois três.')
    const r = normalizeRange(st.doc, posOf(st, 'dois'), posOf(st, ' três'))
    expect(st.doc.textBetween(r.from, r.to)).toBe('dois')
  })
})

describe('sliceFromMarkdown', () => {
  it('replaces a range inside a paragraph without splitting it', () => {
    const st = docOf('Ele disse algo bonito. Fim.')
    const from = posOf(st, 'disse')
    const to = posOf(st, ' Fim')
    const tr = st.tr.replaceRange(from, to, sliceFromMarkdown(schema, 'murmurou algo *belo*.'))
    expect(serializeMarkdown(tr.doc.toJSON() as DocNode)).toBe('Ele murmurou algo *belo*. Fim.\n')
  })

  it('splits paragraphs when the rewrite has two', () => {
    const st = docOf('A B C D.')
    const tr = st.tr.replaceRange(posOf(st, 'B'), posOf(st, ' D'), sliceFromMarkdown(schema, 'B1.\n\nC1'))
    expect(serializeMarkdown(tr.doc.toJSON() as DocNode)).toBe('A B1.\n\nC1 D.\n')
  })
})
