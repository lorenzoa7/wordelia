// Words that many parts of the app use. English is the source language: the other
// languages must have the same keys (TypeScript checks it).

const n = (v: number): string => v.toLocaleString('en-US')

export const common = {
  /** Locale for dates and numbers */
  locale: 'en-US',
  number: n,
  cancel: 'Cancel',
  save: 'Save',
  delete: 'Delete',
  close: 'Close',
  rename: 'Rename',
  create: 'Create',
  open: 'Open',
  import: 'Import',
  export: 'Export',
  accept: 'Accept',
  reject: 'Reject',
  acceptAll: 'Accept all',
  rejectAll: 'Reject all',
  undo: 'Undo',
  retry: 'Try again',
  copy: 'Copy',
  copied: 'Copied.',
  back: 'Back',
  next: 'Next',
  done: 'Done',
  continue: 'Continue',
  settings: 'Settings',
  loading: 'Loading…',
  untitled: 'Untitled',
  words: (v: number): string => (v === 1 ? '1 word' : `${n(v)} words`),
  chapters: (v: number): string => (v === 1 ? '1 chapter' : `${n(v)} chapters`),
  efforts: { minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' },
  /** What each provider is, under its name */
  providerKind: {
    'claude-code': 'Your Claude subscription, through the claude CLI',
    codex: 'Your ChatGPT subscription, through the codex CLI',
    anthropic: 'Pay per use with an API key',
    openai: 'Pay per use with an API key'
  },
  /** The kinds of AI work, each with its own model */
  tasks: {
    chat: { name: 'Chat', hint: 'Conversations, feedback and proposed edits.' },
    action: { name: 'Actions', hint: 'Polish and the other actions on selected text. Speed matters here.' },
    sync: { name: 'Planning sync', hint: 'Reads chapters and updates the planning.' },
    background: { name: 'Background', hint: 'Thread digests, titles and chapter summaries.' }
  },
  /** Names of the built-in actions, by action id */
  builtinActions: { polish: 'Polish', tighten: 'Tighten', grammar: 'Fix grammar only', show: "Show, don't tell", expand: 'Expand' } as Record<string, string>,
  /** Names of the default planning categories, by category id */
  categories: { characters: 'Characters', places: 'Places', world: 'World', plot: 'Plot', notes: 'Notes' } as Record<string, string>
}
