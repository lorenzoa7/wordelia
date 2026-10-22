# Glossary

This file is the ubiquitous language of Wordelia. Use these words in code, docs and UI. Use one word for one thing.

## Book and text

| Term | Meaning | In code |
|---|---|---|
| **Book** | One writing project. A folder on disk with a `wordelia.json` manifest. | `Book`, `BookManifest` |
| **Library** | The list of books that the app knows. It lives in the app data folder, not in a book. | `Library` |
| **Manuscript** | The text of the book: an ordered list of chapters. | `Manuscript` |
| **Chapter** | One part of the manuscript. One Markdown file in `manuscript/`. Shown as a tab in the Write view. | `Chapter` |
| **Scene break** | A marker between two scenes in a chapter. Stored as `* * *`. | `sceneBreak` node |
| **Typography** | The book-level text styles: font, size, line height, indent, alignment. | `Typography` |

## Planning

| Term | Meaning | In code |
|---|---|---|
| **Planning** | The notes about the book that are not the book: characters, places, world, plot. The AI reads it as the source of truth. | `Planning` |
| **Category** | A group of entries, for example Characters. One folder in `planning/`. | `Category` |
| **Entry** | One planning note, for example one character. One Markdown file. On screen the word is "note" ("nota" in Portuguese and Spanish); "entry" is the word in code and docs. | `Entry` |
| **Link** | `[[Note name]]` in a note or a chapter, like Obsidian. Also `[[Note name#Heading]]` and `[[Note name|shown text]]`. Ctrl+click opens the note. | `WikiLinks`, `parseWikiTarget` |
| **Portrait** | The image of an entry. It shows on the card of the entry. The file is in `planning/_assets/`. | `entry.image` |
| **Story line** | The events of the story as a board of cards, in two views: by chapter and by time. A planning entry with `type: story-line`. The Plan view shows it as "Line". | `Board`, `storyline.ts` |
| **Line card** | One event of the story on the story line. It has a place in each view, or none. | `LineCard` |
| **By chapter** | The view of the story line with a column for each chapter: the written chapters, then the planned chapters. | `LineView = 'chapter'` |
| **By time** | The view of the story line with a column for each moment of the story time, in order. ("Por ordem" in Portuguese.) | `LineView = 'order'` |
| **Moment** | One column of the story line by time: a date, a time, a scene or a group of events. | `Board.moments` |
| **Planned chapter** | A column of the story line by chapter for a chapter that is not in the book yet. | `ViewColumn.kind = 'planned'` |
| **Tray** | The first column of a view of the story line: the cards that have no place in that view. | `TRAY` |
| **Alias** | Another name for an entry. The app uses aliases to find mentions in the manuscript. | `aliases` |
| **Sync** | The AI compares the manuscript with the planning and proposes changes to the planning. The button says "Update notes"; its tooltip says that the notes update from the chapters. On screen, the word "sync" is not used. | `planningSync` |

## AI

| Term | Meaning | In code |
|---|---|---|
| **Provider** | A connection to an AI service: Claude Code, Codex, Anthropic API or OpenAI API. | `Provider` |
| **Model route** | The model that the app uses for one task: chat, action, sync or background. | `ModelRoute` |
| **Thread** | One chat conversation with the AI. A book has many threads. | `Thread` |
| **Brief** | The purpose of a thread, written by the user. Example: "Marta's arc". | `thread.brief` |
| **Digest** | A short summary of a thread that the AI keeps up to date. All other threads read it. | `thread.digest` |
| **Action** | A configurable AI operation on selected text, for example **Polish**. | `Action` |
| **Global action** | An action for all books. The app settings keep it. The settings call the group "All books". | `AppSettings.actions`, scope `global` |
| **Book action** | An action that only one book has. The book folder keeps it in `ai/actions.json`. The settings call the group "This book". | `useBook.actions`, scope `book` |
| **Writing rules** | The rules of the author that apply to all AI work on this book. | `writingRules` |
| **Proposal** | A change that the AI proposes. The user must accept or reject it. | `Proposal` |
| **Hunk** | One part of a proposal: one find-and-replace on one file. | `Hunk` |
| **Chat image** | An image that the author adds to a chat message. The app makes it small (WebP, at most 1568 px on the long side) and keeps it in the book, in `planning/_assets/chat/`. | `ChatImage` |
| **Reply** | To quote selected text into the chat composer. | `reply` |
| **Mention** | A chapter, an entry or a thread that the user names in a chat message with "@". It shows as a pill in the text. | `Mention` |
| **Editor's read** | The AI reads a chapter, or a part of it, as an editor. It writes a short letter in the chat and leaves comments on passages. It never changes the text. | `ReadRequest`, `features/read` |
| **Comment** | One finding of an editor's read, on one passage of a chapter. It is not a planning note. Its state is open, done, ignored or intentional. | `EditorComment` |
| **Lens** | The way an editor's read looks at a chapter: structure, reader, style, continuity or proofread. "All lenses" uses all of them. | `Lens`, `LensChoice` |
| **Passage** | The words of a chapter that a comment is about. The `<find>` of the comment gives them. | `EditorComment.passage` |
| **Read thread** | The thread of the reads of one chapter: "Read · <chapter title>". | `Thread.readChapterId` |

## Views

| Term | Meaning |
|---|---|
| **Write view** | The main view. The chapter tabs, the page and the chat. |
| **Thread list** | The view of the chat panel with all the threads of the book. |
| **Plan view** | The view for planning entries. |
| **Map** | A graph of all entries in the Plan view. A line links two entries when one mentions the other. |
| **Desk** | The background of the app, around the page. |
| **Page** | The paper surface where the user writes. |
| **Comment margin** | The column of comment cards to the right of the page, on the desk. Not the margin of the page. |
| **Revision list** | The page with all the comments of the book, by chapter, with filters by lens and by state. It covers the desk in the Write view. |
