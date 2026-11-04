import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { history, undo } from '@tiptap/pm/history'
import { parseMarkdown } from '@shared/markdown/parse'
import { schemaExtensions } from './extensions'
import { findKey, findPlugin, goesToOtherChapter, matchAfterReplace, replaceAllMatches, replaceCurrentMatch, selectionQuery } from './find'

const schema = getSchema(schemaExtensions())

/** A state with a search for `query`, the first match current. */
function searched(md: string, query: string): EditorState {
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(parseMarkdown(md)), plugins: [findPlugin(), history()] })
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)).setMeta(findKey, { query }))
}

function replaced(state: EditorState, text: string): EditorState {
  const tr = state.tr
  return replaceCurrentMatch(state, tr, text) ? state.apply(tr) : state
}

/** The text of each match of the search */
function hits(state: EditorState): string[] {
  return (findKey.getState(state)?.matches ?? []).map((m) => state.doc.textBetween(m.from, m.to))
}

/** A state with the text from the first `a` to the end of the first `b` after it selected */
function selected(md: string, a: string, b: string): EditorState {
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(parseMarkdown(md)) })
  let from = -1
  let to = -1
  state.doc.descendants((node, pos) => {
    if (!node.isText || to >= 0) return true
    const i = node.text!.indexOf(a)
    if (from < 0 && i >= 0) from = pos + i
    const j = from < 0 ? -1 : node.text!.indexOf(b, Math.max(0, from - pos))
    if (j >= 0) to = pos + j + b.length
    return false
  })
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)))
}

describe('matchAfterReplace', () => {
  const matches = [
    { from: 1, to: 6 },
    { from: 10, to: 15 },
    { from: 20, to: 25 }
  ]
  it('goes to the first match after the new text', () => {
    expect(matchAfterReplace(matches, 15)).toBe(2)
  })
  it('does not go back to the start after the last match', () => {
    expect(matchAfterReplace(matches.slice(0, 2), 21)).toBe(-1)
  })
  it('never takes the new text itself', () => {
    expect(matchAfterReplace([{ from: 10, to: 15 }, { from: 16, to: 21 }], 21)).toBe(-1)
  })
})

describe('replace', () => {
  it('moves on when the new text contains the search text', () => {
    let state = searched('Elias saw the sea. Then Elias slept.\n', 'Elias')
    for (let i = 0; i < 3; i++) state = replaced(state, 'Elias Silva')
    expect(state.doc.textContent).toBe('Elias Silva saw the sea. Then Elias Silva slept.')
    expect(findKey.getState(state)?.current).toBe(-1)
  })
  it('selects the next match after a replace', () => {
    const state = replaced(searched('One cat. Two cat. Three cat.\n', 'cat'), 'dog')
    const { from, to } = state.selection
    expect(state.doc.textBetween(from, to)).toBe('cat')
    expect(state.doc.textBetween(1, from)).toBe('One dog. Two ')
    expect(findKey.getState(state)?.current).toBe(0)
  })
})

describe('replace all', () => {
  it('replaces every match, and one undo puts them all back', () => {
    const md = '## Papel\n\nElias cuida do farol.\n\n- O farol de Santa Ilha.\n- Marta sobe ao farol.\n'
    const state = searched(md, 'farol')
    const tr = state.tr
    expect(replaceAllMatches(state, tr, 'cais')).toBe(true)
    const after = state.apply(tr)
    expect(after.doc.textContent).toBe('PapelElias cuida do cais.O cais de Santa Ilha.Marta sobe ao cais.')
    expect(hits(after)).toEqual([])
    let back = after
    undo(after, (t) => (back = after.apply(t)))
    expect(back.doc.eq(state.doc)).toBe(true)
  })
  it('does nothing when the text has no match', () => {
    const state = searched('Elias cuida do farol.\n', 'Marta')
    expect(replaceAllMatches(state, state.tr, 'Ana')).toBe(false)
  })
})

describe('find in a note', () => {
  it('finds the text in the headings, the lists and the quotes of a note', () => {
    const md = '## O farol\n\nElias cuida do farol.\n\n- Um farol velho.\n- Marta.\n\n> Farol apagado.\n'
    expect(hits(searched(md, 'farol'))).toEqual(['farol', 'farol', 'farol', 'Farol'])
  })
})

describe('selectionQuery', () => {
  const md = 'Elias cuida do farol de Santa Ilha.\n\nMarta escreve no caderno.\n'
  it('gives the selected text', () => {
    expect(selectionQuery(selected(md, 'Santa', 'Ilha'))).toBe('Santa Ilha')
  })
  it('puts a space between two blocks', () => {
    expect(selectionQuery(selected(md, 'Ilha', 'Marta'))).toBe('Ilha. Marta')
  })
  it('gives null for no selection, and for a selection of 80 characters or more', () => {
    const empty = EditorState.create({ schema, doc: schema.nodeFromJSON(parseMarkdown(md)) })
    expect(selectionQuery(empty)).toBeNull()
    const long = `Elias ${'a'.repeat(70)} fim.\n`
    expect(selectionQuery(selected(long, 'Elias', 'fim.'))).toBeNull()
  })
})

describe('goesToOtherChapter', () => {
  it('goes on into the next chapter after the last match of a chapter, and back before the first', () => {
    expect(goesToOtherChapter('book', 6, 7, 1)).toBe(true)
    expect(goesToOtherChapter('book', 0, 7, -1)).toBe(true)
    expect(goesToOtherChapter('book', 3, 7, 1)).toBe(false)
    expect(goesToOtherChapter('book', 3, 7, -1)).toBe(false)
  })
  it('goes on from a chapter with no match', () => {
    expect(goesToOtherChapter('book', -1, 0, 1)).toBe(true)
  })
  it('never leaves a note: after its last match, Next goes back to its first match', () => {
    expect(goesToOtherChapter('note', 6, 7, 1)).toBe(false)
    expect(goesToOtherChapter('note', 0, 7, -1)).toBe(false)
    expect(goesToOtherChapter('note', -1, 0, 1)).toBe(false)
  })
})
