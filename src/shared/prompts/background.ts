// Prompts for background jobs: thread digests, chapter summaries, thread titles.

import type { ChatMessage } from '../types'
import { proposalSummary } from '../proposals/parse'

export function buildDigestSystem(): string {
  return [
    'You keep the memory of one chat thread between a novelist and their AI editor.',
    'Other threads read this memory, so it must hold every fact and decision that matters for the book.',
    '',
    'Update the digest with the new messages:',
    '- Keep facts about the story, decisions the author made, ideas the author liked, and open questions.',
    '- Drop small talk and anything the author rejected.',
    '- At most 12 bullets, each one short and concrete. Use the language of the conversation.',
    '',
    'Return only the bullets, one per line, each starting with "- ".'
  ].join('\n')
}

export function buildDigestUser(previous: string, messages: ChatMessage[]): string {
  const lines = messages.map((m) => `${m.role === 'user' ? 'Author' : 'Editor'}: ${proposalSummary(m.content).trim()}`)
  return `<previous_digest>\n${previous.trim() || '(empty)'}\n</previous_digest>\n\n<new_messages>\n${lines.join('\n\n')}\n</new_messages>`
}

export function buildTitleSystem(): string {
  return 'Give a short title (2 to 5 words) for a chat thread about a novel, from its first message. Use the language of the message. Return only the title, without quotes.'
}

export function buildSummarySystem(): string {
  return [
    'Summarize one chapter of a novel for an editor who has not read it.',
    'In 5 to 8 sentences: the events in order, the characters who appear, where and when it happens, the point of view, and how the chapter ends.',
    'Use the language of the chapter. Return only the summary.'
  ].join('\n')
}
