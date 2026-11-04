import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, TextSelection, type Transaction } from '@tiptap/pm/state'
import { history, undo } from '@tiptap/pm/history'
import { parseMarkdown } from '@shared/markdown/parse'
import { schemaExtensions } from './extensions'
import { reloadTransaction } from './keep'

const schema = getSchema(schemaExtensions())
const doc = (md: string) => schema.nodeFromJSON(parseMarkdown(md))

function typed(md: string, at: string, text: string): EditorState {
  let state = EditorState.create({ schema, doc: doc(md), plugins: [history()] })
  let pos = -1
  state.doc.descendants((node, p) => {
    if (pos < 0 && node.isText && node.text!.includes(at)) pos = p + node.text!.indexOf(at) + at.length
  })
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)))
  return state.apply(state.tr.insertText(text))
}

function undone(state: EditorState): EditorState {
  let next = state
  undo(state, (tr: Transaction) => {
    next = state.apply(tr)
  })
  return next
}

describe('reloadTransaction', () => {
  it('keeps the cursor at its place in the text', () => {
    const state = typed('The lamp was out.\n\nElias waited.\n', 'Elias', ' always')
    const outside = doc('The old lamp was out at last.\n\nElias always waited.\n')
    const next = state.apply(reloadTransaction(state, outside, false)!)
    expect(next.doc.textContent).toBe('The old lamp was out at last.Elias always waited.')
    // The cursor stays after "Elias always", in the second paragraph.
    const $head = next.selection.$head
    expect($head.parent.textContent.slice(0, $head.parentOffset)).toBe('Elias always')
  })

  it('keeps the undo history after a change from outside', () => {
    const state = typed('The lamp was out.\n\nElias waited.\n', 'Elias', ' always')
    const outside = doc('The old lamp was out.\n\nElias always waited.\n')
    const next = undone(state.apply(reloadTransaction(state, outside, false)!))
    // Ctrl+Z undoes the typing of the author; the change from outside stays.
    expect(next.doc.textContent).toBe('The old lamp was out.Elias waited.')
  })

  it('makes a restored version undoable', () => {
    const state = typed('The lamp was out.\n', 'lamp', ' light')
    const older = doc('A different text.\n')
    const restored = state.apply(reloadTransaction(state, older, true)!)
    expect(restored.doc.textContent).toBe('A different text.')
    expect(undone(restored).doc.textContent).toBe('The lamp light was out.')
  })

  it('does nothing when the text is the same', () => {
    const state = typed('The lamp was out.\n', 'lamp', '')
    expect(reloadTransaction(state, doc('The lamp was out.\n'), false)).toBeNull()
  })

  it('keeps the history when a new editor takes the state', () => {
    const state = typed('The lamp was out.\n', 'lamp', ' light')
    // A new editor has new plugin instances; the history field has the same key.
    const again = state.reconfigure({ plugins: [history()] })
    expect(undone(again).doc.textContent).toBe('The lamp was out.')
  })

  it('loads a text of the schema of another editor without losing it', () => {
    // A chapter far from the screen keeps the state of its first editor, with the schema of that editor.
    // A change while it has no editor (an accepted chat change, a file from outside, a restore) is parsed
    // in the schema of the next editor. The replace across two schemas emptied the whole chapter.
    const state = typed('The lamp was out.\n\nElias waited.\n\nMarta came.\n', 'Elias', ' always')
    const other = getSchema(schemaExtensions())
    expect(other).not.toBe(schema)
    const changed = other.nodeFromJSON(parseMarkdown('The lamp was out.\n\nElias always waited, with a gold cord.\n\nMarta came.\n'))
    const next = state.apply(reloadTransaction(state, changed, false)!)
    expect(next.doc.textContent).toBe('The lamp was out.Elias always waited, with a gold cord.Marta came.')
    // The undo history of the typing stays.
    expect(undone(next).doc.textContent).toBe('The lamp was out.Elias waited, with a gold cord.Marta came.')
  })

  it('never empties a text that the new text has', () => {
    const state = typed('The lamp was out.\n\nElias waited.\n', 'Elias', ' always')
    const other = getSchema(schemaExtensions())
    const changed = other.nodeFromJSON(parseMarkdown('The lamp was out.\n\nElias always waited.\n\nA new line.\n'))
    const tr = reloadTransaction(state, changed, true)
    expect(tr).not.toBeNull()
    expect(state.apply(tr!).doc.textContent).toBe('The lamp was out.Elias always waited.A new line.')
  })
})
