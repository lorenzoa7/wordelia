// Texts of one part of the app. See src/shared/i18n/README.md.

export const onboarding = {
  dialog: 'Welcome to Wordelia',
  /** aria-label of the language picker */
  language: 'Language',
  title: 'A quiet desk for your book.',
  youWrite: 'You write.',
  youWriteText: 'Wordelia gives you a calm page with real book typography.',
  aiEdits: 'The AI edits.',
  /** Before the Ctrl+J key */
  aiEditsBefore: 'Select a passage and press',
  /** After the Ctrl+J key */
  aiEditsAfter: '. The AI polishes it with your rules, and you see every change before you accept it.',
  aiRemembers: 'The AI remembers.',
  aiRemembersText: 'It reads the whole book, the planning of your story, and your other conversations.',
  skip: 'Skip',
  connectAi: 'Connect an AI',
  connectTitle: 'Connect the AI you already pay for',
  connectSub: 'Wordelia is free. It runs your own Claude Code or Codex program, or uses an API key.',
  apiKey: 'I have an API key (Anthropic or OpenAI)',
  later: 'Later',
  start: 'Start writing',
  copied: 'Copied. Paste it in a terminal.',
  runInTerminal: (cmd: string): string => `Run in a terminal: ${cmd}`,
  /** Before the install command */
  notInstalled: 'Not installed. In a terminal, run',
  expired: 'The login on this computer has expired.',
  notLoggedIn: 'Installed, but not logged in.',
  found: (account?: string): string => `Found on this computer${account ? `, logged in as ${account}` : ''}.`,
  connected: 'Connected',
  waiting: 'Waiting…',
  logIn: 'Log in'
}
