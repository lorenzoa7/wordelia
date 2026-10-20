# Story line board ("Linha da história", second design) — design

Date: 2026-10-20. This design replaces `2026-10-20-story-line-design.md` (lanes and moments). The author asked for it in chat, with sketches, and asked to start without more questions. The calls marked **(my call)** are mine; the author can change them.

## Intent

The first Line put events in lanes (one row for each group of characters) and in moments. The author found it hard to read: cards side by side, mention pills that made the cards cramped, a big drag image, and a "you are here" that was one moment off. The author wants a simple board, like Trello, with two views of the same events:

- **By chapter.** Each chapter is a column. The cards of a column are the events of that chapter, from top to bottom in the order of the chapter.
- **By order.** Each column is a moment of the story time: a group of events, for example "August 1883", "12 August 1899", "Investigation in Cruzília". The cards of a column are in the order in which the events really happened.

The two views show the **same cards**. In the author's book, the childhood events are told in chapter 3, but in "By order" they come first. This difference between the order of telling and the order of the events is the reason for the two views.

## Goals

1. **Two views, one set of cards.** A switch at the top right: "By chapter" and "By order". Each card has a place in each view: a chapter column and a moment column, each with its position. A card that has no place in a view shows in a tray column at the start of that view: "No chapter" or "No moment". A tray shows only when it has cards.
2. **Columns of "By chapter".** The written chapters of the manuscript come first, in the order of the book, with their titles. They are always there, also when they have no cards. Planned chapters come after them: columns that the author adds for chapters that do not exist yet. The header shows the number of the chapter and its title.
3. **"You are here".** In "By chapter": the column of the last chapter of the manuscript. In "By order": the column of the last card of the last chapter that has cards in a moment. It does not depend on the open chapter. **(my call for "By order")**
4. **Editing like Trello.** No "Edit as text".
   - A "+" card placeholder under the last card of a column creates a card in place. Enter adds the card and opens the next one.
   - A "+" column placeholder after the last column creates a column (a moment, or a planned chapter).
   - A column header has a grip. A drag moves the column with its cards. The written chapters have no grip: their order is the order of the book. Planned chapters move among the planned chapters. **(my call)**
   - A drag moves a card in its column, or to another column, also to and from a tray.
   - Rename a column: double-click the title, or the column menu. To rename a written chapter renames the chapter of the book (the column is the chapter). **(my call)**
   - Delete a column: the column menu. The cards of the column go to the tray of that view; they keep their place in the other view. A toast has Undo. A written chapter cannot be deleted here. **(my call)**
5. **Cards.** All cards have the same size. They stack in a column with the same gap. The text is cut with "…". A line at the bottom of the card shows the place of the card in the other view: the moment in "By chapter", the chapter in "By order". A card in a planned chapter (or with no chapter) has a dashed border.
6. **Card dialog.** A click on a card opens a dialog: the full text, the chapter and the moment (two selects), the mentioned notes, Delete, Cancel and Save. "@" in a text box suggests notes.
7. **Mentions.** "@Name" shows as underlined text in one color. A click opens the note. No pills.
8. **Scroll.** The page does not scroll vertically. The board fills the space under the header. The board scrolls horizontally; each column scrolls vertically.
9. **Empty Line.** The Line starts as an empty board ("By chapter" has the written chapters, with no cards). A small banner suggests to ask the AI. Its button opens a new chat thread with a draft, for example "Fill my story line from this information: ". The author completes the message (a pasted text, an @mention of a note, an image) and sends it. The "Build the story line" dialog goes away.
10. **AI proposals in the Line.** When the open chat thread has a proposal for the Line that waits for a decision, the Line shows the board now with the changes: only green (a card or a column that comes, where it goes) and red (one that goes away, where it is), and a word diff for a new text. A move is two changes. Each change has Apply and Reject; "Apply all" and "Reject all" are at the top and in the chat. For a first fill, all is green. While a proposal shows, the board cannot be changed. The chat has one short card for the changes of a reply: the count and "Show in the line". (Changed in 0.12, after the author's feedback.)
11. **The Write view.** The card under the chapter list shows the cards of the open chapter, in order, and their moments. A click opens the Line.
12. **Chat and sync.** The AI reads the Line in each message and changes it only with proposals. The sync proposes cards for the events of changed chapters.

## Non-goals and anti-goals

- No rows for characters (lanes). No dates or calendars: a moment is a free title.
- No inline text editing of the Markdown.
- The AI never changes the Line without approval.
- A Line action never changes the manuscript text. (A rename of a written chapter column renames the chapter; that is the only effect on the book.)
- Planned chapters do not go between written chapters: they come after them.

## Storage (decided)

The Line is still a planning entry with `type: story-line` in its front matter, so the store, the watcher, the trash, proposals, undo and rewind work as before. It does not show in the category lists of Plan (the Line view is its only view). A click on a mention of it opens the Line view.

The body (internal, the author does not see it):

```
# Cards
- ^c1 @Elias lights the lamp; a boat is missing.
- ^c2 @Marta climbs the stairs with coffee.

# By chapter
## The Storm ^k1
^c1 ^c2
## The Return ^k3
^c4

# By order
## The night of the storm ^k2
^c2 ^c1
```

- `# Cards`: one list item for each card: `- ^id text`. The text is one line.
- `# By chapter` and `# By order`: a `## ` heading for each column (`title ^id`), and on the next line the ids of its cards, in order.
- A "By chapter" heading whose title is the title (or the file name) of a chapter is that chapter (case, accents, `[[ ]]` and a number in front such as "3. " do not matter). Other headings are planned chapters.
- Tolerance, for AI output: a missing id gets a new one; a list item with text under a column defines a card there; ids can be one per line; the words of the sections can also be in Portuguese or Spanish; the old format (lanes, `## ` moments, `- Lane: text → [[Chapter]]`) becomes moments and chapter places. The app writes the canonical form when the author changes the board.
- New ids: `c` and the next number for cards, `k` and the next number for columns.

## Drag and drop

`@dnd-kit/core` and `@dnd-kit/sortable` (pointer events, not the HTML drag). Reasons: the HTML drag holds the hidden test window on Windows and Chromium cancels it when the page changes under the pointer; dnd-kit gives a drag image of the size of the card, auto-scroll, and a keyboard drag (Space). A move of 5 px starts a drag, so a click still opens the card.

## AI

- **Chat prompt.** The protocol explains the format, the ids, the two views, and how to change it: `<edit>` on whole lines for small changes, `<create>` on the same file to replace all. A new Line is a `<create>` in the plot category with `type: story-line`. The outline says which chapter is the last written one.
- **The banner draft** goes to a new blank thread; nothing is sent.
- **Diff.** The proposed body is the current body with the hunks of the proposal (or the content of the `<create>`). `diffBoards` compares the two boards by card and column ids (then by text, for a rebuild with new ids).
- **Mock AI.** A fill request without a Line gives a `<create>`; "move" gives an `<edit>` that moves a card to the first moment.

## Left to the builder

Sizes, colors (from tokens), icons, text, the layout of the header, the empty and error states, and the animations.
