// Texts of one part of the app. See src/shared/i18n/README.md.

export const app = {
  update: {
    ready: (v: string): string => `Wordelia ${v} is ready. Restart to use it.`,
    restartNow: 'Restart now',
    badge: 'Update ready',
    badgeHint: (v: string): string => `Restart and install Wordelia ${v}. Your work is saved first.`
  },
  showSidebar: 'Show sidebar',
  hideSidebar: 'Hide sidebar',
  library: 'Library',
  backToLibrary: 'Back to the library',
  bookSettings: 'Book settings',
  exportBook: 'Export…',
  showFolder: 'Show folder',
  closeBook: 'Close book',
  /** aria-label of the Write / Plan switch */
  viewNav: 'View',
  views: { write: 'Write', plan: 'Plan' },
  showChat: 'Show chat',
  hideChat: 'Hide chat',
  chatWidth: 'Chat width. Use the arrow keys to change it.',
  /** The AI badge in the title bar */
  provider: {
    connect: 'Connect an AI',
    checking: 'Checking…',
    notConnected: (name: string): string => `${name}: not connected`,
    ready: (name: string): string => `AI ready: ${name}`,
    openSettings: 'Open AI settings'
  },
  /** Errors of an AI call, in words for the user */
  aiErrors: {
    notInstalled: 'The AI provider is not installed.',
    notLoggedIn: 'Not logged in.',
    connectHint: (detail: string): string => `${detail} Open Settings → AI to connect.`,
    rateLimit: 'The AI provider says the usage limit is reached. Try again later.',
    network: 'No connection to the AI provider.',
    cancelled: 'Stopped.',
    unknown: 'Something went wrong.'
  }
}
