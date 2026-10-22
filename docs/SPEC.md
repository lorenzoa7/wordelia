# Wordelia — Product Specification

Wordelia is a desktop writing app for novelists. It looks and feels like a quiet, simple word processor. An AI editor works beside the writer, like Cursor works beside a programmer.

The AI helps. It does not write the book. The writer writes. The AI polishes, answers, remembers and keeps the story consistent.

## 1. Problem

The first user is a hobby novelist. The writer writes a novel in Google Docs and uses Claude to polish each paragraph with personal rules. The loop is: copy, paste in a chat, wait, copy back, paste. This loop is slow and boring, so the writer stops writing.

Wordelia removes the loop. The AI is inside the editor, and it knows the book.

## 2. Goals

1. Writing must feel calm and pleasant. Few controls. No noise.
2. AI help must be one click or one shortcut away.
3. The AI must know the book: the manuscript, the planning and all chat threads.
4. The writer must approve every AI change. Show each change as a diff.
5. The data must be plain files on the computer of the writer. No account. No server.
6. The export to PDF and DOCX must be ready for a publisher.
7. The app is free. The writer connects the AI that they already pay for.

## 3. Non-goals (for version 1)

- Real-time collaboration with other people.
- A cloud service or user accounts.
- Mobile apps.
- AI that writes full chapters without the writer.

## 4. Features

### 4.1 Library

- The first screen shows the books that the app knows, as cards.
- The writer can create a book, open a book folder, or import a book (DOCX, Markdown, TXT).
- The app remembers recent books in its own data folder.

### 4.2 Write view

- **Chapter tabs:** a left sidebar lists the chapters, like the tabs of Google Docs. The writer can add, rename, reorder (drag) and delete chapters. Each tab shows a word count.
- **Page:** a paper-like page in the center. The text uses the book typography.
- **Toolbar (minimal):** undo, redo, font, font size, bold, italic, underline, alignment, scene break, find and replace. The toolbar fades while the writer types.
- **Smart typing:**
  - `--` becomes the dialogue dash. The writer selects the dash in settings: `—` (U+2014) or `―` (U+2015).
  - Optional: smart quotes (`"` becomes `“ ”`), and `...` becomes `…`.
- **Find and replace** in the chapter or in the full manuscript.
- **Spell check** in the language of the book.
- **Focus options:** focus mode (dims other paragraphs), typewriter scrolling.
- **Status bar:** chapter words, book words, save state.
- **Autosave:** the app saves the file a short time after each change. There is no "Save" button.

### 4.3 Selection menu

When the writer selects text, a small menu opens above the selection:

- **Reply:** puts the selected text as a quote in the chat composer and opens the chat.
- **Polish** (the default action): the AI rewrites the selection with the writing rules. It also reads the text before and after the selection to keep the voice and the facts.
- **More actions:** a list of the other actions of the writer.

An action shows its result as an **inline diff** on the page: removed words in red with a line through them, new words in green. A small bar gives **Accept** (Enter), **Reject** (Esc) and **Retry**.

### 4.4 Actions

- An action has a name, instructions, a model route and a shortcut. The app also sends some text before and after the selection, so the AI keeps the voice and the facts. The writer does not set the size of this context.
- Wordelia ships with four default actions: Polish (the main action), Tighten, Fix grammar only and Show, don't tell. Each one edits the words of the writer and adds no new material. Version 0.7 removed Expand from the defaults; settings version 5 removes it from the settings of a writer who did not change it.
- The writer can edit, add, remove and reorder actions. The writer can assign a shortcut to an action. The main action cannot be removed.
- **Writing rules** are book-level rules. Every action and every chat reads them.

### 4.5 Chat

- A right panel. The writer can collapse it.
- The AI can read the full book and can propose changes to the manuscript and to the planning.
- A proposed change shows as a **diff card** (like a git diff), with **Accept** and **Reject** per hunk, and **Accept all**. An accepted hunk changes the file. The writer can undo it with Ctrl+Z.
- The composer supports `@` mentions of chapters, planning entries and threads. A mention adds that item to the context.
- The composer shows reply quotes as chips.
- The writer can select the model for the thread.

### 4.5b Editor's read

- The AI reads a chapter, or the selected part of it, as an editor. It never changes the text.
- The glasses button of the toolbar opens a popover: what to read, the lens, "Chapter in progress", and **Read**. The chat can also offer a read as a card; one click starts it.
- **Lenses:** Structure, Reader, Style, Continuity, Proofread, or all lenses. A read gives at most 7 comments with all lenses, 5 with one lens.
- A read is a chat message in the thread "Read · <chapter>". The reply is a short letter ("What works", "What I would look at first") and comments.
- Each comment is on a passage. Its card is in the **margin**, to the right of the page, and a number marks the passage. The first read makes room for the margin one time; **Hide** gives the room back.
- **Actions of a comment:** Discuss in chat, Polish passage (the main action with the comment, in the normal review), Update the note (Continuity: a chat message, then normal proposals), It's intentional (with an optional reason), Ignore, Done. Each change of state has Undo.
- A comment follows its passage when the text changes. When the passage is gone, the comment says "The passage changed".
- The **revision list** shows all the comments of the book, by chapter, with filters by lens and by state. The first item of the chapter list opens it.
- A second read of a chapter gets the earlier comments, with their states and reasons. When it says that a comment is fixed, the app asks the writer. It never closes a comment by itself.

### 4.6 Threads (connected chats)

- A book has many threads. Example: one thread for each main character, one for the plot of part 2.
- A thread has a title and an optional **brief** (its purpose).
- The AI keeps a **digest** for each thread: a short list of the facts and decisions in that thread.
- Every thread reads the digests of all other threads. Thus threads do not contradict each other.
- An `@thread` mention adds the recent messages of that thread to the context.
- The AI can propose to save a decision into the planning. The planning is the long-term memory of the book.

### 4.7 Plan view

- A left sidebar lists categories and entries. Default categories: Characters, Places, World, Plot, Notes. The writer can add categories.
- An entry is a rich-text note with an optional image (for example a portrait) and aliases.
- A category page shows its entries as cards.
- The links `[[Entry name]]` work, like Obsidian.
- **Update notes from the chapters** (the sync): a button in the Plan sidebar. The AI reads the chapters that changed since the last sync. It proposes new entries (for example a new character) and updates to entries. The writer reviews each proposal as a diff.
- **Build planning from manuscript:** the same process for a full imported book.

### 4.8 AI providers

- The writer connects one or more providers:
  - **Claude Code** — uses the `claude` CLI that the writer installed and logged in with a Claude subscription.
  - **Codex** — uses the `codex` CLI that the writer installed and logged in with ChatGPT.
  - **Anthropic API** — with an API key.
  - **OpenAI API** — with an API key.
- **Model routes:** the writer selects the model for each task: Chat, Actions, Sync, Background (digests and summaries). Each action can override its route.
- When the writer connects a provider, the app proposes good routes for it.
- The app gets the model list from each provider when possible, so new models appear without an app update. Claude Code uses the aliases `opus`, `sonnet` and `haiku`, which always point to the latest models.

### 4.9 Storage

- A book is a folder of plain files (Markdown and JSON). See `ARCHITECTURE.md` for the layout.
- The writer can put the folder in Google Drive, OneDrive, Dropbox or a git repository to sync it.
- The app detects changes that other programs make to the files and reloads them.
- API keys are encrypted with the operating system key store. They are never in the book folder.

### 4.10 Export

- **PDF**, with presets:
  - **Book** (A5, or 6 × 9 in, or 5 × 8 in): justified text, first-line indent, chapter headings, page numbers.
  - **Manuscript** (A4 or Letter): standard manuscript format for agents and publishers — 12 pt, double spacing, 1 in margins, header with surname, title and page number.
- **DOCX** with real Word styles. Google Docs opens this file without loss.
- **Markdown** and **plain text**.
- Export settings: page size, margins, font, size, line spacing, indent, alignment, scene break symbol, chapter heading style, title page, page numbers, header.

### 4.11 Design

- Warm paper colors. The page is near-white with a light book tint. The desk is a little darker.
- The UI font is a typewriter font. The writing font is a choice of the writer.
- A dark theme for night writing.
- Calm, short animations. Nothing blinks or jumps.
- The look must join the past (typewriter, paper, ink) and the present (clean, light, fast).

## 5. Success criteria

1. The writer can import the Google Docs book (as DOCX) and continue to write it in Wordelia.
2. The writer can polish a paragraph in less than 3 seconds of their own time: select, click Polish, press Enter.
3. A new character in the manuscript appears in the planning after one Sync.
4. The DOCX and PDF exports look like the original Google Docs book.
5. The writer wants to open the app.
