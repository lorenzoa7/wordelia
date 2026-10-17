# Wordelia — Roadmap and status

This file is the source of truth for progress. Update it after each task. Mark a task `[x]` only after you verify it (tests pass, or you saw it work in the app). `[~]` means built but not yet verified.

## Current focus

> **Milestone:** Version 0.4 — the feedback of the author (22 items) is done
> **Next task:** Collect feedback on 0.4.0: the pages, the chat rewind and the new settings. Then fix what the author finds.
> **Not verified:** Codex and the two API transports. The user has no Codex account, and no API keys are set. The scripted provider (`WORDELIA_MOCK_AI=1`) covers their UI flows.

## M0 — Foundation

- [x] Product spec (`docs/SPEC.md`), architecture (`docs/ARCHITECTURE.md`), glossary
- [x] Scaffold: electron-vite, React, TypeScript, Vitest
- [x] GitHub private repository, first push
- [x] Design tokens, fonts, base CSS, light and dark themes
- [x] Logo (wordmark SVG) and app icon
- [x] App shell: custom title bar, view switch, collapsible sidebars
- [x] Screenshot script (Playwright for Electron) for visual checks

## M1 — Books on disk

- [x] Shared domain types and IPC contract
- [x] Wordelia Markdown parser and serializer, with round-trip tests
- [x] Book folder: create, open, read, write (atomic), manifest
- [x] Library screen: recent books, new book, open folder
- [x] Chapters: add, rename, reorder, delete
- [x] Autosave with debounce, save state in the status bar
- [x] File watcher: reload external changes

## M2 — Editor

- [x] TipTap editor with the book typography on a page
- [x] Toolbar: undo, redo, font, size, bold, italic, underline, align, scene break
- [x] Smart typing: `--` to dialogue dash, smart quotes, ellipsis (settings)
- [x] Find and replace
- [x] Word counts (chapter, book)
- [x] Spell check with the book language
- [x] Focus mode, typewriter scrolling

## M3 — AI providers

- [x] Transport interface and stream events
- [x] Claude Code transport (CLI) — live test on 2026-10-15 with the real book (19.4k words). Opus 4.8 (CLI 2.1.198): first planning sync 195 s, Polish 7–16 s, chat 12–22 s. Opus 5.5 (CLI 2.1.295): Polish 4–7 s, chat 10–32 s, incremental sync 30 s
- [~] Codex transport (CLI) — app-server path verified up to the server reply (the account token had expired)
- [~] Anthropic API and OpenAI API transports — built; live test pending
- [x] Provider status detection and model lists
- [x] Settings UI: providers, model routes, suggested routes

## M4 — Actions (Format with AI)

- [x] Selection menu: Reply, Polish, more actions
- [x] Action prompt builder with context before and after
- [x] Inline word diff on the page, with Accept, Reject, Retry
- [x] Action editor in settings, default actions, writing rules

## M5 — Chat and threads

- [x] Chat panel, thread list, streaming messages
- [x] Context builder (planning, manuscript budget, other threads)
- [x] Proposal protocol parser (streaming) and diff cards
- [x] Apply hunks to the live editor or to files
- [x] Reply quotes and `@` mentions
- [x] Thread brief and digest (background job)

## M6 — Planning

- [x] Plan view: categories, entries, entry editor, cards
- [x] Entry images and aliases
- [x] Wiki links `[[...]]`
- [x] Planning in the AI context
- [x] Sync with manuscript (proposals review)
- [x] Import: DOCX, Markdown, TXT; build planning from manuscript

## M7 — Export

- [x] PDF: book and manuscript presets
- [x] DOCX with named styles
- [x] Markdown and plain text
- [x] Export dialog with preview

## M8 — Polish and release

- [x] Animations and micro-interactions review (UI audit, reduced motion)
- [x] Onboarding (first run) and empty states
- [x] Keyboard shortcuts sheet
- [x] Accessibility review (focus rings, contrast, labels) — UI audit, about 40 fixes
- [x] Windows installer (electron-builder), app icon
- [x] README with screenshots

## Done beyond the plan

- [x] Version history: automatic chapter snapshots, before AI changes, diff and restore
- [x] Undo toast for accepted chat proposals (refuses when the text changed after)
- [x] Save on close: the window waits for the editors and the file queue
- [x] Login launcher for Claude Code and Codex, first-run welcome
- [x] Optional typewriter sounds
- [x] E2E scenario suite (`npm run e2e`): library, editor, AI review, chat proposals, planning, export, save on close, history, settings, dark theme, new book typing, chat resize, daily goal, keyboard, paste, reorder, outside file changes
- [x] Independent code review: 17 findings fixed (data safety, Markdown, security, cancellation)
- [x] Live test scripts with a real AI: `live-import`, `live-polish`, `live-chat`, `live-sync`, `live-settings` (see `docs/ARCHITECTURE.md` §10)
- [x] Fixes from the live tests: "Accept all" for replies with many proposals; book quotes and ellipsis on AI text; planning file names keep accents; planning headings in the book language; tolerant frontmatter for AI notes; safe file names; more careful "Fix grammar only"; book title in thread digests
- [x] CLI update check: Settings → AI shows when a newer Claude Code or Codex is out, and runs `claude update`. Old CLIs cannot use the newest models (Claude Code 2.1.198 maps "opus" to Opus 4.8; Opus 5.5 needs 2.1.280 or later)
- [x] A provider shows "Not connected" after a real call fails on login, also when its CLI says that it is logged in
- [x] Effort for each task and each action, with the levels that each model supports (Claude Code: low to max; Codex: from its model list). The chat model menu also sets the effort
- [x] Claude Code models come from the installed CLI (new aliases such as "fable" appear after `claude update`); the settings show which model answered last
- [x] Codex login check through `account/read`: an expired login shows "Not connected" at start

## Version 0.2

- [x] Interface in English, Portuguese (Brazil) and Spanish: 7 parts translated in parallel, language in Settings → General and on the welcome screen
- [x] Dialogue style for each book (dash or quotation marks), from the book language; the AI prompt follows it
- [x] Chat effort Medium by default; settings version 3 moves Claude Code chat routes from High to Medium
- [x] Selections without spaces at the ends (a rewrite no longer joins two words); CRLF files read as LF
- [x] README in simple English with English screenshots (sample book `e2e/fixtures/sample-book-en`, `--en` flag of `scripts/shot.mjs`); logo on a paper card
- [x] Releases from tags: `.github/workflows/release.yml`

## Version 0.3

- [x] App updates from GitHub Releases (electron-updater): background download, "Update ready" in the title bar, restart saves first; Settings → General → Updates
- [x] Public repository; examples use the sample book, not the novel of the author

## Version 0.3.1

- [x] Writing rules in the book menu and in Settings → This book
- [x] Pasted Markdown in notes and writing rules becomes headings and lists

## Version 0.4 — feedback of the author

### Settings

- [x] Settings in a new order: General, AI, Actions; then, under a rule and the book title, the tabs of the open book: "This book" and "Writing rules". The gear and Ctrl+, open General
- [x] Writing rules in Settings, in the note editor of the Plan view; the "writing rules" link in Actions opens them
- [x] Actions tab: the list with shortcuts; for the selected action, the name with one icon button (small icon picker), the instructions, one model-and-effort control, the shortcut. No "context around the selection" control (the data stays)
- [x] A shortcut for each action (`AiAction.shortcut`): recorder, Esc cancels, remove button, conflicts with other actions and with the keys of the app and the editor. Settings version 4 keeps Ctrl+J for the main action and Alt+2, Alt+3… for the others
- [x] Built-in action instructions in the interface language until the user changes them; the AI gets the same text
- [x] AI tab: one row for each provider with one status line and one button (Log in, Update, Install, Add key, Turn on); the rest under "Details". Tidy routes table with column names
- [x] Typing options with live examples (dialogue style cards, `--` → —, "text" → “text”, ... → …, scene break glyphs)
- [x] Effort names in English in all interface languages
- [x] Page size of the book in Settings → This book

### Editor: pages and the book as one scroll

- [x] Pages on screen, like a word processor: the page size and the margins of the book (Settings → This book → Page size). A full page ends, a band of desk shows, and the text goes on to the next page. A break inside a paragraph keeps the line justified (scenario `pages`)
- [x] The book is one scroll: every chapter starts on a new page, and scrolling down goes on into the next chapter. Each chapter has its own editor and undo history; a chapter far from the screen keeps its height but has no editor
- [x] The page has a fixed width. A narrow window scrolls the desk sideways; the toolbar takes two rows
- [x] Ctrl+Home and Ctrl+End go to the start and the end of the chapter. The arrow keys go on into the previous or the next chapter
- [x] Find (Ctrl+F) scrolls to each match and goes on into the other chapters. The case and whole-word buttons have hover states and aligned icons
- [x] A chat proposal shows in the text: its chapter opens, the passage scrolls into view, and the change shows as an inline diff with Accept and Reject (`revealProposal` in `features/editor/registry.ts`, scenario `reveal`)
- [x] The selection menu shows the shortcut of each action

### Design review: layout, title bar, Plan navigation

- [x] Side panels: drag the edge of the sidebar or the chat to change its width. Drag it past the minimum and the panel closes. Drag or click the edge at the window side to open it again. The sidebar width is in `settings.ui.sidebarWidth` (scenario `panels`)
- [x] A narrow window keeps 560 px for the page: the chat gives up width first, then the sidebar (scenario `narrow`)
- [x] Plan pages: "← Overview" on a category page, "← Characters" on an entry page, Alt+← and the mouse back button. A category page has a header with the entry count, Import notes and New entry (scenario `plannav`)
- [x] The writing rules leave the Plan view. The book menu opens Settings → Writing rules
- [x] Title bar: a three-column grid (the tabs stay in the middle, a long title gets shorter), icons and wordmark on the line of the text, tooltips with shortcuts
- [x] Shared controls: focus rings keep the shape of the control; hover, active and open states on all buttons, inputs, selects and switches; toasts with an error icon and a close button; dark text on the dark-theme ribbon color (`--on-ribbon`)
- [x] Chat icon (not the reply arrow) for "Ask the chat about this entry" and "Mention in chat"

### Chat

- [x] Message actions: Edit and Rewind on messages of the user; Copy, Retry and "Insert at cursor" on replies; "Get a reply" under a message without a reply. A rewind can undo the accepted book changes of the removed replies (a version first, only where the AI text is unchanged)
- [x] Thinking line while the AI works: thinking summaries from Claude Code, Codex, the Anthropic API and the OpenAI API (`thinking` stream events), else phase texts ("Reading the chapter and the planning…", "Writing a change to …"). Thinking is never saved or sent to the AI
- [x] Thread list with states: proposals wait (red dot), new reply not seen (green dot, `Thread.readAt`), at work (spinner); a dot on the chat button when the chat is closed
- [x] Model menu like the Claude app: models with versions, a check, number keys 1–9, an Effort submenu, provider labels when several providers are connected
- [x] Model names with versions everywhere ("Opus 5.5"): the app reads the model of each claude alias from the first CLI event, once for each CLI version, with no request to the API
- [x] Proposal cards: wider Accept button, "Show in text" on each change (`revealProposal`), a bar for all the proposals of a reply ("3 proposals in this reply", "Apply all 3")

## Version 0.5 — second feedback of the author

### Editor

- [x] Enter at the end of a page: the new line shows on the next page at once (the page measure runs before the browser paints when the text gets taller or shorter; scenario `pagebreak`)
- [x] The sidebar follows the chapter on screen while scrolling, also when the cursor is in another chapter
- [x] The menu of more actions in the selection bubble opens under its button (scenario `selmenu`)
- [x] Page zoom: Ctrl+=, Ctrl+-, Ctrl+0 and Ctrl+wheel; the chapter heading follows the zoom (scenario `zoom`)
- [x] Pages use the left (inner) and the right (outer) margins of the book
- [x] The scene break in the text is centered again
- [x] "Typewriter scrolling" is now "Keep the typing line in the middle"
- [x] Chat proposals show in the text by themselves, with Accept and Reject; "Show in text" scrolls from where the user is and never decides a proposal (scenario `reveal`)

### Chat

- [x] Thread list as a full view in the chat panel: the ← button left of the thread title opens it (with a dot when another thread needs the user). Search (accents do not matter), pinned threads first, then the most recent; each thread shows its state (red dot, green dot, spinner), its time and one line; "New thread"; an options menu on each row (title and purpose, pin, delete). Up and Down move through the list, Enter opens a thread, Esc goes back. The dropdown is gone; a click on the title opens "Title and purpose". The app still opens on the last thread (scenario `chatview`)
- [x] Proposal card header: the icon, the title (with "…"), the counts and the buttons never overlap. When they do not fit on one line, the buttons go to a second line (checked at 320, 400 and 680 px with a long chapter title)
- [x] The chat goes to the end at once when the user sends a message, so the whole message shows before the reply starts
- [x] Shorter, more direct replies: the chat prompt asks for the answer first, no preamble, no closing offers, lists only for separate points, a few sentences unless the author asks for more. Proposals are not limited (`docs/ARCHITECTURE.md` §5.2, "Reply style")
- [x] Purpose strip: its own tone between the panel and the paper, a target icon, a hairline under it, and a soft shadow when messages scroll under it. A click opens "Title and purpose"
- [x] Inline mentions: the composer is a small TipTap editor. "@" and some letters open the list (chapters, entries, threads); the choice becomes a pill in the text, and the sentence goes on after it. Backspace removes a pill as one unit. Enter sends, Shift+Enter starts a new line, a paste is plain text. The sent message keeps "@Label" in its text and the ids in `mentions`; the message and the edit box show the pills in the text. Messages from before keep their mentions above the text

### Planning

- [x] Planning map: a "Cards | Map" switch on the Plan overview. The map shows all entries as nodes: a color for each category, a size for the number of links. An entry links to another entry when its summary or its notes use the name or an alias of the other entry (whole words; accents count), or `[[Name]]`. Pan, zoom, fit to screen and drag nodes. Hover shows the neighbors and a card. A click opens the entry; its back link goes to the map. Category chips filter the map, the search box shows the matches (Enter opens the best match), and "Chapters" adds the chapters. Entries without links sit on rings around the others. Empty states for a book without entries and for entries without links (`src/shared/planning/graph.ts`, `features/graph/`, scenario `graph`)

## Later (not in version 1)

- Sync to a git remote from the app
- EPUB export
- Typewriter sounds (optional)
- Book-level overrides of actions
