// Which proposals of a thread wait for a decision.
//
// - A proposal that the reply did not finish (the author stopped it, or it failed) is never pending:
//   it cannot be accepted, in the card, in "Apply all" or in the text.
// - The proposals of the replies before the last message of the author are old: the author moved on.
//   They leave the text and the state of the thread, but their cards keep Accept and Reject.

import type { ChatMessage, HunkState } from '../types'
import { hunkKey, parseProposals, type Segment } from './parse'

/** The keys of the proposals in a message that wait for a decision. Only complete proposals can wait. */
export function pendingKeys(segments: Segment[], states: Record<string, HunkState> = {}): string[] {
  const keys: string[] = []
  for (const s of segments) {
    if ((s.kind === 'create' || s.kind === 'portrait') && s.complete) keys.push(hunkKey(s.index, 0))
    if (s.kind === 'edit') s.hunks.forEach((h, i) => h.complete && keys.push(hunkKey(s.index, i)))
  }
  return keys.filter((k) => !states[k] || states[k] === 'pending')
}

/** True when a reply has a proposal that it did not finish. */
export function hasIncomplete(segments: Segment[]): boolean {
  return segments.some((s) => (s.kind === 'edit' ? !s.complete || s.hunks.some((h) => !h.complete) : s.kind !== 'text' && !s.complete))
}

/**
 * The index of the first message whose proposals are current: the messages after the last message of
 * the author. The proposals of the replies before it are old.
 */
export function currentFrom(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return i + 1
  return 0
}

/**
 * How many messages the digest of a thread can cover now. A current reply with proposals that wait
 * stops it: the digest comes after the decisions of the author, so it knows them.
 */
export function digestEnd(messages: ChatMessage[]): number {
  for (let i = currentFrom(messages); i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'assistant' && pendingKeys(parseProposals(m.content), m.hunks).length) return i
  }
  return messages.length
}

/** The pending proposals of the old replies of a thread, by message id. */
export function oldPending(messages: ChatMessage[]): Array<{ messageId: string; keys: string[] }> {
  const from = currentFrom(messages)
  const out: Array<{ messageId: string; keys: string[] }> = []
  messages.slice(0, from).forEach((m) => {
    if (m.role !== 'assistant' || !m.content.includes('<')) return
    const keys = pendingKeys(parseProposals(m.content), m.hunks)
    if (keys.length) out.push({ messageId: m.id, keys })
  })
  return out
}
