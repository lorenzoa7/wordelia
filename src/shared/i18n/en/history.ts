// Texts of one part of the app. See src/shared/i18n/README.md.

export const history = {
  title: 'History',
  titleOf: (title: string): string => `History of “${title}”`,
  description: 'Wordelia keeps versions when you open a chapter, every few minutes while you write, and before AI changes.',
  restore: 'Restore this version',
  reading: 'Reading the history…',
  empty: 'No versions yet. Wordelia saves one when you open the chapter and while you write.',
  /** Before "+12 −3 words" */
  ifRestore: 'If you restore this version:',
  /** After "+12 −3" */
  words: 'words',
  today: (time: string): string => `Today, ${time}`,
  restored: (title: string, when: string): string => `“${title}” is back to the version of ${when}.`,
  /**
   * Labels of saved versions. The files keep the English label; the history shows it in the
   * interface language.
   */
  labels: {
    opened: 'Opened',
    left: 'Left the chapter',
    autosave: 'Autosave',
    beforeRestore: 'Before restore',
    beforeChat: 'Before AI chat change',
    snapshot: 'Snapshot'
  },
  /** The label of the version saved before an action, for example "Before Polish" */
  before: (action: string): string => `Before ${action}`
}
