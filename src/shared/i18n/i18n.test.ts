import { describe, expect, it } from 'vitest'
import { BUILTIN_ACTIONS, DEFAULT_ACTIONS } from '../ai/defaults'
import { MESSAGES, actionInstructions } from '.'

describe('built-in action instructions', () => {
  it('the English text is the default text', () => {
    for (const a of BUILTIN_ACTIONS) expect(MESSAGES.en.common.builtinActionInstructions[a.id]).toBe(a.instructions)
  })
  it('each language has each built-in action, with the same number of lines', () => {
    for (const locale of ['pt-BR', 'es'] as const) {
      for (const a of BUILTIN_ACTIONS) {
        const text = MESSAGES[locale].common.builtinActionInstructions[a.id]
        expect(text, `${locale} ${a.id}`).toBeTruthy()
        expect(text.split('\n').length, `${locale} ${a.id}`).toBe(a.instructions.split('\n').length)
      }
    }
  })
  it('each language has a name for each built-in action, also for the retired ones', () => {
    for (const locale of ['en', 'pt-BR', 'es'] as const) {
      for (const a of BUILTIN_ACTIONS) expect(MESSAGES[locale].common.builtinActions[a.id], `${locale} ${a.id}`).toBeTruthy()
    }
    expect(MESSAGES.en.common.builtinActions).toEqual(Object.fromEntries(BUILTIN_ACTIONS.map((a) => [a.id, a.name])))
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
  it('are in the language of the interface, for each level', () => {
    for (const locale of ['pt-BR', 'es'] as const) {
      expect(Object.keys(MESSAGES[locale].common.efforts)).toEqual(Object.keys(MESSAGES.en.common.efforts))
      expect(MESSAGES[locale].common.efforts.medium).not.toBe(MESSAGES.en.common.efforts.medium)
    }
    expect(MESSAGES['pt-BR'].common.efforts.medium).toBe('Médio')
  })
})
