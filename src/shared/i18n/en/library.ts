// Texts of one part of the app. See src/shared/i18n/README.md.

import { formatCount } from '../../book'

const chapterWord = (v: number): string => (v === 1 ? 'chapter' : 'chapters')

export const library = {
  /** A short word count on cards and in the import list, for example "1.2k" */
  count: (v: number): string => formatCount(v),
  // Library
  tagline: 'A quiet desk for your book, with an editor at your side.',
  newBook: 'New book',
  openFolder: 'Open folder',
  openFolderTitle: 'Open a book folder',
  importFile: 'Import DOCX or Markdown',
  yourBooks: 'Your books',
  emptyLine: 'Chapter One',
  emptyHint: 'Your first book starts here. Every book is a plain folder of files on this computer.',
  folderNotFound: 'Folder not found',
  bookMeta: (words: number, chapters: number): string => `${words === 1 ? '1 word' : `${formatCount(words)} words`} · ${chapters} ${chapterWord(chapters)}`,
  /** The pages on screen, an estimate from the page size, the margins and the typography of the book */
  /** `exact`: counted by the editor; else an estimate (≈) */
  bookPages: (v: number, exact = false): string => `${exact ? '' : '≈ '}${v === 1 ? '1 page' : `${v.toLocaleString('en')} pages`}`,
  bookOptions: 'Book options',
  showFolder: 'Show folder',
  removeFromList: 'Remove from list',
  justNow: 'just now',
  couldNotOpen: (error: string): string => `Could not open the book: ${error}`,
  // New book
  newTitle: 'A new book',
  newDescription: 'Wordelia keeps each book in its own folder of plain files.',
  creating: 'Creating…',
  createBook: 'Create book',
  title: 'Title',
  titlePlaceholder: 'The Lighthouse of Saint Isle',
  author: 'Author',
  authorPlaceholder: 'Your name',
  language: 'Language of the book',
  languageHint: 'The AI writes book text in this language. Spell check uses it too.',
  languageAria: 'Language',
  /** Names of the book languages, by language code */
  languages: {
    'pt-BR': 'Português (Brasil)',
    'pt-PT': 'Português (Portugal)',
    'en-US': 'English (US)',
    'en-GB': 'English (UK)',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    it: 'Italiano'
  } as Record<string, string>,
  location: 'Location',
  locationTitle: 'Where to keep the book',
  change: 'Change…',
  couldNotCreate: (error: string): string => `Could not create the book: ${error}`,
  // Import
  importTitle: 'Import a book',
  importing: 'Importing…',
  reading: 'Reading the file…',
  importSummary: (chapters: number, words: number): string => `${chapters} ${chapterWord(chapters)} · ${words === 1 ? '1 word' : `${formatCount(words)} words`}`,
  buildPlanning: 'Build the planning with AI',
  buildPlanningNote: 'The AI reads the chapters and proposes characters, places and plot notes. You review each proposal before it is saved.',
  warnings: (v: number): string => (v === 1 ? '1 formatting note from the converter was ignored.' : `${v} formatting notes from the converter were ignored.`),
  importedBook: 'Imported book',
  imported: (v: number): string => `Imported ${v} ${chapterWord(v)}.`,
  importFailed: (error: string): string => `Import failed: ${error}`,
  couldNotRead: (error: string): string => `Could not read the file: ${error}`
}
