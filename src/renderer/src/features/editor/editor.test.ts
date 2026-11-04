import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import type { DocNode } from '@shared/types'
import { schemaExtensions } from './extensions'
import { proposalDiff, sliceFromMarkdown, textWithMap } from './review'
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

  it('leaves the spaces at both ends out of the range', () => {
    const st = docOf('Um dois três quatro.')
    const r = normalizeRange(st.doc, posOf(st, ' dois'), posOf(st, 'quatro'))
    expect(st.doc.textBetween(r.from, r.to)).toBe('dois três')
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

describe('a chat proposal with a scene break', () => {
  const SECOND = 'O vento entrava pela *janela*.'
  const chapter = (): EditorState => docOf(`Primeiro parágrafo.\n\n${SECOND}`)
  /** The range of the second paragraph, as the proposal finds it */
  const second = (st: EditorState): { from: number; to: number } => {
    const from = posOf(st, 'O vento')
    return { from, to: from + 'O vento entrava pela janela.'.length }
  }

  it('the diff of a chapter shows a new scene break as new text, and nothing else', () => {
    const st = chapter()
    const { from, to } = second(st)
    const { ops, source } = proposalDiff(st.doc, from, to, `* * *\n\n${SECOND}`, 'chapter')
    expect(ops.filter((o) => o.type === 'insert').map((o) => o.text)).toEqual(['* * *\n\n'])
    expect(ops.some((o) => o.type === 'delete')).toBe(false)
    // The italics of the paragraph are the same: no change of formatting.
    expect(source?.text).toBe('O vento entrava pela janela.')
  })

  it('the diff of a chapter keeps a scene break that the proposal removes', () => {
    const st = docOf('Fim.\n\n* * *\n\nComeço.')
    const { ops } = proposalDiff(st.doc, posOf(st, 'Fim'), posOf(st, 'Começo') + 'Começo.'.length, 'Fim.\n\nComeço.', 'chapter')
    expect(ops.filter((o) => o.type === 'delete').map((o) => o.text).join('')).toContain('* * *')
  })

  it('a note compares plain text, as before (its lists are paragraphs in the editor)', () => {
    const st = docOf('- Um item.\n- Outro item.')
    const from = posOf(st, 'Outro')
    const { ops, source } = proposalDiff(st.doc, from, from + 'Outro item.'.length, '- Outro item novo.', 'entry')
    expect(source).toBeUndefined()
    expect(ops.filter((o) => o.type === 'insert').map((o) => o.text.trim())).toEqual(['novo'])
  })

  it('Accept puts a scene break node there, and the file has "* * *" between blank lines', () => {
    const st = chapter()
    const { from, to } = second(st)
    const tr = st.tr.replaceRange(from, to, sliceFromMarkdown(schema, `* * *\n\n${SECOND}`))
    expect([...Array(tr.doc.childCount).keys()].map((i) => tr.doc.child(i).type.name)).toEqual(['paragraph', 'sceneBreak', 'paragraph'])
    expect(serializeMarkdown(tr.doc.toJSON() as DocNode)).toBe(`Primeiro parágrafo.\n\n* * *\n\n${SECOND}\n`)
  })

  it('Accept of a scene break in the middle of a paragraph splits the paragraph', () => {
    const st = docOf('Ele saiu. Na manhã seguinte, voltou.')
    const tr = st.tr.replaceRange(1, st.doc.content.size - 1, sliceFromMarkdown(schema, 'Ele saiu.\n\n* * *\n\nNa manhã seguinte, voltou.'))
    expect(serializeMarkdown(tr.doc.toJSON() as DocNode)).toBe('Ele saiu.\n\n* * *\n\nNa manhã seguinte, voltou.\n')
  })
})
