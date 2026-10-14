// Prompt for an action (for example Polish) on a selection.

import type { AiAction, Entry } from '../types'
import { bookBlock, entriesMentionedIn, entryBlock, languageName, writingRulesBlock, type BookContext } from './context'

export interface ActionPromptInput {
  book: Pick<BookContext, 'manifest' | 'writingRules' | 'entries'>
  action: AiAction
  before: string
  selection: string
  after: string
  chapterTitle: string
}

export function buildActionSystem(input: ActionPromptInput): string {
  const m = input.book.manifest
  const probe = `${input.before}\n${input.selection}\n${input.after}`
  const entries: Entry[] = entriesMentionedIn(probe, input.book.entries).slice(0, 8)
  return [
    'You are a line editor inside a writing app. You rewrite one passage of a novel for its author.',
    '',
    'Return only the rewritten passage, inside <rewrite></rewrite> tags. Write nothing before or after the tags.',
    'You have no tools. Do not run commands or read files: everything you need is in this prompt.',
    '',
    '# Rules',
    '- Rewrite only the text in <selection>. The text in <before> and <after> is context: do not repeat it, but keep the passage consistent with it (names, facts, tense, voice) and make it join the context smoothly at both ends.',
    `- Write in ${languageName(m.language)}, the language of the book.`,
    '- Keep Markdown formatting, such as *italic*, where it still applies. Separate paragraphs with one blank line. Keep the number of paragraphs unless the instructions ask for a change.',
    '- If the selection starts or ends in the middle of a sentence, keep that boundary.',
    '- Follow the writing rules of the book. They are more important than your own taste.',
    '',
    '# Writing rules of the book',
    writingRulesBlock(input.book.writingRules),
    '',
    bookBlock(m),
    entries.length ? `\n# Planning facts about names in this passage\n${entries.map(entryBlock).join('\n\n')}` : ''
  ].join('\n')
}

export function buildActionUser(input: ActionPromptInput): string {
  return [
    `<instructions>\n${input.action.instructions.trim()}\n</instructions>`,
    '',
    `Chapter: "${input.chapterTitle}"`,
    '',
    `<before>\n${input.before}\n</before>`,
    '',
    `<selection>\n${input.selection}\n</selection>`,
    '',
    `<after>\n${input.after}\n</after>`
  ].join('\n')
}

/** Get the rewrite from a reply, also while it streams. */
export function extractRewrite(reply: string): { text: string; complete: boolean } {
  const open = reply.indexOf('<rewrite>')
  if (open < 0) {
    // Some models forget the tags. Use the full reply when it is done.
    return { text: reply.trim(), complete: false }
  }
  const start = open + '<rewrite>'.length
  const close = reply.indexOf('</rewrite>', start)
  const body = reply.slice(start, close < 0 ? undefined : close)
  return { text: body.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, ''), complete: close >= 0 }
}
