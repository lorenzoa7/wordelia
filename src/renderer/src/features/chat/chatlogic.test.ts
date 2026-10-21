import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@shared/types'
import { closeMarkdown } from './markdown'
import { matchCandidates, mentionQueryIn, type Candidate } from './mentions'
import { formatCost, sumUsage } from './usage'

describe('cut Markdown', () => {
  it('closes a bold mark that the stop cut', () => {
    expect(closeMarkdown("**Marta's reaction is the weak")).toBe("**Marta's reaction is the weak**")
  })

  it('takes away a mark with no text after it', () => {
    expect(closeMarkdown('The visitor needs a detail. **')).toBe('The visitor needs a detail.')
  })

  it('closes italic inside bold in the right order', () => {
    expect(closeMarkdown('**Bold and *italic')).toBe('**Bold and *italic***')
  })

  it('leaves complete text, list bullets and earlier paragraphs alone', () => {
    expect(closeMarkdown('A *word* and **two**.')).toBe('A *word* and **two**.')
    expect(closeMarkdown('* one\n* two')).toBe('* one\n* two')
    expect(closeMarkdown('**Done.**\n\nNext **one')).toBe('**Done.**\n\nNext **one**')
  })

  it('closes code', () => {
    expect(closeMarkdown('Use `find')).toBe('Use `find`')
    expect(closeMarkdown('```\nlet a = 1')).toBe('```\nlet a = 1\n```')
  })
})

describe('mentions', () => {
  const all: Candidate[] = [
    { kind: 'chapter', id: 'c1', label: 'The Storm' },
    { kind: 'entry', id: 'e1', label: 'Elias', aliases: ['Elias', 'the keeper'] },
    { kind: 'entry', id: 'e2', label: 'Marta' },
    { kind: 'entry', id: 'e3', label: 'Saint Isle' }
  ]

  it('finds a note by another name', () => {
    const hits = matchCandidates(all, 'keep')
    expect(hits.map((h) => h.id)).toEqual(['e1'])
    expect(hits[0].alias).toBe('the keeper')
  })

  it('finds a name with a space', () => {
    expect(matchCandidates(all, 'Saint I').map((h) => h.id)).toEqual(['e3'])
    expect(matchCandidates(all, 'saint ').map((h) => h.id)).toEqual(['e3'])
  })

  it('puts names that start with the letters first', () => {
    expect(matchCandidates(all, 'e').map((h) => h.id)).toEqual(['e1', 'c1', 'e3'])
  })

  it('reads the query after "@", with spaces, but not "@ " alone', () => {
    expect(mentionQueryIn('About @Saint I')).toEqual({ text: 'Saint I', length: 7 })
    expect(mentionQueryIn('@')).toEqual({ text: '', length: 0 })
    expect(mentionQueryIn('a @ b')).toBeNull()
    expect(mentionQueryIn('mail@home')).toBeNull()
  })
})

describe('usage', () => {
  it('adds the tokens and the cost of the replies', () => {
    const m = (usage?: ChatMessage['usage']): ChatMessage => ({ id: 'x', role: 'assistant', content: 'x', createdAt: '', ...(usage ? { usage } : {}) })
    expect(sumUsage([m({ inputTokens: 1200, outputTokens: 180 }), m(), m({ inputTokens: 800, outputTokens: 20, costUsd: 0.012 })])).toEqual({
      inputTokens: 2000,
      outputTokens: 200,
      costUsd: 0.012,
      replies: 2
    })
    expect(sumUsage([m({ inputTokens: 5 })]).costUsd).toBeNull()
  })

  it('writes a small cost with three digits', () => {
    expect(formatCost(0.0123, 'en-US')).toBe('$0.012')
    expect(formatCost(1.2, 'en-US')).toBe('$1.20')
  })
})
