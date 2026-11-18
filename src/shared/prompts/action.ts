// Prompt for an action (for example Polish) on a selection.

import type { AiAction, Entry } from '../types'
import { markdownToPlainBlocks } from '../book'
import { bookBlock, entriesMentionedIn, entryBlock, languageName, writingRulesBlock, type BookContext } from './context'

export interface ActionPromptInput {
  book: Pick<BookContext, 'manifest' | 'writingRules' | 'entries'>
  action: AiAction
  before: string
  selection: string
  after: string
  chapterTitle: string
  /** A comment of an editor's read about the passage (Polish of a comment): the rewrite fixes what it says. */
  note?: string
  /** The end of the chapter before (`voiceSample`): how the book narrates, for a draft in another tense */
  voice?: string
}

export function buildActionSystem(input: ActionPromptInput): string {
  const m = input.book.manifest
  const probe = `${input.before}\n${input.selection}\n${input.after}`
  const entries: Entry[] = entriesMentionedIn(probe, input.book.entries).slice(0, 8)
  return [
    'You are a line editor inside a writing app. You rewrite one passage of a novel for its author.',
    '',
    'Before the <rewrite> tags, write one line in <narration></narration> tags: the tense and the point of view that you narrate the passage in, from the writing rules of the book (when they say nothing about it, from the text around the passage). For example: <narration>past tense, third person</narration>.',
    'Then return the rewritten passage, inside <rewrite></rewrite> tags. Write nothing else before or after the tags: no comments, no notes, no explanations.',
    'If the passage needs no change, return it unchanged inside the tags.',
    'You have no tools. Do not run commands or read files: everything you need is in this prompt.',
    '',
    '# Rules',
    '- Rewrite only the text in <selection>. The text in <before> and <after> is context: do not repeat it, but keep the passage consistent with it (names, facts, voice) and make it join the context smoothly at both ends.',
    '- Narrate in the tense and the point of view that the writing rules of the book give, as the book narrates in "How the book narrates". A draft in another tense (for example the present tense in a book that the rules narrate in the past tense) goes into the tense of the rules, also when the text around it is in that other tense. When the rules say nothing about the tense, keep the tense of the text around the passage.',
    `- Write in ${languageName(m.language)}, the language of the book.`,
    '- Keep Markdown formatting, such as *italic*, where it still applies.',
    '- Keep the paragraphs of the selection: separate paragraphs with one blank line, and keep each paragraph break, also between the lines of two speakers. Keep the number of paragraphs unless the instructions ask for a change.',
    '- Keep each scene break: a line with only "* * *", with a blank line before and after it.',
    '- If the selection starts or ends in the middle of a sentence, keep that boundary.',
    '- Follow the writing rules of the book. They are more important than your own taste and than the text around the passage.',
    '',
    '# Writing rules of the book',
    writingRulesBlock(input.book.writingRules),
    '',
    ...(input.voice?.trim() ? ['# How the book narrates', 'The end of the chapter before this one: the tense, the point of view and the voice of the narration. Do not copy it.', `<book_voice>\n${input.voice.trim()}\n</book_voice>`, ''] : []),
    bookBlock(m),
    entries.length ? `\n# Planning facts about names in this passage\n${entries.map(entryBlock).join('\n\n')}` : ''
  ].join('\n')
}

export function buildActionUser(input: ActionPromptInput): string {
  const note = input.note?.trim()
  return [
    ...(note ? [`<editor_comment>\n${note}\n</editor_comment>`, 'An editor left this comment on the passage. Fix what this comment says; keep the rest.', ''] : []),
    `<instructions>\n${input.action.instructions.trim()}\n</instructions>`,
    '',
    `Chapter: "${input.chapterTitle}"`,
    '',
    `<before>\n${input.before}\n</before>`,
    '',
    `<selection>\n${input.selection}\n</selection>`,
    '',
    `<after>\n${input.after}\n</after>`,
    '',
    // Last, because the text just before it wins otherwise: a draft in the present tense, in a book that narrates in the past tense.
    'Write the passage in the tense and the point of view that the writing rules of the book give, also when <before>, <selection> and <after> use another tense.'
  ].join('\n')
}

/**
 * The last paragraphs of a chapter, whole, up to `max` characters: a sample of how the book narrates, for
 * an action on a draft in another tense. Scene breaks and Markdown marks are left out.
 */
export function voiceSample(body: string, max = 900): string {
  const paragraphs = markdownToPlainBlocks(body).split(/\n{2,}/).filter((p) => p.trim())
  const out: string[] = []
  let size = 0
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i].trim()
    if (size + p.length > max) {
      // A last paragraph longer than the sample: its end, from the start of a word.
      if (!out.length) out.unshift(p.slice(p.length - max).replace(/^\S*\s/, ''))
      break
    }
    out.unshift(p)
    size += p.length
  }
  return out.join('\n\n')
}

/**
 * The sample of how the book narrates, for an action in the chapter `chapterId`: the end of the nearest
 * chapter before it that has text, else of the nearest chapter after it. Empty for a book of one chapter.
 */
export function voiceOfBook(chapters: Array<{ id: string; body: string }>, chapterId: string, max = 900): string {
  const at = chapters.findIndex((c) => c.id === chapterId)
  if (at < 0) return ''
  const before = chapters.slice(0, at).reverse()
  const after = chapters.slice(at + 1)
  for (const c of [...before, ...after]) {
    const sample = voiceSample(c.body, max)
    if (sample) return sample
  }
  return ''
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
  // The narration line is for the AI only (buildActionSystem).
  return reply.replace(/<narration>[\s\S]*?<\/narration>/g, '').trim()
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
