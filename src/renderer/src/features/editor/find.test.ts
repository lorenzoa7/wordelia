import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import { parseMarkdown } from '@shared/markdown/parse'
import { schemaExtensions } from './extensions'
import { findKey, findPlugin, matchAfterReplace, replaceCurrentMatch } from './find'

const schema = getSchema(schemaExtensions())

/** A state with a search for `query`, the first match current. */
function searched(md: string, query: string): EditorState {
  const state = EditorState.create({ schema, doc: schema.nodeFromJSON(parseMarkdown(md)), plugins: [findPlugin()] })
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)).setMeta(findKey, { query }))
}

function replaced(state: EditorState, text: string): EditorState {
  const tr = state.tr
  return replaceCurrentMatch(state, tr, text) ? state.apply(tr) : state
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
