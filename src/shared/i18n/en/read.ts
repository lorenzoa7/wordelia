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
  },
  /**
   * The draft of "Discuss in chat", after the quote of the passage: the number of the comment in the margin
   * (null when it has none) and its text. The author writes the question after it.
   */
  aboutComment: (n: number | null, text: string): string => (n === null ? `About the comment “${text}”: ` : `About comment ${n} (“${text}”): `),
  /**
   * The message of "Update the note" in the thread of the read: the planning notes and the story line that
   * must agree with the chapter (as mentions, for example "@Marta"; none when the comment names none) and the
   * comment. The passage is a quote of the message.
   */
  updateNoteAsk: (text: string, targets: string[]): string => {
    const what = targets.length ? (targets.length === 1 ? targets[0] : `${targets.slice(0, -1).join(', ')} and ${targets[targets.length - 1]}`) : 'the planning note or the story line'
    return `The text of this chapter is right as it is. Update ${what} so that it agrees with the passage. Do not change this chapter. The comment: “${text}”`
  },
  /** The toast after the author accepts the Polish of a comment. Its button is `markDone(1)`. */
  polished: 'Mark the comment as done?',
  /** The passage of a comment is not in the text now: "Polish passage" has nothing to polish */
  noPassage: 'The passage of this comment is not in the text now.',
  /** "It's intentional": the dialog that asks for a short reason. The next reads of the chapter get it. */
  intentionalAsk: {
    title: "It's intentional",
    label: 'Why? The next reads get the reason (optional)',
    placeholder: 'For example: the character lies on purpose',
    confirm: 'Mark as intentional'
  },
  /** A link of the letter of a read to one of its comments: its name for screen readers and its tooltip */
  letterRef: {
    /** An open comment, with its number in the margin (null when its passage is not in the text) */
    open: (n: number | null, lens: string): string => (n === null ? `Go to the comment · ${lens}` : `Go to comment ${n} · ${lens}`),
    done: (lens: string): string => `Done · ${lens}`,
    ignored: (lens: string): string => `Ignored · ${lens}`,
    intentional: (lens: string): string => `Intentional · ${lens}`
  },
  /** "Update the note" while the thread of the read still writes a reply: nothing is sent */
  threadBusy: 'The chat still writes a reply in the thread of this read. Try again when the reply ends.',
  /** The revision list: all the comments of the book, in the Write view (the item at the top of the chapter list opens it) */
  list: {
    /** The title of the page, and the item of the chapter list */
    title: 'Revision list',
    /** The text under the title */
    intro: "All the comments of the editor's reads, of all lenses. No comment changes the text.",
    /** The button that opens the form of a read of the open chapter */
    newRead: 'New read',
    /** The names of the two filters */
    lensFilter: 'Lens',
    stateFilter: 'State',
    /** The first choice of each filter: all the comments */
    all: 'All',
    /** The choices of the state filter */
    states: { open: 'Open', done: 'Done', ignored: 'Ignored', intentional: 'Intentional' },
    /** The state of one comment, in its row */
    state: { open: 'Open', done: 'Done', ignored: 'Ignored', intentional: 'Intentional' },
    /** The counts in the header of a chapter, for example "3 open · 1 done" */
    count: {
      open: (n: number): string => `${n} open`,
      done: (n: number): string => `${n} done`,
      ignored: (n: number): string => `${n} ignored`,
      intentional: (n: number): string => `${n} intentional`
    },
    /** The tooltip of a count in the chapter list */
    openCount: (n: number): string => (n === 1 ? '1 open comment' : `${n} open comments`),
    /** Go to the passage of a comment: the list closes, and the chapter shows at the passage */
    goTo: 'Go to passage',
    /** Before the reason of an intentional comment */
    reason: 'Your reason:',
    /** The book has no comments yet */
    empty: "No comments yet. The comments of an editor's read come here.",
    /** No comment agrees with the filters */
    noMatch: 'No comment agrees with these filters.',
    /** The chip of a Continuity comment: the passage of this chapter is in conflict with its source */
    conflict: (chapter: string, source: string): string => `${chapter} is in conflict with ${source}`
  },
  /**
   * The toast when the book opens with an `ai/comments.json` that is not a comments file (conflict marks of git,
   * a partial write of a sync client). The app shows no comments and does not write the file.
   */
  damagedFile: 'The comments file of this book is damaged. Wordelia does not change it. Fix or delete ai/comments.json.'
}
