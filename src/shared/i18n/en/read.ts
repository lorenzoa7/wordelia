// Texts of the editor's read: the comments in the margin and the revision list. See src/shared/i18n/README.md.

export const read = {
  /** The toast after the writer changes the state of `n` comments. Undo follows. */
  stateChanged: {
    open: (n: number): string => (n === 1 ? 'Comment reopened.' : `${n} comments reopened.`),
    done: (n: number): string => (n === 1 ? 'Comment marked as done.' : `${n} comments marked as done.`),
    ignored: (n: number): string => (n === 1 ? 'Comment ignored.' : `${n} comments ignored.`),
    intentional: (n: number): string => (n === 1 ? 'Comment marked as intentional.' : `${n} comments marked as intentional.`)
  },
  /** The toast when `ai/comments.json` comes from a newer Wordelia. The app shows the comments and does not save changes to them. */
  newerFile: 'A newer version of Wordelia wrote the comments of this book. This version shows them, but it does not save changes to them.'
}
