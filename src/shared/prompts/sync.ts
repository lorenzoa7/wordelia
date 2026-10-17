// Prompt for the planning sync: compare chapters with the planning and propose updates.

import type { Chapter } from '../types'
import { bookBlock, chapterBlock, entryBlock, languageName, planningHeadings, planningIndex, type BookContext } from './context'

export interface SyncPromptInput {
  book: BookContext
  /** Chapters to read (the ones that changed) */
  chapters: Chapter[]
  /** Planning categories that exist */
  categories: string[]
  /** True when the planning is empty or almost empty: build it from scratch */
  bootstrap: boolean
}

export function buildSyncSystem(input: SyncPromptInput): string {
  const m = input.book.manifest
  const lang = languageName(m.language)
  const known = planningHeadings(m.language)
  const h = known ?? planningHeadings('en')!
  const translate = known ? '' : ` (translate the headings to ${lang})`
  return [
    'You maintain the planning (the reference notes) of a novel. The planning holds what the author needs to keep the story consistent: characters, places, the world and its rules, and the plot.',
    '',
    input.bootstrap
      ? 'The planning is new. Read the chapters and build the planning: one entry for each character, place, group, object or rule of the world that matters to the story.'
      : 'Read the chapters that changed. Compare them with the planning. Propose new entries for important characters, places, groups, objects or rules that are missing, and updates to entries when the chapters add facts (appearance, personality, relationships, events, secrets, changes of status).',
    '',
    'You have no tools. Do not run commands or read files: everything you need is in this prompt.',
    '',
    '# Rules',
    `- Use only facts that the text states or clearly implies. Do not invent. When a fact is uncertain, write it as a question in a "## ${h.questions}" section.`,
    '- Do not duplicate entries. Check names and aliases in the planning index first.',
    '- Skip minor figures that appear once and do not matter.',
    `- Write entries in ${lang}, short and concrete. Bullets are good. Section headings are in ${lang} too.`,
    `- Name each file with the name exactly as the book writes it, with accents and capitals (for example planning/Places/São Tomé.md, not Sao Tome.md).`,
    `- A new entry has frontmatter with aliases (other names used in the text) and a one-line summary. If the summary has a colon, put it in double quotes.`,
    `- Useful sections for a character${translate}: ## ${h.role}, ## ${h.appearance}, ## ${h.personality}, ## ${h.relationships}, ## ${h.story} (what happens to them, by chapter). For a place: ## ${h.description}, ## ${h.story}. Use these headings exactly.`,
    '- For an update, edit the existing file. Use an exact <find> from the entry and a <replace>, or an empty <find></find> to append a new section or bullet at the end.',
    `- Categories that exist: ${input.categories.join(', ')}.`,
    '',
    '# Output format',
    `First, a few short sentences in ${lang} that say what you found. Then the proposals:`,
    '',
    '<create file="planning/Characters/Name.md">',
    '---',
    'aliases: [Other name]',
    'summary: One line.',
    '---',
    `## ${h.role}`,
    '...',
    '</create>',
    '',
    '<edit file="planning/Characters/Existing.md">',
    '<find>exact text</find>',
    '<replace>new text</replace>',
    '</edit>',
    '',
    'If nothing needs to change, say so and propose nothing.',
    '',
    bookBlock(m)
  ].join('\n')
}

export function buildSyncUser(input: SyncPromptInput): string {
  const { book, chapters } = input
  const indexOf = (c: Chapter): number => book.chapters.findIndex((x) => x.id === c.id)
  return [
    '# Current planning',
    planningIndex(book.entries),
    '',
    book.entries.map(entryBlock).join('\n\n'),
    '',
    '# Chapters to read',
    chapters.map((c) => chapterBlock(c, indexOf(c), false)).join('\n\n')
  ].join('\n')
}
