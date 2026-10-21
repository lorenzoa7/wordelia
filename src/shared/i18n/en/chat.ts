// Texts of one part of the app. See src/shared/i18n/README.md.

export const chat = {
  entryNotFound: 'The text to change was not found in the note. It may have changed.',
  entryManyMatches: 'The text to change appears more than once in the note. Ask the AI for a longer passage.',
  /** aria-label of the chat panel */
  panel: 'Chat',
  /** Shown for a thread that has no title from the AI yet */
  newThread: 'New thread',
  threadOptions: 'Thread options',
  titleAndPurpose: 'Title and purpose…',
  pin: 'Pin',
  unpin: 'Unpin',
  deleteTitle: (title: string): string => `Delete “${title}”?`,
  deleteMessage: 'The thread goes to the trash of the book, and Undo can bring it back. Other threads keep their own digests.',
  deleteThread: 'Delete thread',
  purpose: 'Purpose',
  searchThreads: 'Search threads',
  noThreads: 'No threads yet.',
  messages: (v: number): string => `${v} ${v === 1 ? 'message' : 'messages'}`,
  thread: 'Thread',
  editorDescription: "The purpose helps the AI focus. Other threads see this thread's purpose and digest.",
  title: 'Title',
  purposeHint: "Example: Marta's arc in part two. Her doubts and her loyalty to Elias.",
  digest: 'Digest (kept by the AI)',
  /** The view with the list of all threads */
  threads: 'Threads',
  /** The back button of a thread: it opens the list of all threads */
  allThreads: 'All threads',
  pinned: 'Pinned',
  recent: 'Recent',
  noMatches: (q: string): string => `No thread matches “${q}”.`,
  /** Tooltip of the purpose strip above the messages */
  editPurpose: 'Edit the purpose',

  // Empty chat
  emptyTitle: 'Your editor is here.',
  emptyText: 'It reads the whole book, the planning, and your other threads. It can propose changes; you approve each one.',
  /** Prompts the user can click to put in the composer */
  suggestions: [
    'What is the weakest part of this chapter?',
    'Check this chapter against the planning. Is anything inconsistent?',
    'Suggest three titles for this chapter.',
    'Which scene could be cut or merged?'
  ] as string[],

  // Composer
  chapterNumber: (v: number): string => `Chapter ${v}`,
  /** aria-label of the list of mention choices */
  mentionList: 'Mention',
  /** aria-label of the button that starts a mention */
  mention: 'Mention',
  removeQuote: 'Remove quote',
  /** Images in chat messages */
  attachImage: 'Add an image',
  removeImage: (name: string) => `Remove ${name}`,
  openImage: (name: string) => `Open ${name}`,
  dropImages: 'Drop the images to add them',
  askImage: 'Ask about the image…',
  tooManyImages: (max: number) => `A message can have up to ${max} images.`,
  imageNotRead: (name: string) => `The app cannot read the image “${name}”.`,
  /** A portrait that the AI proposes for a note */
  portrait: 'Portrait',
  usePortrait: 'Use as portrait',
  portraitAlt: (name: string) => `Portrait of ${name}`,
  portraitSet: (name: string) => `${name} has a new portrait.`,
  portraitNoEntry: (name: string) => `There is no note “${name}”. Create the note first.`,
  portraitBadImage: 'The AI named an image that is not in the book.',
  portraitComesBack: 'the portrait from before comes back',
  portraitGoes: 'the portrait goes',
  composer: 'Message to your editor',
  askQuote: 'Ask about the quote…',
  placeholder: 'Ask your editor. Type @ to mention a chapter, entry or thread.',
  stop: 'Stop',
  send: 'Send',

  // Model picker
  modelForThread: 'Model for this thread',
  notSet: 'Not set',
  defaultModel: 'Default model',
  defaultRoute: (route: string): string => `Default (${route})`,
  noAi: 'No AI connected',
  effort: 'Effort',
  /** The "Default" effort: the default level of the model, or who decides */
  defaultEffort: (level: string | undefined, cli: boolean): string =>
    level ? `Default (${level})` : cli ? 'Default (automatic)' : 'Default (the model decides)',

  // Messages
  bulkPartial: (ok: number, total: number, failed: number): string =>
    `Applied ${ok} of ${total} proposals. ${failed} could not be applied: the text changed.`,
  bulkApplied: (ok: number, chapters: boolean): string =>
    `Applied ${ok} proposals.${chapters ? ' The versions from before the change are in the chapter history.' : ''}`,
  copyFailed: 'Could not copy.',
  openChapterFirst: 'Open a chapter first.',
  copyReply: 'Copy the reply',
  insertHint: 'Put the text of this reply into the open chapter, as new paragraphs after the cursor. Ctrl+Z undoes it.',
  insert: 'Insert at cursor',
  /** aria-label while the AI works */
  thinking: 'The editor is thinking',
  retry: 'Retry',
  retryHint: 'Remove this reply and ask again',
  editMessage: 'Edit',
  editHint: 'Edit this message and send it again',
  rewind: 'Rewind',
  rewindHint: 'Rewind to here: remove the messages after this one',
  copyMessage: 'Copy the message',
  /** Under the box of an edited message */
  editAfter: (v: number): string =>
    v === 0
      ? 'The AI answers again.'
      : `Sending removes the ${v === 1 ? 'message' : `${v} messages`} after this one. The AI answers again.`,
  noReply: 'No reply yet.',
  getReply: 'Get a reply',

  // Thinking, while the AI works
  thoughtProcess: 'Thought process',
  showThinking: 'Show the thinking',
  hideThinking: 'Hide the thinking',
  phaseReading: 'Reading the chapter and the planning…',
  phaseEdit: (label: string): string => `Writing a change to “${label}”…`,
  phaseCreate: 'Writing a planning note…',

  // Rewind
  rewindTitle: 'Rewind the thread?',
  rewindText: (v: number): string => `The ${v === 1 ? 'message' : `${v} messages`} after this one will leave the thread.`,
  rewindConfirm: 'Rewind',
  editTitle: 'Send the edited message?',
  editMessageText: (v: number): string =>
    `Your edited message takes the place of the old one${v ? `, and the ${v === 1 ? 'message' : `${v} messages`} after it leave the thread` : ''}. The AI answers again.`,
  retryTitle: 'Ask for a new reply?',
  retryText: 'The last reply leaves the thread, and the AI answers again.',
  rewindBookChanged: 'You accepted changes from these replies:',
  changeCount: (v: number): string => (v === 1 ? '1 change' : `${v} changes`),
  noteToTrash: 'new note, goes to the trash',
  noteComesBack: 'replaced note, the old text comes back',
  rewindUndo: 'Undo these changes in the book',
  rewindUndoHint: 'Wordelia saves a version of each chapter first. Text that you changed after the AI change stays as it is.',
  rewindKeepHint: 'The book stays as it is. Only the thread changes.',
  undoneAll: (v: number): string => `Undid ${v === 1 ? '1 change' : `${v} changes`} in the book.`,
  undonePartial: (ok: number, total: number): string =>
    `Undid ${ok} of ${total} changes in the book. The others changed after the AI change, so they stay. The version history has the text from before.`,

  // Thread states
  statusWorking: 'Working…',
  statusNeedsYou: (v: number): string => (v === 1 ? '1 proposal to review' : `${v} proposals to review`),
  statusNeedsYouShort: 'Needs you',
  statusUnseen: 'New reply',

  // Proposals
  undoUnsafe: 'The text changed after the AI change, so Undo could stop your new words. Use Ctrl+Z or the version history.',
  changeApplied: (label: string): string => `Change applied to “${label}”.`,
  changesApplied: (v: number, label: string): string => `${v} change${v > 1 ? 's' : ''} applied to “${label}”.`,
  inlineView: 'Inline view',
  splitView: 'Split view',
  toggleView: 'Toggle diff view',
  rejectChange: 'Reject change',
  acceptChange: 'Accept change',
  applied: 'Applied',
  rejected: 'Rejected',
  notFound: 'Not found',
  entryCreated: (label: string): string => `Created “${label}” in the planning.`,
  entryUpdated: (label: string): string => `Updated “${label}” in the planning.`,
  replacesEntry: 'replaces the entry',
  dismiss: 'Dismiss',
  replace: 'Replace',
  aliases: (names: string): string => `Also: ${names}`,
  showLess: 'Show less',
  showAll: 'Show all',
  fileMissing: (label: string): string => `The file "${label}" does not exist.`,
  createOnlyEntries: 'The AI can create planning entries only.',
  showInText: 'Show in text',
  showInTextHint: 'Open the chapter at this passage and show the change there',
  passageNotFound: 'The passage was not found in the chapter. It may have changed.',
  /** The bar for all the proposals of one reply */
  replyProposals: (v: number): string => (v === 1 ? '1 proposal in this reply' : `${v} proposals in this reply`),
  applyAll: (v: number): string => `Apply all ${v}`,
  /** The files of the bar that do not show by name: a count after the names */
  moreFiles: (v: number): string => `+${v}`,
  moreFilesLabel: (v: number): string => (v === 1 ? '1 more file' : `${v} more files`),
  applyAllHint: 'Apply every change and note of this reply. Chapters get a version in the history first.',

  // Sending
  connectFirst: 'Connect an AI first.',
  openSettings: 'Open settings',

  // A reply that the author stopped, or that the AI did not finish
  changeIncomplete: 'The reply stopped before this change was complete, so it cannot be applied.',
  incompleteNote: 'The reply stopped before this note was complete, so it cannot be created.',
  /** The mark under a reply that the author stopped */
  stoppedMark: 'Stopped',
  stoppedHint: 'You stopped this reply. Its text ends here.',
  /** While a long book gets the summaries of its chapters */
  summarizing: (done: number, total: number): string => `Summarizing chapters: ${done} of ${total}…`,
  /** A reply with changes arrives while the author types: the app does not move the author */
  changesReady: 'Changes ready',
  show: 'Show',
  /** Undo toasts after a rejection */
  rejectedCount: (v: number): string => (v === 1 ? 'Rejected 1 proposal.' : `Rejected ${v} proposals.`),
  /** The proposals of the earlier replies of a thread that wait */
  dismissOld: (v: number): string => `Dismiss old proposals (${v})`,
  dismissOldHint: 'Reject the proposals of the earlier replies that you did not decide.',
  replacedByNewer: 'A newer proposal changes the same text.',
  /** The thread list: a new thread that has no messages yet */
  notStarted: 'No messages yet',
  threadDeleted: (title: string): string => `Moved “${title}” to the trash of the book.`,
  newThreadRemoved: 'Removed the new thread.',
  /** A change that was not found */
  tryAgain: 'Try again',
  lookedFor: 'The text it looks for',
  /** A change with no text to find adds its text at the end of the chapter */
  atEnd: 'At the end of the chapter',
  /** A change of punctuation or spaces only: no words added or removed */
  smallChange: 'Small change',
  /** A new text for a note that exists */
  replaceTakesOut: (parts: string): string => `This replaces the whole note. It takes out ${parts}.`,
  lostAliases: (names: string): string => `the other names ${names}`,
  lostFields: (names: string): string => `the fields ${names}`,
  lostSections: (names: string): string => `the sections ${names}`,
  noteSummary: 'Summary',
  noteAliases: 'Other names',
  noteChanged: 'What changes in the note',
  /** Tokens and cost of a reply, and of a thread */
  usage: (input: string, output: string, cost: string | null): string =>
    [`${input} tokens in`, `${output} out`, ...(cost ? [`about ${cost}`] : [])].join(' · '),
  usageOfThread: 'Use of this thread',
  usageReplies: (v: number): string => (v === 1 ? 'in 1 reply' : `in ${v} replies`),
  /** The words of the provider about an error, under the plain message */
  errorDetails: 'Details'
}
