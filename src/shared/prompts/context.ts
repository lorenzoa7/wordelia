// Shared context blocks for prompts. Pure functions.

import { countMarkdownWords } from '../book'
import type { BookManifest, Chapter, Entry, Thread } from '../types'
import { boardView, parseBoard } from '../storyline'
import { rulesForAi } from '../ai/defaults'

export interface BookContext {
  manifest: BookManifest
  writingRules: string
  chapters: Chapter[]
  entries: Entry[]
  threads: Thread[]
}

export const LANGUAGE_NAMES: Record<string, string> = {
  'pt-BR': 'Brazilian Portuguese',
  'pt-PT': 'European Portuguese',
  en: 'English',
  'en-US': 'American English',
  'en-GB': 'British English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian'
}

export interface PlanningHeadings {
  role: string
  appearance: string
  personality: string
  relationships: string
  story: string
  description: string
  questions: string
}

const HEADINGS: Record<string, PlanningHeadings> = {
  en: { role: 'Role', appearance: 'Appearance', personality: 'Personality', relationships: 'Relationships', story: 'In the story', description: 'Description', questions: 'Open questions' },
  pt: { role: 'Papel', appearance: 'Aparência', personality: 'Personalidade', relationships: 'Relações', story: 'Na história', description: 'Descrição', questions: 'Perguntas em aberto' },
  es: { role: 'Papel', appearance: 'Apariencia', personality: 'Personalidad', relationships: 'Relaciones', story: 'En la historia', description: 'Descripción', questions: 'Preguntas abiertas' },
  fr: { role: 'Rôle', appearance: 'Apparence', personality: 'Personnalité', relationships: 'Relations', story: 'Dans l’histoire', description: 'Description', questions: 'Questions ouvertes' },
  de: { role: 'Rolle', appearance: 'Aussehen', personality: 'Persönlichkeit', relationships: 'Beziehungen', story: 'In der Geschichte', description: 'Beschreibung', questions: 'Offene Fragen' },
  it: { role: 'Ruolo', appearance: 'Aspetto', personality: 'Personalità', relationships: 'Relazioni', story: 'Nella storia', description: 'Descrizione', questions: 'Domande aperte' }
}

/** Section headings for planning entries in the language of the book (null when the app does not know them). */
export function planningHeadings(language: string): PlanningHeadings | null {
  return HEADINGS[language.slice(0, 2).toLowerCase()] ?? null
}

export function languageName(tag: string): string {
  return LANGUAGE_NAMES[tag] ?? tag
}

/** Rough token estimate. Good enough for budgets. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6)
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function bookBlock(m: BookManifest): string {
  const dash = m.typography.dialogueDash
  const lines = [
    `<book title="${escapeAttr(m.title)}" author="${escapeAttr(m.author)}" language="${escapeAttr(languageName(m.language))}"${m.genre ? ` genre="${escapeAttr(m.genre)}"` : ''}>`,
    m.typography.dialogueStyle === 'quotes'
      ? 'Dialogue punctuation: dialogue goes inside double quotation marks (“…”), with speech tags outside the quotes.'
      : `Dialogue punctuation: dialogue lines start with "${dash} " (the character ${dash === '—' ? 'U+2014 em dash' : 'U+2015 horizontal bar'}). Speech tags inside a line are set off with the same dash.`,
    'Scene breaks inside a chapter are a line with "* * *".',
    '</book>'
  ]
  return lines.join('\n')
}

export function writingRulesBlock(rules: string): string {
  // The notes and examples of the template are hints for the author, not rules (rulesForAi).
  const clean = rulesForAi(rules)
  if (!clean) return '<writing_rules>\n(The author has not written rules yet. Follow the voice of the existing text.)\n</writing_rules>'
  return `<writing_rules>\n${clean}\n</writing_rules>`
}

export function entryRef(e: Entry): string {
  return `planning/${e.file}`
}

export function planningIndex(entries: Entry[]): string {
  if (!entries.length) return '<planning_index>\n(No planning entries yet.)\n</planning_index>'
  const lines = entries.map((e) => {
    const aliases = e.aliases.length ? ` (also: ${e.aliases.join(', ')})` : ''
    const portrait = e.image ? ' (has a portrait)' : ''
    const summary = e.summary ? ` — ${e.summary}` : ''
    return `- ${entryRef(e)}: ${e.name}${aliases}${portrait}${summary}`
  })
  return `<planning_index>\n${lines.join('\n')}\n</planning_index>`
}

/** The story line, as the AI reads and changes it (the whole entry, with its front matter keys). */
export function storyLineBlock(e: Entry): string {
  return `<story_line file="${escapeAttr(entryRef(e))}" name="${escapeAttr(e.name)}">\n${e.body.trim()}\n</story_line>`
}

/** Where the book is in the story line: the last written chapter, and the cards of the open chapter. */
export function storyLineWhere(e: Entry, chapters: Chapter[], currentChapterId: string | null): string {
  const parts: string[] = []
  const last = chapters[chapters.length - 1]
  if (last) parts.push(`The last written chapter is chapter ${chapters.length}, "${last.title}": in "By chapter", the columns after it are planned chapters.`)
  const i = chapters.findIndex((c) => c.id === currentChapterId)
  if (i >= 0) {
    const current = chapters[i]
    const col = boardView(parseBoard(e.body), 'chapter', chapters).find((c) => c.chapterId === current.id)
    parts.push(
      col?.cards.length
        ? `The open chapter "${current.title}" (chapter ${i + 1}) has the cards ${col.cards.map((c) => `^${c.id}`).join(' ')}.`
        : `The open chapter "${current.title}" (chapter ${i + 1}) has no card in the story line yet.`
    )
  }
  return parts.join(' ')
}

export function entryBlock(e: Entry): string {
  const meta: string[] = []
  if (e.aliases.length) meta.push(`aliases: ${e.aliases.join(', ')}`)
  if (e.summary) meta.push(`summary: ${e.summary}`)
  if (e.image) meta.push('portrait: yes (in the images of the message)')
  const head = meta.length ? `${meta.join('\n')}\n\n` : ''
  return `<planning_entry file="${escapeAttr(entryRef(e))}" name="${escapeAttr(e.name)}">\n${head}${e.body.trim()}\n</planning_entry>`
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Names that identify an entry in text: its name and aliases. */
export function entryNames(e: Entry): string[] {
  return [e.name, ...e.aliases].map((n) => n.trim()).filter((n) => n.length >= 3)
}

/** Entries whose name or alias appears in the text. */
export function entriesMentionedIn(text: string, entries: Entry[]): Entry[] {
  const found: Entry[] = []
  for (const e of entries) {
    for (const name of entryNames(e)) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, 'iu')
      if (re.test(text)) {
        found.push(e)
        break
      }
    }
  }
  return found
}

export function chapterRef(c: Chapter): string {
  return `manuscript/${c.file}`
}

export function outlineBlock(chapters: Chapter[], currentId: string | null): string {
  const lines = chapters.map((c, i) => {
    const mark = c.id === currentId ? ' ← open in the editor' : ''
    return `${i + 1}. "${c.title}" (${chapterRef(c)}, ${countMarkdownWords(c.body)} words)${mark}`
  })
  return `<manuscript_outline>\n${lines.join('\n') || '(No chapters yet.)'}\n</manuscript_outline>`
}

export function chapterBlock(c: Chapter, index: number, current: boolean): string {
  return `<chapter file="${escapeAttr(chapterRef(c))}" number="${index + 1}" title="${escapeAttr(c.title)}"${current ? ' current="true"' : ''}>\n${c.body.trim()}\n</chapter>`
}

export function threadsBlock(threads: Thread[], exceptId: string | null): string {
  const others = threads.filter((t) => t.id !== exceptId && (t.digest.trim() || t.brief.trim()))
  if (!others.length) return ''
  const items = others.map(
    (t) =>
      `<thread title="${escapeAttr(t.title)}"${t.brief ? ` brief="${escapeAttr(t.brief)}"` : ''}>\n${t.digest.trim() || '(No digest yet.)'}\n</thread>`
  )
  return items.join('\n')
}

/** Text around a range of a chapter, cut at whitespace. */
export function contextAround(text: string, start: number, end: number, chars: number): { before: string; after: string } {
  let b = Math.max(0, start - chars)
  if (b > 0) {
    const ws = text.indexOf(' ', b)
    if (ws >= 0 && ws < start) b = ws + 1
  }
  let a = Math.min(text.length, end + chars)
  if (a < text.length) {
    const ws = text.lastIndexOf(' ', a)
    if (ws > end) a = ws
  }
  return { before: text.slice(b, start), after: text.slice(end, a) }
}
