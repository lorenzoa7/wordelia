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
  deleteMessage: 'The messages of this thread will be deleted. Other threads keep their own digests.',
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
  removeMention: 'Remove mention',
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
    level ? `Default (${level})` : cli ? 'Default (the CLI decides)' : 'Default (the model decides)',

  // Messages
  bulkPartial: (ok: number, total: number, failed: number): string =>
    `Applied ${ok} of ${total} proposals. ${failed} could not be applied: the text changed.`,
  bulkApplied: (ok: number, chapters: boolean): string =>
    `Applied ${ok} proposals.${chapters ? ' The versions from before the change are in the chapter history.' : ''}`,
  toReview: (v: number): string => `${v} proposals to review`,
  copyFailed: 'Could not copy.',
  openChapterFirst: 'Open a chapter first.',
  copyReply: 'Copy the reply',
  insertHint: 'Insert the reply at the cursor in the open chapter (Ctrl+Z undoes it)',
  insert: 'Insert into chapter',
  thinking: 'The editor is thinking',

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

  // Sending
  connectFirst: 'Connect an AI first.',
  openSettings: 'Open settings'
}
