# Editor's read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The author asks for an editor's read of a chapter (or a selection, also of a chapter in progress) with five lenses; the AI answers in a chat thread with a short letter and up to 7 comments that show in the margin beside their passages and in one revision list. The AI never changes the text.

**Architecture:** A read is a chat message with a `read` request in a thread of that chapter ("Leitura · <title>"); `requestReply` adds a read block to the user turn. The reply's `<note>` tags become comments (`ai/comments.json`, zustand store `useComments`). A TipTap extension draws the passages and keeps each comment on its passage through edits. A margin layer beside the page shows the cards; the desk makes room once when a read starts. A revision-list page in the Write view lists all comments.

**Tech Stack:** Electron 44, React 19, TypeScript, TipTap 3 / ProseMirror, zustand, radix-ui (Popover), Phosphor icons, Vitest, Playwright `_electron` scenarios.

**Spec:** `docs/superpowers/specs/2026-10-21-editors-read-design.md` (read it first; it has the words, the lenses and the behaviour). Mockups: `test-results/mockups/4a-leitura-unificada-margem.png`, `4b-leitura-unificada-lista.png` (local only).

## Global Constraints

- Follow CLAUDE.md: `src/shared` stays pure; the renderer never uses Node (IPC = `src/shared/ipc.ts` + `src/main/ipc.ts` + `src/preload/index.ts`); all visible text through `src/shared/i18n` in en, pt-BR and es (a new namespace `read`); colors, spacing, fonts and motion from `src/renderer/src/styles/tokens.css` (both theme blocks); docs in ASD-STE100.
- The AI never changes the book text. Comments are data about the text. Polish goes through the normal action review; planning changes go through normal chat proposals.
- Words (spec "Words"): a finding is a **comment** (pt-BR "comentário", es "comentario"); a **note** stays a planning entry. Lenses: `structure` Estrutura / Structure / Estructura, `reader` Leitor / Reader / Lector, `style` Estilo / Style / Estilo, `continuity` Continuidade / Continuity / Continuidad, `proofread` Revisão / Proofread / Revisión. "Todos os olhares" / "All lenses" / "Todas las miradas". Margin header "Comentários do editor · N" / "Editor's comments · N" / "Comentarios del editor · N".
- Limits: at most 7 comments for all lenses, at most 5 for one lens (`READ_LIMIT_ALL = 7`, `READ_LIMIT_ONE = 5`).
- Storage: `ai/comments.json` in the book folder (`COMMENTS_FILE` in `src/shared/book.ts`).
- Read thread title: `Leitura · <chapter title>` (pt-BR), `Read · <chapter title>` (en), `Lectura · <chapter title>` (es); one thread per chapter, found again by `Thread.readChapterId`.
- Never use names of the user's novel in code, tests or docs (the repo is public): use the sample books (Elias, Marta, Santa Ilha / Saint Isle, "A Tempestade", "O Visitante").
- Commits: small, clear messages; never add "Co-Authored-By" or "Generated with Claude Code" lines.
- Tests while working: `npm run typecheck`, `npx vitest run`, `npm run e2e -- <names> --workers 1`; never the full suite per task. Test regexes must work with CRLF files too (CI checks out CRLF on Windows): use `[ \t]*`, not `\s*`, across line ends.
- Node: prefix Bash calls with `export PATH="/c/Users/Lorenzo/AppData/Roaming/fnm/node-versions/v24.21.0/installation:$PATH"`. Write regex-heavy scripts with the Write tool; run Python with `python -I`.

## Review Focus

1. **A passage that is in the chapter two times** (a common short phrase): the comment must still show; it anchors to the first match after the start of the read range, not dropped. Test in Task 6.
2. **A `<find>` with Markdown or other quotes/dashes** (`*Andorinha*`, straight vs curly quotes, `--` vs `—`): the comment must anchor (use `markdownToPlainBlocks` + `findText`, which normalizes quotes, dashes and spaces). Test in Task 4.
3. **`ai/comments.json` changes from outside** (the book syncs from another computer while the app runs): the store reloads, the margin redraws, and a pending local write is not lost (follow the `ACTIONS_FILE` branch of `handleExternal`). Test in Task 4.
4. **A book switch:** the comments of book A never show in book B (reset in `useBook.open`). Test in Task 4 (store) and Task 9 (scenario).
5. **"Ler" clicked again while the read still streams:** no second request; the button is off while that thread streams. Test in Task 5.

---

### Task 1: The comment model and its file

**Files:**
- Create: `src/shared/comments.ts`
- Modify: `src/shared/book.ts` (add `COMMENTS_FILE = 'ai/comments.json'` beside `ACTIONS_FILE`)
- Test: `src/shared/comments.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Lens = 'structure' | 'reader' | 'style' | 'continuity' | 'proofread'
  export const LENSES: Lens[]                       // in this order
  export type LensChoice = Lens | 'all'
  export type CommentState = 'open' | 'done' | 'ignored' | 'intentional'
  export interface CommentSource { file: string; quote: string }
  export interface EditorComment {
    id: string; chapterId: string; lens: Lens; rank: number; text: string
    passage: string            // plain text of the passage now (updated when the author edits it)
    sources: CommentSource[]; state: CommentState; reason?: string
    lost?: boolean             // the passage is gone ("O trecho mudou")
    threadId: string; messageId: string; key: string   // key = `${segment index}`
    createdAt: string; updatedAt: string
  }
  export const READ_LIMIT_ALL = 7; export const READ_LIMIT_ONE = 5
  export function parseCommentsFile(text: string | null): EditorComment[]   // tolerant: bad JSON or bad items → [] / items dropped
  export function serializeComments(list: EditorComment[]): string          // {"version":1,"comments":[…]}, 2-space JSON, trailing newline
  export function isLens(v: unknown): v is Lens
  export function openCount(list: EditorComment[], chapterId?: string): number
  ```

- [ ] **Step 1: Write the failing tests** — `comments.test.ts`:
  - `parseCommentsFile(null)` and `parseCommentsFile('not json')` → `[]`.
  - a file with one valid comment and one with `lens: 'plot'` → only the valid one.
  - `parseCommentsFile(serializeComments(list))` deep-equals `list`; `serializeComments` ends with `'\n'` and contains `"version": 1`.
  - `openCount` counts only `state === 'open' && !lost`, per chapter when given.
- [ ] **Step 2: Run** `npx vitest run src/shared/comments.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/shared/comments.ts` and `COMMENTS_FILE`.
- [ ] **Step 4: Run** the test → PASS; `npm run typecheck` → clean.
- [ ] **Step 5: Commit** `Comments of an editor's read: the model and the file`.

### Task 2: The tags of a read in replies

**Files:**
- Modify: `src/shared/proposals/parse.ts`, `src/shared/proposals/state.ts`
- Modify (guard the new kinds; each place assumes `.file` today): `src/renderer/src/features/chat/MessageView.tsx` (ReplyReview ~L298), `src/renderer/src/features/chat/applyProposal.ts` (~L184 `segmentKeys`), `src/renderer/src/features/chat/rewind.ts` (~L63-80), `src/renderer/src/features/chat/thinking.ts` (~L16), `src/renderer/src/features/plan/line/proposal.ts` (~L30), `src/renderer/src/features/plan/sync.ts` (~L158)
- Test: `src/shared/proposals/proposals.test.ts` (new describe blocks)

**Interfaces:**
- Consumes: `Lens`, `LensChoice`, `isLens` (Task 1).
- Produces (added to the `Segment` union):
  ```ts
  | { kind: 'note'; lens: Lens; rank: number; find: string; text: string; sources: CommentSource[]; complete: boolean; index: number }
  | { kind: 'read'; chapter: string; lens: LensChoice; complete: true; index: number }     // <read chapter="manuscript/X.md" lens="structure"/>
  | { kind: 'resolved'; ids: string[]; complete: true; index: number }                      // <resolved ids="c3 c7"/>
  export type FileSegment = Extract<Segment, { file: string }>
  export function isFileSegment(s: Segment): s is FileSegment
  ```
  Tag format (body tags in any order inside `<note …>`): `<note lens="continuity" rank="1"><find>…</find><text>…</text><source file="planning/…">quote</source></note>`; zero or more `<source>`. A note with an unknown lens is kept as text-free and dropped (not a segment). `index` counts all non-text segments in order, as today.
- `proposalSummary`: a note becomes `[Comment N (lens) on: "find…"]`; `read` becomes `[Offered an editor's read of <chapter>]`; `resolved` becomes `[Said that comments <ids> look fixed]`; with `states`, these never touch `.hunks`.
- `pendingKeys` and `hasIncomplete`: notes, read and resolved never count as proposals that wait (they are not hunks); an incomplete note does not make a reply "incomplete".
- `hasProposals` keeps returning true only for `isFileSegment` kinds.

- [ ] **Step 1: Write the failing tests**:
  - `parses a complete note with two sources` → kind `note`, lens, rank 1, find, text, two sources.
  - `a note that is still being typed is hidden from the text and is not complete` (cut inside `<text>`): the text segment does not contain `<note`, and the note segment has `complete: false`.
  - `parses <read chapter="manuscript/A Tempestade.md" lens="structure"/>` and `<resolved ids="c3 c7"/>`.
  - `a note with an unknown lens is dropped`.
  - `proposalSummary keeps notes out of hunks` (with `states` given, no throw, contains `[Comment 1 (continuity)`).
  - `pendingKeys ignores notes`.
- [ ] **Step 2: Run** `npx vitest run src/shared/proposals` → FAIL.
- [ ] **Step 3: Implement** in `parse.ts` (a second regex for the self-closing tags; extend the partial-tag regex at ~L89 to `note|read|resolved`), `state.ts`, and replace `.file` assumptions in the listed renderer files with `isFileSegment` filters.
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck` → PASS / clean; `npm run e2e -- chat proposals notediff storyline --workers 1` → all pass.
- [ ] **Step 5: Commit** `Replies can hold the comments of an editor's read`.

### Task 3: The prompt of a read and the scripted AI

**Files:**
- Create: `src/shared/prompts/read.ts`
- Modify: `src/shared/prompts/chat.ts` (PROTOCOL: a short section on `<read/>`; export nothing new unless needed)
- Modify: `src/shared/types.ts` (`ReadRequest`, `ChatMessage.read?`, `Thread.readChapterId?`)
- Modify: `src/main/book/store.ts` `normalizeThread` (keep `readChapterId` and `messages[].read`)
- Modify: `src/main/ai/mock.ts` (scripted replies)
- Test: `src/shared/prompts/read.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `chapterRef(c)` from `prompts/context.ts`.
- Produces:
  ```ts
  // types.ts
  export interface ReadRequest {
    chapterId: string; lens: LensChoice; inProgress: boolean
    selection?: { text: string }              // plain text of the selected part; the read comments only on it
  }
  // ChatMessage gets `read?: ReadRequest` (on the author's message). Thread gets `readChapterId?: string`.
  // read.ts
  export const READ_MARK = '<editor_read'      // first characters of the read block (the mock looks for it)
  export function buildReadTurn(message: string, req: ReadRequest, chapter: Chapter, chapterIndex: number, earlier: EditorComment[]): string
  export const READ_OFFER_RULES: string         // the PROTOCOL text about <read/>
  ```
- `buildReadTurn` returns `message` + a block `<editor_read chapter="manuscript/…" number="N" lens="…" in_progress="yes|no">…</editor_read>` that says, in English:
  - you are a developmental and line editor; you never rewrite and never use `<edit>`, `<create>` or `<portrait>` in this reply;
  - write a short letter first: "What works" (at most 3 bullet points), then "What I would look at first" (the problems in order, each with its lens and `(→ N)` where N is the number of its comment in this reply);
  - then the comments as `<note>` tags, at most `READ_LIMIT_ALL` (all lenses) or `READ_LIMIT_ONE` (one lens), `rank` 1 = most important; `<find>` copies the passage word for word from the chapter (a short phrase or sentence, never a whole paragraph); one or two sentences in `<text>`; for continuity, a `<source file="…">` with the quote from the planning note, the story line card or the earlier chapter;
  - the lens descriptions of the spec (only the chosen lens, or all five);
  - in progress: "The chapter is not finished: do not comment on a missing end; comment on the direction so far.";
  - a selection: "Comment only on this part:" + the text; every `<find>` must be inside it;
  - earlier comments: open ones as `c<id> [lens] "passage" — text` with "If the new text fixed some of these, add <resolved ids="…"/>"; done, ignored and intentional ones (with reasons) under "Do not repeat these".
- `READ_OFFER_RULES` (in PROTOCOL): when the author asks in an ordinary thread for an editor's read of a chapter, answer with one short sentence and `<read chapter="manuscript/<file>" lens="all|structure|reader|style|continuity|proofread"/>`; never read the chapter in that thread.
- Mock: (a) when the last user turn contains `READ_MARK`, reply with a 2-line letter and 3 notes on the open chapter: `<find>` = the first 6 words of paragraphs 1, 2 and 3 of the chapter from `/<chapter … current="true">/`; lenses style, structure, continuity; the continuity note has `<source file="planning/Characters/Marta.md">…</source>`; when the block lists an open comment id, add `<resolved ids="<first id>"/>`. (b) when the last user turn says "leitura de editor" / "editor's read" outside a read block, reply `<read chapter="<current chapter file>" lens="structure"/>`.

- [ ] **Step 1: Write the failing tests** (`read.test.ts`):
  - `the block names the chapter, the lens and the limit` (lens `style` → contains `at most 5` and the Style description, not the Structure one; `all` → `at most 7` and all five).
  - `a chapter in progress says so` / `a selection limits the comments`.
  - `earlier comments: open with ids, the others under "Do not repeat these" with the reason`.
  - `PROTOCOL offers a read with <read/>` (`buildChatSystem(...)` contains `<read chapter=`).
- [ ] **Step 2: Run** `npx vitest run src/shared/prompts` → FAIL.
- [ ] **Step 3: Implement** `read.ts`, the types, `normalizeThread`, the PROTOCOL lines and the mock branches (put them before the "chat with edit words" branch, ~L212).
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck` → PASS / clean.
- [ ] **Step 5: Commit** `The prompt of an editor's read, and its scripted replies`.

### Task 4: The comment store, the file and external changes

**Files:**
- Create: `src/renderer/src/features/read/store.ts`, `src/renderer/src/features/read/fromReply.ts`
- Modify: `src/main/book/store.ts` (read `COMMENTS_FILE` in `openBook`, add `comments` to the snapshot), `src/shared/types.ts` (`BookSnapshot.comments?: EditorComment[]`), `src/renderer/src/stores/book.ts` (`open` loads the store; `handleExternal` branch for `COMMENTS_FILE` beside `ACTIONS_FILE`; `deleteChapter` moves the comments of the chapter out and its undo puts them back)
- Test: `src/renderer/src/features/read/read.test.ts`, `src/main/book/store.test.ts` (one case)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  ```ts
  // store.ts
  export const useComments: UseBoundStore<{ list: EditorComment[]; root: string | null }>
  export function loadComments(root: string | null, list: EditorComment[]): void
  export function addFromReply(thread: Thread, message: ChatMessage, req: ReadRequest, chapterText: string): EditorComment[]   // idempotent by threadId+messageId+key
  export function setCommentState(ids: string[], state: CommentState, reason?: string): void   // Undo toast inside
  export function updatePassage(id: string, passage: string): void
  export function setLost(id: string, lost: boolean): void
  export function takeChapterComments(chapterId: string): EditorComment[]   // removes and returns (chapter delete)
  export function putBackComments(list: EditorComment[]): void
  // fromReply.ts (pure, testable)
  export function commentsFromSegments(segments: Segment[], ctx: { threadId: string; messageId: string; chapterId: string; chapterPlain: string; selection?: string; limit: number; now: string }): EditorComment[]
  ```
- `commentsFromSegments`: only complete `note` segments; a `<find>` is matched with `findText(chapterPlain, markdownToPlainBlocks(find))` (and inside `selection` when given); a note with no match is dropped; an ambiguous match is kept (Review Focus 1); sort by rank, keep `limit`; `passage` = the matched plain text; ids `c` + short random (`newId('c')`).
- Writes go through `saver.write(root, COMMENTS_FILE, serializeComments(list))` after each change.
- A chapter delete: `takeChapterComments` also writes the removed comments to `.wordelia/trash/<stamp> comments <chapter file>.json` (`book:writeFile`), so they go to the trash with the chapter; the chapter's Undo calls `putBackComments`.

- [ ] **Step 1: Write the failing tests**:
  - `comments come from complete notes only, in rank order, at most the limit`.
  - `a find with italics and straight quotes anchors` (Review Focus 2): chapter has `“Andorinha”` and `*Andorinha*` in Markdown form; find `"Andorinha"` → kept.
  - `a find that is not in the selection is dropped`.
  - `the same reply twice gives no duplicates` (store `addFromReply` called twice → same length).
  - `setCommentState with Undo puts the old states back` (call the toast action).
  - `loadComments for another root clears the list` (Review Focus 4).
  - `store.test.ts`: `openBook reads ai/comments.json into the snapshot` (and `[]` when it is missing or bad).
- [ ] **Step 2: Run** the tests → FAIL.
- [ ] **Step 3: Implement**; the `handleExternal` branch parses the file and calls `loadComments(root, list)` unless a local write is pending (Review Focus 3).
- [ ] **Step 4: Run** `npx vitest run`, `npm run typecheck`; `npm run e2e -- persist external bookfolder --workers 1` → pass.
- [ ] **Step 5: Commit** `The comments of the book: a store, the file and changes from outside`.

### Task 5: Start a read: the popover, the read thread, the reply

**Files:**
- Create: `src/renderer/src/features/read/start.ts`, `src/renderer/src/features/read/ReadPopover.tsx`, `src/renderer/src/features/read/ReadOfferCard.tsx`, `src/renderer/src/features/read/useReadSync.ts`, `src/renderer/src/features/read/read.css`
- Create: i18n namespace `read` in `src/shared/i18n/{en,pt-BR,es}/read.ts` and add it to the three `index.ts` files and README namespace list
- Modify: `src/renderer/src/features/chat/send.ts` (`requestReply`: when the last author message has `read`, use `buildReadTurn`; add `sendInThread`), `src/renderer/src/features/editor/Toolbar.tsx` (the glasses button with the popover, near find/focus ~L159-166), `src/renderer/src/features/chat/MessageView.tsx` (render `read` segments with `ReadOfferCard`; notes are not shown as cards in the chat; `resolved` shows nothing), `src/renderer/src/features/book/BookView.tsx` (call `useReadSync()`)
- Test: `scripts/shots/editorread.mjs` (new; register in `scripts/e2e.mjs` with areas `['editor','chat']`)

**Interfaces:**
- Consumes: Tasks 1–4; `newThread`, `requestReply`, `useChat`, `setActiveThread`, `useApp.setUi`.
- Produces:
  ```ts
  export function readThreadFor(chapterId: string): Thread            // finds by readChapterId, or makes "Leitura · <title>"
  export async function startRead(req: ReadRequest): Promise<void>    // no-op while that thread streams (Review Focus 5)
  export async function sendInThread(threadId: string, text: string, extra?: Partial<ChatMessage>): Promise<void>
  export function useReadSync(): void   // streaming and saved replies of read threads → addFromReply; <resolved> → toast "A leitura acha que N comentários foram resolvidos" with "Marcar como feitos"
  ```
- The visible author message: `t.read.ask(chapterTitle, lensName)` ("Leia o capítulo 2 com todos os olhares." / "… como editor de estrutura."), plus "(em andamento)" / "(só o trecho selecionado)" when they apply.
- Popover: what to read (this chapter / the selection, only when there is a selection), the lens (a segmented control: Todos + 5), the switch "Capítulo em andamento" (on when the chapter is the last of the book), "Ler". Opening the chat panel: `setUi({ chatOpen: true })`.
- `ReadOfferCard`: "Fazer a leitura de editor do cap. N · <lens>" and a button "Ler" that calls `startRead`.
- A read reply (the assistant message after an author message with `read`) gets a small header card above its letter: the glasses icon, "Leitura de editor", "Cap. N · <lens>", and the count of its comments (mockup 4a).

- [ ] **Step 1: Write the failing scenario** `editorread.mjs` part 1: open the sample book, put the cursor in chapter 1, click the toolbar glasses (`[aria-label="Editor's read"]` / pt-BR label), choose "Todos os olhares", click "Ler"; wait for the reply; assert: the chat shows the thread titled `Leitura · A Tempestade`, the letter text is there, `useComments.getState().list` has 3 comments for chapter 1 with lenses style/structure/continuity; clicking "Ler" again while `WORDELIA_MOCK_DELAY` streams does not add a second author message (Review Focus 5). Part 2: in an ordinary thread, type "Faça uma leitura de editor do capítulo", send; the reply shows the offer card; its button starts a read in the same `Leitura · …` thread (no new thread).
- [ ] **Step 2: Run** `npm run e2e -- editorread --workers 1` → FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** `npm run e2e -- editorread chat chatview --workers 1`, `npx vitest run`, `npm run typecheck` → pass.
- [ ] **Step 5: Commit** `Start an editor's read from the toolbar or the chat`.

### Task 6: The passages in the text, and comments that follow the edits

**Files:**
- Create: `src/renderer/src/features/read/marks.ts` (TipTap extension `CommentMarks`)
- Modify: `src/renderer/src/features/editor/extensions.ts` (option `comments?: { chapterId: () => string }`), `src/renderer/src/features/editor/PageEditor.tsx` (pass it, like `proposals`)
- Modify: `src/renderer/src/styles/tokens.css` (lens tokens in both themes: `--lens-structure`, `--lens-reader`, `--lens-style`, `--lens-continuity` (amber), `--lens-proofread`, each with a `-wash`), `read.css`
- Test: `src/renderer/src/features/read/marks.test.ts` (ProseMirror `EditorState` in node, like `features/editor/editor.test.ts`), `editorread.mjs` part 3

**Interfaces:**
- Consumes: `useComments` (Task 4), `textWithMap` (`editor/review.ts`), `findText`, `markdownToPlainBlocks`.
- Produces:
  ```ts
  export const commentMarksKey: PluginKey<{ ranges: Map<string, { from: number; to: number }>; decorations: DecorationSet }>
  export function commentRanges(chapterId: string): Map<string, { from: number; to: number }>   // live ranges of a mounted chapter (for the margin and "Ir ao trecho")
  export function anchorComments(doc: PMNode, comments: EditorComment[], known: Map<string, Range>): Map<string, Range>   // pure: keep known ranges, find new ones by text (first match on ambiguity)
  ```
- Behaviour: open, not lost, not hidden comments of the chapter get a decoration: class `cm-mark cm-<lens>` (`continuity` = wavy amber underline, the others = soft wash) and a number widget in the page margin (`data-comment`, the order in the chapter). On `tr.docChanged`, ranges map through `tr.mapping` (start with assoc 1, end with assoc −1); 300 ms after the last change, for each range: empty or deleted → `setLost(id, true)`; text differs from `comment.passage` → `updatePassage(id, newText)`. When the store list changes (new comments, another state, external reload), rebuild with `anchorComments` (known ranges stay). After `loadDoc` from an external change, find all by text again.

- [ ] **Step 1: Write the failing tests** (`marks.test.ts`):
  - `anchors a passage by text and keeps it after an edit before it` (insert text before → range moves, text equal).
  - `an edit inside the passage updates the passage text` (helper returns the new text for the id).
  - `deleting the passage marks it lost`.
  - `an ambiguous passage anchors to the first match` (Review Focus 1).
  Scenario part 3: after the read, type a word inside the style comment's passage → after 600 ms the comment's `passage` contains the word and its mark is still on screen; select its whole passage and delete → the comment has `lost: true`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/renderer/src/features/read`, `npm run e2e -- editorread reveal notediff pages --workers 1` → pass.
- [ ] **Step 5: Commit** `The passages of comments in the text follow the edits`.

### Task 7: The margin, and room for it

**Files:**
- Create: `src/renderer/src/features/read/Margin.tsx`, `src/renderer/src/features/read/layout.ts`, `src/renderer/src/features/read/ui.ts` (zustand: `hidden` per book root in localStorage with try/catch; `roomTaken: { sidebarWasOpen: boolean } | null`)
- Modify: `src/renderer/src/features/editor/zoom.ts` (when the margin shows: offset = left padding instead of centered; fit room = desk width − `MARGIN_W`), `src/renderer/src/features/editor/PageEditor.tsx` (render `<Margin/>` inside the desk scroll, not inside the scaled `.desk-inner`)
- Test: `src/renderer/src/features/read/layout.test.ts`, `editorread.mjs` part 4

**Interfaces:**
- Consumes: `commentRanges` (Task 6), `useComments`, `useApp` (`settings.ui.sidebarOpen`, `setUi`).
- Produces:
  ```ts
  export const MARGIN_W = 300     // card column width in px (cards 272 + gap)
  export function layoutCards(items: { id: string; top: number; height: number }[], gap: number): { id: string; top: number }[]   // in order, never overlapping
  export function makeRoomForComments(): void    // called by startRead: show the margin; if desk room < page + MARGIN_W, close the chapter list and remember it
  export function hideComments(): void          // "Ocultar": hide marks and cards, put the page and the chapter list back
  export function showComments(): void
  ```
- The margin shows when the visible chapter has open comments and the book's margin is not hidden. Layout changes only in `makeRoomForComments`, `hideComments`, `showComments` (author clicks) and at book open — never because a comment streams in while the author types.
- Header: "Comentários do editor · N", the lens filter (a small menu), "Ocultar". Cards: number, lens tag, text; for continuity the two quotes (`passage`, and each source with its file label) and "Atualizar a nota", "É intencional"; others "Discutir no chat", "Polir trecho", "Ignorar"; all "Feito". A thin connector line joins the selected card to its passage. Lost comments show "O trecho mudou" and only "Feito"/"Ignorar".
- Narrow fallback: when even with the chapter list closed there is less than `MARGIN_W`, no column: the number markers open the card in a radix Popover beside the marker.

- [ ] **Step 1: Write the failing tests**: `layoutCards` keeps order, pushes a card down when the one above overlaps, keeps tops when there is room. Scenario part 4 (window 1440×900, chat open, chapter list open): after "Ler", the chapter list is closed, every `.cm-card` is fully right of the page (`card.left >= page.right`) and inside the desk; "Ocultar" → no `.cm-card`, no `.cm-mark`, the chapter list is open again and the page is centered (`|left gap − right gap| <= 2`). At 1000×800 (narrow): no column; a click on a marker opens a popover card. Screenshots light and dark, pt-BR.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Action buttons call functions that Task 8 provides; until then they call `setCommentState` (Feito/Ignorar) and are wired for the rest in Task 8.
- [ ] **Step 4: Run** `npx vitest run`, `npm run e2e -- editorread narrow zoom pages typewriter --workers 1` → pass; look at the screenshots.
- [ ] **Step 5: Commit** `Comments in the margin beside the page`.

### Task 8: What a comment can do

**Files:**
- Create: `src/renderer/src/features/read/actions.ts`
- Modify: `src/renderer/src/features/chat/MessageView.tsx` (in a read reply, each `(→ N)` of the letter is a small link chip that calls `goToComment` for comment N of that reply)
- Modify: `src/shared/prompts/action.ts` (`ActionPromptInput.note?: string` → an `<editor_comment>` block before `<instructions>`, "Fix what this comment says; keep the rest"), `src/renderer/src/features/actions/runAction.ts` (`RunOptions.note?: string` passed to the prompt), `Margin.tsx` and the revision list (Task 9) call these
- Test: `src/shared/prompts/action.test.ts` (one case), `editorread.mjs` part 5

**Interfaces:**
- Consumes: Tasks 4–7; `runAction(action, range, { note })`, `onReviewEnd`, `findAction` / `settings.defaultActionId`, `addQuote`, `setActiveThread`, `sendInThread`, `askText` (the text prompt of `@/ui/prompt`).
- Produces:
  ```ts
  export function goToComment(c: EditorComment): void           // opens the chapter (selectChapter + whenChapterEditor), scrolls to the range, selects the card
  export function discussComment(c: EditorComment): void        // opens c.threadId, quote = passage (source: the chapter), draft = t.read.aboutComment(n, text)
  export function polishComment(c: EditorComment): Promise<void> // main action on the range with { note: c.text }; when that review is accepted: toast "Marcar o comentário como feito?" with action
  export function updateNoteFor(c: EditorComment): Promise<void> // sendInThread(c.threadId, t.read.updateNoteAsk(text, sources)) → normal proposals
  export function markIntentional(c: EditorComment): Promise<void> // askText (optional reason) → state 'intentional'
  ```

- [ ] **Step 1: Write the failing tests**: `action.test.ts`: `a note goes to the AI before the instructions`. Scenario part 5: a click on "(→ 1)" in the letter selects card 1 in the margin. "Polir trecho" on the style comment → a review opens on its passage → Enter → a toast with "Marcar como feito" → click → the comment state is `done` and its card leaves the margin; Undo in the next toast puts it back. "Discutir no chat" → the read thread is active and the composer has the quote. "É intencional" on the continuity comment with the reason "Elias mente para Marta" → state `intentional`, reason saved. "Atualizar a nota" → a new author message in the read thread and a reply (the mock answers with its normal edit flow; assert only the message was sent).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run`, `npm run e2e -- editorread review selmenu ctrlenter --workers 1` → pass.
- [ ] **Step 5: Commit** `What a comment can do: polish, discuss, update a note, intentional`.

### Task 9: The revision list, and a second read

**Files:**
- Create: `src/renderer/src/features/read/RevisionList.tsx`
- Modify: `src/renderer/src/stores/ui.ts` (`revisionOpen: boolean`, `setRevisionOpen`; reset in `resetForBook`), `src/renderer/src/features/write/ChapterSidebar.tsx` (a top item "Lista de revisão" with the open count between the head and the list, ~L49; each chapter row shows its open count), `PageEditor.tsx` or `BookView.tsx` (the list page covers the desk while `revisionOpen`; the Write view stays mounted)
- Test: `editorread.mjs` part 6

**Interfaces:**
- Consumes: Tasks 1–8.
- Produces: `RevisionList` page. Filters: lens (Todas + 5, with counts) and state (Todas, Abertas, Feitas, Ignoradas, Intencionais, with counts). Groups by chapter in book order, header "Cap. N · TÍTULO" with "N abertas · N feitas…". Row: state icon, text, the passage quote (italic), the lens tag, the state; continuity rows show a chip "Cap. N ⇆ <source label>"; hover actions = the Task 8 actions + "Ir ao trecho". "Nova leitura" opens the Task 5 popover for the open chapter. A click on a chapter in the sidebar closes the list.
- Second read: `startRead` passes the earlier comments of the chapter to `buildReadTurn` (Task 3 already formats them); `<resolved ids>` → the toast of Task 5 → "Marcar como feitos" sets them `done` with Undo.

- [ ] **Step 1: Write the failing scenario** part 6: open the list from the sidebar item (count = open comments); the lens filter "Continuidade" shows only continuity rows; the state filter "Intencionais" shows the intentional row with its reason; "Ir ao trecho" closes the list and the passage is on screen. Read chapter 1 again: the author message's read block (check `useBook` threads) lists the earlier ids; the mock answers with `<resolved>`; the toast "Marcar como feitos" sets that comment `done`. Book switch: the list of the other book has no comment of the first (Review Focus 4).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run e2e -- editorread switchbook reorder plannav --workers 1`, `npx vitest run`, `npm run typecheck` → pass; look at the list screenshots (light/dark, pt-BR/en).
- [ ] **Step 5: Commit** `The revision list, and a second read that knows the first`.

### Task 10: Words, docs and release

**Files:**
- Modify: `GLOSSARY.md` (Editor's read, Comment, Lens, Revision list; under "AI" and "Views"), `src/shared/i18n/README.md` (terms table), `docs/SPEC.md` (§4.5b Editor's read, short), `docs/ARCHITECTURE.md` (a section: read threads, `ai/comments.json`, the marks extension, the margin and the room, the revision list), `docs/ROADMAP.md` (a "Version 0.15 — the editor's read" section and Current focus), `CHANGELOG.md` (0.15.0), `package.json` + the 2 version fields of `package-lock.json`
- Test: the full suite once

- [ ] **Step 1: Run** `npm run typecheck`, `npx vitest run`, then the full `npm run e2e` (once) → all pass, no unstable scenario.
- [ ] **Step 2: Update** the docs and the version; check `git diff` for names of the user's novel (none).
- [ ] **Step 3: Commit** `Release 0.15.0`; push main; tag `v0.15.0`; push the tag; `gh run watch <id> --exit-status`; `gh release view v0.15.0` lists latest.yml, the exe and the blockmap.
