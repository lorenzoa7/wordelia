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
    'Return only the rewritten passage, inside <rewrite></rewrite> tags. Write nothing before or after the tags: no comments, no notes, no explanations.',
    'If the passage needs no change, return it unchanged inside the tags.',
    'You have no tools. Do not run commands or read files: everything you need is in this prompt.',
    '',
    '# Rules',
    '- Rewrite only the text in <selection>. The text in <before> and <after> is context: do not repeat it, but keep the passage consistent with it (names, facts, tense, voice) and make it join the context smoothly at both ends.',
    `- Write in ${languageName(m.language)}, the language of the book.`,
    '- Keep Markdown formatting, such as *italic*, where it still applies.',
    '- Keep the paragraphs of the selection: separate paragraphs with one blank line, and keep each paragraph break, also between the lines of two speakers. Keep the number of paragraphs unless the instructions ask for a change.',
    '- Keep each scene break: a line with only "* * *", with a blank line before and after it.',
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

/**
 * Get the rewrite from a reply, also while it streams. A reply without <rewrite> tags has no
 * rewrite: it is a comment of the AI ("This passage already reads well…"), never text for the book.
 */
export function extractRewrite(reply: string): { text: string; complete: boolean } {
  const open = reply.indexOf('<rewrite>')
  if (open < 0) return { text: '', complete: false }
  const start = open + '<rewrite>'.length
  const close = reply.indexOf('</rewrite>', start)
  const body = reply.slice(start, close < 0 ? undefined : close)
  return { text: body.replace(/^\r?\n/, '').replace(/\r?\n\s*$/, ''), complete: close >= 0 }
}

/** The words of a reply without a rewrite, to show to the author. Empty when the reply has a rewrite. */
export function replyWithoutRewrite(reply: string): string {
  if (reply.includes('<rewrite>')) return ''
  return reply.trim()
}

const SCENE_BREAK = /^[ \t]*\*[ \t]*\*[ \t]*\*[ \t]*$/
/** A line that only holds the attributes of the paragraph above it, for example "{align=center}" */
const ATTRIBUTES = /^[ \t]*\{[^}]*\}[ \t]*$/

/**
 * Keep the paragraphs and the scene breaks of a rewrite, as the AI meant them.
 * - The text of a chapter has no line breaks inside a paragraph (a line break that the author typed
 *   ends with "\"). So each new line of the rewrite starts a paragraph: Markdown would join two lines
 *   into one paragraph, for example the lines of two speakers.
 * - A scene break that the AI wrote inside a line ("…heads. * * * At eleven…") goes back on its own
 *   line, when the selection has a scene break.
 * `selection`: the Markdown of the selection that the AI got.
 */
export function tidyRewrite(rewrite: string, selection: string): string {
  let text = rewrite.replace(/\r\n?/g, '\n')
  const hadBreak = selection.split('\n').some((l) => SCENE_BREAK.test(l))
  if (hadBreak) text = text.replace(/[ \t]*(?<=^|[ \t])\*[ \t]\*[ \t]\*(?=[ \t]|$)[ \t]*/gm, '\n\n* * *\n\n')
  const lines = text.split('\n')
  let out = ''
  lines.forEach((line, i) => {
    if (i === 0) {
      out = line
      return
    }
    const prev = lines[i - 1]
    // A blank line, a hard line break ("\" at the end) and the attribute line of a paragraph stay.
    const keep = !line.trim() || !prev.trim() || /\\$/.test(prev) || ATTRIBUTES.test(line)
    out += (keep ? '\n' : '\n\n') + line
  })
  return out.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n').trim()
}
