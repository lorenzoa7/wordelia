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
    actions.json         The actions of this book (Settings → Actions → This book)
    threads/
      <thread-id>.json   One file for each chat thread
    sync-state.json      Content hashes of chapters at the last planning sync
    comments.json        The comments of the editor's reads (see 7b3)
  .wordelia/             Local cache. Not synced (the app writes a .gitignore for it)
    cache/summaries.json
    wordelia.last-good.json   The last manifest that parsed (see 4.4)
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
| Page break (Ctrl+Enter) | A line with `<!-- page break -->` |
| Heading (inside a chapter or entry) | `## Heading` |
| Font or size of a span | `[text]{font="EB Garamond" size=14}` (Pandoc bracketed span) |
| Paragraph alignment | A last line `{align=center}` after the paragraph text |
| No first-line indent | `{indent=0}` |
| Lists, quotes, links (planning only) | Standard Markdown |
| Wiki link | `[[Entry name]]`, `[[Entry name#Heading]]`, `[[Entry name|shown text]]` |

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

- The name of an entry is its file name. A name with signs that a file name cannot have (`: ? " / \ | * < >`) keeps them in `title:`, and the file gets the name without them (`entryFromFile`, `entryToFile`). A name of signs only gets the word for "untitled" of the interface as its file name.
- A file in a folder under a category folder (`planning/Characters/Minor/Pedro.md`) belongs to that category. A file at the root of `planning/` is in no category: the Plan view shows it in "Not in a category". A new top folder becomes a category when the book opens.

### 4.4 Opening a book

`src/main/book/store.ts` (`openBook`, `inspectFolder`) and `src/main/library.ts`.

- **A damaged manifest.** A `wordelia.json` that does not parse is never replaced without a copy. The app writes the damaged file to `.wordelia/wordelia.json.broken-<time>`, then makes the manifest again from, in this order: one side of a git conflict (the version of this computer first), the last good copy (`.wordelia/wordelia.last-good.json`, written when a book opens and on each save of the manifest), the parts of the file that it can read (`salvageManifest` in `src/shared/manifest.ts`: the id, the title, the language, the chapter order, the typography), or nothing. A note (`BookSnapshot.notices`) tells the writer, with a button that shows the old file. A byte order mark is not damage. A manifest that becomes damaged while the book is open (a git pull) is copied too, before the app writes the manifest again (`book:writeFile`).
- **A missing chapter file.** A chapter in the manifest whose file is not there (a sync client did not deliver it yet) keeps its place in the manifest. A note tells the writer and offers "Forget this chapter". When the file arrives, the chapter comes back in its place (the store keeps the missing ids, and `keepMissingChapters` keeps their places when the order changes).
- **Open folder.** A folder without `wordelia.json` becomes a book only when the writer says yes ("Make it a book", with the book language). For a folder of Markdown or text files, the app offers Import instead: Import copies the files into a new book, one chapter for each file, and the folder does not change. A folder inside a book (for example its `manuscript/` folder) opens that book.
- **A book that moved.** "Find the folder…" on a "Folder not found" card points the card to the new folder when that folder has the same book (by id). "Remove from list" has Undo; the files stay on disk.

### 4.5 Import

`src/main/import.ts` splits the file into chapters; `src/shared/import.ts` has the rules; the renderer (`features/library/convert.ts`) turns DOCX HTML into Markdown.

- **Chapters.** DOCX: the Heading 1 or Heading 2 paragraphs (the level where most headings say "Chapter" or "Capítulo"; a shallower level is parts), or two or more Title paragraphs, or paragraphs like "Capítulo Um". Markdown: one heading level the same way; one "# Title" before the "## Chapter" headings is the title of the book. TXT: lines like "Capítulo Um", "CHAPTER 12" or "Chapter Two — The Storm". The text before the first chapter is the title page, up to its first paragraph of prose (25 words): from there it is a chapter. A chapter without a title in the file gets "Chapter One", "Capítulo Um"… in the language of the book.
- **Scene breaks.** A paragraph with only a marker ("* * *", "***", "#", "⁂", a centered "*") is a scene break. Blank lines are scene breaks or only spacing (`chooseBlankLines`): a document with markers, or with blank lines between more than one pair of paragraphs in four (the Google Docs style), uses them as spacing. The import dialog shows the count of scene breaks, and the writer can change the choice.
- An empty file cannot be imported. The dialog numbers the chapters and says which AI builds the planning.

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

#### Images in chat messages

The author adds images to a message with the image button, a paste or a drop (`src/renderer/src/features/chat/images.ts`). The renderer makes each image small (WebP, at most 1568 px on the long side; the AIs make larger images smaller anyway, and pixels cost tokens) and sends the bytes to `chat:saveImage`, which writes `planning/_assets/chat/<time>-<name>.webp`. The message keeps `ChatMessage.images` (paths relative to `planning/`, names and sizes), so the conversation shows them later and a portrait can use the same file.

A request has `root`, and each user turn has its `images`. Before the transport runs, `loadImages` (`src/main/ai/images.ts`) reads the files of the open book (never outside it) as Base64, at most 8 per request, the most recent. Each provider puts them in its own format:

| Provider | Images |
|---|---|
| Claude Code | `--input-format stream-json`: one JSON line on stdin with image blocks and the text. An old CLI without this flag gets the text only. |
| Codex | `localImage` items in `turn/start` (app-server), `-i <file>` for `codex exec`. Not tested with a real account. |
| Anthropic API | `image` blocks with Base64 before the text. |
| OpenAI API | `input_image` items with a data URL after the text. |

The user turn also has a line `<image file="_assets/chat/…" name="…"/>` for each image, so the AI can name the file in a proposal.

#### Portraits of the notes in the chat

The AI sees the portraits of the planning entries, so it knows how the characters, places and things look. Each message of the author brings them (`src/renderer/src/features/chat/portraits.ts`):

- **Sheets.** All the portraits, small, in a grid of 6 × 4 with the name of the entry under each one (`PORTRAITS_PER_SHEET` = 24, at most 4 sheets). A sheet costs about as much as one large image (about 1,600 tokens). To send each portrait alone would cost about 1,000 tokens for each one.
- **Larger portraits.** The entries that the message is about: a mention, the open entry, or a name or an alias in the text (`portraitPlan` in `src/shared/prompts/portraits.ts`, at most 4). The long side is 1024 px.

The renderer reads the files with `book:readAsset` (only `planning/_assets/`) and draws them on a canvas: an image of the `wordelia-asset` protocol would make the canvas unsafe to read. It keeps the images for the next messages. A user turn sends them in `ChatTurn.portraits` (WebP in Base64, each with a label). `loadImages` puts them after the images of the author, and writes a file in the temp folder for each one (Codex reads images from files). Each provider puts the label right before its image. The planning index marks an entry that has a portrait ("has a portrait"), and the chat prompt tells the AI what the images are.

#### Models and effort

The model lists come from the providers, so new models appear without an app update:

| Provider | Models | Effort levels |
|---|---|---|
| Claude Code | The aliases in `claude --help` ("fable", "opus", "sonnet"), plus "opus", "sonnet" and "haiku". The CLI maps each alias to the newest model of its family. A newer CLI brings newer models. | From the `--effort` line of `claude --help`. An old CLI without `--effort` gets none. |
| Codex | `model/list` of `codex app-server`. | `supportedReasoningEfforts` and `defaultReasoningEffort` of each model. |
| Anthropic API | `models.list`. | `capabilities.effort` of each model (Haiku 4.5 has none). |
| OpenAI API | `models.list`, without audio, image, search and research models. Suggested routes use general chat models only (`isGeneralOpenAiModel` in `src/shared/ai/openai.ts`): never a pro, research, coding or chat-latest model. | Low, medium and high for reasoning models (o-series, GPT-5 and newer; a pro model only high). None for older and chat-latest models. A model that rejects the effort gets the request again without it. |

`src/main/ai/claude-models.ts` reads the help text again when the `claude` program changes (path, size, time). Model lists show the version of each model ("Opus 5.5", `modelLabel` in `src/shared/ai/effort.ts`):

- **Claude Code:** an alias has no version. So, once for each version of the CLI and in the background, the app starts `claude -p --output-format stream-json` for each alias, reads the first event (`system`/`init` names the real model) and stops the CLI at once. The API address of that run is a closed local port, so no request can reach the API and no tokens are used. The result goes to `claude-models.json` in the app data folder, together with the model that answered each real request. When the labels change, the main process sends `ai:modelsChanged` and the renderer reads the model list again.
- **Anthropic API:** the display name without "Claude ".
- **Codex:** its names have the version already.
- **OpenAI API:** a readable name from the id ("gpt-5-mini" → "GPT-5 mini", `openaiModelLabel`).

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
- **Codex:** `codex login status` only reads the saved file. A login can look fine and still fail. So the app also asks `codex app-server` for `account/read` with `refreshToken: true`. When the account is null, the login has expired. "Log in…" runs `codex logout` first, then opens `codex login` in a terminal.
- **Anthropic API / OpenAI API:** `models.list` with the key. A rejected key gives `reason: 'bad-key'`; no connection or a server error gives `reason: 'offline'` (the app cannot tell). `models.list` does not show an account without credit: a failed request does (`reason: 'no-credit'`).
- `ProviderStatus.path` is the program that the app runs. A program path in the settings loses its quotes ("Copy as path"); when the app cannot use it, `pathIgnored` is true and the app finds the program itself (`src/main/ai/resolve-bin.ts`).
- A failed request marks the provider in the app (`learnStatus` in `src/renderer/src/lib/ai.ts`): a login error marks it "Not connected", also when the status check said that it was logged in.
- The app compares the CLI version with the newest version on npm (`src/main/ai/updates.ts`) and shows an update hint under the status line.
- Settings → AI checks the providers when it opens and when the window gets the focus. After "Log in…", "How to install" or "Update…", the row checks every 3 seconds, for at most 3 minutes, until the status changes. The install pages are in `src/shared/ai/install.ts` (Settings → AI and the welcome screen use the same pages).

#### Errors

`classifyError` (`src/shared/ai/errors.ts`) gives each failed request a kind (`AiErrorKind`): `not-installed`, `not-logged-in`, `login-expired`, `bad-key`, `no-credit`, `rate-limit` (the usage limit of a plan, with `resets` when the provider gives the time), `overloaded` (a busy server, or too many requests in a short time), `network`, `refused`, `off`, `cancelled` or `other`. `CompletionResult.error` keeps the text of the provider, short (`errorDetail`). The renderer shows `describeError(result)` (`src/renderer/src/lib/ai.ts`): a plain message in the interface language, the text of the provider for "Details", and a fix button ("Open settings") that opens the row of the provider in Settings → AI. `friendlyError` gives the message only.

#### Providers that are off, and routes

- The main process refuses a request to a provider that is off (`complete` in `src/main/ai/index.ts`, kind `off`). This is the last gate: a provider that is off never runs, also when a route still names it.
- `runCompletion` gives a route of a provider that is off (the route of a thread or of an action) the route of its task, when that one works.
- `autoRoute(prefer?)` (`src/renderer/src/stores/app.ts`, with `repairRoutes` in `src/shared/ai/routes.ts`) gives each task without a route, and each task of a provider that is off, the suggested routes of `prefer` or of the first provider that works. With no working provider, those routes become empty and the app says "Connect an AI". It runs at start, when a provider connects in Settings → AI or in the welcome screen, when a provider is turned off, and when the window gets the focus while the chat has no working AI.
- A provider that is off has no status and no models in the app, so no model picker shows it.

### 5.2 Prompt building (renderer)

`src/shared/prompts/` builds the system prompt from these blocks, in this order (stable blocks first, for prompt caching):

1. Role and behavior of the assistant.
2. Writing rules of the book.
3. Book overview: title, language, genre, typography conventions (dialogue dash).
4. Planning: an index of all entries (name and summary), and the full text of related entries. An entry is related if the user mentions it, or if its name or an alias appears in the current chapter.
5. Manuscript: the full text when it fits the budget. Else, the current chapter and its neighbors in full, and summaries of the other chapters.
6. Other threads: title, brief and digest of each thread.
7. The proposal protocol.

#### Reply style

The author reads the chat in a narrow panel. The "How you reply" block of the chat prompt (`src/shared/prompts/chat.ts`) asks for short, direct replies:

- The answer comes first. There is no preamble, and the AI does not repeat the question.
- A reply has a few sentences. It is longer only when the author asks for depth, or when the task needs it. Proposals have no limit.
- There are no closing offers ("Do you want me to…") and no summary at the end.
- Lists are only for separate points.

The AI replies in the language of the author. The scripted provider (`src/main/ai/mock.ts`) writes replies in the same style.

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

<portrait file="planning/Characters/Teresa.md">_assets/chat/teresa.webp</portrait>
```

A `<portrait>` proposes an image of the chat as the portrait of an existing entry. Its card shows the image with "Use as portrait"; the entry gets `image`, and the message keeps the image from before in `replaced`, so a rewind puts it back. A new entry gets its portrait from `image:` in the front matter of its `<create>`.

The renderer parses the tags while the reply streams. It shows each tag as a diff card. A hunk applies to the live editor when the chapter is open (one undo step). Else it applies to the file text. The match is exact first, then with whitespace and quote normalization.

- **Only complete proposals wait** (`src/shared/proposals/state.ts`). A change or a note that the reply did not finish (the author pressed Stop, or the reply failed) can never be applied: not in its card, not in "Apply all", not in the text. Its card shows the cut text and says that the reply stopped. A stopped reply keeps its text (`ChatMessage.stopped`) with a quiet "Stopped" mark; the chat closes the cut Markdown marks of its last paragraph (`features/chat/markdown.ts`).
- **Current and old proposals.** The proposals of the replies after the last message of the author are current (`currentFrom`). When the author sends a new message, the proposals of the earlier replies are old: they leave the text and the state of the thread, and their cards keep Accept and Reject. "Show in text" on an old card brings its change back to the text. The thread menu has "Dismiss old proposals (3)", which rejects them (with Undo). The planning sync thread has its own review: all its proposals are current.
- **Proposals in the text** (`src/renderer/src/features/editor/inlineProposals.ts`). Every current pending change of the open thread to a chapter or to a planning entry shows in its text (the chapter editor, or the note editor of the entry) as a word diff, with the pills "Accept" and "Reject" after it. The card and the text show the same proposal: a decision in one place sets the hunk state, and the other place follows. A passage that is not in the chapter once (the user changed it, or it occurs two times) does not show in the text; the card still shows it. When two proposals change the same words, the newest one shows; the card of the older one says "A newer proposal changes the same text." A change with an empty `<find>` adds text at the end: its new paragraphs show after the last paragraph.
- "Show in text" on a change, and a click on the name of a proposal, call `revealProposal`: it scrolls from where the user is to the change and marks it for a moment. It never decides the proposal. From another page (Plan), or for a chapter far from the screen (no editor yet), it opens the chapter first (`selectChapter`) and goes to the change when the editor of the chapter is there. A change with an empty `<find>` goes to the end of the chapter.
- **A new reply goes to its change, but never while the author types.** When a new reply of the thread that shows in the chat has chapter proposals, the text scrolls to the newest one. When its first change is for a planning entry (or for the story line), the app opens that page. While the author types (the focus is in a text field or an editor outside the chat panel, or a key went down there in the last 4 seconds, `features/chat/typing.ts`), the app does not move: a toast "Changes ready · Show" waits, and the move happens only on "Show". A reply of a thread that does not show (another thread, a new thread, the thread list) never moves the author. The replies of the planning sync never move the author.
- The text of an editor has a paragraph for each list item, without its mark ("- ", "1. "). The passage of a proposal is compared in the same form (`markdownToPlainBlocks` in `src/shared/book.ts`), so a change to a list in a note shows as a diff.
- A `<portrait>` of the open thread that waits shows on the page of its entry, in the place of the portrait, with a green ring, "Use" and "Reject". A click on a portrait opens it whole (`ImageViewer` in `features/chat/ChatImages.tsx`, also for the images of the chat); "Change" under the portrait chooses another image.
- **Undo of an accepted change.** The app remembers the chapter changes that the author accepted in the session. When the text of the chapter shows the old words again (Ctrl+Z), the change is pending again and shows in the text; when the new words come back (Ctrl+Y), it is accepted again. Ctrl+Z with the focus outside a text (for example on the Accept button of the chat) undoes the last accepted change in its chapter.
- A reply with two or more open proposals has a bar for all of them ("Apply all 3", "Reject all"). The icon and the text take the free room of the line; the buttons go to their own line when they do not fit beside the text, and there they share the width. When the two buttons do not fit side by side, each one takes a line, so a button is never cut. The files line shows three names (with "…" when they are long) and then a count of the others ("+29"); a tooltip shows all the names. The `chatview` scenario checks 32 proposals with long names at 320 to 680 px.
- An accepted `<create>` that replaces an entry keeps the old entry file in the message (`ChatMessage.replaced`). Before the decision, the card of such a `<create>` shows a diff of the note (summary, other names, text) and says what the note loses: other names, fields and sections (`noteReplace` in `src/shared/proposals/replace.ts`).
- **Undo.** Accept, Create, Replace, Use and "Apply all" show a toast with Undo. For notes, portraits and "Apply all", Undo takes the change out of the book where the text of the AI is still there (`undoAccepted` in `features/chat/undo.ts`, with the code of the rewind). Reject, "Reject all", Dismiss and the Reject pill in the text also show a toast with Undo, which sets the proposals back to pending.
- **Not found.** A change that was not found has "Try again" (after the author fixed the text) and "The text it looks for".
- **Copy and Insert.** Copy and "Insert at cursor" take the prose of a reply only (`replyProse`): never proposals and never words about them. Insert puts new paragraphs after the paragraph of the cursor; a selection stays. A reply with proposals has no Insert.

#### Rewind, Edit and Retry

`src/renderer/src/features/chat/rewind.ts`. A rewind removes the messages after a message of the user. Edit removes the message and the messages after it, and sends the new text. Retry removes the last reply and asks again. When removed replies had accepted proposals, the app asks first and can undo them:

1. It saves a version of each changed chapter ("Before restore").
2. It undoes each change from the newest to the oldest (`revertChanges` in `src/shared/proposals/revert.ts`): the old text goes back only where the text of the AI is still there, once and unchanged. Other words of the user stay.
3. A new entry from the AI goes to the trash of the book. A replaced entry gets its old file back. In both cases only when the entry still has the text of the AI.

The digest of the thread starts again when it covered removed messages.

#### Thread states

The thread list shows a state for each thread (`src/renderer/src/features/chat/status.tsx`): proposals of the current replies wait for a decision, a reply that the user did not see (`Thread.readAt`, set when the thread shows in the open chat), or a reply in progress. The chat button in the title bar has a dot when the chat is closed and a thread needs the user.

Delete thread stops its reply in progress and moves the thread file to `.wordelia/trash/` of the book. A toast has Undo (`restoreThread`).

Each reply keeps its tokens and its cost when the provider tells them (`ChatMessage.usage`, from the `usage` events and the result). The line of the model under a reply shows them, and "Title and purpose" shows the total of the thread. A failed reply keeps the kind of its error, the words of the provider and the provider (`ChatMessage.errorKind`, `errorDetail`, `provider`). Its error box shows the plain message of `describeError` (`src/renderer/src/lib/ai.ts`), "Details", and the fix button of the kind (for example "Open settings", which opens the row of the provider).

A failed or empty reply never goes back to the AI (`chatHistory` in `src/shared/prompts/chat.ts`): an API refuses an empty turn, and then each later message of the thread would fail. Two turns of the author in a row become one turn. A reply that ends after its book closed goes into the thread file of its book.

#### The chat panel

`src/renderer/src/features/chat/ChatPanel.tsx` shows one of two views. `useChat.listOpen` selects the view.

- **Thread view.** The header has a back button (←), the title and the options. The back button opens the thread list. It has a dot when another thread needs the user. A click on the title opens "Title and purpose". Under the header, the purpose strip shows the brief of the thread. It gets a shadow when messages scroll under it. Then the messages and the composer.
- **Thread list.** The threads of the book that have messages, in the full height of the panel: the pinned threads first, then the most recent. Each row shows the state, the time, one line (the state, the brief or the digest) and an options menu. No row looks selected: while the list shows, the user is in no thread. The row with the keyboard focus shows a focus ring. The search ignores accents. The arrow keys move through the list, Enter opens a thread, and Esc goes back to the open thread. A thread does not count as seen while the list shows.

`setActiveThread` closes the list. A quote, a mention from outside the chat, and Review of the planning sync also close it, so the composer or the thread shows.

#### New threads

A thread exists only after its first message (`src/renderer/src/features/chat/threads.ts`).

- "New thread" shows a blank thread (`useChat.blank`). The blank thread is not in the book, not in the thread list, not in the "@" list and not on disk. `activeThreadId` keeps the thread that was open before, so Esc in the thread list goes back to it.
- The title, the purpose and the model of the blank thread stay in the chat store (`saveThreadChange`). The first message saves the thread with them (`sendMessage`).
- The thread list, another thread and a book change remove the blank thread, unless the user gave it a title, a purpose, a model or a draft. Then it stays in the chat store (`useChat.kept`, for each book, in memory) and shows in the thread list ("No messages yet") until its first message. Esc in the list goes back to it.
- With no open thread (a book without threads, or after the open thread is deleted), the chat shows a blank thread.
- When a book opens, the chat shows the most recently changed thread with messages. The app also deletes the empty threads that older versions saved: no messages, no purpose, the default title. An older empty thread with a purpose stays on disk, but it does not show.

#### Scroll

`useFollowEnd` (`src/renderer/src/features/chat/follow.ts`) keeps the end of the thread in view.

- When the user sends a message, and when a thread opens, the chat goes to the end at once.
- A `ResizeObserver` watches the messages and the scroll box. When their size changes, the chat goes to the end again before the browser paints. This covers a font that loads late, a quote, the thinking line, and the text of a reply while it streams.
- The chat follows changes of the messages while a reply streams, and for 1.5 s after a jump or after a reply ends. At rest, a change of the messages (for example, the user opens the thinking of a reply) does not move the view. When the view is at the end, a change of the scroll box (for example, a taller composer) keeps the end in view.
- A scroll up stops the follow: the wheel and the keys (Up, Page Up, Home) stop it before the scroll starts, so a change of size cannot pull the view back in the middle of the scroll. A scroll down to 40 px or less from the end starts it again.

#### The composer and mentions

The composer (`Composer.tsx`) and the edit box of a sent message use `ChatInput.tsx`: a small TipTap editor with a document, paragraphs, text, hard breaks, undo and an inline `mention` node (an atom with `kind`, `id` and `label`).

- "@" and up to 30 letters after a space open the list of chapters, entries and threads. Up, Down, Enter, Tab and Esc work in the list. The choice becomes a pill in the text, with a space after it. Backspace (or Delete) next to a pill removes the whole pill.
- Enter sends. Shift+Enter starts a new line. A paste is plain text.
- The draft stays in the chat store as TipTap JSON (`draftDoc`), with its text (`draft`) and its mentions. Code outside the composer (a suggestion, "Mention in chat", "Ask the chat about this entry") changes the draft through the store and increments `draftRev`. Then the composer loads the draft and puts the cursor at the end.
- Each thread has its own draft (text, mentions, quotes and images), for each book (`useChat.drafts`). When another thread shows, its draft comes back; the composer loads it without the focus (`draftQuiet`). A suggestion never takes the place of a typed draft: it goes on a new line after it. An image that the author takes out of a draft goes to the trash of the book, when no message, note or other draft uses it.
- The list finds other names of a note ("@keep" finds Elias, "the keeper") and names with spaces ("@Saint I"); the first character after "@" is not a space (`features/chat/mentions.ts`). The list does not offer the thread of the composer.
- `src/renderer/src/features/chat/draft.ts` reads and writes the draft (pure functions with tests). A sent message keeps the text with each mention as "@Label", and `mentions` with the ids. The prompt builder reads the ids, as before. The chat finds "@Label" in the text again (`splitMentions`) to show each mention as a pill in its place. Older messages have their mentions apart from the text: the chat shows these above the text.

### 5.4 Actions

An action sends: the writing rules, the action instructions, N characters before the selection, the selection, and N characters after. The AI returns `<rewrite>...</rewrite>`. The editor shows a word diff as decorations on the page. Accept replaces the range in one transaction.

#### The review of an action

`runAction` (`features/actions/runAction.ts`) runs the action, and `review.ts` with `ReviewBar.tsx` shows the result.

- **The rewrite.** A reply without `<rewrite>` tags has no rewrite: the toast shows the words of the AI, and the text does not change. `tidyRewrite` keeps the paragraphs of a rewrite: each new line starts a paragraph (the text of a chapter has no soft line breaks), and a scene break that the AI wrote inside a line goes back on its own line.
- **The diff.** `reviewText` gives the text of the passage with its scene breaks ("* * *"), its paragraph breaks and the formatting of each character. The rewrite goes through the same function after the parse that Accept uses. `styledDiff` compares the two, so a joined paragraph (a struck "¶"), a removed scene break (struck through) and removed italics show. `diffStats` counts words, else punctuation, else paragraph breaks: a real change is never "+0 −0". The chat proposals use the same drawing on plain text.
- **The lock.** Only the passage is locked, while the AI works and while the change waits. The author can write in the rest of the chapter; the range follows the edits. Enter and Ctrl+Enter accept, Esc rejects (or stops the AI), and Tab goes to the review bar, only when the cursor is in the passage. A refused key gives a short cue on the bar.
- **One review in the book.** `useReviewHost` keeps the editor of the review. The bar stays with its review, also when the cursor goes to another chapter. A new action ends the other review and stops its request. Each run has its own request and word counter. The action again with the cursor in the passage (or on the bar) is a retry on the same passage.
- **The bar** sits in room above the paragraph of the passage (`.review-room`), so it covers no text. Only its state is a live region for screen readers.
- **The end.** Reject, an error and a reply without a rewrite give back the selection of the author. Errors have "Try again", or "Open settings" for a provider that is not connected. A review whose editor closes (the Plan view, a chapter far from the screen) waits, and shows again with its editor when the text did not change.
- **The model.** An action whose provider is not on this computer (a book action from another computer) uses the model of Actions (`actionRoute`).
- **Writing rules.** `rulesForAi` (`src/shared/ai/defaults.ts`) leaves the notes and the "(Example: …)" lines of the rules template out of every prompt.
- **The scripted AI** (`src/main/ai/mock.ts`) keeps the paragraphs of a passage. Action instructions with "one paragraph", "without italics", "only a comment" or "scripted error: <kind>" give those replies, for the `review` scenario.

The built-in actions are Polish (the main action, Ctrl+J), Tighten (Alt+2), Fix grammar only (Alt+3) and Show, don't tell (Alt+4) (`DEFAULT_ACTIONS` in `src/shared/ai/defaults.ts`). Each one edits the words of the author and adds no new material. Expand left the defaults in version 0.7 (`RETIRED_ACTIONS`): settings version 5 removes it when the author did not change it (the same name, instructions, icon, model, effort, context and shortcut, and it is not the main action). A changed Expand stays, and its name and instructions still show in the interface language. The shortcut Alt+5 becomes free; the other actions keep their shortcuts.

Each action has its own keyboard shortcut (`AiAction.shortcut`, for example "Ctrl+J"). `src/shared/ai/shortcuts.ts` reads key presses, keeps one text form and finds conflicts with other actions and with the keys of the app and the editor (`RESERVED_SHORTCUTS`). `useActionShortcuts` runs the action of a shortcut in the Write view. Settings version 4 gave the actions of old settings the keys that they had by position: Ctrl+J for the main action, Alt+2, Alt+3… for the others. See `docs/decisions/0003-action-shortcuts-and-builtin-instructions.md`.

#### Actions for all books and for one book

The global actions are in the app settings (`AppSettings.actions`). The actions of one book are in `ai/actions.json` in the book folder (`{ "actions": [...] }`), so they go with the book. The main process reads the file when the book opens (`BookSnapshot.actions`). The book store keeps the list (`useBook.actions`) and writes the file (`setActions`). A change from outside (a sync client) loads the file again. `src/shared/ai/scopes.ts` has the rules, with unit tests. See `docs/decisions/0004-book-actions.md`.

- **One list.** The open book uses the global actions, then its own actions (`mergeActions`; `useAllActions()`, `allActions()` and `findAction()` in `features/actions/allActions.ts`). The selection menu, the shortcuts, Retry, the review bar and the keyboard list in Settings → General use this list. Without a book, the list is the global actions.
- **Settings → Actions.** Two groups: "All books" and, when a book is open, "This book". Each group has its own "New". The field "Use in: All books | This book" moves the selected action to the other group (`addToGroup`). A move to the book asks first, because the other books lose the action. A move to all books does not ask. Move up, Move down and Alt with the arrow keys change the order of an action in its group. A name or instructions that wait to be saved are saved when the settings close; an empty name is not saved.
- **Shortcuts.** The recorder checks the two groups: it refuses a shortcut that an action of the other group has. A new action gets a shortcut that is free in the two groups (`freeShortcut`). Two actions can still get one shortcut: a global shortcut that the author set while another book was open, or a book from another computer. Then the book action wins inside its book: in the merged list, the global action has no shortcut. Settings → Actions shows the shortcut of the global action struck through, and under its shortcut field: "In this book, Alt+2 runs “Narrator voice”." A move loses the shortcut only when an action of the other group has it; a toast tells.
- **Built-in actions** can move to a book. A moved action stays the same: a built-in action stays built in (the file can mark only the ids of built-in actions as built in), so its name and instructions still show in the interface language, and it can go back without a change. "Restore the built-in actions" puts all built-in actions back in the global group, also one that moved to the open book. An own action of the open book loses a shortcut that a built-in action gets back. A global action with the id of a book action is left out of the merged list: the book action wins.
- **The main action** (`defaultActionId`, Ctrl+J by default) is a global setting, and it cannot move to a book or be deleted. Thus the first button above the selection and Ctrl+J do the same thing in every book. A main action of one book would leave the other books without a first button.
- The review bar shows the name of the action as the settings show it (`actionName`), also for an action of the book.

### 5.5 Thread digests

After each AI reply, a background job (Background route) updates the digest of the thread: the old digest plus the last exchange gives the new digest (12 bullets or fewer). The digest waits for the decisions of the author: it covers the messages up to the first current reply with proposals that wait (`digestEnd`). When the author decides them, the digest runs again 2.5 seconds after the last decision (`features/chat/digest.ts`). The title from the AI never takes the place of a title that the author set while the AI worked.

### 5.6 Planning sync

`src/renderer/src/features/plan/sync.ts` has the job. `SyncPanel.tsx` has the controls of the Plan view.

1. Find the chapters whose content hash changed since the last sync.
2. Send them with the planning index and the related entries, in parts of 60,000 tokens or fewer.
3. The AI returns `<create>` and `<edit>` proposals for planning files only.
4. After each part, `ai/sync-state.json` gets the hashes of the chapter texts that the AI read. A chapter that the author changes while the sync runs still waits for the next sync.
5. The user reviews the proposals. Accepted proposals update the files.

The sync is a background job. `useSyncJob` keeps its state: idle, running, done or failed.

- **Start.** The sync button ("Update notes") in the Plan sidebar starts it. With the sidebar hidden, the overview and the category pages show the same button. "Build the planning from the manuscript" (on the overview and on the empty map, when the planning has no entries and a chapter has text) and the import dialog start a sync of all chapters. The chat does not open, and it keeps its thread.
- **Progress.** The sync button shows a spinner, "Updating the notes…" and one line: "Reading 3 chapters…" until the reply starts, then the count of complete changes ("2 changes so far…"). With more than one part, the line starts with "Part 1 of 2". The × button cancels. A cancel keeps the complete changes of the replies, and the chapters of the stopped part still wait.
- **Result.** A card under the Sync button shows the result: "8 changes proposed to the notes", the names of the notes, Review, Accept all and Reject all. The toasts of the two have Undo. The Undo of Accept all writes the notes of before back, moves a new note to the trash and makes the changes wait again; it stops when a note changed after the changes. The card goes away when no change waits for a decision (in the card or in the chat), or with its × button. Without changes, the card says that the notes agree with the chapters. An error shows in the card, with Try again, or with Open settings when no AI is connected.
- **Away from the Plan view.** When the Plan sidebar is not on screen (another view, or a hidden sidebar), a toast tells the start of a sync (for example after an import) and its result. The Review action of the result toast opens the changes.
- **Review.** The proposals stay in the "Planning sync" thread. Thus the proposal cards, Apply all and the inline diffs work on them as on other proposals. Review opens the chat on that thread. Review does not open the first changed note, because the thread shows all changes in one place, also new notes that have no page yet. Also, the sync thread becomes the open thread, so the notes show its changes inline.
- **Up to date.** When no chapter changed, the Sync button looks off and its tooltip says "Up to date". The button has `aria-disabled`, not `disabled`, so it stays focusable and its tooltip shows. A sync of all chapters is only "Build the planning from the manuscript", for a planning without entries.
- Another book stops the sync and clears its result.

### 5.7 Interface languages

The interface is in English (the default), Portuguese (Brazil) and Spanish (`AppSettings.language`). The texts are in `src/shared/i18n/<locale>/<namespace>.ts`. The translations have the type of the English texts, so a missing key is a type error. React code uses `useT()`, other renderer code `getT()`, and the main process `mainT()`. Rules and a terms table: `src/shared/i18n/README.md`.

Some texts are stored in English and translated only when the app shows them, so that a book looks the same in every language: the title "New thread" (it also tells the app to make a title), the title and the purpose of the planning sync thread, and the labels of chapter versions ("Opened", "Before Polish"). Built-in actions and default categories show translated names until the user renames them (`actionName`, `categoryName`). The instructions of built-in actions also show in the interface language until the user changes them, and the AI gets that same text (`actionInstructions`). Effort names (Low, Medium, High…) are translated for display; the settings keep the English id.

The language of a book is a different setting. It controls the AI output, the dialogue style, the chapter word (the label "CAPÍTULO" above the number on the page, "Sem título" for a new chapter, "Capítulo Um" in an export heading), spell check, hyphenation (the page has `lang` = book language) and export. AI prompts stay in English.

## 5.8 App updates

`src/main/updater.ts` uses electron-updater with the GitHub provider (`publish` in `electron-builder.yml`: the public repository `lorenzoa7/wordelia`). The build writes `latest.yml` and puts `app-update.yml` in the app resources. The release workflow uploads the installer, its blockmap and `latest.yml` to the GitHub release.

- The installed app looks for a new version 15 seconds after start and then every 6 hours, when `AppSettings.autoUpdate` is on. Settings → General → Updates also has a manual check.
- The app downloads the new version in the background. Then the title bar shows "Update ready" and a toast offers "Restart now".
- "Restart now" closes the window through the normal close path, so the renderer saves everything first. Then `quitForUpdate()` runs the installer without questions and starts the new version. When the writer keeps the window open (some text was not saved), `cancelUpdateInstall()` makes a later quit a normal quit. When the user quits without a restart, the update installs on quit, but only while "Download updates automatically" is on (`onSettingsChanged` in `src/main/settings.ts`).
- General → Updates shows plain words for an error ("no internet connection" or "try again later"). The text of the updater is in the tooltip of the line.
- Updates are off in development, in test runs (`WORDELIA_E2E=1`) and on other platforms. The state reaches the renderer as the `app:update` event (`UpdateState`).

## 6. Settings and secrets

App data folder (`app.getPath('userData')`):

- `settings.json`: theme, editor preferences, providers, model routes, the actions for all books. The actions of one book are in its folder (§5.4).
- `library.json`: known books. Each card keeps the title, the author, the words, the chapters, the pages (an estimate, see §7a) and the first words of the book (`bookFacts` in `src/main/library.ts`). The main process writes them when a book opens, when it closes (after the renderer saved everything), and when the window closes with a book open. A card of an older version without pages gets them the next time the library shows: the main process reads the book from its folder one time.
- `secrets.json`: API keys, encrypted with `safeStorage`. Without the key store of the system, `setSecret` saves nothing and `ai:setKey` returns a message. Settings → AI removes a key ("Remove key", which also turns the API off) and does not keep a key that the API rejects.

## 7. Export

- **PDF:** the main process opens a hidden window with print HTML and CSS paged media (`@page` size and margins, margin boxes for page numbers, `break-before: page` for chapters). `webContents.printToPDF` writes the file.
- **DOCX:** `docx` builds a document with named styles: Normal, First Paragraph, Chapter Number, Chapter Title, Scene Break. Page size, margins and a page number field in the footer. The title page is a separate section without a page number.
- **Presets** (`src/shared/export/model.ts`). The Book preset has the pages of the Write view: the page size and the margins of the book (Settings → This book) and the book typography (font, size, line height, indent, alignment, the indent of the first paragraph, the space between paragraphs). So the Book PDF has the pages that the author sees, plus the title page. The Manuscript preset has the standard format: A4 (US Letter for `en-US` or when Letter is chosen), 1 in margins, Times New Roman 12 pt, double spacing, "Surname / TITLE / 12" at the top right. Without the running header, the page number alone is at the top right; the title page ("about 80,000 words", "by …") is in the language of the book.
- **An export never changes the page of the book.** The dialog starts from the choices of the last export (`startExportSettings`) and keeps them with the book after an export, but never the page size and the margins (`exportSettingsToKeep`): these are the page of the Write view.
- **Alignment.** A paragraph with an alignment that differs from the book alignment keeps it (also "left" in a justified book).
- **Markdown and plain text** (`src/shared/export/text.ts`) come from the document, not from the Markdown of the chapters. Markdown has only standard Markdown: a heading in a chapter goes under the chapter title (`###`), and the marks that only Wordelia reads (`{align=…}`, `[text]{size=18}`, `<!-- page break -->`, `&nbsp;`) go. Plain text has real line breaks, the scene break symbol of the book typography, and no Markdown signs.

## 7a. Pages on screen

The Write view shows the manuscript as pages, like a word processor (`src/renderer/src/features/editor/PageEditor.tsx`).

- **Page geometry.** A page has the page size and the margins of the book (`export.pageSize` and `export.margins`, Settings → This book; A5 by default), at the zoom of the screen. An export never changes them (§7). The screen shows a right-hand page: the inner margin is on the left, the outer margin on the right. A page has a fixed width; when the desk is narrower than the page (a narrow window with the two side panels), the pages scale down to the width of the desk (`fitScale` in `zoom.ts`), so the page always fits. The zoom of the author multiplies this fit. The chapter heading also follows the zoom, so a page holds the same text at every zoom. The heading shows "CHAPTER" (in the language of the book), the number and the title; a new chapter has a title without a number ("Untitled"), because a number in a title is wrong after the chapter moves.
- **Zoom** (`zoom.ts`, `ZoomControl.tsx`). Ctrl+= and Ctrl++ zoom in, Ctrl+- zooms out, Ctrl+0 goes back to 100 %, Ctrl+wheel zooms; the toolbar has a slider (a double click goes back to 100 %). The pages are always laid out at 100 %: the zoom is a CSS transform of `.desk-inner`, and `.desk-zoom` around it has the scaled size, so the desk scrolls. A change of zoom never moves a word or a page break. It is an animation of 260 ms on a log scale, around the reading line (or the mouse); a new zoom stops the animation to the old one. Code that measures inside the pages divides positions on screen by the scale (`scaleOf`). The review bar is outside the scaled pages, so it keeps its size.
- **Page numbers and exact page counts** (`pageCounts.tsx`). Each page shows its number in the bottom corner: a CSS counter, which each chapter sheet starts at the pages of the chapters before it. A chapter on screen reports its pages after each measure; a chapter far from the screen is drawn in a hidden sheet with the same layout and counted with the same rule (`cutPages`). The chapter list shows the pages of each chapter, and the library card gets the exact total of the book (`library:pages`; the card keeps it while the words do not change, else it shows an estimate with "≈").
- **Typewriter mode** (Settings → General). The line of the cursor stays at 42 % of the desk height while the author types. The desk eases towards that height frame by frame; there is room after the last page for it.
- **One scroll for the book.** Every chapter is a sheet that starts on a new page. The sheets follow one another. Each chapter has its own TipTap editor (its own undo history). A chapter far from the screen (more than about two screens) has no editor: it keeps its measured height, and its last editor state (the undo history, the cursor, the text) stays in `keep.ts`; the next editor of the chapter takes it back (`EditorState.reconfigure` keeps the history field). The chapter at 30% of the screen height is the active chapter in the sidebar. The toolbar and the actions stay on the chapter with the cursor. `selectChapter` scrolls to a chapter (`chapterJump`); `setActiveChapter` only marks it. A new order of the chapters (a drag) keeps the chapter on screen at its height. Focus mode lights the paragraph of the cursor in the chapter with the cursor only (`.page.is-current`).
- **Write and Plan.** The Write view stays mounted under the Plan view (`BookView`), hidden and inert, so the scroll, the editors, the cursor and the undo history are there when the author comes back; the editor that had the focus gets it back, unless a jump (for example a chat proposal) goes to another chapter. Its keys (find, zoom, Ctrl+Z of an accepted proposal) work only while it shows.
- **Text from the store** (`keep.ts`). A chapter file that another program changed, or a restored version, goes into an open editor as one replace of the part that changed (`reloadTransaction`), so the cursor moves with the text and the undo history stays. A change from outside does not go into the undo history; a restore is one undo step.
- **The place of the author** (`features/write/place.ts`, `deskPlace.ts`). For each book folder, the local storage of the app (the app data folder, not the book) keeps the view, the chapter at the top of the desk, how far down its sheet, and the cursor. A book opens there; a book without a place opens with the cursor at the start of its first chapter, so keys go to the text at once.
- **Page breaks** (`pagination.ts`). After each layout, a plugin measures the line boxes of the chapter (from the rectangles of its text) and puts a page gap where a page is full. A gap between paragraphs is a block widget. A gap inside a paragraph is a full-width inline-block: it makes a soft line break, so the line before it stays justified. The plugin works in "flow" coordinates (the y of a line minus the gaps above it), so the result does not depend on the gaps on screen. A break never splits a word. The chapter heading takes the top of the first page. When a change makes the editor taller or shorter (a new line), the plugin measures in a microtask, before the browser paints, so a new page shows at once. Other typing measures after a pause of 120 ms.
  - The measure hides the gaps (`.is-measuring`) and reads the free flow of the text. A gap inside a paragraph forces a line break: if it took part in the measure, a gap in a wrong place would keep itself there. The plugin keeps the scroll position of the desk during the measure, because the desk is shorter without the gaps.
  - A line with only a line break (Shift+Enter) counts as a line. A page break node (`pageBreak`, Ctrl+Enter) has no height and no mark, and it is never selected: the block after it starts a new page, and the rest of the page stays empty. Like Google Docs: Backspace at the start of the new page removes the page break at once; when the new page has only an empty paragraph, the paragraph goes too, and the cursor goes back to the end of the text of the page before. Delete at the end of the page before removes the page break and an empty paragraph after it. Ctrl+Enter on an empty page makes one more page (an empty paragraph keeps the empty page). A plugin removes a page break that follows another one or that ends the chapter, because it makes no page.
  - Gap heights are in CSS pixels at zoom 1 times `--page-zoom`, so a new zoom shows in one frame.
  - A new page that an edit makes (a page break, or text that grows past the last page) comes in like a new sheet on the desk (`--dur-page`, not with reduced motion). The page before it has its full size at once: every page has the size of the book page, also during the movement. A veil in the color of the desk covers the band and the new sheet and fades out, and the desk scrolls to the cursor in the same movement when it is low on the screen. ProseMirror draws a gap again at each key in its paragraph; the progress is in the plugin state (`Arrival`), so a new element starts where the movement is. `newPage` finds the page: the last break before the cursor, when it is new and it is a page break or a new last page (a line that goes to a page that was there before is not a new page). A page that an edit removes goes at once, like Google Docs: what is under it is in its last place in the first frame. (Versions 0.8.3 and 0.8.4 had a movement for it; at the end of the book the desk is at its bottom, so the browser had to move the whole page above down while the space closed. It was removed.) The plugin keeps the number of breaks of the last measure (`measured`), because a deleted page break leaves the list of breaks at once. The measure runs at once when the editor changes its height or its number of blocks. A gap whose place is deleted leaves the list of breaks too, so the next measure draws it again (a page break that was removed made a page too tall). A break moves only the line that does not fit, like Google Docs; Word also keeps two lines together at the top of a page (widow control), and the editor does not.
  - The first Backspace at the start of the page after a page break selects the page break and shows its mark ("Page break"); the second removes it. A selected scene break has a ring.
- **Registry** (`registry.ts`). The mounted editors, by chapter. The toolbar, the selection menu, the review bar, the find bar and the actions use the active editor (`useActiveEditor`). `applyToChapter` changes a chapter in its editor when it is mounted, else in the store. `locateInChapter` and `chapterHasText` find a passage for "Show in text".
- **Find** searches the active chapter, scrolls to each match, and goes on into the next chapter that has a match. A new search shows the nearest match after the cursor; Enter right after typing goes to that match (the search of the box is made first). Escape and the close button leave the text where it is: the cursor goes to the match on screen, and the editor gets the focus without a scroll. Replace selects the next match after the new text (also when the new text has the search text) and stops after the last one; Next goes back to the start. "Replace in all chapters…" (`replaceBook.ts`) asks first, with the count for each chapter; a chapter with an editor changes there (one undo step), a chapter without one changes in the store. The toast tells the result and has an Undo, which puts back each chapter that did not change after the replace.
- **Paste** (`paste.ts`). Pasted text gets the quotes, the dash and the ellipsis of the book. From Google Docs or Word, bold, italic, underline and a centered or right alignment stay; fonts, sizes, colors and a left or justified alignment go. "***" and "* * *" become scene breaks; empty lines and images go.
- **Page estimate** (`src/shared/export/pages.ts`, pure, with tests). The library card shows "≈ 214 pages" for books that are not open, so the main process cannot measure the screen. It follows the page on screen instead: the text width and height from the page size and the margins, the line height from the font size and the line height of the book typography, the first-line indent and the space after a paragraph, the chapter heading on the first page of each chapter (183.7 px for 12 pt), scene breaks (their margins collapse with the space of a paragraph), and page breaks. Words fill each line, and a word never breaks (the app has no hyphenation). A word is its number of characters times the average character width of the font (`FONT_WIDTHS`: measured with the canvas of the browser on the sample prose, then fitted by 1% or less to the line breaks of the browser at ten widths). So the estimate also counts the short last lines of dialogue. For real-looking chapters in six layouts, the estimate was within 10% of the pages on screen, most often exact (`pages.test.ts`). The `library` scenario compares the card with the pages that the Write view shows.

## 7b. Planning map

The Plan overview has a switch: "Cards | Map". The map shows the planning as a graph (`src/renderer/src/features/graph/`).

- **Page.** The map page is a `.plan-scroll` too. It has the same column as the cards and the category pages (`--plan-w`, 980 px), the same padding and the same scrollbar gutter (`scrollbar-gutter: stable`), but it does not scroll. Thus the title and the switch stay in place when the user switches. The two buttons of the switch have the same width (a grid with `1fr` columns). The `graph` scenario measures the switch, its buttons and the title on the two pages, with the chat open, the chat closed and the sidebar closed.
- **Links** (`src/shared/planning/graph.ts`, pure, with tests). Entry A links to entry B when the summary or the notes of A use the name or an alias of B, or `[[B]]` (also `[[B|text]]` and `[[B#Heading]]`). The match is on whole words and ignores case. Accents count: "Pará" does not match "para". A name with fewer than 3 letters does not count, but a `[[link]]` to it does. When names overlap, the longest name wins. The weight of a link is the number of mentions in the two directions. With the "Chapters" chip, each chapter is a node too, and it links to the entries that it mentions.
- **Layout** (`layout.ts`). d3-force with these forces: links, repulsion, a pull to the center (stronger up and down on a wide stage), collision, and a force that keeps the box of each node and its label away from the other boxes. A label keeps its size on the screen, so at a zoom below 1 it takes more room in the world. When all labels show, the canvas sets `labelScale` (1 to 1.5) from the zoom of the fit, and the label force uses it. Entries without links are not in the simulation: they sit on ellipses around the linked entries. The app runs one tick for each animation frame. With reduced motion, the layout runs to the end at once.
- **Drawing** (`MapCanvas.tsx`). SVG. React draws the nodes, the edges and the labels once. Each frame sets their positions directly in the DOM, and it writes an attribute only when its value changes. The labels are on a layer above the nodes, in screen units: each frame puts each label under its node, so the labels keep their size at all zoom levels. Do not use a CSS variable that changes on each frame (for example the zoom): it restyles all the elements of the map, and the frames get slow. All labels show when the map has 40 nodes or fewer (at zoom 0.45 or more), or at zoom 1.1 or more; else only the labels of the 14 nodes with the most links show. With 300 entries, a frame takes about 12 to 16 ms on average while the map settles, p95 17 to 22 ms (`MAP_PERF=1 node scripts/shot.mjs graph --en`; version 0.5 took 15 to 21 ms, p95 22 to 28 ms, on the same computer).
- **Hover.** The node under the pointer and its neighbors stay; the rest of the map goes pale. A hover does not restyle each node. The pale map is three groups (`.map-edges`, `.map-nodes`, `.map-tags`), and their opacity fades in `--map-fade` (180 ms, ease-out). Above them, a focus layer has copies of the node, its neighbors and its edges, with the highlight. The copies do not catch the pointer, and `paint` moves them with their nodes. There are two focus layers: when the pointer goes to another node, the old layer fades out while the new layer fades in. A layer that is off drops its copies after 400 ms. React draws the map itself once (`useMemo`); a hover draws only the focus layer. With reduced motion, there is no fade (`base.css`). With 300 entries at rest, a hover frame takes 6.8 ms on average, p95 7.5 ms (`MAP_PERF=1 node scripts/shot.mjs graph --en --motion`). Version 0.6 took 27 ms, p95 60 ms and up to 195 ms, because each hover drew all nodes again and faded each node.
- **Nodes.** An entry is a paper token: a soft shadow (one radial gradient), a disc of paper with a little of the category color (`--map-tint`), a ring in the category color with some ink (`--map-deep`), and the Phosphor icon of the category (`CategoryDef.icon`, bold). The icons are `<symbol>` elements in one sprite in `<defs>`, one for each icon on the map. Each node has one `<use>`, not an icon component. Near the map (zoom 1 or more), an inner ring shows too, like the rim of a seal. A chapter is a small closed book: a cover (`--map-book`), a spine, a red ribbon and its number. The radius grows with the number of links: 9 to 21 for an entry, 11 to 16 for a chapter (half the height of the book).
- **Level of detail.** The SVG has `data-lod` (`near`, `mid`, `ml`, `far`, `tiny`) from the zoom, and each node has `data-size` (`s`, `m`, `l`). An icon shows only when its token has a radius of 6 px or more on the screen. The shadows show from zoom 0.5. A token without its icon gets more of its category color. The attribute changes only when the zoom goes past a limit, so a frame does not restyle the nodes.
- **Stage.** The sheet has the paper color (`--map-ground`), a soft light in the middle (`--map-glow`), darker edges (`--map-vignette`) and the paper grain (`.grain`). The dot grid (`--map-dot`) is an SVG `<pattern>` in screen units (`dotGrid` in `layout.ts`, with tests). It moves and zooms with the map, but its dots keep a radius of 1 px. The step is 24 world units at zoom 1. It doubles or halves to stay between 14 and 28 px on the screen, and before it doubles, every second dot fades out. Thus the grid stays sharp at all zoom levels and never jumps. The pattern changes only when the view moves.
- **Navigation** (`nav.ts`). The map is the Plan page `activeCategory = ':map'` in the book store, and the story line is `':line'`. A folder name cannot have ":" on Windows. Each move to another Plan page records the page that the author leaves (`usePlanNav`, at most 50). Back (the back link, Alt+← and the mouse back button) goes to that page, as in a browser: a note that the author opened from a card of the story line goes back to the story line, and the line shows its view and its scroll as they were. The back link names the page ("← Story line", "← Map", "← Elias"). With no page to go back to, back goes one level up: a note to its category (a note in a folder under a category to that category, a note in no category to the overview), a category, the map or the line to the overview. Pages that do not exist any more (a deleted note) are skipped. Alt+← works also with the caret in a text box: the box saves first (on macOS, Option+← in a text box stays a text key). The overview and each category page keep their scroll for the session.
- The layout, the view and the filters of each book stay in memory for the session. The app does not save them.
- The colors of the categories are the tokens `--map-1` to `--map-8`, in the order of the categories. The palette was checked for color vision deficiency (adjacent pairs) and for 3:1 contrast on the paper, in the two themes. The other map tokens (`--map-ground`, `--map-dot`, `--map-glow`, `--map-vignette`, `--map-shade`, `--map-tint`, `--map-deep`, `--map-book`) have a light and a dark value.

## 7b2. Story line

The story line is a board of cards: each card is one event of the story. The board has two views of the same cards. Design: `docs/superpowers/specs/2026-10-20-story-line-board-design.md` (it replaces the first design with lanes and moments).

- **Storage.** A planning entry with `type: story-line` in its front matter (in `Entry.meta`). A book has one: the first entry with this type, by file name (`findStoryLine`). The first change on the board makes it in the plot category (`features/plan/line/model.ts`). Because it is an entry, the store, the watcher, the trash, proposals, undo and rewind work without new code. The category lists of Plan and the map leave it out; `selectEntry` of the story line opens the Line view.
- **Format.** The author does not see the body; the AI reads and changes it. `# Cards` has one line for each card (`- ^c1 text`). `# By chapter` and `# By order` have a `## title ^k1` heading for each column and, on the next line, the ids of its cards in order. `src/shared/storyline.ts` parses and writes it (pure, unit tests in `storyline.test.ts`). The parser also reads text that is not canonical: missing ids get new ones (`c` or `k` and the next number), a list item with text under a column defines a card there, the section words can be in Portuguese or Spanish, and the old format (lanes, moments, `→ [[Chapter]]`) becomes moments and chapter places. The app writes the canonical form when the author changes the board.
- **Views.** `boardView`: by chapter, the written chapters come first, in the order of the book, also with no cards; a heading matches a chapter by its title or file name (case, accents, `[[ ]]` and a number in front do not matter). The other headings are planned chapters, after them. By order, the moments in their order. A card with no place in a view is in the tray of that view ("No chapter", "No moment"), the first column; the tray shows only when it has cards.
- **You are here** (`hereKey`). By chapter: the last chapter of the book. By order: the moment of the last card of the last chapter that has cards in a moment. It does not depend on the open chapter.
- **Board** (`features/plan/line/Board.tsx`). dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`) with pointer events, not the HTML drag: a move of 5 px starts a drag, so a click opens a card. Space starts a drag with the keyboard; the arrows move the card; Space drops it. The drag image is a copy of the card with the same size; its tilt is inside a straight box, because the drag measures that box. Written chapters and the tray do not move; planned chapters move among the planned chapters; moments move freely. A drop calls `placeCard` or `moveColumn` and saves the canonical body.
- **Cards.** One size (`--line-card-h`), one gap. The text has at most three lines, then "…". A mention is the name, underlined, in one color; a click opens the note. The line at the bottom shows the place of the card in the other view. A card that is not in a written chapter has a dashed border. The dialog (`CardDialog.tsx`) has one size for every card: a text box of a fixed height that scrolls, the chapter and the moment (a long name is cut with "…"), the mentioned notes, Delete and "Open the chapter". Typed text is never lost: Esc (when the list of notes is closed), a click outside, the close button, a mentioned note and "Open the chapter" save it first; a toast says so, with Undo. Only Cancel drops it. "@" in a text box suggests notes (`MentionTextarea.tsx`). The board does not make mention names Tab stops: on the keyboard, Enter on a card opens the dialog, and its mentioned notes are buttons. In the text box, a mention that names a note shows in color: a layer under the box draws the same text with the mentions marked, and the text of the box is transparent (its caret and selection show).
- **Columns.** A "+" card under the last card makes a card; a "+" column after the last column makes a column (it is as high as an empty column). In these boxes, Enter or a click outside adds; Esc closes the box and keeps its text as a draft for the session (the "+" shows the start of it). A double-click on a title (or the menu) renames it; the column of a written chapter renames the chapter, and a toast says so, with Undo. Delete puts the cards of the column in the tray of that view. Delete has an Undo toast, which works only while the line is as the delete left it.
- **Tray button.** The board opens at "You are here", so the tray (the first column) can be out of sight. When the tray has cards, a button over the board says "No chapter · 3" (or "No moment · 3") and scrolls the board to it.
- **Planned chapters.** A new last chapter of the book ("New chapter at the end" under the chapter list, "Start the next chapter", or the "+" of the list on the last chapter) takes the title of the first planned chapter. Its column then becomes the column of the chapter, with its cards. The AI names a planned chapter in the style of the titles of the written chapters.
- **The page** does not scroll: the header stays and the board fills the space under it. The board scrolls sideways; each column scrolls down, with the scrollbar of the app. The header has the place of the headers of Cards and Map (the same top and the same scrollbar gutter), so the title and the switches do not move between the three modes.
- **AI.** The banner of an empty line opens a new blank thread with a draft ("Fill my story line from this information: "); the author completes and sends it. The prompt has a section "# Story line" with the whole entry, and the outline section says which chapter is the last written one and which cards the open chapter has. The protocol explains the format and how to change it (`<edit>` on whole lines, `<create>` to replace all, keep the ids).
- **Proposals on the board** (`features/plan/line/proposal.ts`, `ReviewBoard.tsx`). A proposal of the open thread for the story line (an `<edit>` of it, a `<create>` of its file, or a `<create>` with `type: story-line`) gives a proposed body: the current body with the hunks of the proposal, or the content of the `<create>`. `boardChanges` finds the changes between the line now and the proposed board, matched by id, then by text (a rebuild with new ids): a card or a column that comes (`place`, `column-add`), one that goes (`unplace`, `card-delete`, `column-delete`), a new text, a new title, a new place of a column. A move is two changes: the card leaves its column and goes to the other one. `reviewView` shows the board now with the changes: only green (comes) and red (goes), and a word diff for a new text. Each change has a bar with Reject and Accept; "Accept all" and "Reject all" are on the board and in the chat. The bar over the board says "16 changes"; its AI icon says where they come from. `applyBoardChange` applies one change to the line now (a new card goes after its nearest earlier neighbor; a card for a new column makes the column). At the first decision, the message keeps the line of that moment and the proposed body (`ChatMessage.lineBefore`, `lineAfter`): from then on, the changes of the proposal are the changes between these two lines. A later change of the line (a card of the author, another proposal) is never a change of this proposal, and a chapter rename changes the two kept lines too. The decisions are in `hunks['line:<change id>']`. `liveChanges` leaves out a change that the line does not need any more (a card that left its column by another way). A new place ends the old place of the card in that view (`impliedChanges`); a rejected new column rejects the new places in it (`cascadeRejects`). "Apply all" before any decision makes the line the proposed line; after a decision it applies the changes that wait one by one, new places before removals (`applyOrder`). New ids of the proposal keep away from the ids of the line (`parseBoard(body, taken)`), and a new card of the proposal never takes a card of the author with the same id. When no change waits, the proposal is accepted (when one change was applied) or rejected. The board cannot change until the author decides. A decision keeps the board where it is: the place of a view is the same with and without a proposal, and after a decision the column of the button goes back to its place on the screen (`anchor.ts`). The chat has one card for the story line changes of a reply, also when the AI wrote them in several parts; the bar of a reply counts them as one proposal.
- **Sync.** When a story line exists, the sync rules ask for cards for the events of the changed chapters, in their chapter and, when the text says it, in their moment.
- **Write view.** `StoryLineCard.tsx` under the chapter list: the cards of the open chapter, in order, and their moments. A click opens the Line view by chapter.
- **Renames.** When a chapter gets a new title, `renameChapterInBody` changes its "By chapter" heading. When a note gets a new name, the "@" mentions of its old name on the cards take the new name (`renameMentionsInBoard`, 7d).

## 7b3. Editor's read

The AI reads a chapter as an editor and leaves comments on passages. It never changes the text. Design: `docs/superpowers/specs/2026-10-21-editors-read-design.md`. The code is in `features/read/`; the pure parts are in `src/shared/comments.ts` and `src/shared/prompts/read.ts`.

- **Start** (`start.ts`). `startRead` finds the read thread of the chapter (`Thread.readChapterId`) or makes it ("Read · <title>"), and sends a visible author message with `read: ReadRequest` (the chapter, the lens, "in progress", and the selection when there is one). The toolbar popover (`ReadPopover.tsx`) and "New read" of the revision list use the same form; the form works without an editor. A `<read chapter lens/>` tag in an ordinary reply is an offer card (`ReadOfferCard.tsx`); a click starts the read in the read thread.
- **Prompt.** `send.ts` sends a read message with the context of a chat message, plus `buildReadTurn`: the chapter (or the selection, with the chapter as context), the rules of the lens, the limit (7 comments for all lenses, 5 for one), and the earlier comments of that chapter with their ids, states and reasons.
- **Reply.** The letter is prose. Each comment is a tag: `<note lens rank><find>passage</find><text>comment</text><source file="…">quote</source></note>`. `<resolved ids="…"/>` names earlier comments that the new text fixed; the app asks the author (a toast), and never closes a comment by itself. `parse.ts` gives these tags as segments. A `<read>` with an unknown lens offers all lenses; a `<note>` with an unknown lens is dropped. `fromReply.ts` makes a comment as soon as its tag is complete; a comment whose passage is not in the chapter (or in the selection) is dropped. In the letter, "(→ N)" is a chip (`CommentRef.tsx`) with the current margin number of that comment; a click goes to it.
- **Storage.** `ai/comments.json` (`parseCommentsFile`, `serializeComments`). The store is `useComments` (`store.ts`). A file from outside replaces the list when no local write waits. When a local write waits, the app merges the two lists by id: the later `updatedAt` wins (`commentsChangedOutside`; `handleExternal` sends this file to it before its check for a pending write). `updatedAt` is the time of the last decision of the author; an automatic change of the passage or of "lost" does not change it. A chapter that comes back from outside never starts automatic writes. A file with a version above 1 makes the store read-only: the app shows the comments and does not save changes. A file that is there but does not parse also makes the store read-only, and a toast tells the author: the app does not make comments again from the replies over it. A chapter delete puts its comments in the trash with the chapter, and its Undo puts them back. Retry, Rewind, Edit and a thread delete remove the open comments of the replies that go (`dropMessageComments`); decided comments stay, because the next read uses them. The Undo of a thread delete does nothing when another book is open. Comments of a chapter that is not in the book stay in the file, but do not show.
- **Marks** (`marks.ts`, the TipTap extension `CommentMarks`). The passages of the open comments have a soft wash (continuity: a wavy amber underline) and a number in the page margin. The ranges move with each step of the editor. When the author changes words inside a passage, the comment keeps it, and the new passage text goes to the file. When the passage is deleted, the comment is lost ("The passage changed"); Undo brings it back. The plugin keeps the ranges of closed comments too, so Undo of "Done" puts the card on the same passage. A chapter without an editor finds a passage by its text; for a read of a selection, the search starts at the selection.
- **Comment margin** (`Margin.tsx`, `Card.tsx`, `layout.ts`). The cards are in a column of 300–400 px to the right of the page, next to their passages, in text order (`layoutCards`). The app makes room one time, at the click of the author (`makeRoomForComments`): the page moves to the left of the desk, and the chapter list closes when that is not enough. It never moves the page while the author types or while a comment streams in. "Hide" (`hideComments`) gives the room back; the choice is kept for each book. In a narrow window, a click on a number opens its card as a popover. `decideComments` is the one path for a change of state: it writes the change, shows a toast with Undo, and gives the room back after the last open comment. The status bar shows "N editor's comments" (`CommentsStatus.tsx`).
- **Actions** (`actions.ts`). `goToComment`, `discussComment` (the read thread, with the passage as a quote), `polishComment` (the main action with `{ note }`: the comment goes to the AI in an `<editor_comment>` block; after Accept, a toast asks "Mark the comment as done?"), `updateNoteFor` (a message in the read thread; the normal proposals follow), `markIntentional` (an optional reason that the next reads get).
- **Revision list** (`RevisionList.tsx`, `revision.ts`). All the comments of the book, by chapter in book order, with filters by lens and by state and their counts. `useUi.revisionOpen` shows it over the desk; the Write view stays mounted under it. The first item of the chapter list opens it, and each chapter row shows its open count. The filters and the scroll place stay while the book is open. A path that shows the text (a chapter jump, "Go to passage", "Show in text", Find) closes the list (`showText` in `stores/ui.ts`). In the view of a book, Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z outside a text field never run the Undo of the browser (`useUndoGuard` in `lib/undoKeys.ts`, used in `BookView`): the browser would undo the last typing of a chapter that is hidden (under the Plan view or the list) or not focused, and autosave would write it. In a text field, the key stays the Undo of that text; the Undo of an accepted chat change still runs. The actions of a row and of a card come from one description (`commentActions`).
- **Tests.** Unit tests next to each file. The scenarios `comments` and `editorread`; the hook `window.__wordelia.comments`. The scripted provider answers a read with notes, a letter, and `<resolved>` for a second read.

## 7c. Shell and controls

- **Title bar.** The wordmark is at the far left, then the book menu. The view tabs stay in the middle. On the right: the update badge, the AI warning, the chat button and the settings button. The tools never cover the tabs: when they do not fit in their column (`useFitTools` in `app/TitleBar.tsx`), the AI warning keeps only its icon, then the update badge too. The `narrow` scenario measures this in each language from 980 px to 1440 px.
- **Welcome** (`features/onboarding/Welcome.tsx`). A modal dialog: the title bar and the page are inert behind it, Tab stays in it, the global shortcuts are off, and Esc closes it. A program that is not installed has "Install…", which opens its official install page; the row then looks again every 4 s, and when the window gets the focus back. "Start writing" with no book opens the New book dialog. A new install has the interface language of the system (`localeForSystem`).
- **A book switch.** `useUi.resetForBook()` closes what belongs to the last book: the find bar, the history and the export.
- **AI warning** (`app/ProviderBadge.tsx`). It shows only when the chat has no AI: no chat route, or the chat provider is not installed or not logged in (an expired login has its own text). A problem must stay for 1.5 s before the warning shows, so the start-up checks do not make it flash. A click opens Settings → AI.
- **Sidebar toggle** (`features/book/SidebarToggle.tsx`). The sidebar header has the hide button. A hidden sidebar leaves a small button at the top-left corner of the page area (`.sidebar-show` in `BookView`), over the Write and the Plan views. The shortcut and the window edge also work. When the sidebar is hidden, `.book-main` has the class `is-sidebar-closed`: the editor toolbar and the Plan pages get more space at the left. A view that puts controls at the top-left corner must keep 56 px clear in this state.
- **Fields** (`ui/index.tsx`). `Field` does not wrap its control in the label. The label covers its text only. A click on the label focuses a text box or flips a switch; it never opens a dropdown. A click beside a control does nothing. The controls get their `id` and `aria-labelledby` from the field (`FieldContext`).
- **Number boxes** (`NumberInput`). Typing stays in the box. Enter or a blur saves the value, clamped to its minimum and maximum. The arrow keys step it (Shift: ten steps). The box accepts a comma or a point for decimals and shows the number in the interface language. The daily goal and the page margins use it.
- **Page margins** (Settings → This book). Top, Bottom, Left and Right, in centimeters with one decimal. The book keeps millimeters in `export.margins`: Left is `inner` and Right is `outer`. A margin always leaves 40 mm of the page for the text.
- **Icons beside text.** An icon moves up by `--icon-lift` (`styles/tokens.css`), so that its middle meets the middle of the capitals of the text (or of the x-height, for text in small letters only). The text rounds to whole pixels, so the token has one value for each display scale (100 %, 125 %, 150 % and more). The open book icon draws low in its box and uses `--icon-lift-book`. The `icons` scenario reads the screen pixels of 45 icon and text pairs and fails when an icon is more than 0.75 px from the middle (1.4 px on a 100 % screen).

## 7d. Plan sidebar

- **Categories.** The "…" menu of a category (in its row and on its page) renames it, changes its icon (a row of icons, `categoryIcons.ts`) or deletes it. In the sidebar, the menu also has New note and Import notes. A rename changes the name only: the folder and the files stay. A name that another category has is refused with a toast. A new category opens at once. A delete moves the notes of the category (also the notes in folders under it) to the trash of the book; the story line, which does not show in the categories, moves to another category. The toast has Undo: the category comes back in its place, with its notes. The last category cannot be deleted.

`src/renderer/src/features/plan/PlanSidebar.tsx`.

- The Sync button and the result card of the planning sync (5.6) are at the top.
- **Lists.** A category lists its notes and the notes in folders under its folder. Notes at the root of `planning/` are in a group "Not in a category" (sidebar and overview). Names sort in natural order ("Note 2" before "Note 10"). An empty category shows no count.
- **Category rows.** A click anywhere on a category row shows the category page and unfolds its entries. The hover buttons of the row (Import notes, New) are not part of this, and they are not Tab stops: a row has two Tab stops, the row and its "…" menu. On the page that shows, a click on the row folds or unfolds the entries. The caret only folds and unfolds: the page stays. On the keyboard, Enter is a click, → unfolds and ← folds. The caret is not a tab stop. Thus one click on a row always does a thing that the author sees, and the caret is the only control that does not change the page. The section titles of the overview also open the category pages.
- **Caret.** The box of the caret has the height of the category icon (15 px) and the same lift (`--icon-lift`). Thus the two boxes round to the same pixels, and the caret, the icon and the name share one middle at every display scale. The `icons` scenario measures the caret of each row.

### 7d2. Notes

`features/plan/PlanView.tsx` (the note page), `noteActions.ts` (what the writer does to notes and categories), `src/shared/planning/notes.ts` (pure, tests in `notes.test.ts`). The `plannotes` scenario checks this section.

- **Names.** The name box and the alias box save on Enter, on blur, and when the page closes without a blur (a shortcut, a link). Esc puts the name back. The name or an alias of another note is refused with a toast; so is an alias that the note already has.
- **Rename** (`renameNote`). The file gets the new name. The `[[links]]` to the old name in the notes and their summaries, and the "@" mentions of the old name on the story line, take the new name; the heading and the shown text of a link stay. When the chapters or the other notes still use the old name as plain text, it becomes an alias, so the mentions in the manuscript still count. The chapters do not change: they are the text of the writer. A toast tells the count, with Undo (only while nothing changed after the rename).
- **Delete.** The note goes to the trash of the book; the toast has Undo, which moves the file back (`restoreEntries`).
- **Move.** The category control at the top of a note ("Characters ▾") moves it to another category, with Undo.
- **Links** (`editor/wiki-links.ts`, `plan/links.ts`). A plain click puts the caret in a link; Ctrl+click opens the note. The tooltip of a link says so. `[[Name#Heading]]` opens the note at its heading. `[[Name|text]]` shows only "text" while the caret is not in the link. "Create it" on a missing link makes the note in the category of the note that has the link (from a chapter, in Notes); its category control can move it at once.
- **In the manuscript.** The chips count each mention once (the matcher of the map: an alias "Marta" next to the name "Marta" counts once). A chip opens the chapter with the find bar on the name that comes first in it, at its first match (`useUi.openFind`).
- **Portrait.** "Change" and "Remove" show on the portrait. Remove has Undo.
- **Import** (`importNotes.ts`, `src/shared/planning/import.ts`). A name that a note of the book has gets " 2", and the toast says so. The front matter stays (for example `tags`). An embed of a note becomes a link; an embed of a file goes, without a loose space. The toast names the files after the limit of 200.

## 8. Saving

- Each chapter editor keeps up to 350 ms of typing in memory, then writes Markdown to the book store; while the author types without a pause, at least every 1.5 s. An editor that unmounts (its chapter scrolled far away) writes first. The editor tells the saver at the first key (`saver.hold`), so the status bar says "Saving…" at once.
- The store writes files through `saver` (500 ms debounce for each file, at least every 2 s, ordered writes).
- A failed write stays in the queue and retries. The status bar shows "Not saved" (a click tries again), and a toast tells why in plain words, once for each problem (read-only file, file held by another program, missing folder, full disk), with "Try again" (`saveProblemOf`).
- Editors register a flusher (`src/renderer/src/lib/flush.ts`). Closing a book runs all flushers, then `saver.flush()`. When some text is not on disk, the book stays open and the app asks "Keep the book open / Close anyway", as for the window.
- Closing the window: the main process stops the close, sends `app:flushRequest`, and closes when the renderer answers `app:flushDone` (or after 4 s).
- Deleted chapters, entries and chat threads move to `.wordelia/trash/`. Nothing is deleted for good. The toast of a deleted chapter has an Undo: the file comes back, and the chapter goes back to its place with its text. A new chapter file that arrives while the book is open (a sync client) joins the book at the end. New chapter names keep away from the files of missing chapters.
- Accepted AI proposals show an **Undo** toast. It restores the text from before the change.
- **Version history** (`src/renderer/src/features/history/`). The app saves a version of a chapter when the chapter opens, when the author leaves it, every 8 minutes, and before AI changes (in `.wordelia/history/`). The versions of the last day all stay; up to 7 days, the newest of each hour; up to 60 days, the newest of each day; then the newest of each week; at most 400 (`versionsToDrop` in `src/main/book/history.ts`). After "Restore this version", Ctrl+Z in the chapter undoes the restore, and the toast has an Undo. The dialog compares the chapter with the selected version, word by word. When a version shows, the compare view glides to its first change, with 30% of the view above it for context. The glide takes the time of the `--dur-slow` token, also in a long chapter; with reduced motion it jumps. A wheel, a key or a click stops it.
  - When the author selects another version, nothing in the dialog flashes or moves. The compare view keeps the last version until the text of the new version is there; a spinner shows only when a version takes more than 300 ms. The line "If you restore this version: +12 −3 words" keeps its height when it has no numbers. "Close" and "Restore this version" do not change: Restore is off only when the chapter has no versions or the selected version cannot be read. A click on Restore while a version loads waits for the text of the selected version, never the text on screen. The dialog keeps the versions that it read, so a version that the author selects again shows at once. While the list of versions loads, the dialog has the height of the list. The `history` scenario records the two buttons and the compare view in each frame, and each change of an attribute in the footer, while it goes through all the versions.

## 9. Long books

When the manuscript does not fit the token budget of the chat, the chat sends the open chapter and its neighbors in full, and summaries of the other chapters. The background model makes the summaries. They are cached by content hash in `.wordelia/cache/summaries.json`. While they are made, the reply shows "Summarizing chapters: 3 of 12". Each summary goes to the cache when it is done. Stop cancels the summary requests of the message; a second message waits for a summary that is in progress, and does not ask for it again.

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
| `live-import` | `IMPORT_FILE`, `LIVE_OUT` | Imports a DOCX, waits for the planning sync, opens its thread with Review, accepts all proposals with the "Apply all" bar of the reply, copies the book to `LIVE_OUT/book`. |
| `live-polish` | `LIVE_BOOK`, `LIVE_OUT`, optional `LIVE_CASES` | Runs actions on paragraphs (`action:chapter:paragraph:count`) and writes `polish-report.json` with the text before and after. |
| `live-chat` | `LIVE_BOOK`, `LIVE_OUT`, optional `LIVE_PROMPTS` | Sends chat messages in a new thread, accepts the proposals, and writes `chat-report.json`. |
| `live-sync` | `LIVE_BOOK`, `LIVE_OUT`, optional `LIVE_CHAPTER`, `LIVE_TEXT` | Adds a paragraph to a chapter, presses Sync, opens the thread with Review, accepts the proposals, and writes `sync-report.json`. |
| `live-settings` | — | Screenshot of Settings → AI with the real provider status. |
| `debug` | optional `WORDELIA_DEBUG_PROVIDER`, `WORDELIA_DEBUG_MODEL`, `WORDELIA_DEBUG_BIN` | One small completion. Prints the status, the models and the result. |

Set `WORDELIA_CLAUDE_BIN` to run any scenario with another copy of the `claude` CLI, for example a newer one.

### AI text and the book typography

The AI often writes straight quotes and three dots. `typesetForBook` (`src/renderer/src/lib/typeset.ts`) changes them to the quotes and the ellipsis of the book, when the book settings ask for smart quotes and smart ellipsis. It runs on action rewrites, on chat edits to chapters (the diff card shows the same text that is applied), and on "Insert at cursor". Attribute blocks such as `{font="X"}` and HTML tags keep their straight quotes.

### Frontmatter from the AI

The AI can write YAML that is not valid, for example `summary: Two plots: one…`. When YAML parsing fails, `readFrontmatter` reads simple `key: value` lines and lists. The file is then written back as valid YAML. When a line does not fit, or a key repeats, the raw frontmatter is kept unchanged, as before.
