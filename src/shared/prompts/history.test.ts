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
})
