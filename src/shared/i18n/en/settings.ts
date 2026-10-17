// Texts of one part of the app. See src/shared/i18n/README.md.

export const settings = {
  /** The dialog and its tabs */
  dialog: {
    sections: 'Settings sections',
    general: 'General',
    ai: 'AI',
    actions: 'Actions',
    /** The group of tabs for the open book. The title of the book shows above them. */
    bookGroup: (title: string): string => `Settings of the book “${title}”`,
    book: 'This book',
    rules: 'Writing rules'
  },
  /** The General tab */
  general: {
    updates: 'Updates',
    version: (v: string): string => `Version ${v}`,
    autoUpdate: 'Download updates automatically',
    autoUpdateHint: 'Wordelia downloads new versions from GitHub in the background. They install when you restart.',
    checkNow: 'Check for updates',
    restartToUpdate: 'Restart and update',
    updateStates: {
      idle: '',
      off: 'Updates work only in the installed app.',
      checking: 'Looking for a new version…',
      none: 'You have the newest version.',
      downloading: (v: string, p: number): string => `Downloading version ${v}… ${p}%`,
      ready: (v: string): string => `Version ${v} is ready. Restart to install it.`,
      error: (m: string): string => `Could not check for updates: ${m}`
    },
    language: 'Language',
    interfaceLanguage: 'Interface language',
    languageHint: 'This is the language of the app. Set the language of each book in “This book”.',
    theme: 'Theme',
    themes: { light: 'Paper', dark: 'Lamplight', system: 'System' },
    writing: 'Writing',
    pageZoom: 'Page zoom',
    dailyGoal: 'Daily goal',
    dailyGoalAria: 'Daily goal',
    /** The unit after the number of the daily goal */
    goalUnit: 'words a day',
    goalHint: '0 turns the goal off.',
    spellcheck: 'Spell check',
    focusMode: 'Focus mode (dim other paragraphs)',
    typewriterSounds: 'Typewriter sounds',
    typewriterScrolling: 'Keep the typing line in the middle',
    keyboard: 'Keyboard',
    /** Shown under the list of shortcuts */
    actionKeysHint: 'Change the shortcuts of the actions in “Actions”.',
    /** Names of the keyboard shortcuts */
    shortcuts: {
      acceptReject: 'Accept or reject an AI change',
      dialogueDash: 'Dialogue dash',
      sceneBreak: 'Scene break',
      findReplace: 'Find and replace',
      toggleChat: 'Show or hide the chat',
      toggleSidebar: 'Show or hide the sidebar',
      writePlan: 'Write / Plan',
      zoomInOut: 'Zoom in / out',
      zoomReset: 'Reset the zoom'
    }
  },
  /** The This book tab */
  book: {
    book: 'Book',
    title: 'Title',
    author: 'Author',
    subtitle: 'Subtitle',
    genre: 'Genre',
    genrePlaceholder: 'Dark fantasy, mystery…',
    language: 'Language',
    languageHint: 'The AI writes book text in this language.',
    /** Names of the book languages, by language code */
    languages: {
      'pt-BR': 'Português (Brasil)',
      'pt-PT': 'Português (Portugal)',
      'en-US': 'English (US)',
      'en-GB': 'English (UK)',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
      it: 'Italiano'
    } as Record<string, string>,
    textOnPage: 'Text on the page',
    pageSize: 'Page size',
    pageSizeHint: 'The pages on screen and the exported book use this size.',
    margins: 'Margins (centimeters)',
    marginsHint: 'In the PDF of a book, the left margin is on the spine side of each page.',
    marginTop: 'Top',
    marginBottom: 'Bottom',
    marginLeft: 'Left',
    marginRight: 'Right',
    /** aria-label of a margin box. `side` is Top, Bottom, Left or Right. */
    marginAria: (side: string): string => `${side} margin, in centimeters`,
    /** Sample text in the typography preview */
    previewDialogue: (dash: string): string => `${dash} Did you feel that? ${dash} asked the old man, and the candles bent toward the door.`,
    previewQuoted: '“Did you feel that?” asked the old man, and the candles bent toward the door.',
    previewNarration: 'Elias did not answer. Outside, the wind kept its own counsel.',
    font: 'Font',
    size: 'Size (pt)',
    sizeAria: 'Size',
    lineSpacing: 'Line spacing',
    indent: 'First-line indent (em)',
    indentAria: 'Indent',
    alignment: 'Alignment',
    justified: 'Justified',
    left: 'Left',
    paragraphSpace: 'Space between paragraphs',
    paragraphSpaceAria: 'Paragraph spacing',
    noSpace: 'None (book style)',
    indentFirst: 'Indent the first paragraph of a chapter or scene',
    typing: 'Typing',
    typingNote: 'Wordelia changes these as you type. The AI follows the same style.',
    dialogueStyle: 'Dialogue',
    dialogueStyleDash: 'Dash',
    dialogueStyleQuotes: 'Quotation marks',
    /** Examples of the two dialogue styles, with the dash and the quotes of the book */
    dashExample: (dash: string): string => `${dash} Hello, he said.`,
    quotesExample: (open: string, close: string): string => `${open}Hello,${close} he said.`,
    dialogueDash: 'Dialogue dash',
    emDash: 'Em dash',
    horizontalBar: 'Horizontal bar',
    smartQuotes: 'Curly quotes',
    /** The word inside the quotes of the example: "word" → “word” */
    quotesWord: 'text',
    smartEllipsis: 'Ellipsis',
    sceneBreak: 'Scene break in exports',
    blankLine: 'Blank line'
  },
  /** The Writing rules tab */
  rules: {
    intro: 'Your rules for the AI in this book: voice, point of view, tense, dialogue, words to avoid. Every action and the chat follow them.',
    placeholder: 'Write your rules…'
  },
  /** The AI tab */
  ai: {
    connections: 'Connections',
    free: 'Wordelia is free. Connect the AI you already pay for.',
    /** How to connect each provider. Text in `backticks` shows as code. */
    help: {
      'claude-code':
        'Uses your Claude Pro or Max plan. Install Claude Code, then run `claude auth login` in a terminal. Wordelia runs your own `claude` program; it never sees your password or tokens.',
      codex: 'Uses your ChatGPT plan. Install the Codex CLI, then run `codex login` in a terminal. Wordelia runs your own `codex` program.',
      anthropic: 'Pay per use with an API key from console.anthropic.com. The key is encrypted on this computer.',
      openai: 'Pay per use with an API key from platform.openai.com. The key is encrypted on this computer.'
    },
    /** The status line of a provider */
    connected: 'Connected',
    notInstalled: 'Not installed',
    notConnected: 'Not connected',
    expired: 'Login expired',
    off: 'Off',
    checking: 'Checking…',
    updateAvailable: (version: string): string => `version ${version} is out`,
    /** The one button of a provider */
    logIn: 'Log in…',
    update: 'Update…',
    install: 'Install…',
    addKey: 'Add key',
    turnOn: 'Turn on',
    details: 'Details',
    checkAgain: 'Check again',
    use: (provider: string): string => `Use ${provider}`,
    providerConnected: (provider: string): string => `${provider} connected.`,
    keyFailed: (detail: string): string => `The key did not work: ${detail}`,
    allTasksUse: (provider: string): string => `All tasks now use ${provider}.`,
    version: (version: string): string => `Version ${version}.`,
    newVersion: (version: string): string => `Version ${version} is out. New models often need the newest version.`,
    updateCodex: 'Update Codex with the tool that installed it.',
    apiKey: 'API key',
    keyPlaceholderSaved: 'A key is saved. Paste a new one to replace it.',
    keyPlaceholder: 'Paste your API key',
    saveKey: 'Save key',
    programPath: 'Program path',
    programPathPlaceholder: (program: string): string => `Empty: find ${program} automatically`,
    useForAll: 'Use for all tasks',
    modelsForTasks: 'Models for each task',
    routesNote: 'Fast models suit actions. Strong models suit the chat and planning.',
    task: 'Task',
    provider: 'Provider',
    model: 'Model',
    effort: 'Effort',
    effortHelp: 'How long the model thinks. More effort gives better answers, but they are slower and use more of your plan.',
    connectFirst: 'Connect a provider above to choose models.',
    cliDefault: 'CLI default',
    providerAria: (task: string): string => `${task} provider`,
    modelAria: (task: string): string => `${task} model`,
    effortAria: (task: string): string => `${task} effort`,
    /** The "Default" effort choice: what happens when Wordelia sends no effort. `effort` is the name of the default level, if known. */
    defaultEffort: (effort: string | undefined, cli: boolean): string =>
      effort ? `Default (${effort})` : cli ? 'Default (the CLI decides)' : 'Default (the model decides)',
    noEffort: 'No effort setting'
  },
  /** The Actions tab */
  actions: {
    /** Name of an action that the user just added */
    newAction: 'New action',
    deleteTitle: (name: string): string => `Delete “${name}”?`,
    deleteMessage: 'This action will be removed.',
    resetTitle: 'Restore the default actions?',
    resetMessage: 'Your changes to the built-in actions will be lost. Your own actions stay.',
    restore: 'Restore',
    new: 'New',
    restoreDefaults: 'Restore the built-in actions',
    name: 'Name',
    nameAria: 'Action name',
    changeIcon: 'Change the icon',
    instructions: 'Instructions',
    /** "The AI also follows the <writing rules>." The middle part is a link when a book is open. */
    rulesNotePrefix: 'The AI also follows the',
    rulesNoteLink: 'writing rules',
    rulesNoteSuffix: 'of the book.',
    model: 'Model',
    modelAria: 'Model and effort',
    sameAsActions: 'Same as Actions',
    effort: 'Effort',
    noModelYet: 'No model yet',
    defaultModel: 'Default model',
    shortcut: 'Shortcut',
    noShortcut: 'None',
    recordShortcut: 'Change the shortcut',
    pressKeys: 'Press the keys…',
    escCancels: 'Esc cancels',
    clearShortcut: 'Remove the shortcut',
    /** `what` is the name of an action in quotes, or a name from reservedKeys */
    shortcutTaken: (keys: string, what: string): string => `${keys} is already the shortcut for ${what}.`,
    shortcutNeedsModifier: 'Use Ctrl or Alt with a letter or a number.',
    /** What the app and the editor do with the shortcuts that actions cannot use */
    reservedKeys: {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      strike: 'Strikethrough',
      code: 'Code',
      undo: 'Undo',
      redo: 'Redo',
      selectAll: 'Select all',
      copy: 'Copy',
      cut: 'Cut',
      paste: 'Paste',
      pastePlain: 'Paste as plain text',
      save: 'Save',
      find: 'Find',
      replace: 'Find and replace',
      chat: 'Show or hide the chat',
      write: 'Write',
      plan: 'Plan',
      export: 'Export',
      align: 'Alignment',
      quote: 'Quote',
      list: 'Lists',
      heading: 'Headings',
      rename: 'Rename a chapter',
      closeWindow: 'Close the window',
      zoom: 'Page zoom'
    },
    isMain: 'Main action',
    makeMain: 'Make it the main action',
    mainHint: 'The main action is the first button above the selected text.'
  }
}
