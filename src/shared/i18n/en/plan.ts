// Texts of one part of the app. See src/shared/i18n/README.md.

export const plan = {
  /** The name of a new planning entry, before the user renames it */
  newEntryName: 'New entry',
  writingRules: 'Writing rules',
  name: 'Name',
  /** Tooltip of the back link at the top of a Plan page. `to` is "Overview" or a category name. */
  backTo: (to: string): string => `Back to ${to}`,
  category: {
    /** Under the title of a category page */
    count: (n: number): string => (n === 1 ? '1 entry' : `${n} entries`),
    newEntry: 'New entry',
    importNotes: 'Import notes'
  },
  sidebar: {
    planning: 'Planning',
    /** The sync button. Its tooltip says what it does. */
    sync: 'Sync',
    /** Tooltip of the sync button: what it does */
    updateNotesHint:
      'The AI reads the chapters that changed since the last update and proposes changes to your planning notes. You accept or reject each change. The AI does not change the manuscript.',
    /** Tooltip of the sync button, second line. `count` is 1 or more. */
    changedChapters: (count: number): string => `${count} chapter${count > 1 ? 's' : ''} changed since the last update.`,
    upToDate: 'Up to date: no chapter changed since the last update.',
    overview: 'Overview',
    showEntries: (category: string): string => `${category}: show entries`,
    hideEntries: (category: string): string => `${category}: hide entries`,
    importNotesInto: (category: string): string => `Import notes into ${category}`,
    newIn: (category: string): string => `New in ${category}`,
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
    lastCategory: 'The planning needs one category.'
  },
  overview: {
    title: 'The world of the story',
    intro: 'Characters, places, the world and the plot. The AI reads this planning in every chat and action, so the book stays consistent.',
    buildFromManuscript: 'Build the planning from the manuscript',
    noNotesYet: 'No notes yet.',
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
    apply: 'Apply',
    rejectOne: 'Reject',
    applyAll: 'Apply all',
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
    dndCancel: 'The move is cancelled.'
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
      `${entries === 1 ? '1 entry' : `${entries} entries`} · ${links === 1 ? '1 link' : `${links} links`}`,
    searchPlaceholder: 'Find an entry',
    search: 'Find an entry on the map',
    clearSearch: 'Clear the search',
    /** Next to the search box */
    matches: (n: number): string => (n === 0 ? 'No match' : n === 1 ? '1 match' : `${n} matches`),
    categories: 'Categories',
    /** Tooltip of a category chip */
    toggleCategory: (category: string, shown: boolean): string => (shown ? `Hide ${category}` : `Show ${category}`),
    chapters: 'Chapters',
    chaptersHint: 'Show the chapters and the entries that they mention',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit to screen',
    /** The map for screen readers */
    label: (entries: number, links: number): string =>
      `Map of ${entries} entries and ${links} links. Use the search box to find and open an entry.`,
    /** In the card of a node */
    links: (n: number): string => (n === 0 ? 'No links' : n === 1 ? '1 link' : `${n} links`),
    chapter: (n: number): string => `Chapter ${n}`,
    emptyTitle: 'Nothing to map yet',
    emptyText: 'The map shows the entries of the planning and the links between them. Add characters, places and notes, and they show here.',
    noLinksTitle: 'No links yet',
    noLinks: 'An entry links to another entry when its summary or its notes use the name of the other entry, or [[Name]].',
    allHidden: 'All the categories are hidden.',
    showAll: 'Show all'
  },
  entry: {
    deleteTitle: (name: string): string => `Delete “${name}”?`,
    deleteMessage: "The file moves to the book's .wordelia/trash folder.",
    askChat: 'Ask the chat about this entry',
    mentionInChat: 'Mention in chat',
    deleteEntry: 'Delete entry',
    chooseImage: 'Choose an image',
    changeImage: 'Change',
    addImage: 'Add image',
    summary: 'Summary',
    summaryPlaceholder: 'One line that describes this entry',
    alsoCalled: 'Also called',
    removeAlias: (alias: string): string => `Remove ${alias}`,
    aliasPlaceholder: '+ name',
    notesPlaceholder: 'Notes: appearance, personality, history, secrets…',
    inManuscript: 'In the manuscript'
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
    syncing: 'Syncing…',
    /** A toast when a sync starts away from the Plan sidebar (for example after an import) */
    started: 'The notes update in the background. The Plan view shows the progress.',
    /** Under "Syncing…": the AI reads the chapters */
    reading: (n: number): string => (n === 1 ? 'Reading 1 chapter…' : `Reading ${n} chapters…`),
    /** Under "Syncing…": the AI writes its reply. `found`: the complete changes so far. */
    writing: (found: number): string => (found === 0 ? 'Writing the changes…' : found === 1 ? '1 change so far…' : `${found} changes so far…`),
    /** Before the progress when the chapters go to the AI in more than one part */
    part: (part: number, parts: number): string => `Part ${part} of ${parts}`,
    cancel: 'Cancel the sync',
    /** The result card in the Plan sidebar, and the toast */
    proposed: (n: number): string => (n === 1 ? '1 change proposed to the notes' : `${n} changes proposed to the notes`),
    noChanges: 'No changes. The notes agree with the chapters.',
    review: 'Review',
    reviewHint: 'Open the changes in the chat. There you accept or reject each change.',
    accepted: (n: number): string => (n === 1 ? 'Applied 1 change to the notes.' : `Applied ${n} changes to the notes.`),
    rejected: (n: number): string => (n === 1 ? 'Rejected 1 change.' : `Rejected ${n} changes.`),
    /** The title of the card when the sync stops with an error */
    failed: 'The sync stopped.',
    result: 'Result of the sync',
    threadTitle: 'Planning sync',
    /** Stored in sync threads: keep this English text as it is, or old threads show it untranslated. */
    threadBrief: 'Keeps the planning in step with the manuscript. Proposals come from the Sync button.',
    /** The user message in the sync thread. `chapters` is the list of chapter titles in quotes. */
    request: (bootstrap: boolean, count: number, chapters: string, part: number, parts: number): string =>
      `${bootstrap ? 'Build the planning from' : 'Sync the planning with'} ${count === 1 ? 'chapter' : `${count} chapters`}: ${chapters}${parts > 1 ? ` (part ${part} of ${parts})` : ''}.`
  },
  links: {
    noEntry: (name: string): string => `No planning entry is called "${name}".`,
    createIt: 'Create it'
  },
  imported: (count: number, category: string): string => `Imported ${count} note${count === 1 ? '' : 's'} into ${category}.`
}
