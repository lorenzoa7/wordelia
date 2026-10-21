// Texts of one part of the app. See src/shared/i18n/README.md.

import { formatCount } from '../../book'

const chapterWord = (v: number): string => (v === 1 ? 'chapter' : 'chapters')
/** “A”, “B”, “C” and 2 more */
const listNames = (names: string[]): string =>
  names.slice(0, 3).map((x) => `“${x}”`).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '')

export const library = {
  /** A short word count on cards and in the import list, for example "1.2k" */
  count: (v: number): string => formatCount(v),
  // Library
  tagline: 'A quiet desk for your book, with an editor at your side.',
  newBook: 'New book',
  openFolder: 'Open folder',
  openFolderTitle: 'Open a book folder',
  importFile: 'Import DOCX, Markdown or TXT',
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
  couldNotRead: (error: string): string => `Could not read the file: ${error}`,
  // Import: scene breaks, blank lines and the AI
  sceneBreaks: (v: number): string => (v === 1 ? '1 scene break' : `${v} scene breaks`),
  /** What the empty lines between paragraphs of a document are */
  blankLines: 'Blank lines in the file',
  blankLinesSpacing: 'Just spacing',
  blankLinesBreaks: 'Scene breaks',
  nothingToImport: 'This file has no text to import.',
  /** Before buildPlanningNote: the provider that builds the planning */
  buildPlanningWith: (name: string): string => `${name} does this after the import.`,
  buildPlanningNoAi: 'To build the planning, connect an AI in Settings → AI.',
  /** The empty library: a click on the sheet starts the first book */
  emptyStart: 'Start your first book',
  // Open folder: a folder that is not a book
  notBookTitle: 'This folder is not a book yet',
  notBookText: (name: string): string => `“${name}” has no wordelia.json, the file that makes a folder a Wordelia book.`,
  notBookNotes: (v: number): string =>
    `It has ${v === 1 ? '1 Markdown or text file' : `${v} Markdown or text files`}. Import copies the files into a new book, one chapter for each file. This folder does not change.`,
  notBookMake: '“Make it a book” adds wordelia.json and the folders manuscript, planning and ai to this folder.',
  notBookChapters: (v: number): string =>
    `“Make it a book” adds wordelia.json to this folder. ${v === 1 ? 'The file' : `The ${v} files`} in its manuscript folder become the chapters.`,
  makeBook: 'Make it a book',
  importNotes: 'Import the files',
  insideBookTitle: 'This folder is part of a book',
  insideBook: (title: string): string => `It is inside the folder of “${title}”. Open that book?`,
  openThatBook: 'Open the book',
  // A book whose folder moved
  findFolder: 'Find the folder…',
  findFolderTitle: (title: string): string => `Where is the folder of “${title}” now?`,
  folderFound: (title: string): string => `“${title}” is back in the library.`,
  notABookFolder: 'That folder is not a Wordelia book.',
  notThisBook: (title: string): string => (title ? `That folder has another book: “${title}”.` : 'That folder has another book.'),
  /** Remove from list, with Undo */
  removed: (title: string): string => `“${title}” is not in the list now. Its files stay on this computer.`,
  // When a book opens: problems with its files
  manifestRepaired: {
    conflict: 'The book file wordelia.json had two versions in it (a sync or git conflict). Wordelia kept the version of this computer. The old file is in the .wordelia folder.',
    copy: 'The book file wordelia.json was damaged. Wordelia put back its last good copy. The old file is in the .wordelia folder.',
    salvage: 'The book file wordelia.json was damaged. Wordelia repaired it with the parts that it could read: check the book settings. The old file is in the .wordelia folder.',
    new: 'The book file wordelia.json could not be read. Wordelia made a new one: check the title, the language and the order of the chapters. The old file is in the .wordelia folder.'
  } as Record<'conflict' | 'copy' | 'salvage' | 'new', string>,
  showOldFile: 'Show the old file',
  /** Chapter files that are not in the manuscript folder now, by name */
  chaptersMissing: (names: string[]): string =>
    names.length === 1
      ? `The file of the chapter “${names[0]}” is missing. Its place in the order stays: the chapter comes back when the file is there (for example, after a sync).`
      : `The files of ${names.length} chapters are missing: ${listNames(names)}. Their places in the order stay: the chapters come back when the files are there (for example, after a sync).`,
  forgetMissing: (v: number): string => (v === 1 ? 'Forget this chapter' : 'Forget these chapters')

}
