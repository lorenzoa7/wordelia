import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../types'
import { hasProposals, parseProposals, replyProse } from './parse'
import { currentFrom, digestEnd, hasIncomplete, oldPending, pendingKeys } from './state'

const edit = (find: string, replace: string): string => `<edit file="manuscript/The Storm.md">\n<find>${find}</find>\n<replace>${replace}</replace>\n</edit>`
const user = (id: string): ChatMessage => ({ id, role: 'user', content: 'Improve it.', createdAt: '2026-01-01T00:00:00Z' })
const reply = (id: string, content: string, hunks?: ChatMessage['hunks']): ChatMessage => ({ id, role: 'assistant', content, createdAt: '2026-01-01T00:00:01Z', ...(hunks ? { hunks } : {}) })

describe('pending proposals', () => {
  it('never counts a change that the reply did not finish', () => {
    // The author pressed Stop in the middle of <replace>.
    const cut = 'Here is a tighter version.\n\n<edit file="manuscript/The Storm.md">\n<find>Elias lit the lamp.</find>\n<replace>Elias lit the lamp, as he had for twenty-two y'
    const segments = parseProposals(cut)
    expect(pendingKeys(segments)).toEqual([])
    expect(hasIncomplete(segments)).toBe(true)
  })

  it('never counts a note or a portrait that the reply did not finish', () => {
    expect(pendingKeys(parseProposals('<create file="planning/Characters/Teresa.md">\n---\nsummary: A cut no'))).toEqual([])
    expect(pendingKeys(parseProposals('<portrait file="planning/Characters/Marta.md">_assets/chat/ma'))).toEqual([])
  })

  it('counts the complete changes of a reply, and not the decided ones', () => {
    const text = `${edit('a', 'b')}\n<create file="planning/Places/The Harbor.md">\nText\n</create>`
    expect(pendingKeys(parseProposals(text))).toEqual(['0:0', '1:0'])
    expect(pendingKeys(parseProposals(text), { '0:0': 'accepted' })).toEqual(['1:0'])
    expect(hasIncomplete(parseProposals(text))).toBe(false)
  })
})

describe('current and old replies', () => {
  const thread: ChatMessage[] = [user('u1'), reply('a1', edit('one', 'One')), user('u2'), reply('a2', edit('two', 'Two'))]

  it('the replies after the last message of the author are current', () => {
    expect(currentFrom(thread)).toBe(3)
    expect(currentFrom([...thread, user('u3')])).toBe(5)
    expect(currentFrom([])).toBe(0)
  })

  it('lists the pending proposals of the old replies', () => {
    expect(oldPending(thread)).toEqual([{ messageId: 'a1', keys: ['0:0'] }])
    // A new message of the author makes the last reply old too.
    expect(oldPending([...thread, user('u3')]).map((x) => x.messageId)).toEqual(['a1', 'a2'])
    expect(oldPending([user('u1'), reply('a1', edit('one', 'One'), { '0:0': 'rejected' }), user('u2')])).toEqual([])
  })
})

describe('the digest waits for the decisions', () => {
  it('stops before a current reply with proposals that wait', () => {
    expect(digestEnd([user('u1'), reply('a1', edit('one', 'One'))])).toBe(1)
  })

  it('covers the reply when its proposals are decided, or when they are old', () => {
    expect(digestEnd([user('u1'), reply('a1', edit('one', 'One'), { '0:0': 'accepted' })])).toBe(2)
    expect(digestEnd([user('u1'), reply('a1', edit('one', 'One')), user('u2'), reply('a2', 'Plain text.')])).toBe(4)
  })
})

describe('the prose of a reply', () => {
  it('has no proposals and no words about them', () => {
    const text = `Here is a tighter version of this paragraph.\n\n${edit('Elias lit the lamp.', 'Elias lit it.')}\n\nIt keeps the voice.`
    expect(replyProse(text)).toBe('Here is a tighter version of this paragraph.\n\nIt keeps the voice.')
    expect(replyProse(text)).not.toContain('[Proposed')
    expect(hasProposals(text)).toBe(true)
    expect(hasProposals('Three titles: The Storm, The Keeper, The Boat.')).toBe(false)
  })
})
