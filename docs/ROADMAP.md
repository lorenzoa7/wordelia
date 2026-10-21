# Wordelia — Roadmap and status

This file is the source of truth for progress. Update it after each task. Mark a task `[x]` only after you verify it (tests pass, or you saw it work in the app). `[~]` means built but not yet verified.

## Current focus

> **Milestone:** Version 0.13 — portraits for the AI, proposals in notes
> **Next task:** Collect feedback on 0.13.0. Then fix what the author finds.
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

### Shell and settings

- [x] No "Claude" badge in the title bar. A small warning shows only when the chat has no AI ("Connect an AI", "AI not connected", "AI login expired"); a click opens Settings → AI. The update badge stays
- [x] A dropdown opens only from its own box: `Field` no longer wraps its control in the label, so a click beside a select or a switch does nothing (all settings tabs, the export dialog, the new book and import dialogs)
- [x] Page margins in Settings → This book, next to the page size: Top, Bottom, Left, Right in centimeters (the book keeps millimeters; Left = inner, Right = outer)
- [x] "Sync with manuscript" becomes "Update notes / from the chapters", with a tooltip: the AI reads the changed chapters and proposes changes to the notes; you accept or reject each change; the manuscript does not change. The count badge stays
- [x] The wordmark at the far left of the title bar. The sidebar toggle is in the sidebar header; a hidden sidebar leaves a small button at the top-left corner of the page (Write and Plan views)
- [x] Icons centered on the text: the lift is measured on the screen pixels for each display scale (scenario `icons`, 45 pairs); icons added to the settings tabs, theme cards, actions list, carets and links
- [x] The daily goal is a number box with "words a day" (0 turns it off, saved on Enter or blur)
- [x] The page zoom select has the steps of the zoom keys; the keyboard list shows the zoom keys

## Version 0.6 — third feedback of the author

### Editor

- [x] A new page grows in, and the desk glides down with the cursor
- [x] Ctrl+Enter makes a page break, like a word processor (`<!-- page break -->`, also in PDF and DOCX); every page keeps the same height; line breaks count as lines (scenario `ctrlenter`)
- [x] A break inside a paragraph can no longer keep itself in a wrong place (the measure hides the gaps); this made the word spaces of a justified line too wide after an accepted change
- [x] Zoom: a zoom menu in the toolbar; the page gaps follow the zoom in the same frame; the view stays on the same text, also in a long book (scenario `zoom`)
- [x] Typewriter mode works (it never followed the cursor while the author typed); it lives in Settings → General with an explanation (scenario `typewriter`)
- [x] Ctrl+Z after an accepted chat change brings the proposal back into the text, also when the focus is in the chat; Ctrl+Y applies it again (scenario `reveal`)
- [x] A new chat proposal scrolls into view by itself (the last one of the reply)
- [x] The sync button says "Sync"; the Plan overview is "The world of the story" (no "story bible")

### Planning map

- [x] No layout shift in the "Cards | Map" switch: its two buttons have the same width, and the cards, the category pages and the map use one column (`--plan-w`) with the same scrollbar gutter. The switch, its buttons and the title keep their place and size on the two pages (the `graph` scenario measures them with the chat open, the chat closed and the sidebar closed; before, the switch moved 9.6 px with the chat open, 76 px with the chat closed and 123 px with the sidebar closed, and the title moved too)
- [x] Nodes with personality: each entry is a paper token with a soft shadow, a ring and the icon of its category in the category color (one SVG sprite, one `<use>` for each node). Near, an inner ring like the rim of a seal. A chapter is a small closed book with a red ribbon and its number. The size still follows the number of links; hover, dim and search states stay. Far out, small tokens show no icon and get more color (level of detail)
- [x] Background with depth: a dot grid that moves and zooms with the map and stays sharp at every zoom (the dots keep their size; the step doubles or halves, and every second dot fades first), a soft light in the middle, darker edges and the paper grain. Light and dark themes
- [x] Faster frames: the labels are in screen units, so no CSS variable changes on each frame, and a frame writes only the attributes that change. With 300 entries: 12 to 16 ms a frame on average, p95 17 to 22 ms (version 0.5: 15 to 21 ms, p95 22 to 28 ms, on the same computer)
- [x] When all labels show, the layout keeps room for them at the zoom of the fit, so they overlap less. Far out, a small map shows only the major labels

### Chat

- [x] "New thread" in the thread list has a soft tone of the panel, not the white of the paper. Its hover is one step darker (light and dark themes)
- [x] A new thread exists only after its first message. "New thread" shows a blank thread that is not in the book and not on disk; the first message saves it with its title, purpose and model. The thread list, another thread and another book remove it. An empty thread never shows in the thread list or in the "@" list. When a book opens, the chat shows the most recent thread with messages, and the app deletes the empty threads that older versions saved (no messages, no purpose, the default title). The scenario `chatview` checks the thread files on disk
- [x] Send goes to the very end of the thread, and the end stays in view when the layout changes after the first frame (a font that loads, a quote, the thinking line) and while the reply streams. A scroll up stops the follow; a scroll back to the end starts it again (`useFollowEnd`, `features/chat/follow.ts`). The scenario `chatview` sends a long message with a quote and two pills and measures scrollTop + clientHeight against scrollHeight in each resize step
- [x] No row of the thread list looks selected: while the list shows, the user is in no thread. The row with the keyboard focus shows a focus ring

## Version 0.7 — fourth feedback of the author

### Editor

- [x] A new page grows in one time; it no longer flickers (the measure restarted its animation)
- [x] Smooth zoom (a short transform) and a zoom slider in the toolbar; a double click goes back to 100 %
- [x] The loading bar of an action stays above the selection; the result bar goes under the paragraph
- [x] The Polish button is a light chip, not red
- [x] Accept and Reject in the text are labeled pills
- [x] Chat proposals for planning notes show in the note as a diff (scenario `notediff`)
- [x] The first Backspace selects a page break and shows its mark; a selected scene break has a ring

### Planning

- [x] The sync runs in the background. "Sync" no longer opens the chat or changes its thread. The button shows a spinner, "Syncing…" and the progress ("Reading 2 chapters…", then "1 change so far…"; "Part 1 of 2" for a long book), with a button that cancels. A cancel keeps the complete changes, and the chapters of the stopped part still wait (scenario `sync`)
- [x] The result shows in the Plan sidebar, under the button: "2 changes proposed to the notes", the names of the notes, Review, Accept all and Reject all (Reject all has Undo). An error shows in the same card, with Try again or Open settings. When the Plan sidebar is not on screen, a toast tells the result, with Review
- [x] Review opens the chat on the "Planning sync" thread, at its proposal cards. The proposals stay in that thread, so the cards, the inline diffs in the notes and Apply all work as before. The author never looks for the thread
- [x] The Sync button is off when no chapter changed since the last sync. Its tooltip says "Up to date". A chapter that the author changes while the sync runs still waits for the next sync
- [x] Category rows in the Plan sidebar: the caret, the icon and the name share one middle (the `icons` scenario measures the caret). A click anywhere on the row shows the category page and its entries; on the page that shows, a click folds or unfolds the entries. The caret only folds and unfolds. Enter is a click, → unfolds, ← folds (scenario `plannav`)
- [x] Map hover with a fade: the pale map and the highlight fade in and out in 180 ms (ease-out; no fade with reduced motion). The pale map is three groups that fade as one, and a focus layer above them draws the node, its neighbors and its edges again. With 300 entries at rest, a hover frame takes 6.8 ms on average, p95 7.5 ms (version 0.6: 27 ms, p95 60 ms, up to 195 ms). So the fade shows, and the old fade of 120 ms did not (scenario `graph`)

### Settings, library, history and the reply bar

- [x] Four built-in actions: Polish (Ctrl+J), Tighten (Alt+2), Fix grammar only (Alt+3) and Show, don't tell (Alt+4). Expand left the defaults: it is the only action that writes new material, and the chat does that better. Settings version 5 removes Expand only when the author did not change it (name, instructions, icon, model, effort, context, shortcut) and it is not the main action; Alt+5 becomes free. A kept Expand and old "Before Expand" versions still show in the interface language (`withoutRetiredActions`, unit tests; the `settings` scenario counts the actions)
- [x] Pages on the library card: "≈ 214 páginas" above the words and the chapters. A pure estimate (`src/shared/export/pages.ts`) follows the page on screen: page size, margins, the font, size and line height of the book typography, the indent, the chapter heading, scene breaks and page breaks; words fill each line with the measured average character width of the font. The main process computes it when a book opens and closes, so a book that is not open has a number too. Within 10% of the pages on screen for real-looking chapters in six layouts, most often exact (unit tests; the `library` scenario compares the card with the Write view: 24 and 25 pages)
- [x] Version history: when a version shows, the compare view glides to its first change (about 400 ms, the `--dur-slow` token; reduced motion jumps). The `history` scenario checks a long chapter with one change at its end
- [x] Settings → Writing rules: long rules no longer touch the bottom edge of the dialog. Each tab keeps 32 px under its content at the end of its scroll (the `settings` scenario measures all tabs, also with 60 rules)
- [x] The bar for all the proposals of a reply fits at every panel width: the title, one line of files (three names with "…", then "+29"; all the names in a tooltip), and the two buttons, which go to their own line when they do not fit and never get cut (the `chatview` scenario: 32 proposals with long names at 320, 360, 400, 520 and 680 px)

## Version 0.8 — fifth feedback of the author

### Editor

- [x] Zoom is a scale of the desk: the pages stay laid out at 100 %, so words and page breaks never move; a smooth, even animation (scenario `zoom`)
- [x] A new page grows in more softly, and typing on it no longer starts its animation again (scenario `newpage`)
- [x] The review bar stays above the passage also when the change is ready
- [x] Three views of an AI change in the review bar (word by word, old over new, new text only); the default in Settings → General (scenario `diffviews`)
- [x] Page numbers in the bottom corner of each page; exact page counts in the chapter list and on the library card (scenario `pagecount`)

### Actions and history

- [x] Actions for one book. Settings → Actions has two groups: "All books" (the app settings) and "This book" (only when a book is open). The book keeps its actions in `ai/actions.json` in its folder, so they go with the book. Each group has "New". "Use in: All books | This book" moves an action to the other group; a move to this book asks first, because the other books lose the action. A built-in action keeps its name and instructions in the interface language when it moves, and it can go back without a change. The main action (Ctrl+J) stays for all books (decision 0004)
- [x] The selection menu, the shortcuts, Retry, the review bar and the keyboard list in Settings → General use the global actions, then the actions of the open book (`mergeActions`, `useAllActions`)
- [x] Shortcuts across the two groups: the settings refuse a shortcut that an action of the other group has. When two actions get one shortcut anyway (a global shortcut set while another book was open, or a book from another computer), the book action wins inside its book. The settings show the shortcut of the global action struck through, with "In this book, Alt+2 runs “Narrator voice”." (unit tests in `scopes.test.ts`; scenario `book-actions`, also in Portuguese)
- [x] Version history: "Close" and "Restore this version" stay still when the author selects another version. Restore stays on while a version loads, and a click waits for the selected version. The compare view keeps the last version until the new text is there (a spinner only after 300 ms), and the line "If you restore this version" keeps its height, so nothing moves. The `history` scenario records the footer in each frame, and each change of its attributes, while it goes through all versions (the old dialog fails it: Restore went off at each version, and the compare view moved 24 px)

### Version 0.8.1: the new page

- [x] A new page opens in one smooth movement: the gap grows from nothing, and the screen scrolls with it on the same path, so the cursor stays still. Before, each key on the new page drew the gap again at its full height: the growth stopped after one key, and the page jumped. The progress is now in the plugin state (scenario `newpage` checks each frame: one word goes to the new page, no step of more than 30 % of the gap, the cursor does not go up)

### Version 0.8.2: page breaks like Google Docs

- [x] Backspace at the start of a new page removes the page break at once (no selection). On an empty page, the empty paragraph goes too, and the cursor goes back to the end of the text of the page before. Delete at the end of the page before does the same
- [x] Ctrl+Enter on an empty page makes one more page; two page breaks in a row are removed
- [x] A new page comes in every time (also a second page break on the same place), and the page before it never changes its size: a veil over the new sheet fades out, and the desk scrolls with it
- [x] A removed page break no longer leaves a page that is too tall: a gap whose place is deleted leaves the list of breaks too
- Scenarios: `ctrlenter` (the author's steps: Ctrl+Enter, Backspace, Ctrl+Enter two times, Backspace two times; pages, cursor and new pages after each step), `newpage` (each frame: the gap keeps its height, the veil only fades, the desk never scrolls back); unit tests for `newPage`

### Version 0.8.3: pages that go

- [x] A page that an edit removes goes back into the desk: its space stays for a moment, a veil comes over its sheet, and then the space closes. The page before it keeps its size (scenario `ctrlenter` counts a departure for each Backspace that removes a page)
- [x] A removed page is seen also when the pages around it look the same (two empty pages): the measure compares the number of pages of the last measure

### Version 0.8.4: pages that go, smoothly

- [x] The space of a page that goes closes during the whole movement, not after the fade: what is under it (the next chapter, "Start the next chapter") moves up at once and softly, with no jump at the end. Before, it waited 270 ms and then moved 736 px in about 220 ms
- [x] Backspace on an empty page no longer scrolls the desk at once: the desk scrolls to the cursor in the same movement as the page that goes
- [x] Scenario `ctrlenter` records what is under the chapter in each frame: it starts to move within 100 ms of the key, and no frame moves it faster than the whole way in 250 ms

### Version 0.8.5: a page that goes, at once

- [x] No movement for a page that goes: it goes at once, like Google Docs. At the end of the book the desk is at its bottom, and while the space closed the browser moved the whole page above down, so the button under the book stood still (measured: 812 px in 630 ms). The page count of the last measure stays (`measured`), so a removed page break never leaves a page that is too tall
- [x] Scenario `ctrlenter`: after Backspace on an empty page, what is under the chapter does not move after the first frame

## Version 0.9 — images in the chat

- [x] The author adds images to a chat message: the image button, a paste (Ctrl+V) or a drop on the composer. Small pictures in the composer, each with a button that takes it out; at most 6 images in a message
- [x] The renderer makes each image small (WebP, 1568 px on the long side) and the book keeps it in `planning/_assets/chat/`. The sent message shows its images; a click opens one at its size
- [x] All four providers get the images (`src/main/ai/images.ts`, unit tests). Claude Code was checked with the real CLI (a red image: "Red"). Codex and the two APIs are not checked with a real account
- [x] The AI can propose an image as the portrait of a note (`<portrait>`), or a new note with a portrait (`image:` in its front matter). The card shows the image with "Use as portrait"; a rewind puts the portrait from before back
- [x] Scenario `chatimage`: button, paste, remove, send, the AI gets the image, the portrait goes to the note and shows in the Plan view, the rewind puts it back
- [x] 0.9.1: a mention shows the icon of its category, as on the map (`categoryIcons.ts`)

## Version 0.10 — story line

- [x] The story line: a planning entry with `type: story-line` whose body holds lanes, moments and events (`src/shared/storyline.ts`, 17 unit tests)
- [x] The Line view in Plan: lanes in rows, moments in columns, meetings over their lanes, mentions with the icons of their categories, written and planned cards, "you are here", drag a card to another cell, "Edit as text"
- [x] Build from a planning note, a text or the chapters, through the chat (a `<create>` proposal)
- [x] The chat reads the story line and the moment of the open chapter, and changes it with proposals; the sync links events to chapters
- [x] A card of the open chapter in the Write view; chapter renames update the links; the map leaves the story line out
- [x] Scenario `storyline`: build, view, a move through the chat, a drag, a rename, the Write card, the map

## Version 0.11 — story line board

- [x] A new model: cards with a place by chapter and by time (`src/shared/storyline.ts`, 33 unit tests): parse, write, views, "you are here", changes, diff
- [x] The Line view: two views with a switch, the written chapters always there, planned chapters, moments, the trays; no page scroll; cards of one size with "…"; mentions as underlined names
- [x] Editing like a board: "+" for cards and columns, drag cards and columns (dnd-kit, also with the keyboard), rename, delete with Undo, the card dialog with "@" suggestions
- [x] The empty line: a banner that opens a new chat thread with a draft; the build dialog is gone
- [x] AI proposals on the board: new, deleted, moved and changed cards and columns, Accept and Reject; a short chat card
- [x] Prompts, sync and the scripted AI use the new format; the Write card shows the cards of the open chapter
- [x] Scenarios `storyline` (the AI) and `storyline-edit` (by hand, the layout, the keyboard)

## Version 0.12 — story line review and Plan navigation

- [x] AI proposals for the line: only green and red, a move is a removal and an addition, Apply and Reject on each change, one chat card for a reply (`boardChanges`, `reviewView`, `applyBoardChange`; 49 unit tests)
- [x] Back in Plan goes to the page before (history), with its name; the line keeps its view and its scroll
- [x] The card dialog has one size; mentions show in color in the text box; the selects stay in the dialog
- [x] The header of the line has the place of the other modes; the "+" column is as high as a column; the scrollbar of the app in the columns; a new banner
- [x] A new last chapter takes the title of the first planned chapter; the AI names planned chapters in the style of the book
- [x] Rename and delete categories
- [x] The icon of Reply in the selection menu is on the middle of its text (the `icons` scenario measures it)

## Version 0.13 — portraits for the AI, proposals in notes

- [x] The chat sends the portraits of the notes: sheets with names, and the notes in focus larger (`portraitPlan`, `features/chat/portraits.ts`)
- [x] A change to a list in a note shows as a diff (`markdownToPlainBlocks`); a new reply opens the note or the line that it changes
- [x] A proposed portrait waits on the page of the note; a click on a portrait shows it whole
- [x] The board keeps its place after Apply and Reject (`anchor.ts`; the `storyline` scenario checks the last decision in a narrow window)
- [x] The chat card of a line proposal, the footer of the card dialog, @ for every note name in AI cards

## Tests and CI

- [x] End-to-end scenarios run with a hidden window (transparent, no focus) and with CSS animations off
- [x] `npm run e2e` runs 4 scenarios at the same time (about 2 minutes instead of 7); `--changed` runs only the scenarios for the changed files; a failed scenario runs once more alone and is reported as unstable when it passes
- [x] CI on GitHub (`ci.yml`): types, unit tests and all scenarios in three parts on clean Windows machines, for each push to main and each pull request; a release tag builds the installer only after these checks

## Later (not in version 1)

- Sync to a git remote from the app
- EPUB export
- Typewriter sounds (optional)
