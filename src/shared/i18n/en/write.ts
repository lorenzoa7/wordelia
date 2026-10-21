// Texts of one part of the app. See src/shared/i18n/README.md.

export const write = {
  chapters: 'Chapters',
  chapterTitle: 'Chapter title',
  chapterOptions: 'Chapter options',
  /** aria-label of a chapter in the sidebar */
  /** Pages of a chapter in the chapter list */
  chapterPages: (n: number): string => `${n} p.`,
  /** Tooltip of the pages: the words of the chapter */
  chapterWords: (n: number): string => `${n.toLocaleString('en')} words`,
  chapterLabel: (n: number, title: string, words: number): string =>
    `Chapter ${n}: ${title}, ${words} words. F2 renames, Alt and arrow keys move it.`,
  newChapterAfter: 'New chapter after this',
  moveUp: 'Move up',
  moveDown: 'Move down',
  mention: 'Mention in chat',
  versionHistoryMenu: 'Version history…',
  deleteChapter: 'Delete chapter',
  deleteTitle: (title: string): string => `Delete “${title}”?`,
  deleteMessage: 'You can undo it right after. The file also stays in the book folder, in .wordelia/trash.',
  deleted: (title: string): string => `Deleted “${title}”.`,
  /** The status bar under the page */
  status: {
    /** After the number of selected words */
    selected: 'selected',
    /** After the number of words in the chapter */
    wordsInChapter: 'words in chapter',
    inBook: (count: string): string => `${count} in book`,
    minRead: (minutes: number): string => `${minutes} min read`,
    dailyGoal: (words: number): string => `Daily goal: ${words} words`,
    goalReached: 'Goal reached',
    today: (words: string): string => `+${words} today`,
    versionHistory: 'Version history',
    history: 'History',
    saved: 'Saved',
    saving: 'Saving…',
    notSaved: 'Not saved'
  },
  /** Running an action on the selection */
  action: {
    connectFirst: 'Connect an AI first.',
    openSettings: 'Open settings',
    nothingToChange: 'The AI found nothing to change.',
    noRewrite: 'The AI sent no rewrite. Try again.'
  },
  /** The "+" in the header of the chapter list: the new chapter goes after the chapter on screen */
  newChapterAfterOne: (title: string): string => `New chapter after “${title}”`,
  /** The button under the chapter list */
  addChapterAtEnd: 'Add a chapter at the end',
  /** Why the app cannot save, in plain words */
  saveProblems: {
    readOnly: 'The file is read-only, or the system does not let Wordelia change it.',
    busy: 'Another program holds the file, for example a sync app.',
    missing: 'The book folder is not there. It moved, or its drive is not connected.',
    diskFull: 'The disk is full.',
    other: 'Wordelia cannot write the file.'
  },
  notSavedToast: (reason: string): string => `Your last changes are not saved. ${reason} Wordelia tries again by itself.`,
  /** The tooltip of "Not saved" in the status bar, after the reason */
  clickToRetry: 'Click to try again.'
}
