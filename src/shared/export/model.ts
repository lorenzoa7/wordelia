// The export model: what PDF and DOCX exports print. Pure code.

import { parseMarkdown } from '../markdown/parse'
import type { BookManifest, Chapter, DocNode, ExportSettings, PageSize } from '../types'

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
  return {
    title: manifest.title,
    subtitle: manifest.subtitle,
    author: manifest.author,
    language: manifest.language,
    settings: settings ?? manifest.export,
    words,
    chapters: chapters.map((c, i) => ({ number: i + 1, title: c.title, blocks: parseMarkdown(c.body).content ?? [] }))
  }
}

/** Presets for the export dialog. */
export function presetSettings(preset: 'book' | 'manuscript', base: ExportSettings, bookFont: string): ExportSettings {
  if (preset === 'manuscript') {
    return {
      ...base,
      preset,
      pageSize: base.pageSize === 'Letter' ? 'Letter' : 'A4',
      margins: { top: 25.4, bottom: 25.4, inner: 25.4, outer: 25.4 },
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
    pageSize: ['A4', 'Letter'].includes(base.pageSize) ? 'A5' : base.pageSize,
    margins: { top: 20, bottom: 20, inner: 18, outer: 14 },
    typography: { fontFamily: bookFont, fontSize: 11, lineHeight: 1.45, firstLineIndent: 1.5, align: 'justify' },
    chapterHeading: 'number-title',
    chapterStartsOnNewPage: true,
    chapterDropFromTop: 30,
    sceneBreak: 'asterisks',
    titlePage: true,
    pageNumbers: true,
    runningHeader: false
  }
}
