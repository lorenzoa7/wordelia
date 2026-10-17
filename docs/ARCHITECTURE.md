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
    planning/        Planning map: the links between entries
    text/            Word diff, token estimate, helpers
  renderer/
    index.html
    src/
      app/           App shell, view switch
      styles/        Design tokens and base CSS
      ui/            UI primitives
      features/      library, editor, chapters, chat, plan, graph (planning map), settings, export
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
      Marta.md          One file for each entry
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
aliases: [Marta]
summary: Elias's companion. Practical and curious.
image: _assets/marta.webp
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
- **Codex:** the app runs the `codex` CLI of the user (`codex app-server`, JSON-RPC, read-only sandbox; `codex exec --json` as a fallback).
- **Anthropic API / OpenAI API:** HTTPS streaming with the key of the user.

#### Models and effort

The model lists come from the providers, so new models appear without an app update:

| Provider | Models | Effort levels |
|---|---|---|
| Claude Code | The aliases in `claude --help` ("fable", "opus", "sonnet"), plus "opus", "sonnet" and "haiku". The CLI maps each alias to the newest model of its family. A newer CLI brings newer models. | From the `--effort` line of `claude --help`. An old CLI without `--effort` gets none. |
| Codex | `model/list` of `codex app-server`. | `supportedReasoningEfforts` and `defaultReasoningEffort` of each model. |
| Anthropic API | `models.list`. | `capabilities.effort` of each model (Haiku 4.5 has none). |
| OpenAI API | `models.list`. | Low, medium and high for reasoning models. |

`src/main/ai/claude-models.ts` reads the help text again when the `claude` program changes (path, size, time). Model lists show the version of each model ("Opus 5.5", `modelLabel` in `src/shared/ai/effort.ts`):

- **Claude Code:** an alias has no version. So, once for each version of the CLI and in the background, the app starts `claude -p --output-format stream-json` for each alias, reads the first event (`system`/`init` names the real model) and stops the CLI at once. The API address of that run is a closed local port, so no request can reach the API and no tokens are used. The result goes to `claude-models.json` in the app data folder, together with the model that answered each real request. When the labels change, the main process sends `ai:modelsChanged` and the renderer reads the model list again.
- **Anthropic API:** the display name without "Claude ".
- **Codex and OpenAI API:** their names have the version already.

Each task route (`ModelChoice`) has an explicit effort. Settings version 2 gave old Claude Code routes the suggested effort of their task (`TASK_EFFORT` in `src/shared/ai/effort.ts`: chat medium, actions medium, sync high, background low; settings version 3 moved Claude Code chat routes from high to medium). An action can override the effort of its route (`AiAction.effort`). When the model does not support an effort, the app uses the nearest lower level (`nearestEffort`).

#### Thinking

A transport sends `{ type: 'thinking', delta }` events when the provider streams a summary of what the model thinks:

| Provider | Source |
|---|---|
| Claude Code | `stream_event` → `content_block_delta` with `thinking_delta`; else the `thinking` blocks of the `assistant` message |
| Codex | `item/reasoning/summaryTextDelta` (and `item/reasoning/textDelta` when a model gives no summary); `exec --json`: completed `reasoning` items |
| Anthropic API | Thinking deltas. The app asks for `display: "summarized"` on the models that always think (generation 5), so it costs nothing more |
| OpenAI API | `response.reasoning_summary_text.delta`, with `reasoning.summary: "auto"`. When the organization cannot get summaries, the app asks again without them |

The chat shows the thinking in one line while the reply streams, and keeps it in memory for the session. It never goes into the message or back to the AI.

#### Provider status

- **Claude Code:** `claude --version` and `claude auth status`.
- **Codex:** `codex login status` only reads the saved file. A login can look fine and still fail. So the app also asks `codex app-server` for `account/read` with `refreshToken: true`. When the account is null, the login has expired.
- A failed request with a login error marks the provider "Not connected" in the app, also when the status check said that it was logged in.
- The app compares the CLI version with the newest version on npm (`src/main/ai/updates.ts`) and shows an update hint.

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

- "Show in text" on a change calls `revealProposal` (`src/renderer/src/features/editor/registry.ts`): the editor shows the change at its place in the chapter. When the user accepts or rejects it there, the card gets the same state.
- A reply with two or more open proposals has a bar for all of them ("Apply all 3", "Reject all").
- An accepted `<create>` that replaces an entry keeps the old entry file in the message (`ChatMessage.replaced`).

#### Rewind, Edit and Retry

`src/renderer/src/features/chat/rewind.ts`. A rewind removes the messages after a message of the user. Edit removes the message and the messages after it, and sends the new text. Retry removes the last reply and asks again. When removed replies had accepted proposals, the app asks first and can undo them:

1. It saves a version of each changed chapter ("Before restore").
2. It undoes each change from the newest to the oldest (`revertChanges` in `src/shared/proposals/revert.ts`): the old text goes back only where the text of the AI is still there, once and unchanged. Other words of the user stay.
3. A new entry from the AI goes to the trash of the book. A replaced entry gets its old file back. In both cases only when the entry still has the text of the AI.

The digest of the thread starts again when it covered removed messages.

#### Thread states

The thread list shows a state for each thread (`src/renderer/src/features/chat/status.tsx`): proposals wait for a decision, a reply that the user did not see (`Thread.readAt`, set when the thread shows in the open chat), or a reply in progress. The chat button in the title bar has a dot when the chat is closed and a thread needs the user.

### 5.4 Actions

An action sends: the writing rules, the action instructions, N characters before the selection, the selection, and N characters after. The AI returns `<rewrite>...</rewrite>`. The editor shows a word diff as decorations on the page. Accept replaces the range in one transaction.

Each action has its own keyboard shortcut (`AiAction.shortcut`, for example "Ctrl+J"). `src/shared/ai/shortcuts.ts` reads key presses, keeps one text form and finds conflicts with other actions and with the keys of the app and the editor (`RESERVED_SHORTCUTS`). `useActionShortcuts` runs the action of a shortcut in the Write view. Settings version 4 gave the actions of old settings the keys that they had by position: Ctrl+J for the main action, Alt+2, Alt+3… for the others. See `docs/decisions/0003-action-shortcuts-and-builtin-instructions.md`.

### 5.5 Thread digests

After each AI reply, a background job (Background route) updates the digest of the thread: the old digest plus the last exchange gives the new digest (12 bullets or fewer).

### 5.6 Planning sync

1. Find the chapters whose content hash changed since the last sync.
2. Send them with the planning index and the related entries.
3. The AI returns `<create>` and `<edit>` proposals for planning files only.
4. The user reviews them. Accepted proposals update the files and `ai/sync-state.json`.

### 5.7 Interface languages

The interface is in English (the default), Portuguese (Brazil) and Spanish (`AppSettings.language`). The texts are in `src/shared/i18n/<locale>/<namespace>.ts`. The translations have the type of the English texts, so a missing key is a type error. React code uses `useT()`, other renderer code `getT()`, and the main process `mainT()`. Rules and a terms table: `src/shared/i18n/README.md`.

Some texts are stored in English and translated only when the app shows them, so that a book looks the same in every language: the title "New thread" (it also tells the app to make a title), the title and the purpose of the planning sync thread, and the labels of chapter versions ("Opened", "Before Polish"). Built-in actions and default categories show translated names until the user renames them (`actionName`, `categoryName`). The instructions of built-in actions also show in the interface language until the user changes them, and the AI gets that same text (`actionInstructions`). Effort names (Low, Medium, High…) stay in English in every language.

The language of a book is a different setting. It controls the AI output, the dialogue style, the chapter word ("Capítulo Um"), spell check, hyphenation (the page has `lang` = book language) and export. AI prompts stay in English.

## 5.8 App updates

`src/main/updater.ts` uses electron-updater with the GitHub provider (`publish` in `electron-builder.yml`: the public repository `lorenzoa7/wordelia`). The build writes `latest.yml` and puts `app-update.yml` in the app resources. The release workflow uploads the installer, its blockmap and `latest.yml` to the GitHub release.

- The installed app looks for a new version 15 seconds after start and then every 6 hours, when `AppSettings.autoUpdate` is on. Settings → General → Updates also has a manual check.
- The app downloads the new version in the background. Then the title bar shows "Update ready" and a toast offers "Restart now".
- "Restart now" closes the window through the normal close path, so the renderer saves everything first. Then `quitForUpdate()` runs the installer without questions and starts the new version. When the user quits without a restart, the update installs on quit.
- Updates are off in development, in test runs (`WORDELIA_E2E=1`) and on other platforms. The state reaches the renderer as the `app:update` event (`UpdateState`).

## 6. Settings and secrets

App data folder (`app.getPath('userData')`):

- `settings.json`: theme, editor preferences, providers, model routes, actions.
- `library.json`: known books.
- `secrets.json`: API keys, encrypted with `safeStorage`.

## 7. Export

- **PDF:** the main process opens a hidden window with print HTML and CSS paged media (`@page` size and margins, margin boxes for page numbers, `break-before: page` for chapters). `webContents.printToPDF` writes the file.
- **DOCX:** `docx` builds a document with named styles: Normal, First Paragraph, Chapter Number, Chapter Title, Scene Break. Page size, margins and a page number field in the footer. The title page is a separate section without a page number.

## 7a. Pages on screen

The Write view shows the manuscript as pages, like a word processor (`src/renderer/src/features/editor/PageEditor.tsx`).

- **Page geometry.** A page has the page size and the margins of the book's export settings (A5 by default), at the zoom of the screen. It has a fixed width: in a narrow window the desk scrolls sideways.
- **One scroll for the book.** Every chapter is a sheet that starts on a new page. The sheets follow one another. Each chapter has its own TipTap editor (its own undo history). A chapter far from the screen (more than about two screens) has no editor: it keeps its measured height. The chapter with the cursor, or else the chapter at 30% of the screen height, is the active chapter. `selectChapter` scrolls to a chapter (`chapterJump`); `setActiveChapter` only marks it.
- **Page breaks** (`pagination.ts`). After each layout, a plugin measures the line boxes of the chapter (from the rectangles of its text) and puts a page gap where a page is full. A gap between paragraphs is a block widget. A gap inside a paragraph is a full-width inline-block: it makes a soft line break, so the line before it stays justified. The plugin works in "flow" coordinates (the y of a line minus the gaps above it), so the result does not depend on the gaps on screen. A break never splits a word. The chapter heading takes the top of the first page.
- **Registry** (`registry.ts`). The mounted editors, by chapter. The toolbar, the selection menu, the review bar, the find bar and the actions use the active editor (`useActiveEditor`). `applyToChapter` changes a chapter in its editor when it is mounted, else in the store. `revealProposal` opens a chat proposal in the text as an inline diff (Accept applies it and tells the chat).
- **Find** searches the active chapter, scrolls to each match, and goes on into the next chapter that has a match.

## 7b. Planning map

The Plan overview has a switch: "Cards | Map". The map shows the planning as a graph (`src/renderer/src/features/graph/`).

- **Links** (`src/shared/planning/graph.ts`, pure, with tests). Entry A links to entry B when the summary or the notes of A use the name or an alias of B, or `[[B]]` (also `[[B|text]]` and `[[B#Heading]]`). The match is on whole words and ignores case. Accents count: "Pará" does not match "para". A name with fewer than 3 letters does not count, but a `[[link]]` to it does. When names overlap, the longest name wins. The weight of a link is the number of mentions in the two directions. With the "Chapters" chip, each chapter is a node too, and it links to the entries that it mentions.
- **Layout** (`layout.ts`). d3-force with these forces: links, repulsion, a pull to the center (stronger up and down on a wide stage), collision, and a force that keeps the box of each node and its label away from the other boxes. Entries without links are not in the simulation: they sit on ellipses around the linked entries. The app runs one tick for each animation frame. With reduced motion, the layout runs to the end at once.
- **Drawing** (`MapCanvas.tsx`). SVG. React draws the nodes, the edges and the labels once. Each frame sets their positions directly in the DOM. The labels are on a layer above the nodes and keep their size on the screen at all zoom levels. All labels show when the map is small or near; else only the labels of the 14 nodes with the most links show. With 300 entries, a frame takes about 15 ms while the map settles (`MAP_PERF=1 node scripts/shot.mjs graph --en`).
- **Navigation** (`nav.ts`). The map is the Plan page `activeCategory = ':map'` in the book store. A folder name cannot have ":" on Windows. Thus the sidebar, Alt+← and the mouse back button work as on the other Plan pages. An entry that the user opens from the map has the back link "← Map".
- The layout, the view and the filters of each book stay in memory for the session. The app does not save them.
- The colors of the categories are the tokens `--map-1` to `--map-8`, in the order of the categories. The palette was checked for color vision deficiency (adjacent pairs) and for 3:1 contrast on the paper, in the two themes.

## 8. Saving

- Each chapter editor keeps up to 350 ms of typing in memory, then writes Markdown to the book store. An editor that unmounts (its chapter scrolled far away) writes first.
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
| `WORDELIA_MOCK_AI=1` | All providers use the scripted provider in `src/main/ai/mock.ts`. It streams a short thinking before chat replies. |
| `WORDELIA_MOCK_DELAY` | Milliseconds between the pieces of a scripted reply (default 12). The `chat` scenario sets it in the main process to show the thinking line. |
| `WORDELIA_USER_DATA` | App data folder (settings, library, secrets). |
| `WORDELIA_BOOKS_DIR` | Default folder for new and imported books, instead of Documents. |
| `WORDELIA_EXPORT_DIR` | Exports go here without a save dialog. |
| `WORDELIA_UPDATE_TEST=1` | The updater checks and downloads, but never installs (`scripts/smoke-update.mjs`). |

`scripts/shot.mjs <scenario> [--dark] [--fresh] [--real-ai]` builds nothing; run `npm run build` first, or use `npm run shot -- <scenario>`. Scenarios are in `scripts/shots/`.

### Live tests with a real AI

These scenarios use the AI that is connected on this computer (`--real-ai`). They cost tokens of the user's plan. Each one works on a copy of the book.

| Scenario | Environment | What it does |
|---|---|---|
| `live-import` | `IMPORT_FILE`, `LIVE_OUT` | Imports a DOCX, waits for the planning sync, accepts all proposals with the "Apply all" bar of the reply, copies the book to `LIVE_OUT/book`. |
| `live-polish` | `LIVE_BOOK`, `LIVE_OUT`, optional `LIVE_CASES` | Runs actions on paragraphs (`action:chapter:paragraph:count`) and writes `polish-report.json` with the text before and after. |
| `live-chat` | `LIVE_BOOK`, `LIVE_OUT`, optional `LIVE_PROMPTS` | Sends chat messages in a new thread, accepts the proposals, and writes `chat-report.json`. |
| `live-sync` | `LIVE_BOOK`, `LIVE_OUT`, optional `LIVE_CHAPTER`, `LIVE_TEXT` | Adds a paragraph to a chapter, presses Sync, accepts the proposals, and writes `sync-report.json`. |
| `live-settings` | — | Screenshot of Settings → AI with the real provider status. |
| `debug` | optional `WORDELIA_DEBUG_PROVIDER`, `WORDELIA_DEBUG_MODEL`, `WORDELIA_DEBUG_BIN` | One small completion. Prints the status, the models and the result. |

Set `WORDELIA_CLAUDE_BIN` to run any scenario with another copy of the `claude` CLI, for example a newer one.

### AI text and the book typography

The AI often writes straight quotes and three dots. `typesetForBook` (`src/renderer/src/lib/typeset.ts`) changes them to the quotes and the ellipsis of the book, when the book settings ask for smart quotes and smart ellipsis. It runs on action rewrites, on chat edits to chapters (the diff card shows the same text that is applied), and on "Insert at cursor". Attribute blocks such as `{font="X"}` and HTML tags keep their straight quotes.

### Frontmatter from the AI

The AI can write YAML that is not valid, for example `summary: Two plots: one…`. When YAML parsing fails, `readFrontmatter` reads simple `key: value` lines and lists. The file is then written back as valid YAML. When a line does not fit, or a key repeats, the raw frontmatter is kept unchanged, as before.
