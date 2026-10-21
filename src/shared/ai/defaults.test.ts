import { describe, expect, it } from 'vitest'
import type { AiAction } from '../types'
import { BUILTIN_ACTIONS, DEFAULT_ACTIONS, RETIRED_ACTIONS, isUnchangedBuiltIn, rulesForAi, withoutRetiredActions, writingRulesTemplate } from './defaults'
import { writingRulesBlock } from '../prompts/context'
import { withDefaultShortcuts } from './shortcuts'

const expand = RETIRED_ACTIONS.find((a) => a.id === 'expand') as AiAction
/** The actions of a settings file of version 4 that the author did not change. */
const version4 = (): AiAction[] => [...DEFAULT_ACTIONS, expand].map((a) => ({ ...a }))
const own: AiAction = { id: 'act_own', name: 'Darker', icon: 'Feather', builtIn: false, route: null, contextChars: 2000, instructions: 'Make it darker.', shortcut: 'Alt+6' }

describe('default actions', () => {
  it('are four, with Polish as the main action on Ctrl+J', () => {
    expect(DEFAULT_ACTIONS.map((a) => a.id)).toEqual(['polish', 'tighten', 'grammar', 'show'])
    expect(DEFAULT_ACTIONS[0].shortcut).toBe('Ctrl+J')
  })
  it('a retired action is not a default, and each built-in id is used once', () => {
    expect(DEFAULT_ACTIONS.some((a) => a.id === 'expand')).toBe(false)
    const ids = BUILTIN_ACTIONS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('settings version 5: retired actions', () => {
  it('removes Expand when the author did not change it', () => {
    const out = withoutRetiredActions(version4(), 'polish')
    expect(out.map((a) => a.id)).toEqual(['polish', 'tighten', 'grammar', 'show'])
  })
  it('keeps the shortcuts of the other actions; Alt+5 becomes free', () => {
    const out = withoutRetiredActions([...version4(), own], 'polish')
    expect(out.map((a) => [a.id, a.shortcut])).toEqual([
      ['polish', 'Ctrl+J'],
      ['tighten', 'Alt+2'],
      ['grammar', 'Alt+3'],
      ['show', 'Alt+4'],
      ['act_own', 'Alt+6']
    ])
  })
  it('keeps Expand when the author changed it', () => {
    const changes: Array<Partial<AiAction>> = [
      { name: 'Grow' },
      { instructions: 'Add more smell and sound.' },
      { route: { provider: 'claude-code', model: 'opus' } },
      { effort: 'high' },
      { shortcut: 'Ctrl+Shift+E' },
      { icon: 'Feather' }
    ]
    for (const change of changes) {
      const actions = version4().map((a) => (a.id === 'expand' ? { ...a, ...change } : a))
      expect(withoutRetiredActions(actions, 'polish').some((a) => a.id === 'expand'), JSON.stringify(change)).toBe(true)
    }
  })
  it('keeps Expand without a shortcut in version 4: the author cleared it', () => {
    const actions = version4().map((a) => (a.id === 'expand' ? { ...a, shortcut: undefined } : a))
    expect(withoutRetiredActions(actions, 'polish').some((a) => a.id === 'expand')).toBe(true)
  })
  it('keeps Expand when it is the main action', () => {
    expect(withoutRetiredActions(version4(), 'expand').some((a) => a.id === 'expand')).toBe(true)
  })
  it('keeps an own action with the id of a retired one only when it is not a built-in', () => {
    const mine = { ...expand, builtIn: false }
    expect(withoutRetiredActions([...DEFAULT_ACTIONS, mine], 'polish')).toContainEqual(mine)
  })
  it('settings from before version 4: the shortcut by position does not count as a change', () => {
    const old = [...DEFAULT_ACTIONS, expand].map(({ shortcut, ...a }) => (void shortcut, a))
    // The same steps as the settings migration: shortcuts by position first, then the retired actions.
    const withKeys = withDefaultShortcuts([old[4], ...old.slice(0, 4)], 'polish')
    expect(withKeys[0].shortcut).toBe('Alt+1')
    expect(isUnchangedBuiltIn(withKeys[0], expand)).toBe(false)
    expect(isUnchangedBuiltIn(withKeys[0], expand, true)).toBe(true)
    expect(withoutRetiredActions(withKeys, 'polish', true).map((a) => a.id)).toEqual(['polish', 'tighten', 'grammar', 'show'])
  })
  it('never leaves the list empty', () => {
    expect(withoutRetiredActions([{ ...expand }], 'polish')).toHaveLength(1)
  })
})

describe('the writing rules that the AI gets', () => {
  it('leaves out the notes and the examples of the template of a new book', () => {
    const rules = rulesForAi(writingRulesTemplate('Brazilian Portuguese'))
    expect(rules).toBe('# Writing rules\n\n## Language\n- Write in Brazilian Portuguese.')
    expect(rules).not.toMatch(/Example|1899|dash/)
  })
  it('keeps the rules of the author, also next to an example that is left', () => {
    const own = '# Writing rules\n\n## Dialogue\n- (Example: dialogue lines start with a dash.)\n- Dialogue goes in double quotation marks.\n\n## Avoid\n- (Exemplo: gírias modernas.)'
    expect(rulesForAi(own)).toBe('# Writing rules\n\n## Dialogue\n- Dialogue goes in double quotation marks.')
  })
  it('gives no rules when only headings are left, so the prompt says that there are none', () => {
    expect(rulesForAi('# Writing rules\n\n## Voice\n- (Example: third person.)')).toBe('')
    expect(writingRulesBlock('# Writing rules\n\n## Voice\n- (Example: third person.)')).toContain('has not written rules yet')
  })
})
