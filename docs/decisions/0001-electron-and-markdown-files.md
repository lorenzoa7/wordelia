# 0001 — Electron, and a book is a folder of Markdown files

Date: 2026-10-14. Status: accepted.

## Context

The app must run on Windows, spawn local CLI programs, read and write files, and export print-quality PDF. The user wants files on disk, like Obsidian, that sync with Drive or git.

## Decision

- Use Electron. Tauri needs Rust, which is not installed, and its webview on Windows (WebView2) has no `printToPDF` with CSS margin boxes.
- A book is a folder. Chapters and planning entries are Markdown files with YAML frontmatter. Threads are JSON.
- Use our own Markdown dialect (see `ARCHITECTURE.md` 4.2). It is standard Markdown plus Pandoc-style attributes for rare formats (span font, paragraph alignment).

## Consequences

- Git diffs and Obsidian can read the book.
- Rare formats (font of a span) are less readable in other apps. This is acceptable, because novels use them rarely.
- Electron 44 needs Node 22.12 or later to install. The project uses Node 24 (`.node-version`).
