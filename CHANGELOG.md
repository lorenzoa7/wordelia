# Changelog

Each version has its Windows installer in GitHub Releases. The release workflow copies the section of the version from this file to the release notes.

## 0.4.0 (2026-10-17)

### New
- Pages, like a word processor. The text is cut into pages of the book's page size (Settings → This book → Page size). The page has a fixed width; a narrow window scrolls sideways.
- The book is one long scroll. Every chapter starts on a new page, and scrolling down goes on into the next chapter. The arrow keys also go on into the next or the previous chapter.
- "Show in text" on a chat proposal: the chapter opens, the passage scrolls into view, and the change shows in the text with Accept and Reject.
- Chat: edit a message, rewind to a message, retry a reply, copy. A rewind can also undo the book changes of the removed replies.
- Chat: a thinking line shows what the AI does now. "Thought process" opens its full thinking.
- Chat: the thread list shows states. A red dot: proposals wait for you. A green dot: a new reply that you did not see. The chat button gets a dot when the chat is closed.
- A shortcut for each action. Settings → Actions has a key recorder. Ctrl+J stays on the main action.
- Drag the edge of the sidebar or the chat to change its width. Drag it to the window edge to close it, and drag it out again to open it.
- Plan pages have a back link ("← Overview", "← Characters"). Alt+← also goes back.

### Changed
- The model menu looks like the Claude app: model names with versions ("Opus 5.5"), a check on the current model, keys 1–9 and an Effort submenu.
- Settings open on General. The tabs of the open book ("This book" and "Writing rules") are under a line, below the other tabs.
- The writing rules moved from the Plan view to Settings → Writing rules.
- The AI connections are simpler: one row for each provider, with one status and one button. The rest is under "Details".
- The Actions tab is simpler. The built-in instructions show in the language of the interface until you change them.
- The typing options have examples (for example, "texto" → “texto” for smart quotes).
- Effort names (Low, Medium, High…) stay in English in all languages.
- The proposal buttons are larger. "Apply all" is a bar for all the proposals of a reply.
- "Insert into chapter" is now "Insert at cursor".
- A design review of all screens: aligned icons in the title bar, hover and focus states on all controls, better contrast in the dark theme.

### Fixed
- Find (Ctrl+F) scrolls to each match, also in other chapters. The case and whole-word buttons have hover states and aligned icons.
- "Ask the chat about this entry" has a chat icon, not a return arrow.

## 0.3.1 (2026-10-17)

### Changed
- The writing rules are easier to find: the book menu (the book title at the top) and Settings → This book now open them.

### Fixed
- Markdown that you paste into the writing rules or a planning note (for example "## Rules" or "- item") becomes headings and lists. Before, the signs stayed as text, and the AI got them escaped.

## 0.3.0 (2026-10-16)

### New
- Wordelia updates itself. It downloads new versions from GitHub in the background. When a version is ready, the title bar shows "Update ready". Select it to save, restart and install. Settings → General → Updates has the switch and a "Check for updates" button.
- Install 0.3.0 by hand one time. The versions after it come by themselves.

### Changed
- The source code is public on GitHub.

## 0.2.0 (2026-10-15)

### New
- The app is in English, Portuguese (Brazil) and Spanish. Select the language in Settings → General or on the welcome screen. English is the default.
- Dialogue style for each book: a dash at the start of the line, or quotation marks. New books get the style of their language. The AI follows it.

### Changed
- The suggested chat effort is now Medium. Opus at Medium gives very good answers and is faster. Old Claude Code chat settings move from High to Medium.
- More space between the logo and its caret.
- The README has a simpler summary, English screenshots and a logo that you can see on dark pages.

## 0.1.0 (2026-10-15)

The first version.

### Write
- A page with book typography: first-line indents, justified text, scene breaks. Type `--` to get the dialogue dash.
- Chapters in a sidebar. Find and replace, word counts, a daily word goal, focus mode, typewriter scrolling and optional typewriter sounds.
- Version history of each chapter, with compare and restore.

### AI
- Actions on selected text (Polish, Tighten, Fix grammar only, Show don't tell, Expand, or your own). The change shows on the page as a diff. Press `Enter` to accept or `Esc` to reject.
- A chat that reads the book and the planning, and proposes changes as diff cards. "Accept all" applies all the proposals of a reply.
- Connected threads: each thread keeps a digest, and all threads read the digests of the others.
- A model and an effort for each task and each action.
- Providers: Claude Code and Codex (with your own subscription), the Anthropic API and the OpenAI API (with your own key). Model lists come from the providers. Settings show when a newer Claude Code or Codex is out.

### Plan
- Characters, places, world and plot as notes with images and aliases.
- "Sync with manuscript": the AI reads the chapters that changed and proposes new notes and new facts.
- Import Markdown notes, for example from Obsidian.

### Files
- A book is a folder of Markdown files. Import DOCX, Markdown or text. Export a print-ready PDF, a DOCX with real Word styles, Markdown or text.

### Known limits
- The installer has no code signature. Windows SmartScreen shows a warning: select "More info", then "Run anyway".
- Live tests used Claude Code. Codex and the two APIs have tests with a scripted AI only.
