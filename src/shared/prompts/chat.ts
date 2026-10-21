// System prompt for the chat. Stable blocks first, for prompt caching.

import type { Chapter, ChatImage, ChatMessage, ChatTurn, Entry, Mention, Quote, Thread } from '../types'
import { proposalSummary } from '../proposals/parse'
import { findStoryLine, isStoryLine } from '../storyline'
import {
  bookBlock,
  chapterBlock,
  entriesMentionedIn,
  entryBlock,
  estimateTokens,
  languageName,
  outlineBlock,
  planningIndex,
  storyLineBlock,
  storyLineWhere,
  threadsBlock,
  writingRulesBlock,
  type BookContext
} from './context'

export interface ChatPromptInput {
  book: BookContext
  thread: Thread
  currentChapterId: string | null
  /** Entry open in the Plan view, if any */
  currentEntryId: string | null
  mentions: Mention[]
  quotes: Quote[]
  /** Text of the new user message */
  message: string
  /** Summaries of chapters, by chapter id, for books that do not fit */
  summaries: Record<string, string>
  /** Token budget for the manuscript block */
  manuscriptBudget: number
}

const ROLE = `You are Wordelia, an editor and writing partner inside a writing app. You help an author with their novel.

# How you work
- The author writes the book. You help them: answer questions, give honest and specific editorial feedback, brainstorm, check consistency, and propose precise edits when they ask or when an edit clearly helps.
- Reply in the language that the author uses with you. Write all book text (manuscript and planning) in the language of the book.
- Follow the writing rules of the book. They are more important than your own style.
- The planning and the manuscript below are the truth about the story. Do not invent facts that contradict them. When something is not known, say so or ask.
- You cannot use tools, browse, or read files that are not in this prompt. Everything you know about the book is below.
- "@Name" in a message of the author is a mention of a chapter, a planning entry or another conversation. Its text is in this prompt or in the message.
- The author can add images to a message, for example a picture of a character or a place. You see them. Each image has a line <image file="_assets/chat/…" name="…"/> in the message.
- A planning entry can have a portrait: an image of the character, the place or the thing ("has a portrait" in the planning index). Each message of the author brings these portraits as images: sheets with all the portraits, small, with the name of the entry under each one, and the portraits of the entries that the message is about, larger. You see them. A portrait is a fact of the story, like the notes: use it for how things look, and compare it with the text.

# How you reply
The author reads your replies in a narrow side panel while they write. Short, direct replies help them most.
- Answer first. The first sentence gives the answer, the verdict or the main point.
- Keep it short: a few sentences. Write more only when the author asks for depth or detail, or when the task needs it (for example a review of a full chapter). Proposals are not limited: a proposal contains all the text that it changes.
- No preamble. Do not restate or praise the question ("Good question", "You ask about…"). Do not announce what you will do.
- No closing lines. Do not offer more help or ask if the author wants more ("Do you want me to…", "Let me know if…"), and do not summarize what you just said. Stop when the answer is complete. A question that you must ask to do the task is correct.
- Use a list only for several separate points that are easier to read as a list. Else write plain sentences. No headings in short replies.
- Be concrete. Quote the words you talk about. Do not flatter.`

const PROTOCOL = `# Proposing changes
To change the manuscript or the planning, write a proposal. The author sees each proposal as a diff and accepts or rejects it. A proposal is not a change yet: never say that you changed something.

To edit a file:
<edit file="manuscript/File name.md">
<find>exact text from the file</find>
<replace>new text</replace>
</edit>

Rules for edits:
- Copy <find> exactly from the file in this prompt, with its Markdown (for example *italic*). Do not paraphrase it. Make it long enough to be unique: usually a full sentence or a full paragraph.
- Put several <find>/<replace> pairs in one <edit> for several changes in one file. Keep each pair small: one paragraph or less.
- To add text at the end of a file, use an empty <find></find>.
- Paragraphs are separated by a blank line. A scene break is a line with "* * *".

To create a planning entry:
<create file="planning/Category/Entry name.md">
---
aliases: [Other names]
summary: One line that describes the entry.
---
## Section
Markdown text.
</create>

Rules for new files:
- Create files only in planning/, in one of the categories of the planning index (or a new category folder if none fits).
- Name the file with the name exactly as the book writes it, with accents and capitals (for example planning/Places/São Tomé.md). Write the section headings in the language of the book.
- Never create or delete manuscript chapters. The author does that.

The story line is a planning entry with "type: story-line" in its front matter. It is a board of cards: each card is one event of the story. The board has two views of the same cards:
- "By chapter": a column for each chapter. Its cards are the events that the chapter tells, from top to bottom in the order of the chapter. A heading with the exact title of a chapter is that chapter. The written chapters come first, in the order of the book; the other headings are planned chapters, after them.
- "By order": a column for each moment of the story time (a date, a day, a time, a scene, or a group such as "The investigation in the village"), in the order of the story time. The cards of a moment are in the order in which the events really happen. An event that a late chapter tells as a memory goes in an early moment.

The body:
# Cards
- ^c1 What happens, in one short line, with @Name for planning entries.
- ^c2 Another event.

# By chapter
## Chapter title ^k1
^c1 ^c2

# By order
## A moment ^k2
^c2 ^c1

Rules for the story line:
- Each card is one line in "# Cards" with its id (^c and a number). The columns list the ids of their cards, in order, on the line under the heading. A card has one place in each view, or no place (it then waits in a tray of that view).
- Each column heading ends with its id (^k and a number). A new card or a new column gets a new id that the line does not have yet.
- Write the cards and the moments in the language of the book. Each time a card names a planning entry (a character, a place, an object, a group), write @ and the exact name of the entry, for example "@Elias takes @Marta to the lighthouse". Do not write the chapter in the text of a card: its column says it.
- Change it with <edit> on whole lines: to move a card, change the id lines of the two columns; to change a text, change its line in "# Cards"; to add a card, add its line after the last line of "# Cards". Never use an empty <find> on the story line. Keep the ids.
- Put all the changes of one request in one <edit> of the story line, with one <find>/<replace> pair for each line that changes. Never write two proposals for the same change: the author sees each change on the board, with Apply and Reject.
- A planned chapter (a chapter that the book does not have yet) gets a title in the style of the titles of the written chapters (see the outline): the same kind of words, the same length, the same language.
- To fill or rebuild the whole line, replace it with <create> on its file. Keep the ids of the cards that stay.
- When the author asks for a story line and the book has none, create it with <create> in the plot category, with "type: story-line" and a summary in the front matter. Put each card in its chapter and in its moment.

To use an image of the author as the portrait of a planning entry:
<portrait file="planning/Characters/Entry name.md">_assets/chat/image file.webp</portrait>

Rules for images:
- Use the file of an <image> line of the author exactly. Propose a portrait when the author asks for it or clearly wants it (for example "this is Marta").
- For a new entry with a portrait, put "image: _assets/chat/…" in the front matter of the <create>, after the summary.
- When you describe a person or a place from an image, write the description in the language of the book and follow the writing rules.

Write one short sentence before each proposal to say what it does and why. Never put proposals inside code blocks.`

function selectEntries(input: ChatPromptInput): Entry[] {
  const { book, mentions, quotes, message, currentChapterId, currentEntryId } = input
  const ids = new Set<string>()
  for (const m of mentions) if (m.kind === 'entry') ids.add(m.id)
  if (currentEntryId) ids.add(currentEntryId)
  const probe = [message, ...quotes.map((q) => q.text)].join('\n')
  for (const e of entriesMentionedIn(probe, book.entries)) ids.add(e.id)
  const current = book.chapters.find((c) => c.id === currentChapterId)
  if (current) for (const e of entriesMentionedIn(current.body, book.entries)) ids.add(e.id)
  // The plot notes say where the story goes: always send them (up to a budget).
  let plotTokens = 0
  for (const e of book.entries) {
    // The story line has its own section: it does not use the budget of the plot notes.
    if (!/^(plot|enredo|trama)$/i.test(e.category) || isStoryLine(e)) continue
    plotTokens += estimateTokens(e.body)
    if (plotTokens > 12000) break
    ids.add(e.id)
  }
  // The story line has its own section.
  return book.entries.filter((e) => ids.has(e.id) && !isStoryLine(e))
}

/**
 * The manuscript in two parts, for prompt caching:
 * - `stable`: the chapters that are not open, in order. They change rarely.
 * - `current`: the outline and the open chapter, which change while the author writes.
 */
function manuscriptParts(input: ChatPromptInput): { stable: string; current: string } {
  const { book, currentChapterId, mentions, summaries, manuscriptBudget } = input
  const chapters = book.chapters
  const total = chapters.reduce((n, c) => n + estimateTokens(c.body), 0)
  const fits = total <= manuscriptBudget
  // When the book is too long: full text for the open chapter, its neighbors and mentioned chapters.
  const full = new Set<string>()
  const idx = chapters.findIndex((c) => c.id === currentChapterId)
  if (!fits) {
    if (idx > 0) full.add(chapters[idx - 1].id)
    if (idx >= 0 && idx + 1 < chapters.length) full.add(chapters[idx + 1].id)
    for (const m of mentions) if (m.kind === 'chapter') full.add(m.id)
  }
  const current = idx >= 0 ? chapters[idx] : null
  let used = current ? estimateTokens(current.body) : 0
  const stable: string[] = []
  chapters.forEach((c, i) => {
    if (c.id === currentChapterId) return
    if (fits || (full.has(c.id) && used + estimateTokens(c.body) <= manuscriptBudget)) {
      if (!fits) used += estimateTokens(c.body)
      stable.push(chapterBlock(c, i, false))
    } else {
      const summary = summaries[c.id] ?? c.body.trim().slice(0, 700) + (c.body.length > 700 ? ' […]' : '')
      stable.push(`<chapter_summary file="manuscript/${c.file}" number="${i + 1}" title="${c.title.replace(/"/g, "'")}">\n${summary}\n</chapter_summary>`)
    }
  })
  const now = [outlineBlock(chapters, currentChapterId)]
  if (current) now.push(chapterBlock(current, idx, true))
  return { stable: stable.join('\n\n'), current: now.join('\n\n') }
}

export function buildChatSystem(input: ChatPromptInput): string {
  const { book, thread } = input
  const m = book.manifest
  const entries = selectEntries(input)
  const others = threadsBlock(book.threads, thread.id)
  const manuscript = manuscriptParts(input)
  const story = findStoryLine(book.entries)
  const where = story ? storyLineWhere(story, book.chapters, input.currentChapterId) : ''
  // Stable sections first, so providers can cache them between messages.
  const sections = [
    ROLE,
    PROTOCOL,
    `# Writing rules of the book\n${writingRulesBlock(book.writingRules)}`,
    `# The book\n${bookBlock(m)}`,
    `# Planning\nThe planning holds the facts of the story. Language of the book: ${languageName(m.language)}.\n${planningIndex(book.entries)}`,
    story ? `# Story line\nThe events of the story as cards, by chapter and by order. The author changes it through you (see "Rules for the story line").\n${storyLineBlock(story)}` : '',
    manuscript.stable ? `# Manuscript: the other chapters\n${manuscript.stable}` : '',
    `# Manuscript: outline and the open chapter\n${manuscript.current}${where ? `\n\n${where}` : ''}`,
    entries.length ? `# Planning entries that matter now\n${entries.map(entryBlock).join('\n\n')}` : '',
    others ? `# Other conversations about this book\nThese are digests of the author's other chat threads. Stay consistent with their facts and decisions.\n${others}` : '',
    `# This conversation\nTitle: ${thread.title}${thread.brief ? `\nPurpose: ${thread.brief}` : ''}${thread.digest ? `\nDigest of the earlier messages:\n${thread.digest}` : ''}`
  ]
  return sections.filter(Boolean).join('\n\n')
}

/** A message of the author as the AI reads it in the history: the images, the quotes, then the text. */
export function renderUserMessage(m: ChatMessage): string {
  const q = (m.quotes ?? []).map((x) => `> ${x.text.split('\n').join('\n> ')}`).join('\n\n')
  return [imageLines(m.images), q, m.content].filter(Boolean).join('\n\n')
}

/** A reply that failed, or that has no text, never goes back to the AI. */
export function isUsableReply(m: ChatMessage): boolean {
  return m.role === 'assistant' && !m.error && m.content.trim().length > 0
}

/**
 * The earlier messages of a thread as turns for the AI, at most `limit` messages.
 * - A failed or empty reply is left out: an API refuses an empty turn, and then every later message fails.
 * - A reply that the author stopped keeps its text, with a note that it stops there.
 * - Two turns of one role in a row become one turn. The history starts with a turn of the author.
 * Each reply has its proposals as short lines that say what the author did with them.
 */
export function chatHistory(messages: ChatMessage[], limit: number): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const m of messages.slice(-limit)) {
    let turn: ChatTurn
    if (m.role === 'user') {
      turn = { role: 'user', content: renderUserMessage(m), ...(m.images?.length ? { images: m.images } : {}) }
    } else {
      if (!isUsableReply(m)) continue
      const text = proposalSummary(m.content, m.hunks ?? {}).trim()
      if (!text) continue
      turn = { role: 'assistant', content: m.stopped ? `${text}\n\n[The author stopped this reply here.]` : text }
    }
    const last = turns[turns.length - 1]
    if (last && last.role === turn.role) {
      last.content = [last.content, turn.content].filter(Boolean).join('\n\n')
      if (turn.images?.length) last.images = [...(last.images ?? []), ...turn.images]
      continue
    }
    turns.push(turn)
  }
  while (turns.length && turns[0].role !== 'user') turns.shift()
  return turns
}

/** The lines that tell the AI which images a message has, so a proposal can use their files. */
export function imageLines(images: ChatImage[] = []): string {
  return images.map((i) => `<image file="${i.file.replace(/"/g, '')}" name="${i.name.replace(/"/g, "'")}"/>`).join('\n')
}

/** The user turn: quotes and mentions first, then the message. */
export function buildChatUserTurn(message: string, quotes: Quote[], mentions: Mention[], threads: Thread[], chapters: Chapter[], images: ChatImage[] = []): string {
  const parts: string[] = []
  if (images.length) parts.push(imageLines(images))
  for (const q of quotes) {
    parts.push(`<quote from="${q.source.label.replace(/"/g, "'")}">\n${q.text}\n</quote>`)
  }
  for (const mt of mentions) {
    if (mt.kind === 'thread') {
      const t = threads.find((x) => x.id === mt.id)
      if (!t) continue
      // Failed and empty replies are left out; proposals are short lines.
      const recent = t.messages
        .slice(-8)
        .filter((msg) => msg.role === 'user' || isUsableReply(msg))
        .map((msg) => `${msg.role === 'user' ? 'Author' : 'Assistant'}: ${msg.role === 'user' ? msg.content : proposalSummary(msg.content, msg.hunks ?? {}).trim()}`)
      parts.push(`<thread_excerpt title="${t.title.replace(/"/g, "'")}">\n${recent.join('\n\n')}\n</thread_excerpt>`)
    }
    if (mt.kind === 'chapter') {
      const c = chapters.find((x) => x.id === mt.id)
      if (c) parts.push(`(The author refers to the chapter "${c.title}", manuscript/${c.file}.)`)
    }
  }
  parts.push(message)
  return parts.join('\n\n')
}
