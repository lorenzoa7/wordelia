# Wordelia — Architecture

Read `GLOSSARY.md` first. This file uses its terms.

## 1. Stack

| Part | Choice | Why |
|---|---|---|
| Shell | Electron 44 | Node access for files and CLI child processes. Chromium for PDF export. Rust is not necessary. |
| Build | electron-vite 3, Vite 6 | Fast dev server with hot reload. Works with Node 20.14 (the local Node). |
| UI | React 19, TypeScript 5.9 | Large ecosystem. |
| Editor | TipTap 3 (ProseMirror) | Strong document model, input rules, decorations for inline diffs, bubble menus. |
| State | Zustand 5 | Small, simple stores. |
| Motion | `motion` (Framer Motion) | Calm spring animations. |
| Icons | Phosphor (light weight) | Thin lines that match the typewriter look. |
| Markdown | markdown-it + own serializer | Full control of the Wordelia Markdown dialect. |
| DOCX | `docx` (export), `mammoth` (import) | Real Word styles. |
| PDF | Chromium `printToPDF` with CSS paged media | Page margin boxes give page numbers and headers. |
| Tests | Vitest (unit), Playwright for Electron (end to end and screenshots) | |
| Package | electron-builder (NSIS installer for Windows) | |

## 2. Processes

```
+---------------------------+        IPC (typed, see src/shared/ipc.ts)        +----------------------------+
| Renderer (React, sandbox) |  <--------------------------------------------->  | Main (Node)                |
|  - UI, editor, stores     |   invoke: book.*, ai.*, export.*, settings.*      |  - file system, watcher    |
|  - prompt building        |   events: ai:chunk, book:changed                   |  - AI transport (CLIs, HTTP)|
|  - proposal parsing       |                                                   |  - export (PDF, DOCX)      |
+---------------------------+                                                   |  - secrets (safeStorage)   |
                                                                                +----------------------------+
```

Rules:

1. The renderer has no Node access. `contextIsolation` is on. The preload script exposes `window.wordelia`, a typed API.
2. The main process owns all I/O: files, child processes, network.
3. The renderer owns the app logic: it builds prompts, parses proposals and applies them. Thus the AI uses the live text in the editor, also when it is not saved yet.
4. `src/shared/` is pure TypeScript. It has no Node and no DOM imports. Both processes use it.

## 3. Source layout

```
src/
  main/              Electron main process
    index.ts         App start, window
    ipc.ts           Registers IPC handlers
    book/            Book folder I/O, watcher, library
    ai/              Provider transports: claude-code, codex, anthropic, openai
    export/          PDF and DOCX
    import/          DOCX, Markdown, TXT
    settings/        App settings and secrets
  preload/index.ts   contextBridge API
  shared/            Pure code for both processes
    types.ts         Domain types
    ipc.ts           IPC contract (channel names and payload types)
    markdown/        Wordelia Markdown <-> document JSON
    proposals/       Proposal protocol: parse and apply
    prompts/         Prompt builders
    text/            Word diff, token estimate, helpers
  renderer/
    index.html
    src/
      app/           App shell, view switch
      styles/        Design tokens and base CSS
      ui/            UI primitives
      features/      library, editor, chapters, chat, planning, settings, export
      stores/        Zustand stores
```

## 4. Book folder

```
My Book/
  wordelia.json          Manifest (see BookManifest in src/shared/types.ts)
  manuscript/
    The Traveller.md     One file for each chapter. The manifest keeps the order.
  planning/
    Characters/
      Heitor Ferrari.md  One file for each entry
    Places/
    World/
    Plot/
    Notes/
    _assets/             Images for entries
  ai/
    writing-rules.md     The writing rules of this book
    threads/
      <thread-id>.json   One file for each chat thread
    sync-state.json      Content hashes of chapters at the last planning sync
  .wordelia/             Local cache. Not synced (the app writes a .gitignore for it)
    cache/summaries.json
  .gitignore
```

File names are readable, with spaces, like Obsidian notes. The app keeps IDs in the frontmatter, so a rename does not break links.

### 4.1 Chapter file

```markdown
---
id: ch_k3j9x2
title: The Traveller
---
The first paragraph of the chapter.

— Did you feel that? — asked the old man.

* * *

A new scene starts here.
```

### 4.2 Wordelia Markdown dialect

| Element | Syntax |
|---|---|
| Paragraph | Text, then a blank line |
| Italic, bold | `*italic*`, `**bold**` |
| Underline | `<u>text</u>` |
| Strikethrough | `~~text~~` |
| Scene break | A line with `* * *` |
| Heading (inside a chapter or entry) | `## Heading` |
| Font or size of a span | `[text]{font="EB Garamond" size=14}` (Pandoc bracketed span) |
| Paragraph alignment | A last line `{align=center}` after the paragraph text |
| No first-line indent | `{indent=0}` |
| Lists, quotes, links (planning only) | Standard Markdown |
| Wiki link | `[[Entry name]]` |

The serializer writes the shortest correct Markdown. The parser accepts standard Markdown from other apps.

### 4.3 Entry file

```markdown
---
id: en_8fh2k1
aliases: [Heitor, Ferrari]
summary: Smuggler of the Carpinteiros gang. Loyal, hot-headed.
image: _assets/heitor.webp
---
## Appearance
...
```

## 5. AI

### 5.1 Transport (main process)

All providers implement one interface:

```ts
interface ProviderTransport {
  id: ProviderId                       // 'claude-code' | 'codex' | 'anthropic' | 'openai'
  status(): Promise<ProviderStatus>    // installed? logged in? version
  listModels(): Promise<ModelInfo[]>   // dynamic when the provider supports it
  stream(req: CompletionRequest, onEvent: (e: StreamEvent) => void, signal: AbortSignal): Promise<CompletionResult>
}
```

`CompletionRequest` is `{ system, messages, model, effort?, maxTokens? }`. The AI is a pure text model. It does not get tools. It proposes changes with the proposal protocol (5.3), and the app applies them after the user accepts.

- **Claude Code:** the app runs the `claude` CLI of the user in print mode with streaming JSON output, no tools, no settings sources, and the prompt on stdin. See `docs/decisions/0002-ai-through-user-clis.md`.
- **Codex:** the app runs the `codex` CLI of the user (`codex exec --json`, read-only sandbox, prompt on stdin).
- **Anthropic API / OpenAI API:** HTTPS streaming with the key of the user.

### 5.2 Prompt building (renderer)

`src/shared/prompts/` builds the system prompt from these blocks, in this order (stable blocks first, for prompt caching):

1. Role and behavior of the assistant.
2. Writing rules of the book.
3. Book overview: title, language, genre, typography conventions (dialogue dash).
4. Planning: an index of all entries (name and summary), and the full text of related entries. An entry is related if the user mentions it, or if its name or an alias appears in the current chapter.
5. Manuscript: the full text when it fits the budget. Else, the current chapter and its neighbors in full, and summaries of the other chapters.
6. Other threads: title, brief and digest of each thread.
7. The proposal protocol.

### 5.3 Proposal protocol

The AI writes changes as tags in its reply:

```xml
<edit file="manuscript/The Traveller.md">
<find>exact current text</find>
<replace>new text</replace>
</edit>

<create file="planning/Characters/Teresa.md">
...full Markdown of the new file...
</create>
```

The renderer parses the tags while the reply streams. It shows each tag as a diff card. A hunk applies to the live editor when the chapter is open (one undo step). Else it applies to the file text. The match is exact first, then with whitespace and quote normalization.

### 5.4 Actions

An action sends: the writing rules, the action instructions, N characters before the selection, the selection, and N characters after. The AI returns `<rewrite>...</rewrite>`. The editor shows a word diff as decorations on the page. Accept replaces the range in one transaction.

### 5.5 Thread digests

After each AI reply, a background job (Background route) updates the digest of the thread: the old digest plus the last exchange gives the new digest (12 bullets or fewer).

### 5.6 Planning sync

1. Find the chapters whose content hash changed since the last sync.
2. Send them with the planning index and the related entries.
3. The AI returns `<create>` and `<edit>` proposals for planning files only.
4. The user reviews them. Accepted proposals update the files and `ai/sync-state.json`.

## 6. Settings and secrets

App data folder (`app.getPath('userData')`):

- `settings.json`: theme, editor preferences, providers, model routes, actions.
- `library.json`: known books.
- `secrets.json`: API keys, encrypted with `safeStorage`.

## 7. Export

- **PDF:** the main process opens a hidden window with print HTML and CSS paged media (`@page` size and margins, margin boxes for page numbers, `break-before: page` for chapters). `webContents.printToPDF` writes the file.
- **DOCX:** `docx` builds a document with named styles: Normal, First Paragraph, Chapter Number, Chapter Title, Scene Break. Page size, margins and a page number field in the footer. The title page is a separate section without a page number.

## 8. Saving

- Editors keep up to 350 ms of typing in memory, then write Markdown to the book store.
- The store writes files through `saver` (500 ms debounce for each file, ordered writes).
- Editors register a flusher (`src/renderer/src/lib/flush.ts`). Closing a book runs all flushers, then `saver.flush()`.
- Closing the window: the main process stops the close, sends `app:flushRequest`, and closes when the renderer answers `app:flushDone` (or after 4 s).
- Deleted chapters and entries move to `.wordelia/trash/`. Nothing is deleted for good.
- Accepted AI proposals show an **Undo** toast. It restores the text from before the change.

## 9. Long books

When the manuscript does not fit the token budget of the chat, the chat sends the open chapter and its neighbors in full, and summaries of the other chapters. The background model makes the summaries. They are cached by content hash in `.wordelia/cache/summaries.json`.

## 10. Test hooks

The app reads these environment variables. Users never set them.

| Variable | Effect |
|---|---|
| `WORDELIA_E2E=1` | Exposes `window.__wordelia` (open a book, run an action, import a file). |
| `WORDELIA_MOCK_AI=1` | All providers use the scripted provider in `src/main/ai/mock.ts`. |
| `WORDELIA_USER_DATA` | App data folder (settings, library, secrets). |
| `WORDELIA_BOOKS_DIR` | Default folder for new and imported books, instead of Documents. |
| `WORDELIA_EXPORT_DIR` | Exports go here without a save dialog. |

`scripts/shot.mjs <scenario> [--dark] [--fresh] [--real-ai]` builds nothing; run `npm run build` first, or use `npm run shot -- <scenario>`. Scenarios are in `scripts/shots/`.

### Live tests with a real AI

These scenarios use the AI that is connected on this computer (`--real-ai`). They cost tokens of the user's plan. Each one works on a copy of the book.

| Scenario | Environment | What it does |
|---|---|---|
| `live-import` | `IMPORT_FILE`, `LIVE_OUT` | Imports a DOCX, waits for the planning sync, accepts all proposals with the "Accept all" bar, copies the book to `LIVE_OUT/book`. |
| `live-polish` | `LIVE_BOOK`, `LIVE_OUT`, optional `LIVE_CASES` | Runs actions on paragraphs (`action:chapter:paragraph:count`) and writes `polish-report.json` with the text before and after. |
| `live-chat` | `LIVE_BOOK`, `LIVE_OUT`, optional `LIVE_PROMPTS` | Sends chat messages in a new thread, accepts the proposals, and writes `chat-report.json`. |
| `live-settings` | — | Screenshot of Settings → AI with the real provider status. |
| `debug` | optional `WORDELIA_DEBUG_PROVIDER` | One small completion. Prints the status, the models and the result. |

### AI text and the book typography

The AI often writes straight quotes and three dots. `typesetForBook` (`src/renderer/src/lib/typeset.ts`) changes them to the quotes and the ellipsis of the book, when the book settings ask for smart quotes and smart ellipsis. It runs on action rewrites, on chat edits to chapters (the diff card shows the same text that is applied), and on "Insert into chapter". Attribute blocks such as `{font="X"}` and HTML tags keep their straight quotes.

### Frontmatter from the AI

The AI can write YAML that is not valid, for example `summary: Two plots: one…`. When YAML parsing fails, `readFrontmatter` reads simple `key: value` lines and lists. The file is then written back as valid YAML. When a line does not fit, or a key repeats, the raw frontmatter is kept unchanged, as before.
