// Texts of one part of the app. See src/shared/i18n/README.md.

import type { ExportSettings, PageSize } from '../../types'

export const exportDialog = {
  description: 'Make a file to send to readers, editors or publishers.',
  exporting: 'Exporting…',
  /** The file formats. PDF, Word and Markdown are names. */
  formats: {
    pdf: { label: 'PDF', hint: 'Print-ready pages', button: 'Export PDF' },
    docx: { label: 'Word', hint: 'Also for Google Docs', button: 'Export Word' },
    md: { label: 'Markdown', hint: 'One file', button: 'Export Markdown' },
    txt: { label: 'Plain text', hint: 'No formatting', button: 'Export Plain text' }
  },
  presets: {
    book: { name: 'Book', hint: 'Pages like a printed novel' },
    manuscript: { name: 'Manuscript', hint: 'Standard format for agents and publishers' }
  },
  pageSize: 'Page size',
  /** Names of the page sizes, by page size id */
  pageSizes: {
    A5: 'A5 (148 × 210 mm)',
    Pocket5x8: '5 × 8 in',
    Digest5_5x8_5: '5.5 × 8.5 in',
    Trade6x9: '6 × 9 in (trade paperback)',
    A4: 'A4 (210 × 297 mm)',
    Letter: 'US Letter (8.5 × 11 in)'
  } as Record<PageSize, string>,
  font: 'Font',
  size: 'Size',
  lineSpacing: 'Line spacing',
  double: 'Double',
  chapterHeading: 'Chapter heading',
  headings: {
    'number-title': 'Number and title',
    'word-number-title': '“Chapter One” and title',
    title: 'Title only',
    number: 'Number only'
  } as Record<ExportSettings['chapterHeading'], string>,
  sceneBreak: 'Scene break',
  blankLine: 'Blank line',
  titlePage: 'Title page',
  pageNumbers: 'Page numbers',
  runningHeader: 'Running header',
  newPage: 'Each chapter on a new page',
  docxNote: 'For Google Docs: upload the .docx file to Google Drive and open it with Google Docs. The fonts are Google Fonts, so they look the same.',
  oneFile: 'One file with all chapters, in order.',
  mdNote: 'Formatting stays as Markdown.',
  txtNote: 'Formatting is removed.',
  exportedTo: (file: string): string => `Exported to ${file}`,
  show: 'Show',
  exportFailed: (error: string): string => `Export failed: ${error}`,
  /** Under the presets: the book preset has the pages of the Write view */
  sameAsScreen: 'The same pages as in the Write view: page size, margins and type.'
}
