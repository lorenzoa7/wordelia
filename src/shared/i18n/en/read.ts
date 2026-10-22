// Texts of the editor's read: comments in the margin, the revision list and the start of a read. See src/shared/i18n/README.md.

import type { LensChoice } from '../../comments'

export const read = {
  /** The toast after the writer changes the state of `n` comments. Undo follows. */
  stateChanged: {
    open: (n: number): string => (n === 1 ? 'Comment reopened.' : `${n} comments reopened.`),
    done: (n: number): string => (n === 1 ? 'Comment marked as done.' : `${n} comments marked as done.`),
    ignored: (n: number): string => (n === 1 ? 'Comment ignored.' : `${n} comments ignored.`),
    intentional: (n: number): string => (n === 1 ? 'Comment marked as intentional.' : `${n} comments marked as intentional.`)
  },
  /** The toast when `ai/comments.json` comes from a newer Wordelia. The app shows the comments and does not save changes to them. */
  newerFile: 'A newer version of Wordelia wrote the comments of this book. This version shows them, but it does not save changes to them.',

  /** The name of the read: the toolbar button, the popover and the card of a reply */
  title: "Editor's read",
  /** The ways to read a chapter. "all" is the choice that reads with every lens. */
  lens: {
    all: 'All lenses',
    structure: 'Structure',
    reader: 'Reader',
    style: 'Style',
    continuity: 'Continuity',
    proofread: 'Proofread'
  },
  /** The title of the thread that holds the reads of one chapter */
  threadTitle: (chapter: string): string => `Read · ${chapter}`,
  /** The message of the author that starts a read. `how` tells if the read is of a selection, or of a chapter in progress. */
  ask: (chapter: string, lens: LensChoice, how: { selection: boolean; inProgress: boolean }): string => {
    const base: Record<LensChoice, string> = {
      all: `Read the chapter “${chapter}” with all lenses`,
      structure: `Read the chapter “${chapter}” as a structure editor`,
      reader: `Read the chapter “${chapter}” as a first reader`,
      style: `Read the chapter “${chapter}” as a style editor`,
      continuity: `Read the chapter “${chapter}” as a continuity editor`,
      proofread: `Read the chapter “${chapter}” as a proofreader`
    }
    const extra = [how.selection ? 'only the selected passage' : '', how.inProgress ? 'chapter in progress' : ''].filter(Boolean)
    return `${base[lens]}${extra.length ? ` (${extra.join(', ')})` : ''}.`
  },
  /** The button that starts a read: in the popover and on the offer card */
  run: 'Read',
  /** The tooltip of a button that starts a read, while the chapter is being read */
  running: 'This chapter is being read now.',
  /** The popover of the toolbar */
  popover: {
    whatToRead: 'What to read',
    thisChapter: 'This chapter',
    theSelection: 'The selection',
    lens: 'Lens',
    inProgress: 'Chapter in progress',
    inProgressHint: 'The editor does not say that the end is missing.',
    note: 'The editor leaves comments. It never changes your text.'
  },
  /** The card in the chat that offers a read: the chapter number and the lens */
  offer: (n: number, lens: string): string => `Do the editor's read of ch. ${n} · ${lens}`,
  /** The card above the letter of a read: the chapter number and the lens, then the comments of the reply */
  head: {
    place: (n: number, lens: string): string => `Ch. ${n} · ${lens}`,
    comments: (n: number): string => (n === 1 ? '1 comment' : `${n} comments`)
  },
  /** The toast when the AI says that some comments look fixed. The writer decides. */
  resolved: (n: number): string => (n === 1 ? 'The read thinks 1 comment is fixed.' : `The read thinks ${n} comments are fixed.`),
  markDone: (n: number): string => (n === 1 ? 'Mark as done' : 'Mark all as done'),
  /** The margin beside the page: the cards of the open comments of the chapter on screen */
  margin: {
    /** The header of the column, with the number of cards that show */
    title: (n: number): string => `Editor's comments · ${n}`,
    /** The name of the lens filter of the margin */
    filter: 'Show the comments of one lens',
    /** Hide the cards and the marks of this book */
    hide: 'Hide',
    /** A comment whose passage is not in the text now */
    lost: 'The passage changed',
    discuss: 'Discuss in chat',
    polish: 'Polish passage',
    updateNote: 'Update the note',
    intentional: "It's intentional",
    ignore: 'Ignore',
    done: 'Done',
    /** The tooltip of the state buttons when the comments file comes from a newer Wordelia */
    readOnly: 'A newer version of Wordelia keeps these comments. This version cannot change them.',
    /** The labels of the quotes of a Continuity comment: a chapter, the story line, a planning note */
    chapter: (n: number): string => `Ch. ${n}`,
    storyLine: 'Story line',
    note: 'Note',
    /** A quote in a card */
    quote: (text: string): string => `“${text}”`,
    /** The name of a card for screen readers */
    card: (n: number | null, lens: string): string => (n === null ? `Comment · ${lens}` : `Comment ${n} · ${lens}`)
  },
  /** The item of the status bar: the open comments of the book */
  status: {
    count: (n: number): string => (n === 1 ? "1 editor's comment" : `${n} editor's comments`),
    /** The tooltip when the comments do not show in the margin now */
    show: 'Show the comments in the margin',
    /** The tooltip when they show */
    goTo: 'Go to the comments'
  }
}
