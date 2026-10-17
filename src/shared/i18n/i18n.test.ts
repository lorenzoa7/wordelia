import { describe, expect, it } from 'vitest'
import { DEFAULT_ACTIONS } from '../ai/defaults'
import { MESSAGES, actionInstructions } from '.'

describe('built-in action instructions', () => {
  it('the English text is the default text', () => {
    for (const a of DEFAULT_ACTIONS) expect(MESSAGES.en.common.builtinActionInstructions[a.id]).toBe(a.instructions)
  })
  it('each language has each built-in action, with the same number of lines', () => {
    for (const locale of ['pt-BR', 'es'] as const) {
      for (const a of DEFAULT_ACTIONS) {
        const text = MESSAGES[locale].common.builtinActionInstructions[a.id]
        expect(text, `${locale} ${a.id}`).toBeTruthy()
        expect(text.split('\n').length, `${locale} ${a.id}`).toBe(a.instructions.split('\n').length)
      }
    }
  })
  it('shows unchanged instructions in the interface language, and changed ones as they are', () => {
    const polish = DEFAULT_ACTIONS[0]
    const pt = MESSAGES['pt-BR']
    expect(actionInstructions(pt, polish)).toBe(pt.common.builtinActionInstructions.polish)
    expect(actionInstructions(MESSAGES.en, polish)).toBe(polish.instructions)
    expect(actionInstructions(pt, { ...polish, instructions: 'Minhas regras.' })).toBe('Minhas regras.')
    expect(actionInstructions(pt, { ...polish, builtIn: false })).toBe(polish.instructions)
  })
})

describe('effort names', () => {
  it('stay in English in every language', () => {
    expect(MESSAGES['pt-BR'].common.efforts).toEqual(MESSAGES.en.common.efforts)
    expect(MESSAGES.es.common.efforts).toEqual(MESSAGES.en.common.efforts)
  })
})
