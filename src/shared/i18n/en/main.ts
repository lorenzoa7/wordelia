// Texts of one part of the app. See src/shared/i18n/README.md.
// The main process: native menus, dialogs and the status and error texts of the AI providers.

export const main = {
  /** Right-click menu */
  contextMenu: {
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    noSuggestions: 'No suggestions',
    addToDictionary: (word: string): string => `Add “${word}” to the dictionary`
  },
  /** The dialog when the window closes and some text is not on disk */
  closeDialog: {
    message: 'Some changes could not be saved.',
    fileNotWritten: 'A file could not be written.',
    syncAppHint: 'If a sync app (OneDrive, Google Drive, Dropbox) holds the file, wait a moment and try again.',
    keepOpen: 'Keep the window open',
    closeAnyway: 'Close anyway'
  },
  /** Open dialogs and the errors of the book channels */
  dialogs: {
    chooseFolderFirst: 'Choose the folder for the book first.',
    useOpenFolder: 'Open the folder with the Open folder button.',
    chooseImage: 'Choose an image',
    images: 'Images',
    importBook: 'Import a book',
    documents: 'Documents',
    importNotes: 'Import notes into the planning',
    markdownNotes: 'Markdown notes',
    notABook: 'This folder is not a Wordelia book. Open it with the Open folder button.'
  },
  /** Save dialogs of the export: the title and the file type name */
  export: {
    pdf: { title: 'Export PDF', filter: 'PDF' },
    docx: { title: 'Export Word document', filter: 'Word document' },
    markdown: { title: 'Export Markdown', filter: 'Markdown' },
    text: { title: 'Export Text', filter: 'Text' }
  },
  /** Titles of the terminal windows for a CLI login or update */
  terminal: {
    login: 'Wordelia login',
    update: 'Wordelia update'
  },
  /** Status and error texts of the AI providers (ProviderStatus.detail, CompletionResult.error) */
  ai: {
    retrying: 'Retrying…',
    cancelled: 'Cancelled.',
    claudeNotFound: 'The claude CLI was not found.',
    claudeLogin: 'Run "claude auth login" in a terminal to log in.',
    claudeNotInstalled: 'Claude Code is not installed.',
    claudeBadArgs: 'The claude CLI rejected its arguments.',
    claudeExited: (code: number | null): string => `claude exited with code ${code}`,
    codexNotFound: 'The codex CLI was not found.',
    codexLogin: 'Run "codex login" in a terminal to log in.',
    codexExpired: 'The Codex login has expired. Run "codex logout", then "codex login", in a terminal.',
    codexNotInstalled: 'Codex is not installed.',
    codexError: 'Codex error',
    codexTurn: (status: string): string => `Turn ${status}`,
    codexStopped: 'codex app-server stopped',
    codexExited: (code: number | null): string => `codex exited with code ${code}`,
    addApiKey: 'Add an API key.',
    apiKeyWorks: 'API key works.',
    anthropicAddKey: 'Add an Anthropic API key in Settings.',
    anthropicKeyRejected: 'The Anthropic API key was rejected.',
    anthropicUnreachable: 'Could not reach the Anthropic API.',
    refusal: 'The model declined this request.',
    rateLimit: 'Rate limit reached. Try again soon.',
    openaiAddKey: 'Add an OpenAI API key in Settings.',
    requestFailed: 'The request failed.'
  }
}
