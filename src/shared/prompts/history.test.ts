import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../types'
import { chatHistory } from './chat'

const at = '2026-01-01T00:00:00Z'
const user = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'user', content, createdAt: at, ...extra })
const reply = (id: string, content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: 'assistant', content, createdAt: at, ...extra })

describe('the history of a thread for the AI', () => {
  it('leaves out a failed reply and joins the two messages of the author', () => {
    const turns = chatHistory(
      [user('u1', 'Is Marta too quick?'), reply('a1', '', { error: 'No connection to the AI provider.' }), user('u2', 'And the visitor?'), reply('a2', 'He needs one detail.')],
      24
    )
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant'])
    expect(turns[0].content).toBe('Is Marta too quick?\n\nAnd the visitor?')
    expect(turns.every((t) => t.content.trim().length > 0)).toBe(true)
  })

  it('leaves out an empty reply', () => {
    const turns = chatHistory([user('u1', 'Hello'), reply('a1', '   ')], 24)
    expect(turns).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('keeps a stopped reply with a note that it stops there', () => {
    const turns = chatHistory([user('u1', 'Three titles?'), reply('a1', 'The Storm, The Keep', { stopped: true })], 24)
    expect(turns[1].content).toBe('The Storm, The Keep\n\n[The author stopped this reply here.]')
  })

  it('starts with a message of the author, and keeps the images', () => {
    const image = { file: '_assets/chat/marta.webp', name: 'marta.png', width: 10, height: 10 }
    const turns = chatHistory([user('u1', 'Old'), reply('a1', 'Old reply'), user('u2', 'This is Marta.', { images: [image] }), reply('a2', 'I see her.')], 3)
    expect(turns[0].role).toBe('user')
    expect(turns[0].images).toEqual([image])
    expect(turns[0].content).toContain('<image file="_assets/chat/marta.webp"')
  })

  it('shows each proposal as one short line with the decision of the author', () => {
    const content = 'A tighter version.\n<edit file="manuscript/The Storm.md">\n<find>old</find>\n<replace>new</replace>\n</edit>'
    const turns = chatHistory([user('u1', 'Improve it.'), reply('a1', content, { hunks: { '0:0': 'accepted' } })], 24)
    expect(turns[1].content).toContain('accepted by the author')
    expect(turns[1].content).not.toContain('<edit')
  })

  // A paragraph of about 90 words: longer than the short lines of the history.
  const FIND = 'Elias lit the lighthouse lamp at six o’clock sharp, as he had done for twenty-two years. ' + 'Outside, the sea was very rough. '.repeat(8)
  const REPLACE = 'Elias lit the lamp at six sharp, as he had for twenty-two years. ' + 'Outside, the sea was rough. '.repeat(8) + 'He gazed at the horizon.'
  const edit = (find: string, replace: string): string => `A tighter version.\n<edit file="manuscript/The Storm.md">\n<find>${find}</find>\n<replace>${replace}</replace>\n</edit>`

  it('gives the full <find> and <replace> of a change that waits, so the AI can change it', () => {
    const turns = chatHistory([user('u1', 'Improve it.'), reply('a1', edit(FIND, REPLACE)), user('u2', 'Change the proposal: keep the old verb.')], 24)
    const text = turns[1].content
    expect(text).toContain('not decided yet')
    expect(text).toContain('not in the file yet')
    expect(text).toContain('<edit file="manuscript/The Storm.md">')
    expect(text).toContain(`<find>${FIND}</find>`)
    expect(text).toContain(`<replace>${REPLACE}</replace>`)
  })

  it('an accepted or a rejected change stays one short line', () => {
    for (const state of ['accepted', 'rejected'] as const) {
      const text = chatHistory([user('u1', 'Improve it.'), reply('a1', edit(FIND, REPLACE), { hunks: { '0:0': state } })], 24)[1].content
      expect(text).not.toContain(REPLACE)
      expect(text).not.toContain('<find>')
    }
  })

  it('keeps the history small: changes that wait beyond the budget are short lines, the newest in full', () => {
    const long = 'A long passage. '.repeat(1500)
    const turns = chatHistory([user('u1', 'Write a long scene.'), reply('a1', edit('', long)), user('u2', 'Improve it.'), reply('a2', edit(FIND, REPLACE))], 24)
    const all = turns.map((t) => t.content).join('\n')
    expect(all.length).toBeLessThan(long.length)
    expect(all).toContain(`<replace>${REPLACE}</replace>`)
    expect(turns[1].content).toContain('not decided yet')
  })
})
