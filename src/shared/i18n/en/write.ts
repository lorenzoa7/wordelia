// Texts of one part of the app. See src/shared/i18n/README.md.

export const write = {
  chapters: 'Chapters',
  newChapter: 'New chapter',
  addChapter: 'Add chapter',
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
  deleteMessage: "The file moves to the book's .wordelia/trash folder. You can get it back from there.",
  deleted: (title: string): string => `“${title}” moved to the trash folder.`,
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
    noRewrite: 'The AI sent no rewrite. Try again.',
    /** Ctrl+J in an empty paragraph, or on a selection of spaces */
    nothingSelected: 'Select some text, or put the cursor in a paragraph with text.',
    /** A reply without a rewrite: the words of the AI */
    aiSays: (words: string): string => `The AI did not rewrite the passage: “${words}”`,
    /** The change is ready while the author is in the Plan view */
    readyIn: (action: string, chapter: string): string => `The change of ${action} is ready in “${chapter}”.`,
    show: 'Show',
    changedMeanwhile: 'The passage changed while the AI worked, so its change was not kept.'
  }
}
