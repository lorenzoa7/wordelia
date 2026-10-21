// Texts of one part of the app. See src/shared/i18n/README.md.
// The word for a planning entry on screen is "note" (GLOSSARY.md).

export const plan = {
  /** The name of a new planning entry, before the user renames it */
  newEntryName: 'New note',
  writingRules: 'Writing rules',
  name: 'Name',
  /** Tooltip of the back link at the top of a Plan page. `to` is "Overview" or a category name. */
  backTo: (to: string): string => `Back to ${to}`,
  category: {
    /** Under the title of a category page */
    count: (n: number): string => (n === 1 ? '1 note' : `${n} notes`),
    newEntry: 'New note',
    importNotes: 'Import notes'
  },
  sidebar: {
    planning: 'Planning',
    /** The sync button. Its tooltip says what it does. */
    sync: 'Update notes',
    /** Tooltip of the sync button: what it does */
    updateNotesHint:
      'The AI reads the chapters that changed since the last update and proposes changes to your planning notes. You accept or reject each change. The AI does not change the manuscript.',
    /** Tooltip of the sync button, second line. `count` is 1 or more. */
    changedChapters: (count: number): string => `${count} chapter${count > 1 ? 's' : ''} changed since the last update.`,
    upToDate: 'Up to date: no chapter changed since the last update.',
    overview: 'Overview',
    showEntries: (category: string): string => `${category}: show notes`,
    hideEntries: (category: string): string => `${category}: hide notes`,
    importNotesInto: (category: string): string => `Import notes into ${category}`,
    newIn: (category: string): string => `New note in ${category}`,
    empty: 'Empty',
    newCategory: 'New category',
    categoryPlaceholder: 'Objects, Factions, Timeline…',
    add: 'Add',
    addCategory: 'Add category',
    categoryMenu: (category: string): string => `Actions of ${category}`,
    renameCategory: 'Rename the category',
    rename: 'Rename',
    deleteCategory: 'Delete the category',
    deleteCategoryTitle: (category: string): string => `Delete “${category}”?`,
    deleteCategoryMessage: (notes: number): string =>
      notes ? `Its ${notes === 1 ? 'note goes' : `${notes} notes go`} to the trash of the book.` : 'The category has no notes.',
    lastCategory: 'The planning needs one category.',
    /** The toast after a category is deleted. It has Undo. */
    categoryDeleted: (category: string, notes: number): string =>
      notes ? `“${category}” is deleted. ${notes === 1 ? 'Its note is' : `Its ${notes} notes are`} in the trash of the book.` : `“${category}” is deleted.`,
    /** The icons of a category, in its menu */
    icon: 'Icon',
    /** The notes at the root of the planning folder, in no category folder */
    outside: 'Not in a category'
  },
  overview: {
    title: 'The world of the story',
    intro: 'Characters, places, the world and the plot. The AI reads this planning in every chat and action, so the book stays consistent.',
    buildFromManuscript: 'Build the planning from the manuscript',
    /** A note with no summary and no text */
    noNotesYet: 'Nothing written yet.',
    /** The card that adds an entry to a category */
    newCard: 'New'
  },
  /** The story line: a board of cards in two views, by chapter and by time (features/plan/line) */
  line: {
    title: 'Story line',
    /** The switch at the top right of the board */
    views: 'Views of the story line',
    byChapter: 'By chapter',
    byTime: 'By time',
    statsChapters: (chapters: number, cards: number): string =>
      `${chapters === 1 ? '1 chapter' : `${chapters} chapters`} · ${cards === 1 ? '1 card' : `${cards} cards`}`,
    statsMoments: (moments: number, cards: number): string =>
      `${moments === 1 ? '1 moment' : `${moments} moments`} · ${cards === 1 ? '1 card' : `${cards} cards`}`,
    here: 'You are here',
    hereChapter: 'The last chapter of the book',
    hereTime: 'The moment of the last chapter of the book',
    trayChapter: 'No chapter',
    trayChapterHint: 'Cards that are not in a chapter yet. Drag them to a chapter.',
    trayTime: 'No moment',
    trayTimeHint: 'Cards that are not in a moment yet. Drag them to a moment.',
    written: 'A chapter of the book. The chapters keep the order of the book.',
    planned: 'A planned chapter: it is not in the book yet. Drag it to change its place.',
    moment: 'A moment of the story. Drag it to change its place.',
    untitled: 'Untitled',
    chapterNumber: (n: number): string => `Chapter ${n}`,
    cards: (n: number): string => (n === 1 ? '1 card' : `${n} cards`),
    addCard: 'Add a card',
    cardPlaceholder: 'What happens? Type @ to mention a note.',
    cardKeys: 'Enter adds the card · Esc closes',
    addChapter: 'Plan a chapter',
    addMoment: 'Add a moment',
    chapterPlaceholder: 'Title of the chapter',
    momentPlaceholder: 'For example: August 1883',
    columnKeys: 'Enter adds · Esc closes',
    columnMenu: (title: string): string => `Actions of “${title}”`,
    move: (title: string): string => `Move “${title}”`,
    rename: 'Rename',
    renameChapter: 'Rename the chapter',
    openChapter: 'Open the chapter',
    deleteColumn: 'Delete the column',
    columnDeleted: (title: string, cards: number, tray: string): string =>
      cards ? `“${title}” is deleted. Its ${cards === 1 ? 'card is' : `${cards} cards are`} in “${tray}”.` : `“${title}” is deleted.`,
    cardTitle: 'Card',
    chapter: 'Chapter',
    momentField: 'Moment',
    none: 'None',
    mentions: 'Mentioned notes',
    noMentions: 'Type @ in the text to mention a note.',
    deleteCard: 'Delete the card',
    cardDeleted: 'The card is deleted.',
    textRequired: 'Write what happens.',
    suggestions: 'Notes to mention',
    bannerText: 'The AI can fill the line from a summary, a note or an image.',
    bannerAction: 'Fill with the AI',
    bannerDraft: 'Fill my story line from this information: ',
    threadTitle: 'Story line',
    reviewTitle: 'AI proposal',
    changes: (n: number): string => (n === 1 ? '1 change' : `${n} changes`),
    fromAi: (n: number): string => (n === 1 ? '1 change from the AI' : `${n} changes from the AI`),
    apply: 'Accept',
    rejectOne: 'Reject',
    applyAll: 'Accept all',
    rejectAll: 'Reject all',
    slotAdd: 'Comes here',
    slotRemove: 'Leaves',
    slotDelete: 'Deleted',
    slotText: 'New text',
    columnAdd: 'New column',
    columnDelete: 'Column deleted',
    columnRename: 'New title',
    columnMove: 'New place',
    reviewLocked: 'Accept or reject it before you change the line.',
    reviewStale: 'This proposal of the AI does not fit the line any more.',
    writing: 'The AI writes a proposal for the line…',
    showInChat: 'Show in the chat',
    showInLine: 'Show in the line',
    accepted: 'The line is updated.',
    created: 'The story line is ready.',
    summary: 'The events of the story, by chapter and by time.',
    card: 'Story line',
    inLine: (n: number): string => `Chapter ${n} in the line`,
    more: (n: number): string => `+${n}`,
    dndInstructions: 'Press Space to pick up a card or a column. Move it with the arrow keys. Press Space to drop it, or Escape to cancel.',
    dndStart: (text: string): string => `Picked up “${text}”.`,
    dndOver: (title: string): string => `Over “${title}”.`,
    dndEnd: (title: string): string => `Dropped in “${title}”.`,
    dndCancel: 'The move is cancelled.',
    /** A toast: the card dialog closed (Esc, a click outside, a link) and kept the new text */
    cardSaved: 'The card is saved.',
    /** A toast: the title of a written chapter changed on the board. It has Undo. */
    chapterRenamed: (from: string, to: string): string => `The chapter “${from}” is now “${to}”.`,
    /** The button that shows the tray, with the number of its cards */
    trayButton: (tray: string, cards: number): string => `${tray} · ${cards}`,
    trayButtonHint: (cards: number): string => (cards === 1 ? '1 card has no place in this view. Show it.' : `${cards} cards have no place in this view. Show them.`),
    /** The "+" of a column when its box has text that is not a card yet */
    draft: 'Continue the card'
  },
  /** The map: a graph of the entries and the links between them */
  map: {
    /** The switch on the overview: the cards or the map */
    views: 'Planning views',
    cards: 'Cards',
    map: 'Map',
    line: 'Line',
    /** Under the title of the map */
    stats: (entries: number, links: number): string =>
      `${entries === 1 ? '1 note' : `${entries} notes`} · ${links === 1 ? '1 link' : `${links} links`}`,
    searchPlaceholder: 'Find a note',
    search: 'Find a note on the map',
    clearSearch: 'Clear the search',
    /** Next to the search box */
    matches: (n: number): string => (n === 0 ? 'No match' : n === 1 ? '1 match' : `${n} matches`),
    categories: 'Categories',
    /** Tooltip of a category chip */
    toggleCategory: (category: string, shown: boolean): string => (shown ? `Hide ${category}` : `Show ${category}`),
    chapters: 'Chapters',
    chaptersHint: 'Show the chapters and the notes that they mention',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit to screen',
    /** The map for screen readers */
    label: (entries: number, links: number): string =>
      `Map of ${entries} notes and ${links} links. Use the search box to find and open a note.`,
    /** In the card of a node */
    links: (n: number): string => (n === 0 ? 'No links' : n === 1 ? '1 link' : `${n} links`),
    chapter: (n: number): string => `Chapter ${n}`,
    emptyTitle: 'Nothing to map yet',
    emptyText: 'The map shows the notes of the planning and the links between them. Add characters, places and notes, and they show here.',
    noLinksTitle: 'No links yet',
    noLinks: 'A note links to another note when its summary or its text uses the name of the other note, or [[Name]].',
    allHidden: 'All the categories are hidden.',
    showAll: 'Show all'
  },
  entry: {
    deleteTitle: (name: string): string => `Delete “${name}”?`,
    deleteMessage: "The file moves to the book's .wordelia/trash folder.",
    askChat: 'Ask the chat about this note',
    mentionInChat: 'Mention in chat',
    deleteEntry: 'Delete the note',
    chooseImage: 'Choose an image',
    changeImage: 'Change',
    addImage: 'Add image',
    viewImage: 'View the whole image',
    proposedPortrait: 'Proposed portrait',
    usePortrait: 'Use',
    summary: 'Summary',
    summaryPlaceholder: 'One line that describes this note',
    alsoCalled: 'Also called',
    removeAlias: (alias: string): string => `Remove ${alias}`,
    aliasPlaceholder: '+ name',
    notesPlaceholder: 'Appearance, personality, history, secrets…',
    inManuscript: 'In the manuscript',
    /** Tooltip of a chip of "In the manuscript" */
    findInChapter: (name: string): string => `Open the chapter at the first “${name}”`,
    /** The toast after a note is deleted. It has Undo. */
    deleted: (name: string): string => `“${name}” is in the trash of the book.`,
    removeImage: 'Remove',
    removeImageLabel: 'Remove the portrait',
    imageRemoved: 'The portrait is removed.',
    /** The category control at the top of a note */
    category: 'Category',
    moveTo: (category: string): string => `In ${category}. Move to another category`,
    moved: (name: string, category: string): string => `“${name}” is now in ${category}.`,
    /** A note in a folder under its category folder: the name of that folder */
    inFolder: (folder: string): string => `In the folder ${folder}`
  },
  rules: {
    intro:
      'Your rules for this book: voice, point of view, tense, dialogue, words to avoid. Every AI action and chat follows them. Paste the rules from your old prompt here.',
    placeholder: 'Write your rules…'
  },
  noteEditor: {
    placeholder: 'Write here…',
    notesAbout: (label: string): string => `Notes about ${label}`,
    notes: 'Notes',
    reply: 'Reply'
  },
  sync: {
    connectAiFirst: 'Connect an AI first.',
    openSettings: 'Open settings',
    upToDate: 'The planning is up to date with the manuscript.',
    /** The sync button while the sync runs */
    syncing: 'Updating the notes…',
    /** A toast when a sync starts away from the Plan sidebar (for example after an import) */
    started: 'The notes update in the background. The Plan view shows the progress.',
    /** Under "Syncing…": the AI reads the chapters */
    reading: (n: number): string => (n === 1 ? 'Reading 1 chapter…' : `Reading ${n} chapters…`),
    /** Under "Syncing…": the AI writes its reply. `found`: the complete changes so far. */
    writing: (found: number): string => (found === 0 ? 'Writing the changes…' : found === 1 ? '1 change so far…' : `${found} changes so far…`),
    /** Before the progress when the chapters go to the AI in more than one part */
    part: (part: number, parts: number): string => `Part ${part} of ${parts}`,
    cancel: 'Stop the update',
    /** The result card in the Plan sidebar, and the toast */
    proposed: (n: number): string => (n === 1 ? '1 change proposed to the notes' : `${n} changes proposed to the notes`),
    noChanges: 'No changes. The notes agree with the chapters.',
    review: 'Review',
    reviewHint: 'Open the changes in the chat. There you accept or reject each change.',
    accepted: (n: number): string => (n === 1 ? 'Accepted 1 change to the notes.' : `Accepted ${n} changes to the notes.`),
    rejected: (n: number): string => (n === 1 ? 'Rejected 1 change.' : `Rejected ${n} changes.`),
    /** The title of the card when the sync stops with an error */
    failed: 'The update stopped.',
    result: 'Result of the update',
    threadTitle: 'Planning sync',
    /** Stored in sync threads: keep this English text as it is, or old threads show it untranslated. */
    threadBrief: 'Keeps the planning in step with the manuscript. Proposals come from the Sync button.',
    /** The user message in the sync thread. `chapters` is the list of chapter titles in quotes. */
    request: (bootstrap: boolean, count: number, chapters: string, part: number, parts: number): string =>
      `${bootstrap ? 'Build the planning from' : 'Sync the planning with'} ${count === 1 ? 'chapter' : `${count} chapters`}: ${chapters}${parts > 1 ? ` (part ${part} of ${parts})` : ''}.`,
    /** The toast of Undo after Accept all, when a note changed after the changes */
    undoUnsafe: 'A note changed after these changes, so Undo could remove your new words. Use the chat to undo a change.',
    /** The hint of the build button on a book with no text */
    nothingToRead: 'The chapters have no text yet.'
  },
  links: {
    noEntry: (name: string): string => `No note is called "${name}".`,
    createIt: 'Create it',
    /** Tooltip of a [[link]] in a note or a chapter */
    openHint: 'Ctrl+click to open the note.',
    missingHint: 'No note has this name. Ctrl+click to create it.',
    /** The toast after "Create it" */
    created: (name: string, category: string): string => `“${name}” is a new note in ${category}.`
  },
  imported: (count: number, category: string): string => `Imported ${count} note${count === 1 ? '' : 's'} into ${category}.`,
  /** After `imported`: notes that got a new name, because a note of the book has their name */
  importRenamed: (list: string): string => `A note of the book has the same name: ${list}.`,
  /** One item of `importRenamed` */
  importRenamedItem: (from: string, to: string): string => `“${from}” is now “${to}”`,
  /** After `imported`: files that the import did not read */
  importLeftOut: (left: number, max: number): string =>
    `${left === 1 ? '1 file was' : `${left} files were`} not imported: the limit is ${max} files at a time.`,
  /** Names: a rename, a new alias or a new category with a name that another one has */
  names: {
    nameTaken: (name: string): string => `Another note is already called “${name}”.`,
    aliasTaken: (alias: string, note: string): string => `“${alias}” is already a name of ${note}.`,
    aliasOwn: (alias: string): string => `“${alias}” is already a name of this note.`,
    categoryTaken: (name: string): string => `A category is already called “${name}”.`,
    /** The toast after a rename that changed links. It has Undo. */
    renamed: (links: number, oldName: string | null): string =>
      [
        links ? `${links === 1 ? '1 link now goes' : `${links} links now go`} to the new name.` : '',
        oldName ? `“${oldName}” stays as another name, so the chapters still count it.` : ''
      ]
        .filter(Boolean)
        .join(' ')
  }
}
