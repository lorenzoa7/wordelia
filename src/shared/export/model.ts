// The export model: what PDF and DOCX exports print. Pure code.

import { parseMarkdown } from '../markdown/parse'
import type { BookManifest, Chapter, DocNode, ExportSettings, PageSize, Typography } from '../types'

export interface ExportChapter {
  number: number
  title: string
  blocks: DocNode[]
}

export interface ExportBook {
  title: string
  subtitle: string
  author: string
  language: string
  settings: ExportSettings
  chapters: ExportChapter[]
  words: number
  /** The first paragraph of a chapter or scene has a first-line indent too (book typography) */
  indentFirst: boolean
  /** Em. Space between paragraphs (book typography; the manuscript preset has none) */
  paragraphSpacing: number
}

/** Page sizes in millimeters (width, height). */
export const PAGE_SIZES: Record<PageSize, { label: string; w: number; h: number }> = {
  A5: { label: 'A5 (148 × 210 mm)', w: 148, h: 210 },
  Pocket5x8: { label: '5 × 8 in', w: 127, h: 203.2 },
  Digest5_5x8_5: { label: '5.5 × 8.5 in', w: 139.7, h: 215.9 },
  Trade6x9: { label: '6 × 9 in (trade paperback)', w: 152.4, h: 228.6 },
  A4: { label: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  Letter: { label: 'US Letter (8.5 × 11 in)', w: 215.9, h: 279.4 }
}

export const NUMBER_WORDS_EN = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty']
const NUMBER_WORDS_PT = ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete', 'Oito', 'Nove', 'Dez', 'Onze', 'Doze', 'Treze', 'Catorze', 'Quinze', 'Dezesseis', 'Dezessete', 'Dezoito', 'Dezenove', 'Vinte']
const NUMBER_WORDS_ES = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez', 'Once', 'Doce', 'Trece', 'Catorce', 'Quince', 'Dieciséis', 'Diecisiete', 'Dieciocho', 'Diecinueve', 'Veinte']

/** "Chapter One" in the language of the book. */
export function chapterWord(language: string, n: number): string {
  const l = language.toLowerCase()
  if (l.startsWith('pt')) return `Capítulo ${NUMBER_WORDS_PT[n - 1] ?? n}`
  if (l.startsWith('es')) return `Capítulo ${NUMBER_WORDS_ES[n - 1] ?? n}`
  if (l.startsWith('fr')) return `Chapitre ${n}`
  if (l.startsWith('de')) return `Kapitel ${n}`
  if (l.startsWith('it')) return `Capitolo ${n}`
  return `Chapter ${NUMBER_WORDS_EN[n - 1] ?? n}`
}

/** The word "Chapter" in the language of the book, without a number: the label above the number of a chapter. */
export function chapterLabel(language: string): string {
  const l = language.toLowerCase()
  if (l.startsWith('pt') || l.startsWith('es')) return 'Capítulo'
  if (l.startsWith('fr')) return 'Chapitre'
  if (l.startsWith('de')) return 'Kapitel'
  if (l.startsWith('it')) return 'Capitolo'
  return 'Chapter'
}

/**
 * The title of a new chapter, in the language of the book. It has no number: a number in a title
 * would be wrong after the chapter moves, and the heading shows the number already.
 */
export function untitledChapter(language: string): string {
  const l = language.toLowerCase()
  if (l.startsWith('pt')) return 'Sem título'
  if (l.startsWith('es')) return 'Sin título'
  if (l.startsWith('fr')) return 'Sans titre'
  if (l.startsWith('de')) return 'Ohne Titel'
  if (l.startsWith('it')) return 'Senza titolo'
  return 'Untitled'
}

/** The word count on the title page of a manuscript, rounded to a thousand: "about 80,000 words". */
export function aboutWords(language: string, words: number): string {
  const n = (Math.round(words / 1000) * 1000 || words).toLocaleString(language)
  const l = language.toLowerCase()
  if (l.startsWith('pt')) return `cerca de ${n} palavras`
  if (l.startsWith('es')) return `unas ${n} palabras`
  if (l.startsWith('fr')) return `environ ${n} mots`
  if (l.startsWith('de')) return `etwa ${n} Wörter`
  if (l.startsWith('it')) return `circa ${n} parole`
  return `about ${n} words`
}

/** The author line on the title page of a manuscript: "by Ana Exemplo". */
export function byAuthor(language: string, author: string): string {
  const l = language.toLowerCase()
  if (l.startsWith('pt') || l.startsWith('es')) return `por ${author}`
  if (l.startsWith('fr')) return `par ${author}`
  if (l.startsWith('de')) return `von ${author}`
  if (l.startsWith('it')) return `di ${author}`
  return `by ${author}`
}

export function headingParts(book: Pick<ExportBook, 'language' | 'settings'>, ch: ExportChapter): { label: string | null; title: string | null } {
  switch (book.settings.chapterHeading) {
    case 'number':
      return { label: String(ch.number), title: null }
    case 'title':
      return { label: null, title: ch.title }
    case 'word-number-title':
      return { label: chapterWord(book.language, ch.number), title: ch.title }
    default:
      return { label: String(ch.number), title: ch.title }
  }
}

export function buildExportBook(manifest: BookManifest, chapters: Chapter[], words: number, settings?: ExportSettings): ExportBook {
  const s = settings ?? manifest.export
  return {
    title: manifest.title,
    subtitle: manifest.subtitle,
    author: manifest.author,
    language: manifest.language,
    settings: s,
    words,
    indentFirst: manifest.typography.indentFirstParagraph,
    paragraphSpacing: s.preset === 'manuscript' ? 0 : manifest.typography.paragraphSpacing,
    chapters: chapters.map((c, i) => ({ number: i + 1, title: c.title, blocks: parseMarkdown(c.body).content ?? [] }))
  }
}

/** The page and the type of the book preset: the pages of the Write view (Settings → This book). */
function bookPage(book: Pick<BookManifest, 'export' | 'typography'>): Pick<ExportSettings, 'pageSize' | 'margins' | 'typography'> {
  const t: Typography = book.typography
  return {
    pageSize: book.export.pageSize,
    margins: { ...book.export.margins },
    typography: { fontFamily: t.fontFamily, fontSize: t.fontSize, lineHeight: t.lineHeight, firstLineIndent: t.firstLineIndent, align: t.align }
  }
}

/** The page of the manuscript preset: A4, or US Letter for a book in American English or when Letter is chosen. */
function manuscriptPage(base: ExportSettings, language: string): Pick<ExportSettings, 'pageSize' | 'margins'> {
  return { pageSize: base.pageSize === 'Letter' || language === 'en-US' ? 'Letter' : 'A4', margins: { top: 25.4, bottom: 25.4, inner: 25.4, outer: 25.4 } }
}

/**
 * Presets for the export dialog. The book preset has the pages of the Write view: the page size,
 * the margins and the typography of the book, so the PDF has the pages that the writer sees. The
 * manuscript preset has the standard manuscript format.
 */
export function presetSettings(preset: 'book' | 'manuscript', base: ExportSettings, book: Pick<BookManifest, 'export' | 'typography' | 'language'>): ExportSettings {
  if (preset === 'manuscript') {
    return {
      ...base,
      preset,
      ...manuscriptPage(base, book.language),
      typography: { fontFamily: 'Times New Roman', fontSize: 12, lineHeight: 2, firstLineIndent: 2.6, align: 'left' },
      chapterHeading: 'word-number-title',
      chapterStartsOnNewPage: true,
      chapterDropFromTop: 70,
      sceneBreak: 'hash',
      titlePage: true,
      pageNumbers: true,
      runningHeader: true
    }
  }
  return {
    ...base,
    preset,
    ...bookPage(book),
    chapterHeading: 'number-title',
    chapterStartsOnNewPage: true,
    chapterDropFromTop: 30,
    sceneBreak: 'asterisks',
    titlePage: true,
    pageNumbers: true,
    runningHeader: false
  }
}

/**
 * The settings of the export dialog when it opens: the choices of the last export, with the page of
 * the preset. The book preset follows the pages of the Write view again, also after the book
 * settings changed.
 */
export function startExportSettings(book: Pick<BookManifest, 'export' | 'typography' | 'language'>): ExportSettings {
  const saved = book.export
  if (saved.preset === 'manuscript') return { ...saved, ...manuscriptPage(saved, book.language) }
  return { ...saved, ...bookPage(book) }
}

/**
 * The export settings that the book keeps after an export. The page size and the margins are the
 * page of the Write view (Settings → This book): an export never changes them.
 */
export function exportSettingsToKeep(book: Pick<BookManifest, 'export'>, used: ExportSettings): ExportSettings {
  return { ...used, pageSize: book.export.pageSize, margins: { ...book.export.margins } }
}
