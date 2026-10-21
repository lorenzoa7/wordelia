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
      /** The text of the updater shows only in the tooltip of the line */
      error: 'Could not check for updates. Try again later.',
      offline: 'Could not check for updates: no internet connection.'
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
    typewriterScrolling: 'Typewriter mode',
    typewriterHint: 'While you type, the line stays at the same height on the screen and the page moves up, as in a typewriter. Without it, the cursor goes down the screen until the page scrolls.',
    diffView: 'AI changes in the text',
    diffViewHint: 'How a change of the AI shows before you accept it. The bar of the change can switch it at any time.',
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
        'Uses your Claude Pro or Max plan. Install Claude Code, then click “Log in…”. Wordelia runs your own `claude` program; it never sees your password.',
      codex: 'Uses your ChatGPT plan. Install Codex, then click “Log in…”. Wordelia runs your own `codex` program.',
      anthropic:
        'Pay per use: Anthropic bills each request to your API account. A Claude Pro or Max plan does not pay for the API; to use your plan, use Claude Code. The key is encrypted on this computer.',
      openai:
        'Pay per use: OpenAI bills each request to your API account. A ChatGPT plan does not pay for the API; to use your plan, use Codex. The key is encrypted on this computer.'
    },
    /** The status line of a provider */
    connected: 'Connected',
    notInstalled: 'Not installed',
    notConnected: 'Not connected',
    expired: 'Login expired',
    off: 'Off',
    checking: 'Checking…',
    /** The one button of a provider */
    logIn: 'Log in…',
    update: 'Update…',
    /** Opens the official install page of the program */
    install: 'How to install',
    addKey: 'Add key',
    turnOn: 'Turn on',
    details: 'Details',
    checkAgain: 'Check again',
    use: (provider: string): string => `Use ${provider}`,
    providerConnected: (provider: string): string => `${provider} connected.`,
    allTasksUse: (provider: string): string => `All tasks now use ${provider}.`,
    version: (version: string): string => `Version ${version}.`,
    newVersion: (version: string): string => `Version ${version} is out. New models often need the newest version.`,
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
    /** The model choice of Codex that lets Codex choose */
    cliDefault: 'Default model',
    providerAria: (task: string): string => `${task} provider`,
    modelAria: (task: string): string => `${task} model`,
    effortAria: (task: string): string => `${task} effort`,
    /** The "Default" effort choice: what happens when Wordelia sends no effort. `effort` is the name of the default level, if known. */
    defaultEffort: (effort: string | undefined, cli: boolean): string =>
      effort ? `Default (${effort})` : cli ? 'Default (automatic)' : 'Default (the model decides)',
    noEffort: 'No effort setting',
    /** More status lines of a provider */
    optional: 'Not installed (optional)',
    notLoggedIn: 'Not logged in',
    noKey: 'No key',
    badKey: 'The key did not work',
    noCredit: 'No credit left',
    offline: 'Could not check now',
    waitingLogin: 'Waiting for the login…',
    waitingInstall: 'Waiting for the installation…',
    waitingUpdate: 'Waiting for the update…',
    /** Under the status line, when a newer version of the program is out */
    newVersionShort: (version: string): string => `Version ${version} is out.`,
    /** More buttons of a provider */
    howToUpdate: 'How to update',
    addCredit: 'Add credit',
    getKey: 'Get a key',
    removeKey: 'Remove key',
    /** The accessible names of the buttons of a provider, for screen readers */
    detailsAria: (provider: string): string => `${provider} details`,
    actionAria: (action: string, provider: string): string => `${action}: ${provider}`,
    /** The details of a program */
    program: (path: string): string => `Program: ${path}`,
    pathIgnored: 'Wordelia cannot use this path. Type the full path to the program file. Until then, Wordelia uses the program that it finds.',
    /** Toasts */
    connectedAll: (provider: string): string => `${provider} connected. All tasks use it now.`,
    connectedSome: (provider: string, tasks: string): string => `${provider} connected. It now does: ${tasks}.`,
    movedTo: (off: string, to: string): string => `${off} is off. The tasks use ${to} now.`,
    noAiLeft: (off: string): string => `${off} is off. Connect an AI to use the chat and the actions.`,
    keyRejected: (provider: string): string => `${provider} did not accept this key. Check that you copied all of it.`,
    keyUnchecked: (provider: string): string => `Key saved. Wordelia could not reach ${provider} to check it.`,
    keyRemoved: 'Key removed.',
    keyNotSaved: (reason: string): string => `The key was not saved. ${reason}`,
    nowOff: (provider: string): string => `${provider} is off.`
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
    mainHint: 'The main action is the first button above the selected text.',
    /** The two groups of actions: in the app settings, and in the folder of the open book */
    allBooks: 'All books',
    thisBook: 'This book',
    newForAll: 'New action for all books',
    newForBook: 'New action for this book',
    bookEmpty: 'No actions yet. The actions here work only in this book.',
    /** The field that moves an action to the other group */
    useIn: 'Use in',
    globalHint: 'Every book has this action.',
    bookHint: 'Only this book has this action. The book folder keeps it.',
    mainForAll: 'The main action is for all books.',
    toBookTitle: (name: string): string => `Use “${name}” only in this book?`,
    toBookMessage: 'The other books will not have this action. To give it back to them, open this book and choose “All books”.',
    toBookConfirm: 'Use only in this book',
    movedWithoutShortcut: (name: string, keys: string, other: string): string => `“${name}” has no shortcut now: ${keys} is the shortcut for “${other}”.`,
    /** Under the shortcut of a global action when an action of the open book has the same shortcut */
    shortcutInBook: (keys: string, other: string): string => `In this book, ${keys} runs “${other}”.`
  }
}
