# Wordelia — Roadmap and status

This file is the source of truth for progress. Update it after each task. Mark a task `[x]` only after you verify it (tests pass, or you saw it work in the app). `[~]` means built but not yet verified.

## Current focus

> **Milestone:** M8 — polish and live AI verification
> **Next task:** Live tests with real models once the user logs in (`claude auth login`, `codex logout && codex login`): Polish quality, chat proposals, planning sync on the real book.
> **Blocked:** both CLIs are logged out on this computer. The scripted provider (`WORDELIA_MOCK_AI=1`) covers the UI flows.

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
- [~] Claude Code transport (CLI) — built; live test pending
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

- [ ] Animations and micro-interactions review
- [x] Onboarding (first run) and empty states
- [x] Keyboard shortcuts sheet
- [ ] Accessibility review (focus rings, contrast, labels)
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

## Later (not in version 1)

- Sync to a git remote from the app
- EPUB export
- Typewriter sounds (optional)
- Book-level overrides of actions
