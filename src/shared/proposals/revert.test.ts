import { describe, expect, it } from 'vitest'
import { applyHunk } from './apply'
import { revertChanges } from './revert'

describe('revertChanges', () => {
  it('puts the old text back', () => {
    const before = 'Marta disse que sim.\n\nO farol apagou.\n'
    const after = applyHunk(before, 'disse que sim', 'murmurou que sim')
    expect(after.ok).toBe(true)
    const r = revertChanges(after.ok ? after.text : '', [{ find: 'disse que sim', replace: 'murmurou que sim' }])
    expect(r).toEqual({ text: before, reverted: 1, failed: 0 })
  })

  it('keeps words that the user wrote after the change', () => {
    const now = 'Marta murmurou que sim.\n\nO farol apagou. Elias correu.\n'
    const r = revertChanges(now, [{ find: 'disse que sim', replace: 'murmurou que sim' }])
    expect(r.text).toBe('Marta disse que sim.\n\nO farol apagou. Elias correu.\n')
  })

  it('undoes changes from the last to the first', () => {
    const changes = [
      { find: 'a gray sea', replace: 'a grey sea' },
      { find: 'a grey sea', replace: 'the grey water' }
    ]
    expect(revertChanges('Under the grey water.\n', changes).text).toBe('Under a gray sea.\n')
  })

  it('leaves a change when its text changed later', () => {
    const r = revertChanges('Marta whispered yes.\n', [{ find: 'said yes', replace: 'murmured yes' }])
    expect(r).toEqual({ text: 'Marta whispered yes.\n', reverted: 0, failed: 1 })
  })

  it('removes an appended passage', () => {
    const appended = applyHunk('Fim.\n', '', 'Novo.')
    const r = revertChanges(appended.ok ? appended.text : '', [{ find: '', replace: 'Novo.' }])
    expect(r.text).toBe('Fim.\n')
  })

  it('cannot undo a deletion', () => {
    expect(revertChanges('A.\n', [{ find: 'B.', replace: '' }]).failed).toBe(1)
  })
})
