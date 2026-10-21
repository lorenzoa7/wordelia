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
  sidebarWidth: 'Sidebar width. Use the arrow keys to change it.',
  /** Tooltip of the edge between a side panel and the page */
  resizeHint: 'Drag to resize. Drag to the edge to hide.',
  /** Tooltip of the edge when its panel is hidden */
  openHint: 'Drag or click to show',
  /** The warning in the title bar when the chat has no AI. It opens Settings → AI. */
  provider: {
    connect: 'Connect an AI',
    connectHint: 'No AI is connected. Open Settings → AI to connect one.',
    notConnectedShort: 'AI not connected',
    notConnectedHint: (name: string): string => `${name} is not connected. Open Settings → AI to connect it.`,
    expired: 'AI login expired',
    expiredHint: (name: string): string => `The login of ${name} has expired. Open Settings → AI to log in again.`
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
  },
  /** The question when a book closes and some text is not on disk (the other texts are main.closeDialog) */
  keepBookOpen: 'Keep the book open'

}
