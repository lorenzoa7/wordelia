# Story line ("Linha da história") — design

Date: 2026-10-20. Approved by the author in chat (mockups in the conversation).

## Intent

An author has a general view of where the story goes: a synopsis, notes, the chapters that exist. The order of events is loose, and groups of characters live parallel stories that meet. The story line shows the events of the story as a diagram: lanes (groups of characters) and moments (before, after, at the same time). The AI builds it from a summary, and the author changes it mostly by asking the chat. The AI also reads it, so questions such as "how do I connect this part with what comes next?" get an answer for the right point of the story.

## Goals

1. **A third view in Plan:** "Line", beside "Cards" and "Map".
2. **Diagram:** lanes are rows; moments are columns. A moment has no date: it only says "before", "after", "at the same time". An event is a short card. An event in two or more lanes is a meeting: its card spans those lanes. One lane can be the past lane, for flashbacks.
3. **Written or planned:** an event with a link to a chapter is written (solid card, chapter name on it). An event without a link is planned (dashed card).
4. **Mentions:** "@Name" in the text of an event shows as a mention pill with the icon of the category of the entry (as in the chat). A click opens the entry.
5. **You are here:** the moment of the events linked to the open chapter has a mark.
6. **The chat reads and changes it:** the story line goes to the AI in every chat message, with the moment of the open chapter. The author asks for changes ("put the storm before the visit", "make a lane for the visitor"); the AI proposes them with the existing proposal protocol. Nothing changes without the author's approval.
7. **Build from a source:** "Build the story line" on the empty Line view. The source is a planning entry (for example a synopsis note), a pasted text, or the written chapters. The build goes through the chat: the app opens a thread and sends a message; the AI replies with a `<create>` proposal.
8. **Write view:** a small card under the chapter list: the event of the open chapter, the events at the same time, the next events. A click opens the Line view.
9. **Manual changes:** drag a card to another cell (moment and lane). "Edit as text" opens the entry in the note editor.
10. **Sync:** the planning sync links events to the chapters that tell them, and proposes events that the chapters show and the line does not have.

## Non-goals and anti-goals

- No dates, calendars, or tension graphs.
- The story line is optional. A book without one works as before; nothing asks the author to make one.
- The AI never changes the story line without approval (proposals only).
- No fixed list of steps: the order is loose, parallel events are normal.
- The author's own notes (the summary) are not changed by the build.

## Storage (decided)

The story line is a planning entry with `type: story-line` in its front matter. `entryFromFile` already keeps unknown front-matter keys in `Entry.meta`. A book has one story line: the first entry with this type (by file name). The build puts it in the plot category: `planning/Plot/<name>.md`, with the name in the book language ("Linha da história", "Story line", "Línea de la historia"). Because it is a normal entry, the store, the file watcher, the trash, external edits, proposals (`<edit>`, `<create>`), rewind and the planning index work without new code. The Map leaves it out (it would link to everyone).

### Body format

Everything that a proposal can change is in the body, so `<edit>` proposals, undo and rewind work as for other entries. The front matter has only `type: story-line` and the summary.

```markdown
---
type: story-line
summary: The events of the story, in lanes and moments.
---
Lanes: Elias · Marta · The visitor · Past (past)

## 1
- Elias: The storm comes; a boat is missing. → [[The Storm]]
- Marta: @Marta brings coffee to the lighthouse. → [[The Storm]]
- Past: Twenty-two years ago, the first night of @Elias at the lighthouse.

## 2 · The boat
- Elias + Marta: They see the blue boat together. → [[The Visitor]]
- The visitor: A stranger lies in the blue boat.

## 3
- Elias + Marta + The visitor: The visitor wakes up in the lighthouse.
```

Rules (one parser in `src/shared/storyline.ts`, pure, with unit tests):

- The lanes line gives the order of the lanes: a line that starts with `Lanes:`, `Trilhas:` or `Carriles:` (the build writes the word of the book language), then the lane names separated by ` · `. The suffix ` (past)`, ` (passado)` or ` (pasado)` marks the past lane. Without a lanes line, the lanes are in the order of their first event.
- A level-2 heading starts a moment. Its text is the label of the moment ("1", "2 · The boat"). The order of the headings is the order of the moments.
- A list item is an event. It starts with lane names joined by ` + `, then `: `, then the text. A lane name that the lanes line does not have becomes a new lane after the others (the parser does not fail). A list item without a lane prefix goes to a row "Other" at the bottom.
- Chapter links are at the end of the line: `→ [[Title]]`, more than one with `, `. A link matches a chapter by its title or its file name, ignoring case and accents. A link to a chapter that does not exist shows as plain text, and the event stays planned.
- A mention is `@` followed by the longest entry name or alias that matches there (ignoring case and accents). Other `@words` are plain text.
- Other lines (paragraphs, notes) are kept as they are and do not show in the diagram.

### Layout (decided)

- Rows: the lanes in their order, then the past lane (its label in italics), then "Other" when it has events.
- Columns: the moments. Inside a moment, events go into sub-columns: an event goes into the first sub-column where all its rows are free. Several single-lane events of one cell stack in one cell and share a sub-column. A meeting goes into its own sub-column when its rows are taken. So cards never overlap. This packing is a pure function with unit tests.
- A meeting spans from its first lane to its last lane. When its lanes are not next to each other, the card shows the names of its lanes.
- You are here: the moment of the events linked to the open chapter has a tinted background and "you are here" in its header. The cards of the open chapter have an accent border.
- The build dialog: three choices (a planning entry from a list with the plot entries first, a text box for a pasted text, the written chapters) and "Build".
- The Write view card: as in the mockup step 3 ("Moment 2", the events, "At the same time", "Next").

### Changes by the app

- Drag a card to another cell: the app moves only that list line (new moment heading, new lane prefix). The rest of the text stays as it is, so the change is a small diff in the history.
- Rename of a chapter: the app changes `[[Old title]]` to `[[New title]]` in the story line.

## Chat

- The chat system prompt has a section "# Story line" when one exists: the file path, its full text (it always goes, also outside the plot budget), and one line about the open chapter: "The open chapter "X" is in moment 3 (events: …)." When the open chapter has no event, the line says so.
- The protocol section explains the format and how to change it: small changes with `<edit>` on whole list lines (move = delete the line and add it under the other moment heading); a new story line with `<create>` and `type: story-line` in the front matter; mentions as `@Name` of existing entries; links as `→ [[Chapter title]]`.
- The proposal cards are the existing ones (a word diff of the changed lines).
- Build: the Line view shows "Build the story line" when the book has none. A dialog asks for the source: a planning entry (a list of the entries, the plot entries first), "Paste a text", or "The written chapters". The app opens a new thread ("Story line") and sends a message that the app writes in the interface language: with an @mention of the entry, or with the pasted text as a quote, or with the request to use the chapters. The AI replies with a `<create>` proposal.

## Write view

Under the chapter list, when a story line exists and the open chapter has events: a small card with "Moment 3", the events of the chapter, "At the same time: …" (other lanes, same moment), and "Next: …" (the next moment, the same lanes). A click opens the Line view.

## Sync

The sync prompt gets the story line in full, and one rule: link events to the chapters that tell them (add `→ [[Title]]`), and propose events that the changed chapters show and the line does not have. Only when a story line exists.

## Tests

- Unit (`storyline.test.ts`): the lanes line (three languages, the past mark, no lanes line), meetings, unknown lanes, items without a lane, chapter links (title, file name, accents, missing chapter), mentions (longest match, aliases, unknown `@word`), lines that stay, the sub-column packing, moving a line, renaming a link; the chat prompt section.
- End-to-end scenario `storyline`: build from a planning entry through the chat (the scripted AI replies with a `<create>`) → accept → the Line view shows the lanes, the moments, a meeting card over its lanes, a mention pill with its icon, a written and a planned card, the mark on the moment of the open chapter; ask the chat to move an event (the scripted AI replies with an `<edit>`) → accept → the card is in the new moment; drag a card → the line moved in the entry; the Write view card shows the events; the Map does not show the story line.

## Left to the builder

The look (follow the mockups and the tokens), the exact words of the interface and of the prompts, the scripted AI replies, how the drag shows its target.
