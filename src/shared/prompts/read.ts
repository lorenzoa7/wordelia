// The prompt of an editor's read. Pure code.
//
// A read is a chat message of the author. Its user turn for the AI is the message and a read block that
// tells the AI to answer with a short letter and `<note>` comments. The reply format is the one of
// `parseProposals` (src/shared/proposals/parse.ts). The AI never changes the text.

import { LENSES, READ_LIMIT_ALL, READ_LIMIT_ONE, isLens, type EditorComment, type Lens } from '../comments'
import type { Chapter, ReadRequest } from '../types'
import { chapterRef, escapeAttr } from './context'

/** The first characters of the read block. The scripted AI of the tests looks for them. */
export const READ_MARK = '<editor_read'

/** What each lens looks at. */
const LENS_GUIDE: Record<Lens, string> = {
  structure:
    'Structure. Check the purpose of the chapter and of each scene, the conflict, the stakes and the pacing. Check the open questions, the setups and payoffs, and the start and the end of the chapter.',
  reader:
    'Reader. Read as a first reader. Find where the reader is lost, bored or curious. Check that it is clear who, where and when. Check the emotional beats.',
  style:
    'Style. Check the sentences: rhythm, repetition, clichés, filter words, and the writing rules of the book. Write comments only. Do not write the new sentence: the Polish action of the app does the rewriting.',
  continuity:
    'Continuity. Find conflicts with the planning notes (facts, looks, the portraits, the rules of the world), with the story line (who knows what and when, the order of the events, also the planned chapters: "she only learns this in chapter 5") and with the earlier chapters.',
  proofread: 'Proofread. Find typos, wrong punctuation, errors with the dialogue dash, and a name that the text writes in two ways.'
}

/** A text on one line, cut at `max` characters. */
function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t
}

/** The earlier comments of the chapter: the open ones with their ids, then the ones that the author decided. */
function earlierLines(earlier: EditorComment[]): string[] {
  const open = earlier.filter((c) => c.state === 'open')
  const decided = earlier.filter((c) => c.state !== 'open')
  const lines: string[] = []
  if (open.length) {
    lines.push(
      '',
      'Open comments from the earlier reads of this chapter. The author has not decided about them yet, and they are still in the margin: do not write them again.',
      ...open.map((c) => `${c.id} [${c.lens}] "${oneLine(c.passage, 160)}" — ${oneLine(c.text, 400)}`),
      `If the new text fixed some of these comments, end your reply with <resolved ids="${open
        .slice(0, 2)
        .map((c) => c.id)
        .join(' ')}"/>. Write the ids of the comments that look fixed, and no other id. The app asks the author before it closes a comment.`
    )
  }
  if (decided.length) {
    lines.push(
      '',
      'Do not repeat these comments. The author decided about them. An intentional comment is a choice of the author: do not comment on that choice again.',
      ...decided.map((c) => `[${c.lens}] "${oneLine(c.passage, 160)}" — ${oneLine(c.text, 400)} (${c.state}${c.reason ? `: ${oneLine(c.reason, 200)}` : ''})`)
    )
  }
  return lines
}

/**
 * The user turn of a read: the message of the author, then the read block.
 * `earlier` holds the comments of this chapter from the earlier reads (the caller picks the chapter).
 */
export function buildReadTurn(message: string, req: ReadRequest, chapter: Chapter, chapterIndex: number, earlier: EditorComment[]): string {
  const all = req.lens === 'all'
  const lenses: Lens[] = req.lens === 'all' ? LENSES : [req.lens]
  const limit = all ? READ_LIMIT_ALL : READ_LIMIT_ONE
  const ref = chapterRef(chapter)
  const withSource = lenses.includes('continuity')
  const exampleLens: Lens = req.lens === 'all' ? 'continuity' : req.lens

  const lines: string[] = [
    `<editor_read chapter="${escapeAttr(ref)}" number="${chapterIndex + 1}" lens="${req.lens}" in_progress="${req.inProgress ? 'yes' : 'no'}">`,
    `The author asks for an editor's read of chapter ${chapterIndex + 1}, "${chapter.title}" (${ref}). Read it as a developmental editor and as a line editor. You never rewrite the text: you never use <edit>, <create> or <portrait> in this reply. Do not offer a read with <read/>: this reply is the read.`,
    '',
    all ? 'Read with all five lenses:' : 'Read with this lens only:',
    ...lenses.map((l) => `- ${LENS_GUIDE[l]}`),
    ''
  ]
  if (req.inProgress) {
    lines.push('The chapter is not finished: do not comment on a missing end; comment on the direction so far.', '')
  }
  if (req.selection) {
    lines.push(
      'Comment only on this part:',
      '<selection>',
      req.selection.text,
      '</selection>',
      'Every <find> must be inside it. The rest of the chapter and of the book is context.',
      ''
    )
  }
  lines.push(
    'Write your reply in this order.',
    '1. A short letter in prose, before the first <note>. Write its two headings in the language that the author uses with you.',
    '   - "What works": at most 3 bullet points.',
    '   - "What I would look at first": the problems in order of importance, one line for each problem. Each line has the lens of the problem and (→ N), where N is the number of its comment in this reply.',
    '2. The comments, one <note> tag for each. The first comment is number 1, the second is number 2, and so on.',
    '',
    'This is a comment:',
    `<note lens="${exampleLens}" rank="1">`,
    '<find>the passage, copied from the chapter word for word</find>',
    '<text>The comment, in one or two sentences.</text>',
    ...(exampleLens === 'continuity' ? ['<source file="planning/Characters/Marta.md">A quote from that file that supports the comment.</source>'] : []),
    '</note>',
    '',
    'Rules for the comments:',
    `- Write at most ${limit} comments. Fewer is better: write only the comments that matter. A comment is about one passage and about the facts of this book. Do not write generic comments.`,
    '- rank is the number of the comment. Write the comments in order of importance: rank 1 is the most important.',
    all ? '- lens is the lens that found the problem: structure, reader, style, continuity or proofread.' : `- lens is always "${req.lens}".`,
    '- <find> is the passage that the comment is about. Copy it from the chapter word for word: a short phrase or one sentence, never a whole paragraph. Keep it inside one paragraph. Do not change, add or leave out a word. Leave out the Markdown marks (for example * and _). Make it long enough that it is in the chapter one time.',
    '- A comment needs a passage that is in the chapter. When something is missing (for example a scene), choose the passage where it must start. The app drops a comment whose passage it cannot find.',
    '- <text> says in one or two sentences what the problem is and why it matters. Do not write the new text.'
  )
  if (withSource) {
    lines.push(
      '- Every continuity comment has a <source>. Its file is the planning note, the story line or the earlier chapter that the text disagrees with, as the planning index and the manuscript outline name it (planning/… or manuscript/…). Its text is a quote from that file, word for word: the line of the planning note, or the card of the story line.'
    )
  }
  lines.push(...earlierLines(earlier), '</editor_read>')
  return `${message}\n\n${lines.join('\n')}`
}

/** A read request from a thread file, or `null` when its shape is wrong. */
export function parseReadRequest(raw: unknown): ReadRequest | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { chapterId, lens, inProgress, selection } = raw as Record<string, unknown>
  if (typeof chapterId !== 'string' || !chapterId) return null
  if (lens !== 'all' && !isLens(lens)) return null
  if (typeof inProgress !== 'boolean') return null
  const text = typeof selection === 'object' && selection !== null ? (selection as Record<string, unknown>).text : undefined
  return { chapterId, lens, inProgress, ...(typeof text === 'string' ? { selection: { text } } : {}) }
}

/**
 * The part of the chat protocol about reads. In an ordinary thread the AI does not read a chapter:
 * it offers the read with a tag, and the author starts it with one click.
 */
export const READ_OFFER_RULES = `# Offering an editor's read
An editor's read is a separate job. The app runs it in its own conversation, and it puts the comments of the editor in the margin of the chapter. When the author asks for an editor's read of a chapter (for example "read chapter 7 as a structure editor"), do not read the chapter in this conversation. Answer with one short sentence and this tag:
<read chapter="manuscript/File name.md" lens="all"/>

Rules for the tag:
- chapter is the file of the chapter, as the manuscript outline names it. lens is all, structure, reader, style, continuity or proofread. Use all when the author names no lens. Use structure for the structure and the pacing, reader for a first reader, style for the sentences, continuity for the agreement with the planning and the story line, and proofread for typos and punctuation.
- Use the tag for a whole chapter only. When the author asks about one passage or one scene, answer in the conversation as usual.
- The app shows the tag as a button. Do not write <note> tags and do not review the chapter in the same reply.`
