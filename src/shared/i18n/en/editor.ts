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
    zoomReset: 'Back to 100 %',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomSliderHint: 'Drag to zoom. Double-click: 100 %'
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
  /** The mark of a selected page break (Ctrl+Enter) */
  pageBreak: 'Page break',
  review: {
    chatProposal: 'Chat proposal',
    /** Words that the AI wrote so far */
    words: (n: number): string => `${n} words`,
    stop: 'Stop',
    /** The three views of an AI change in the review bar */
    viewLabel: 'View of the change',
    views: {
      words: 'Word by word',
      stacked: 'Old over new',
      new: 'New text only'
    },
    /** The name of the review bar for screen readers */
    barLabel: (action: string): string => `Review of ${action}`,
    /** What a screen reader says about the review: the state, not each new word count */
    working: (action: string): string => `${action}: the AI is working on the passage. You can write in the rest of the chapter.`,
    readyStatus: (action: string, added: number, removed: number): string =>
      `${action}: the change is ready, ${added} added and ${removed} removed. Enter accepts, Esc rejects, Tab goes to the bar.`,
    /** A key that the locked passage refused */
    lockedShort: 'Locked',
    lockedWorking: 'The passage is locked while the AI works. Esc stops.',
    lockedReady: 'The passage is locked until you decide. Enter accepts, Esc rejects.'
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
  },
  /** aria-label of the text of a chapter */
  chapterTextOf: (n: number, title: string): string => `Text of chapter ${n}: ${title}`,
  /** aria-label of the font and size buttons of the toolbar, with their value */
  fontIs: (font: string): string => `Font: ${font}`,
  fontSizeIs: (size: number): string => `Font size: ${size}`,
  /** Find and replace in all chapters */
  replaceInAllChapters: 'Replace in all chapters…',
  replaceInBookTitle: 'Replace in all chapters',
  replaceInBookWhat: (find: string, replace: string): string => (replace ? `“${find}” becomes “${replace}” in these chapters:` : `“${find}” goes out of these chapters:`),
  replaceInBookNone: (find: string): string => `No chapter has “${find}”.`,
  replaceInBookButton: (n: number): string => (n === 1 ? 'Replace 1 time' : `Replace ${n} times`),
  replaceCount: (n: number): string => (n === 1 ? '1 time' : `${n} times`),
  replacedInBook: (n: number, chapters: number): string => `Replaced ${n === 1 ? '1 time' : `${n} times`} in ${chapters === 1 ? '1 chapter' : `${chapters} chapters`}.`,
  replaceUndoPartly: (n: number): string => (n === 1 ? 'One chapter changed after the replace. It stays as it is.' : `${n} chapters changed after the replace. They stay as they are.`)
}
