// The text of the chat composer, with mentions in the text ("What do you think of @Marta here?").
// The composer is a small TipTap editor: one paragraph, line breaks, and inline mention nodes.
// These helpers read and write its document as JSON. They are pure, so the tests can use them.
//
// A sent message keeps two parts: the text, where each mention shows as "@Label", and the list of
// mentions with their ids. The prompt builder reads the ids. The chat finds "@Label" in the text again
// to show each mention as a pill in its place.

import type { Mention } from '@shared/types'

export type DraftInline = { type: 'text'; text: string } | { type: 'hardBreak' } | { type: 'mention'; attrs: Mention }

export interface DraftParagraph {
  type: 'paragraph'
  content?: DraftInline[]
}

export interface DraftDoc {
  type: 'doc'
  content: DraftParagraph[]
}

/** The text of a mention in a message. */
export function mentionToken(m: Pick<Mention, 'label'>): string {
  return `@${m.label}`
}

/** A document from text and mentions, in order. A line break in the text becomes a hard break. */
export function docFromParts(parts: Array<string | Mention>): DraftDoc {
  const content: DraftInline[] = []
  for (const p of parts) {
    if (typeof p !== 'string') {
      content.push({ type: 'mention', attrs: { kind: p.kind, id: p.id, label: p.label } })
      continue
    }
    p.replace(/\r\n?/g, '\n')
      .split('\n')
      .forEach((line, i) => {
        if (i > 0) content.push({ type: 'hardBreak' })
        if (line) content.push({ type: 'text', text: line })
      })
  }
  return { type: 'doc', content: [content.length ? { type: 'paragraph', content } : { type: 'paragraph' }] }
}

export function docFromText(text: string): DraftDoc {
  return docFromParts([text])
}

/** The text to send, and the mentions in it (each one once, in order). Paragraphs and hard breaks become line breaks. */
export function readDraft(doc: DraftDoc | null): { text: string; mentions: Mention[] } {
  const mentions: Mention[] = []
  const lines = (doc?.content ?? []).map((p) =>
    (p.content ?? [])
      .map((n) => {
        if (n.type === 'text') return n.text
        if (n.type === 'hardBreak') return '\n'
        if (n.type === 'mention') {
          const m = { kind: n.attrs.kind, id: n.attrs.id, label: n.attrs.label }
          if (!mentions.some((x) => x.id === m.id)) mentions.push(m)
          return mentionToken(m)
        }
        return ''
      })
      .join('')
  )
  return { text: lines.join('\n'), mentions }
}

/** Put a mention at the end of the text, with a space before it when necessary and a space after it. */
export function appendMention(doc: DraftDoc | null, m: Mention): DraftDoc {
  const base = doc ?? docFromText('')
  const paragraphs = base.content.length ? base.content : [{ type: 'paragraph' as const }]
  const last = paragraphs[paragraphs.length - 1]
  const content = [...(last.content ?? [])]
  const end = content[content.length - 1]
  if (end && !(end.type === 'text' && /\s$/.test(end.text)) && end.type !== 'hardBreak') content.push({ type: 'text', text: ' ' })
  content.push({ type: 'mention', attrs: { kind: m.kind, id: m.id, label: m.label } }, { type: 'text', text: ' ' })
  return { type: 'doc', content: [...paragraphs.slice(0, -1), { type: 'paragraph', content }] }
}

/** Remove a mention, in each place where it is. */
export function withoutMention(doc: DraftDoc | null, id: string): DraftDoc {
  const base = doc ?? docFromText('')
  return {
    type: 'doc',
    content: base.content.map((p) => ({ ...p, content: (p.content ?? []).filter((n) => !(n.type === 'mention' && n.attrs.id === id)) }))
  }
}

/**
 * Find the mentions of a message in its text. `parts` is the text in pieces, with each mention in its place.
 * `rest` has the mentions that are not in the text: messages from before inline mentions kept them apart.
 */
export function splitMentions(content: string, mentions: Mention[]): { parts: Array<string | Mention>; rest: Mention[] } {
  // Longer labels first: "@Marta Lopes" before "@Marta".
  const tokens = mentions.map((m) => ({ m, token: mentionToken(m) })).sort((a, b) => b.token.length - a.token.length)
  const used = new Set<string>()
  const parts: Array<string | Mention> = []
  let text = ''
  let i = 0
  while (i < content.length) {
    const hit = content[i] === '@' ? tokens.find((x) => x.token.length > 1 && content.startsWith(x.token, i)) : undefined
    if (!hit) {
      text += content[i]
      i++
      continue
    }
    if (text) parts.push(text)
    text = ''
    parts.push(hit.m)
    used.add(hit.m.id)
    i += hit.token.length
  }
  if (text) parts.push(text)
  return { parts, rest: mentions.filter((m) => !used.has(m.id)) }
}
