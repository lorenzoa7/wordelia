// Texts of one part of the app. See src/shared/i18n/README.md.

export const editor = {
  /** The formatting toolbar above the page */
  toolbar: {
    formatting: 'Formatting',
    redo: 'Redo',
    font: 'Font',
    selectedText: 'Selected text',
    bookFont: (font: string): string => `Book font (${font})`,
    changeBookFont: 'Change the font of the whole book…',
    fontSize: 'Font size',
    bookSize: (size: number): string => `Book size (${size})`,
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    alignment: 'Alignment',
    align: { left: 'Left', center: 'Center', right: 'Right', justify: 'Justify' },
    bookDefault: 'Book default',
    noIndent: 'No first-line indent',
    sceneBreak: 'Scene break',
    findReplace: 'Find and replace',
    focusMode: 'Focus mode',
    zoom: 'Zoom',
    zoomReset: 'Back to 100 %'
  },
  /** The small menu above a text selection */
  selection: {
    askChat: 'Ask the chat about this',
    reply: 'Reply',
    /** Tooltip of the main action, before the shortcut */
    withAi: (action: string): string => `${action} with AI`,
    moreActions: 'More actions',
    actions: 'Actions',
    editActions: 'Edit actions…',
    /** Label of a quote when the chapter has no title */
    chapter: 'Chapter'
  },
  /** The bar under an inline AI review */
  review: {
    chatProposal: 'Chat proposal',
    /** Words that the AI wrote so far */
    words: (n: number): string => `${n} words`,
    stop: 'Stop'
  },
  /** Find and replace */
  find: {
    replaceToggle: 'Replace',
    find: 'Find',
    noResults: 'No results',
    matchCase: 'Match case',
    wholeWord: 'Whole word',
    /** The letter on the whole-word button */
    wholeWordShort: 'W',
    previous: 'Previous',
    next: 'Next',
    replaceWith: 'Replace with',
    replace: 'Replace',
    replaceAll: 'Replace all',
    otherChapters: 'Other chapters'
  },
  /** The page and the chapter heading */
  page: {
    placeholder: 'Begin here…',
    chapterText: 'Chapter text',
    chapterTitle: 'Chapter title',
    nextChapter: 'Start the next chapter',
    noChapters: 'This book has no chapters yet.',
    addFirstChapter: 'Add the first chapter'
  },
  /** Errors when a proposal cannot change the chapter */
  apply: {
    notFound: 'The text to change was not found in the chapter. It may have changed.',
    manyMatches: 'The text to change appears more than once in the chapter. Ask the AI for a longer passage.',
    noChapter: 'The chapter does not exist.'
  }
}
