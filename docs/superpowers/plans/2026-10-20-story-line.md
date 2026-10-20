# Story line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Line" view in Plan that shows the events of the story in lanes and moments, built and changed by the AI through chat proposals.

**Architecture:** The story line is a planning entry with `type: story-line` in its front matter; its body holds a lanes line, moment headings and event list items. One pure module (`src/shared/storyline.ts`) parses, lays out and edits it. The chat prompt sends it with the moment of the open chapter, and the existing `<edit>`/`<create>` proposals change it. The renderer draws it in the Plan view and in a small card of the Write view.

**Tech Stack:** TypeScript, React 19, zustand, Vitest, Playwright scenarios (`scripts/shots`).

**Spec:** `docs/superpowers/specs/2026-10-20-story-line-design.md`

## Global Constraints

- Every text that the user sees goes through `src/shared/i18n` (English, Portuguese (Brazil), Spanish).
- Colors, spacing, fonts and motion come from `src/renderer/src/styles/tokens.css`.
- `src/shared/` stays pure (no Node, DOM or Electron).
- The AI never changes the story line without approval: only `<edit>`/`<create>` proposals.
- The user's novel never goes into the repository: tests and docs use the sample book (Elias, Marta, Santa Ilha, the visitor).
- Prose in docs: ASD-STE100.

## Review Focus

1. A story line that the author edits by hand (in Obsidian) with odd lines: extra spaces, `*` bullets, `###` headings, no lanes line → the parser keeps working and drops nothing (Task 1 test `tolerates hand edits`).
2. A chapter renamed after its events got links → the links follow (Task 4 test `renames links`).
3. Two entries named "Ana" and "Ana Lúcia" → `@Ana Lúcia` is one mention of the longer name (Task 1 test `longest mention`).
4. A meeting of lanes 1 and 3 with lane 2 busy in the same moment → no overlap, the card names its lanes (Task 1 test `packs a meeting over a busy lane`).
5. A book without a story line → no "# Story line" prompt section, no Write card, the Line view shows the build button (Tasks 2, 3, 5).

---

### Task 1: The story line module

**Files:**
- Create: `src/shared/storyline.ts`
- Test: `src/shared/storyline.test.ts`

**Interfaces:**
- Produces:
  - `STORY_LINE_TYPE = 'story-line'`, `isStoryLine(e: Pick<Entry, 'meta'>): boolean`, `findStoryLine(entries: Entry[]): Entry | null` (first by `file`).
  - `interface StoryEvent { lanes: string[]; text: string; links: string[]; line: number }` (`line`: index in the body lines; `lanes` empty for "Other").
  - `interface StoryMoment { label: string; line: number; events: StoryEvent[] }`
  - `interface StoryLine { lanes: string[]; past: string | null; lanesLine: number; moments: StoryMoment[] }` (`lanesLine` -1 when none).
  - `parseStoryLine(body: string): StoryLine`
  - `chapterOf(link: string, chapters: Pick<Chapter, 'id' | 'title' | 'file'>[]): string | null` (chapter id; title or file name, case and accents ignored).
  - `type Piece = { kind: 'text'; text: string } | { kind: 'mention'; entryId: string; text: string }`; `mentionPieces(text: string, entries: Pick<Entry, 'id' | 'name' | 'aliases'>[]): Piece[]`
  - `interface Placed { event: StoryEvent; moment: number; sub: number; rows: number[] }`; `layoutStoryLine(line: StoryLine): { rows: string[]; subs: number[]; placed: Placed[] }` (`rows`: lanes, then the past lane, then `''` for Other when used; `subs[m]`: sub-columns of moment m).
  - `momentOfChapter(line: StoryLine, chapterId: string, chapters): number` (-1 when none).
  - `moveEvent(body: string, line: StoryLine, event: StoryEvent, toMoment: number, toLane: string): string`
  - `renameLinks(body: string, oldTitle: string, newTitle: string): string`

- [ ] **Step 1: Write the failing tests** — `parses lanes, moments and events` (the spec example: lanes `['Elias','Marta','The visitor','Past']`, past `'Past'`, 3 moments, labels `'1'`, `'2 · The boat'`, `'3'`, the meeting has lanes `['Elias','Marta']`, links `['The Storm']`); `reads the lanes word in three languages` (`Trilhas:` with `(passado)`, `Carriles:` with `(pasado)`); `makes lanes from events without a lanes line`; `adds an unknown lane after the others`; `puts an item without a lane in Other` (`lanes: []`); `tolerates hand edits` (`* ` bullets, `  - ` indent, `###` heading inside a moment kept as a non-event line, trailing spaces); `matches links by title and file name, ignoring accents`; `longest mention` (entries "Ana", "Ana Lúcia": `@Ana Lúcia chega` → one mention of "Ana Lúcia"; `@Ninguém` → text); `packs a meeting over a busy lane` (moment with `Elias: a`, `Marta: b`, `Elias + The visitor: c` → `subs[0] === 2`, c in sub 1 with rows `[0,1,2]`); `stacks single events of one cell in one sub-column`; `finds the moment of a chapter`; `moves an event line` (only that line changes; new prefix and new heading); `renames links`.
- [ ] **Step 2: Run** `npx vitest run src/shared/storyline.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement `src/shared/storyline.ts`** with the interfaces above. Packing: for each moment, take events in order; a single-lane event joins the existing cell of its lane when the cell has one, else the first sub-column whose rows are free; a meeting takes the first sub-column where all rows from its first to its last lane are free.
- [ ] **Step 4: Run** the tests — PASS. Run `npm run typecheck`.
- [ ] **Step 5: Commit** `Story line: parser, layout and line moves (shared, with unit tests)`.

### Task 2: The AI reads and changes the story line

**Files:**
- Modify: `src/shared/prompts/chat.ts` (new section, protocol text), `src/shared/prompts/sync.ts` (rule), `src/renderer/src/features/chat/send.ts`, `src/renderer/src/features/plan/sync.ts` (pass the chapter for the moment line)
- Test: `src/shared/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: `findStoryLine`, `parseStoryLine`, `momentOfChapter` (Task 1).
- Produces: `storyLineBlock(entry: Entry, chapters: Chapter[], currentChapterId: string | null): string` in `src/shared/prompts/context.ts`.

- [ ] **Step 1: Failing tests** — `sends the story line with the moment of the open chapter` (system contains `# Story line`, `planning/Plot/Story line.md`, the body, and `The open chapter "The Storm" is in moment 1`); `no story line, no section`; `the story line goes in full also when the plot budget is full`; `the sync prompt asks to link events to chapters when a story line exists`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the section (after the planning index) and the protocol lines (format, `<edit>` on whole lines, move = delete + add, lanes line edits, `<create>` with `type: story-line` in the plot category, `@Name`, `→ [[Chapter title]]`). Leave the story line out of the "entries that matter now" list so it does not go two times.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Story line: the chat and the sync read it and propose changes to it`.

### Task 3: The Line view

**Files:**
- Create: `src/renderer/src/features/plan/StoryLineView.tsx`, `src/renderer/src/features/plan/storyline.css`
- Modify: `src/renderer/src/features/graph/nav.ts` (`LINE_PAGE = ':line'`, `openLine()`), `src/renderer/src/features/graph/MapView.tsx` (third switch button; leave the story line out of the map), `src/renderer/src/features/plan/PlanView.tsx` (route), i18n `plan.ts` ×3

**Interfaces:**
- Consumes: Task 1 (`layoutStoryLine`, `mentionPieces`, `chapterOf`, `momentOfChapter`, `moveEvent`), `MentionPill` (chat), `useBook` (`updateEntry`, `selectEntry`, `selectChapter`, `setView`).
- Produces: `StoryLineView(): React.JSX.Element`, `openLine(): void`.

- [ ] **Step 1: Implement** the grid (CSS grid: a label column, then one column per sub-column of each moment; cards placed by `Placed`), written and planned cards, meeting cards (accent tint, lane names when not contiguous), mention pills (click opens the entry), chapter names (click opens the chapter), the moment of the open chapter (tint + "you are here"), drag a card to a cell (`moveEvent` → `updateEntry`), "Edit as text" (opens the entry), the empty state with "Build the story line" (Task 4 fills the dialog).
- [ ] **Step 2: Check** `npm run typecheck`, and look at a screenshot from a scratch scenario.
- [ ] **Step 3: Commit** `Story line: the Line view in Plan`.

### Task 4: Build, chapter renames and the scripted AI

**Files:**
- Create: `src/renderer/src/features/plan/BuildStoryLine.tsx`
- Modify: `src/renderer/src/stores/book.ts` (`renameChapter` calls `renameLinks` on the story line), `src/main/ai/mock.ts` (build → `<create>`; "move"/"mova" → `<edit>` that moves the last event to the first moment), i18n ×3
- Test: `src/shared/storyline.test.ts` (`renames links` is in Task 1; here the store wiring is covered by the scenario)

**Interfaces:**
- Consumes: `newThread`, `sendMessage` (`send.ts`), `useChat` (`openBlank`, `addQuote`, `mentions`).
- Produces: `askBuildStoryLine(source: { kind: 'entry'; entryId: string } | { kind: 'text'; text: string } | { kind: 'chapters' }): Promise<void>`.

- [ ] **Step 1: Implement** the dialog (three choices, plot entries first), `askBuildStoryLine` (opens the chat, a blank thread titled with `t.plan.line.threadTitle`, puts the mention or the quote, sends the message in the interface language), the rename wiring, the scripted replies.
- [ ] **Step 2: Check** typecheck and unit tests.
- [ ] **Step 3: Commit** `Story line: build from a source through the chat; links follow chapter renames`.

### Task 5: The Write view card

**Files:**
- Create: `src/renderer/src/features/write/StoryLineCard.tsx`
- Modify: `src/renderer/src/features/write/ChapterSidebar.tsx`, i18n `write.ts` ×3, `storyline.css`

**Interfaces:**
- Consumes: Task 1 (`findStoryLine`, `parseStoryLine`, `momentOfChapter`, `mentionPieces`), `openLine` (Task 3).

- [ ] **Step 1: Implement** the card under the chapter list: "Moment N", the events of the chapter, "At the same time: …", "Next: …"; nothing when the chapter has no event or the book has no story line. A click opens the Line view.
- [ ] **Step 2: Check** typecheck.
- [ ] **Step 3: Commit** `Story line: a card of the open chapter in the Write view`.

### Task 6: Scenario, docs and release

**Files:**
- Create: `scripts/shots/storyline.mjs`
- Modify: `scripts/e2e.mjs`, `docs/ARCHITECTURE.md`, `GLOSSARY.md` (Story line, Lane, Moment), `docs/ROADMAP.md`, `CHANGELOG.md`, `package.json`, `package-lock.json`

- [ ] **Step 1: Write the scenario** as in the spec "Tests" (build from the Marta entry through the chat → accept → lanes, moments, meeting, mention pill, written and planned, you are here → "move" through the chat → accept → moved → drag → moved in the entry → Write card → the map has no story line node).
- [ ] **Step 2: Run** `node scripts/shot.mjs storyline` — PASS; look at the screenshots.
- [ ] **Step 3: Run** `npm run typecheck`, `npx vitest run`, `npm run e2e` (all).
- [ ] **Step 4: Docs, version 0.10.0, commit, push, tag `v0.10.0`, watch the release.**
