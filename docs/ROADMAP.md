# Wordelia — Roadmap and status

This file is the source of truth for progress. Update it after each task. Mark a task `[x]` only after you verify it (tests pass, or you saw it work in the app).

## Current focus

> **Milestone:** M0 — Foundation
> **Next task:** Scaffold the Electron app.

## M0 — Foundation

- [x] Product spec (`docs/SPEC.md`), architecture (`docs/ARCHITECTURE.md`), glossary
- [ ] Scaffold: electron-vite, React, TypeScript, Vitest
- [ ] GitHub private repository, first push
- [ ] Design tokens, fonts, base CSS, light and dark themes
- [ ] Logo (wordmark SVG) and app icon
- [ ] App shell: custom title bar, view switch, collapsible sidebars
- [ ] Screenshot script (Playwright for Electron) for visual checks

## M1 — Books on disk

- [ ] Shared domain types and IPC contract
- [ ] Wordelia Markdown parser and serializer, with round-trip tests
- [ ] Book folder: create, open, read, write (atomic), manifest
- [ ] Library screen: recent books, new book, open folder
- [ ] Chapters: add, rename, reorder, delete
- [ ] Autosave with debounce, save state in the status bar
- [ ] File watcher: reload external changes

## M2 — Editor

- [ ] TipTap editor with the book typography on a page
- [ ] Toolbar: undo, redo, font, size, bold, italic, underline, align, scene break
- [ ] Smart typing: `--` to dialogue dash, smart quotes, ellipsis (settings)
- [ ] Find and replace
- [ ] Word counts (chapter, book)
- [ ] Spell check with the book language
- [ ] Focus mode, typewriter scrolling

## M3 — AI providers

- [ ] Transport interface and stream events
- [ ] Claude Code transport (CLI)
- [ ] Codex transport (CLI)
- [ ] Anthropic API and OpenAI API transports
- [ ] Provider status detection and model lists
- [ ] Settings UI: providers, model routes, suggested routes

## M4 — Actions (Format with AI)

- [ ] Selection menu: Reply, Polish, more actions
- [ ] Action prompt builder with context before and after
- [ ] Inline word diff on the page, with Accept, Reject, Retry
- [ ] Action editor in settings, default actions, writing rules

## M5 — Chat and threads

- [ ] Chat panel, thread list, streaming messages
- [ ] Context builder (planning, manuscript budget, other threads)
- [ ] Proposal protocol parser (streaming) and diff cards
- [ ] Apply hunks to the live editor or to files
- [ ] Reply quotes and `@` mentions
- [ ] Thread brief and digest (background job)

## M6 — Planning

- [ ] Plan view: categories, entries, entry editor, cards
- [ ] Entry images and aliases
- [ ] Wiki links `[[...]]`
- [ ] Planning in the AI context
- [ ] Sync with manuscript (proposals review)
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
