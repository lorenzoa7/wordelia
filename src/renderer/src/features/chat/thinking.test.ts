import { describe, expect, it } from 'vitest'
import { parseProposals } from '@shared/proposals/parse'
import { latestThought, streamPhase } from './thinking'

describe('latestThought', () => {
  it('shows the last complete sentence', () => {
    expect(latestThought('I read the chapter. The opening carries the tone of the whole book')).toBe('I read the chapter.')
    expect(latestThought('I read the chapter. The opening carries the tone.')).toBe('The opening carries the tone.')
  })

  it('shows the first sentence while it is written, when it has a few words', () => {
    expect(latestThought('The verbs are soft and')).toBe('The verbs are soft and')
    expect(latestThought('The verbs')).toBe('')
  })

  it('reads a bold heading as a thought', () => {
    expect(latestThought('**Checking the dialogue against the planning**\n\n')).toBe('Checking the dialogue against the planning')
  })

  it('shortens a long sentence', () => {
    const s = latestThought(`${'word '.repeat(60)}end`)
    expect(s.length).toBeLessThanOrEqual(140)
    expect(s.endsWith('…')).toBe(true)
  })

  it('is empty without thinking', () => {
    expect(latestThought('  \n ')).toBe('')
  })
})

describe('streamPhase', () => {
  it('reads before the first words', () => {
    expect(streamPhase(parseProposals(''))).toEqual({ kind: 'reading' })
  })

  it('sees an edit while it streams', () => {
    expect(streamPhase(parseProposals('Here.\n<edit file="manuscript/One.md">\n<find>old'))).toEqual({ kind: 'edit', file: 'manuscript/One.md' })
  })

  it('sees a planning note while it streams', () => {
    expect(streamPhase(parseProposals('<create file="planning/Characters/Teresa.md">\n---'))).toEqual({
      kind: 'create',
      file: 'planning/Characters/Teresa.md'
    })
  })

  it('sees plain text', () => {
    expect(streamPhase(parseProposals('Good question.'))).toEqual({ kind: 'text' })
    expect(streamPhase(parseProposals('<edit file="a.md"><find>a</find><replace>b</replace></edit> Done'))).toEqual({ kind: 'text' })
  })
})
