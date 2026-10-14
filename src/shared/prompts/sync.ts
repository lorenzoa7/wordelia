// Prompt for the planning sync: compare chapters with the planning and propose updates.

import type { Chapter } from '../types'
import { bookBlock, chapterBlock, entryBlock, languageName, planningIndex, type BookContext } from './context'

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
  return [
    'You maintain the planning (the story bible) of a novel. The planning holds what the author needs to keep the story consistent: characters, places, the world and its rules, and the plot.',
    '',
    input.bootstrap
      ? 'The planning is new. Read the chapters and build the planning: one entry for each character, place, group, object or rule of the world that matters to the story.'
      : 'Read the chapters that changed. Compare them with the planning. Propose new entries for important characters, places, groups, objects or rules that are missing, and updates to entries when the chapters add facts (appearance, personality, relationships, events, secrets, changes of status).',
    '',
    '# Rules',
    '- Use only facts that the text states or clearly implies. Do not invent. When a fact is uncertain, write it as a question in a "## Open questions" section.',
    '- Do not duplicate entries. Check names and aliases in the planning index first.',
    '- Skip minor figures that appear once and do not matter.',
    `- Write entries in ${lang}, short and concrete. Bullets are good.`,
    '- A new entry has frontmatter with aliases (other names used in the text) and a one-line summary. Useful sections for a character: ## Role, ## Appearance, ## Personality, ## Relationships, ## In the story (what happens to them, by chapter). For a place: ## Description, ## In the story.',
    '- For an update, edit the existing file. Use an exact <find> from the entry and a <replace>, or an empty <find></find> to append a new section or bullet at the end.',
    `- Categories that exist: ${input.categories.join(', ')}.`,
    '',
    '# Output format',
    'First, one or two sentences that say what you found. Then the proposals:',
    '',
    '<create file="planning/Characters/Name.md">',
    '---',
    'aliases: [Other name]',
    'summary: One line.',
    '---',
    '## Role',
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
