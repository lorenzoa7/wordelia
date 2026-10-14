# Wordelia — Roadmap and status

This file is the source of truth for progress. Update it after each task. Mark a task `[x]` only after you verify it (tests pass, or you saw it work in the app). `[~]` means built but not yet verified.

## Current focus

> **Milestone:** M5–M7 verification and polish
> **Next task:** Verify export (PDF, DOCX) and import (DOCX) end to end; review-bar spacer; dark theme pass.
> **Blocked:** live AI tests need the user to run `claude auth login` and `codex login` (both CLIs are logged out). The mock provider (`WORDELIA_MOCK_AI=1`) covers the UI flows.

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
- [~] File watcher: reload external changes — built; live test pending

## M2 — Editor

- [x] TipTap editor with the book typography on a page
- [x] Toolbar: undo, redo, font, size, bold, italic, underline, align, scene break
- [x] Smart typing: `--` to dialogue dash, smart quotes, ellipsis (settings)
- [x] Find and replace
- [x] Word counts (chapter, book)
- [ ] Spell check with the book language
- [x] Focus mode, typewriter scrolling

## M3 — AI providers

- [x] Transport interface and stream events
- [~] Claude Code transport (CLI) — built; live test pending
- [~] Codex transport (CLI) — built; live test pending
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
- [ ] Wiki links `[[...]]`
- [x] Planning in the AI context
- [x] Sync with manuscript (proposals review)
- [ ] Import: DOCX, Markdown, TXT; build planning from manuscript

## M7 — Export

- [ ] PDF: book and manuscript presets
- [ ] DOCX with named styles
- [ ] Markdown and plain text
- [ ] Export dialog with preview

## M8 — Polish and release

- [ ] Animations and micro-interactions review
- [ ] Onboarding (first run) and empty states
- [ ] Keyboard shortcuts sheet
- [ ] Accessibility review (focus rings, contrast, labels)
- [ ] Windows installer (electron-builder), app icon
- [ ] README with screenshots

## Later (not in version 1)

- Version history (local snapshots with git)
- EPUB export
- Typewriter sounds (optional)
- Book-level overrides of actions
