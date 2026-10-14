// System prompt for the chat. Stable blocks first, for prompt caching.

import type { Chapter, Entry, Mention, Quote, Thread } from '../types'
import {
  bookBlock,
  chapterBlock,
  entriesMentionedIn,
  entryBlock,
  estimateTokens,
  languageName,
  outlineBlock,
  planningIndex,
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
- Be direct and concrete. Quote the words you talk about. Keep answers short; use a list when you have several points. Do not flatter.
- Reply in the language that the author uses with you. Write all book text (manuscript and planning) in the language of the book.
- Follow the writing rules of the book. They are more important than your own style.
- The planning and the manuscript below are the truth about the story. Do not invent facts that contradict them. When something is not known, say so or ask.
- You cannot use tools, browse, or read files that are not in this prompt. Everything you know about the book is below.`

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
- Never create or delete manuscript chapters. The author does that.

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
    if (!/^(plot|enredo|trama)$/i.test(e.category)) continue
    plotTokens += estimateTokens(e.body)
    if (plotTokens > 12000) break
    ids.add(e.id)
  }
  return book.entries.filter((e) => ids.has(e.id))
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
  // Stable sections first, so providers can cache them between messages.
  const sections = [
    ROLE,
    PROTOCOL,
    `# Writing rules of the book\n${writingRulesBlock(book.writingRules)}`,
    `# The book\n${bookBlock(m)}`,
    `# Planning\nThe planning is the story bible. Language of the book: ${languageName(m.language)}.\n${planningIndex(book.entries)}`,
    manuscript.stable ? `# Manuscript: the other chapters\n${manuscript.stable}` : '',
    `# Manuscript: outline and the open chapter\n${manuscript.current}`,
    entries.length ? `# Planning entries that matter now\n${entries.map(entryBlock).join('\n\n')}` : '',
    others ? `# Other conversations about this book\nThese are digests of the author's other chat threads. Stay consistent with their facts and decisions.\n${others}` : '',
    `# This conversation\nTitle: ${thread.title}${thread.brief ? `\nPurpose: ${thread.brief}` : ''}${thread.digest ? `\nDigest of the earlier messages:\n${thread.digest}` : ''}`
  ]
  return sections.filter(Boolean).join('\n\n')
}

/** The user turn: quotes and mentions first, then the message. */
export function buildChatUserTurn(message: string, quotes: Quote[], mentions: Mention[], threads: Thread[], chapters: Chapter[]): string {
  const parts: string[] = []
  for (const q of quotes) {
    parts.push(`<quote from="${q.source.label.replace(/"/g, "'")}">\n${q.text}\n</quote>`)
  }
  for (const mt of mentions) {
    if (mt.kind === 'thread') {
      const t = threads.find((x) => x.id === mt.id)
      if (!t) continue
      const recent = t.messages.slice(-8).map((msg) => `${msg.role === 'user' ? 'Author' : 'Assistant'}: ${msg.content}`)
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
