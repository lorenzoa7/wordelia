import { describe, expect, it } from 'vitest'
import { defaultEffortLabel, effortChoices, friendlyModelName, modelLabel, nearestEffort, parseClaudeHelp, parseEfforts } from './effort'
import { suggestRoutes } from './routes'

const HELP = `
  --effort <level>                      Effort level for the current session
                                        (low, medium, high, xhigh, max)
  --model <model>                       Model for the current session. Provide
                                        an alias for the latest model (e.g.
                                        'fable', 'opus', or 'sonnet') or a
                                        model's full name.`

describe('effort', () => {
  it('reads aliases and efforts from the claude help', () => {
    expect(parseClaudeHelp(HELP)).toEqual({ aliases: ['fable', 'opus', 'sonnet'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'] })
  })
  it('sees an old CLI without the effort option', () => {
    expect(parseClaudeHelp('  --model <model>  Model for the session (e.g. \'opus\')').efforts).toEqual([])
  })
  it('parses and orders effort names', () => {
    expect(parseEfforts('high, low, banana, medium, low')).toEqual(['low', 'medium', 'high'])
  })
  it('finds the nearest supported effort', () => {
    expect(nearestEffort('max', { efforts: ['low', 'medium', 'high'] })).toBe('high')
    expect(nearestEffort('minimal', { efforts: ['low', 'medium'] })).toBe('low')
    expect(nearestEffort('high', { efforts: [] })).toBeUndefined()
    expect(nearestEffort('high', undefined)).toBe('high')
  })
  it('offers the levels of the model, or none', () => {
    expect(effortChoices({ efforts: [] })).toBeNull()
    expect(effortChoices(undefined)).toEqual(['low', 'medium', 'high'])
    expect(effortChoices({ efforts: ['low', 'high'] }, 'max')).toEqual(['low', 'high', 'max'])
  })
  it('names the default', () => {
    expect(defaultEffortLabel({ defaultEffort: 'medium' }, true)).toBe('Default (Medium)')
    expect(defaultEffortLabel(undefined, true)).toBe('Default (automatic)')
  })
  it('makes friendly model names', () => {
    expect(friendlyModelName('claude-opus-5-5')).toBe('Claude Opus 5.5')
    expect(friendlyModelName('claude-haiku-4-5-20251001')).toBe('Claude Haiku 4.5')
    expect(friendlyModelName('gpt-5.5')).toBe('gpt-5.5')
    expect(friendlyModelName('claude-opus-5-5[1m]')).toBe('Claude Opus 5.5')
  })
  it('makes short model labels with the version', () => {
    expect(modelLabel('claude-opus-5-5')).toBe('Opus 5.5')
    expect(modelLabel('claude-fable-5-1')).toBe('Fable 5.1')
    expect(modelLabel('claude-opus-5')).toBe('Opus 5')
    expect(modelLabel('Claude Sonnet 5.5')).toBe('Sonnet 5.5')
    expect(modelLabel('GPT-5.5')).toBe('GPT-5.5')
  })
  it('suggests an explicit effort for each Claude Code task', () => {
    const r = suggestRoutes('claude-code', [{ id: 'opus', label: 'Opus', efforts: ['low', 'medium', 'high'] }])
    expect(r.chat).toEqual({ provider: 'claude-code', model: 'opus', effort: 'medium' })
    expect(r.action).toEqual({ provider: 'claude-code', model: 'sonnet', effort: 'medium' })
    expect(r.background).toEqual({ provider: 'claude-code', model: 'haiku', effort: 'low' })
  })
})
