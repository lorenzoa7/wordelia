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
  /** Errors of an AI call, in words for the user. `p` is the name of the provider, for example "Claude Code". */
  aiErrors: {
    notInstalled: (p: string): string => `${p} is not installed on this computer. Open Settings → AI to install it.`,
    notLoggedIn: (p: string): string => `You are not logged in to ${p}. Open Settings → AI to log in.`,
    /** An API without a key */
    noKey: (p: string): string => `Add an API key for ${p} in Settings → AI.`,
    loginExpired: (p: string): string => `Your ${p} login has expired. Open Settings → AI to log in again.`,
    badKey: (p: string): string => `${p} did not accept your API key. Check the key in Settings → AI.`,
    noCredit: (p: string): string => `Your ${p} account has no credit left. Add credit on the ${p} website, then try again.`,
    usageLimit: 'You reached the usage limit of your plan. Try again later.',
    /** `time`: when the limit ends, for example "15:05" or "Fri 09:00" */
    usageLimitUntil: (time: string): string => `You reached the usage limit of your plan. It resets at ${time}.`,
    overloaded: (p: string): string => `${p} is busy right now. Try again in a moment.`,
    network: (p: string): string => `No connection to ${p}. Check the internet connection, then try again.`,
    refused: 'The model declined this request.',
    off: (p: string): string => `${p} is off. Turn it on in Settings → AI.`,
    cancelled: 'Stopped.',
    other: (p: string): string => `${p} could not answer. Try again.`,
    /** The name in the messages when the provider is not known */
    theAi: 'the AI',
    /** The button that opens the row of the provider in Settings → AI */
    openSettings: 'Open settings'
  }
}
