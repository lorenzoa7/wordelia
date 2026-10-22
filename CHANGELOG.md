# Changelog

Each version has its Windows installer in GitHub Releases. The release workflow copies the section of the version from this file to the release notes.

## 0.15.0 (2026-10-22)

This version adds the editor's read: the AI reads a chapter as an editor and leaves comments in the margin. It never changes your text.

### The editor's read
- The glasses button of the toolbar reads the open chapter, or only the selected part. Choose all lenses or one: Structure, Reader, Style, Continuity or Proofread. Turn on "Chapter in progress" to read a chapter that is not finished.
- The read is a message in the thread "Read · <chapter>". You see the reply come in, and you can stop it or talk about it. The reply is a short letter ("What works", "What I would look at first") and at most 7 comments (5 for one lens).
- In the chat, ask for a read in your own words. The AI answers with a card, and one click starts the read.

### Comments in the margin
- Each comment is on a passage, with a number beside the text and a card to the right of the page. The first read makes room for the cards one time. "Hide" gives the room back.
- A comment follows its passage while you write. When the passage is gone, the card says "The passage changed".
- Each card has actions: Discuss in chat, Polish passage (the AI gets the comment, and you review the change as usual), Update the note (for Continuity), It's intentional (with a reason), Ignore and Done. A change of state has Undo.
- In the letter, "(→ 2)" goes to comment 2 in the margin.

### The revision list
- The first item of the chapter list opens all the comments of the book, by chapter. Filter them by lens and by state.
- A second read of a chapter knows the first one. It does not repeat comments that you closed. When it thinks that a comment is fixed, it asks you.
- The comments are in the book folder (`ai/comments.json`), so they go with the book. When two computers change them at the same time, the app keeps the changes of both. A damaged file is never overwritten: the app tells you, and does not change it.
- Retry, Rewind and Edit of a read remove only the open comments. Your decisions and reasons stay.
- Ctrl+Z outside the text no longer undoes typing that you cannot see (for example in the Plan view, or after a click on Done).

## 0.14.0 (2026-10-21)

This version fixes the 136 problems of a full review of the app, screen by screen.

### Write
- Plan and back: the page, the cursor and Undo stay as they were. A book opens where you stopped.
- Undo stays when a chapter goes far from the screen, after a change from Drive or git, and after you restore a version. A restore and a chapter delete have Undo in their message.
- Find and replace: Replace goes on to the next match, and "Replace in all chapters" changes the whole book.
- The app saves at least every 2 seconds while you type, and says "Saving…" until the text is on disk. A failed save says why, with Try again.
- An export never changes the page of the Write view. The Book PDF has the same pages as the screen. Page numbers, the title page in the language of the book, plain text and Markdown are correct.
- Paste gives the text the quotes and dashes of the book, and "***" becomes a scene break.
- The page fits small windows. New chapters say where they go. Focus mode, smart quotes and the status bar are fixed.

### AI actions
- Only the passage under review is locked: you can type in the rest of the chapter while the AI works.
- The diff shows joined paragraphs, removed scene breaks and changes of italics. A change of punctuation no longer shows "+0 −0".
- Esc stops the request. A reply without a rewrite is never put into the text. The selection comes back after an error or Reject.
- The main action cannot be deleted. You can reorder actions.

### Chat
- A reply that stopped never gives a change that you can accept.
- A reply no longer moves you to another page while you type: "Changes ready · Show" waits for you.
- The newest proposal for a passage wins. Old proposals leave the text. Reject, Create, Replace and Delete have Undo.
- A new text for an existing note shows what changes and what the note loses.
- Each conversation has its own draft. "Insert at cursor" inserts only the prose.
- Each reply shows its tokens and cost. Errors say what happened in plain words, with a button to fix them.

### Plan
- A rename of a note updates its [[links]] and the @mentions of the story line.
- The card dialog never loses what you typed. Deletes of notes and categories have Undo.
- Notes in subfolders show. Move a note to another category, remove a portrait, [[Name#Heading]] and [[Name|text]] links.
- One word for one thing: "note", and "Update notes" for the sync.

### Settings and AI
- A provider that you connect gets the tasks at once. A provider that you turn off is never used.
- Esc in a number box no longer closes Settings and loses the value.
- Clear statuses: login expired, bad key, no credit, offline, busy, usage limit with its reset time. "Remove key". Install pages instead of terminal commands.

### Library and import
- Import finds real scene breaks and chapter headings in words ("Capítulo Um"), and asks what blank lines are.
- A damaged wordelia.json is repaired from a kept copy, never lost. A missing chapter file keeps its place.
- "Open folder" asks before it makes a book. "Find the folder…" for a moved book. Undo for "Remove from list".
- Closing a book with text that is not saved asks first.

## 0.13.1 (2026-10-21)

### Fixed
- Escape or the close button of the find bar no longer scrolls the text back to where the cursor was. The text stays at the match, and the cursor goes there.
- Enter right after you type or paste in the find bar goes to the first match.
- A click on a chat proposal for a chapter always goes to the change: also from Plan, and also when the chapter is far from the screen.

## 0.13.0 (2026-10-21)

### New
- The AI in the chat sees the portraits of your notes. Each message brings a sheet with all the portraits and their names, and the notes that the message is about at a larger size. Ask it to compare the looks of a character with the text.
- A click on the portrait of a note shows the whole image. "Change" under the portrait chooses another image.

### Changed
- A new reply that changes a note (or the story line) opens that page.
- A portrait that the AI proposes shows on the page of the note, with "Use" and "Reject".
- The chat card of a story line proposal: the count of changes at the right, "Reject all" and "Apply all" side by side, and "Show in the line" under them.
- The card dialog: "Open the chapter" is next to the chapter field, and the buttons at the bottom stay in the dialog.
- The AI marks with @ every name of a note in the cards that it writes.

### Fixed
- A change that the AI proposes for a list in a note shows in the note as a diff.
- Apply and Reject on the story line keep the board where it is. The last decision no longer moves the board back to where it was before the proposal.

## 0.12.0 (2026-10-20)

### Changed
- A proposal of the AI for the story line shows only green and red: a card that comes is green where it goes, a card that goes away is red where it is. A move is both. Each change has Apply and Reject on the board; "Apply all" and "Reject all" are on the board and in the chat. The chat shows one card for the changes of a reply.
- Back in Plan goes to the page that you came from: from a note that you opened on the story line, back goes to the line, in the same view and at the same place.
- The card dialog has one size for every card. Its text box has a fixed height and scrolls; mentions of notes show in color as you type.
- The title and the switches of the story line are in the same place as in Cards and Map.
- The columns of the story line have the scrollbar of the app. The "+" column is as high as the other columns.
- A new banner on an empty line, with its own color and the icon of Reply.
- A new last chapter takes the title of the first planned chapter of the story line, and gets its cards. The AI names planned chapters in the style of your chapter titles.

### New
- Rename and delete categories, from the "…" menu of a category. The notes of a deleted category go to the trash of the book.

### Fixed
- The icon of Reply in the selection menu is on the middle of its text.
- A long moment name no longer goes out of the card dialog.

## 0.11.0 (2026-10-20)

### Changed
- The story line is a board now, like Trello, with two views of the same cards. "By chapter": a column for each chapter, with the events in the order of the chapter. "By time": a column for each moment of the story, with the events in the order in which they happen. A switch at the top right changes the view.
- Fill it by hand: "+" under the last card makes a card, "+" after the last column makes a column. Drag cards and columns, rename and delete them. A click on a card opens it; type @ to mention a note.
- All cards have the same size; a long text ends with "…". Mentions are underlined names; a click opens the note.
- "You are here" is the last chapter of the book.
- The page does not scroll; the board scrolls sideways, and each column scrolls down.
- An empty line has a small banner: it opens a new chat with a draft. Add a summary, a note or an image, and send it. The build dialog is gone.
- A proposal of the AI for the line shows on the board: new cards in green, deleted cards in red, moved and changed cards marked. Accept or reject it on the board or in the chat.

### Removed
- Lanes (rows for groups of characters) and "Edit as text".

## 0.10.0 (2026-10-20)

### New
- The story line, in Plan → Line: the events of your story in lanes (groups of characters) and moments (what happens at the same time). Meetings span the lanes that meet, and a past lane holds flashbacks.
- Build it from a planning note, a text or your chapters: the AI proposes it in the chat. Change it by asking the chat ("put the storm before the visit"), or drag a card.
- Names in the events are mentions with the icon of their category; a click opens the note. A chapter name opens the chapter.
- The AI knows where the open chapter is in the story line. The Write view shows a small card: this moment, what happens at the same time, and what comes next.

## 0.9.1 (2026-10-19)

### Changed
- A mention in the chat shows the icon of its category, the same as on the map of the Plan view: a person for a character, a pin for a place, a book for a chapter.

## 0.9.0 (2026-10-19)

### New
- Images in the chat. Add an image to a message with the image button, with Ctrl+V or by dropping it on the message box. Ask the AI to describe a character from a picture; it follows the writing rules of the book.
- The AI can propose an image as the portrait of a note, or a new note with its portrait. "Use as portrait" sets it, and the card of the note shows it in Plan.
- The book keeps the images of the chat, made small, in its folder.

## 0.8.5 (2026-10-19)

### Changed
- A page that you remove goes at once, like Google Docs. The movement of 0.8.3 and 0.8.4 is removed: at the end of the book, it moved the page above.

## 0.8.4 (2026-10-19)

### Changed
- When a page goes, its space closes softly from the start: the next chapter and "Start the next chapter" move up at once, with no wait and no jump.
- Backspace on an empty page scrolls the screen to the cursor softly, in the same movement.

## 0.8.3 (2026-10-19)

### New
- A page that you remove goes back into the desk: its sheet fades into the desk, and then the space closes softly. The page before it keeps its size.

## 0.8.2 (2026-10-19)

### Changed
- A new page comes in like a new sheet on the desk: the page before it keeps its size, the new sheet fades in, and the screen scrolls to it. The page no longer stretches.
- Backspace at the start of a new page removes the page break at once, like Google Docs. On an empty page, the cursor goes back to the end of the text of the page before.

### Fixed
- Ctrl+Enter on an empty page makes one more page.
- A second page break shows the new page coming in again.
- After you remove a page break, every page keeps the same size.
- Backspace always removes a page break; it no longer selects it and then shows it again.

## 0.8.1 (2026-10-18)

### Fixed
- A new page opens in one smooth movement while you type. The words that do not fit slide down to the new page, and the screen scrolls with them, so the cursor stays still. Before, the next key stopped the movement and the page jumped.

## 0.8.0 (2026-10-18)

### New
- Each page shows its number in the bottom corner.
- Page counts are exact: the chapter list, the library card and the page numbers count the white sheets. The library card shows "≈" only before the book is counted.
- The chapter list shows the pages of each chapter. The word count is in its tooltip.
- Three views of an AI change, with three buttons in the review bar: word by word, the old text over the new text, and the new text only. Settings → General sets the default view.
- Actions for one book. Settings → Actions has two groups: "All books" and "This book". The book keeps its actions in its folder, so they go with the book. "Use in" moves an action to the other group. The main action (Ctrl+J) stays for all books.

### Changed
- Zoom is a smooth, even scale of the pages. The words and the page breaks do not move when you zoom.
- A new page grows in more slowly and more softly.
- The bar with Accept and Reject stays above the passage when the change is ready.

### Fixed
- Typing on a new page at the end of a chapter no longer makes the page flicker.
- In the version history, "Close" and "Restore this version" no longer blink when you select another version.

## 0.7.0 (2026-10-18)

### New
- Chat proposals for planning notes show in the note as a diff, like in the chapters.
- Sync runs in the background: the button shows its progress, and a card shows the result with Review, Accept all and Reject all. The chat does not change. Sync is off when no chapter changed.
- The library card shows about how many pages the book has.
- A zoom slider in the toolbar. A double click on it goes back to 100 %.
- In the version history, the view goes to the first change of the version.

### Changed
- Zoom changes smoothly.
- A new page grows in quickly and smoothly.
- Accept and Reject in the text are larger, with words.
- The Polish button is no longer red.
- The loading bar of an action stays above the selection.
- The first Backspace after a page break shows the page break as selected; the next Backspace removes it. A selected scene break shows a ring.
- Four built-in actions instead of five: Polish, Tighten, Fix grammar only and Show, don't tell. Expand is removed when you did not change it.
- A click anywhere on a category row in the Plan sidebar opens it and shows its notes. The arrow lines up with the icon.
- The planning map fades softly when you point at an entry.

### Fixed
- A new page no longer flickers while you type.
- The bar for many proposals no longer cuts its buttons.
- Writing rules have space under the text.

## 0.6.0 (2026-10-17)

### New
- Ctrl+Enter makes a page break, like a word processor: the text after the cursor starts on a new page, and the cursor goes there. Backspace at the start of the new page removes it. PDF and DOCX exports keep it.
- Ctrl+Z after you accept a chat change undoes it, and the proposal shows in the text again. It also works right after you click Accept in the chat. Ctrl+Y applies it again.
- A new proposal from the chat scrolls into view in the text by itself (the last one of the reply).
- A zoom menu in the toolbar.
- A new page grows in with a short animation.

### Changed
- Zoom is smooth: the text does not adjust after a change, and the view stays on the same text, also in a long book.
- The planning map has a new look: each entry is a paper token with the icon of its category, chapters are small books, and the background has a light dot grid.
- The "Cards | Map" buttons stay in the same place when you switch.
- The sync button says "Sync". Its tooltip tells what it does.
- The Plan overview is now "The world of the story".
- Typewriter mode is in Settings → General, with an explanation.
- The "New thread" button fits the chat panel.
- In the thread list, no thread looks selected.

### Fixed
- After an accepted change, the spaces between words in a justified line could become too wide: a page break inside the paragraph stayed in a wrong place.
- Many line breaks (Shift+Enter) made a page grow without end. All pages keep the same height.
- Typewriter mode did not follow the cursor while you typed.
- A new thread that you leave empty is not saved, and old empty threads no longer show in the list.
- The chat scrolls fully to the end when you send a message, and follows the reply.

## 0.5.0 (2026-10-17)

### New
- Chat proposals show in the text by themselves: the change shows as a word diff, with ✓ and ✕ after it. "Show in text" now only goes to the change, from where you are.
- The planning map: Plan → Overview → Map. All entries as a graph, linked when one entry names another. Hover shows the links; a click opens the entry.
- The thread list is a full view in the chat panel. Use the ← button next to the thread title. Each thread shows its state.
- Mentions in the chat are in the text: type "@Jo", choose "José", and the name shows as a pill in your sentence.
- Page zoom: Ctrl+= and Ctrl+- zoom, Ctrl+0 goes back to 100 %, Ctrl+wheel also zooms.
- Page margins in Settings → This book: Top, Bottom, Left and Right, in centimeters.

### Changed
- The chat answers are shorter and more direct.
- The "Claude" badge is gone from the title bar. A warning shows only when no AI is connected.
- The logo is at the far left. The sidebar button is in the sidebar header; when the sidebar is hidden, a small button shows at the top left of the page.
- "Sync manuscript" is now "Update notes from the chapters", with a tooltip that tells what it does.
- "Typewriter scrolling" is now "Keep the typing line in the middle".
- The daily word goal is a number box.
- The sidebar follows the chapter on screen while you scroll.
- The thread purpose has its own strip above the messages.
- Icons line up with their text.

### Fixed
- Enter at the end of a page: the new line shows on the next page at once.
- The actions menu in the selection bubble opens under its button, not in a corner.
- The scene break is centered again.
- "Show in text" two times no longer marks a proposal as rejected.
- The chat scrolls to your message as soon as you send it.
- A long chapter title wraps in the page heading.
- A dropdown in Settings opens only when you click the dropdown itself.
- The proposal card header no longer overlaps with a long chapter title.
- A quick close and open of another book no longer leaves a blank window.

## 0.4.0 (2026-10-17)

### New
- Pages, like a word processor. The text is cut into pages of the book's page size (Settings → This book → Page size). The page has a fixed width; a narrow window scrolls sideways.
- The book is one long scroll. Every chapter starts on a new page, and scrolling down goes on into the next chapter. The arrow keys also go on into the next or the previous chapter.
- "Show in text" on a chat proposal: the chapter opens, the passage scrolls into view, and the change shows in the text with Accept and Reject.
- Chat: edit a message, rewind to a message, retry a reply, copy. A rewind can also undo the book changes of the removed replies.
- Chat: a thinking line shows what the AI does now. "Thought process" opens its full thinking.
- Chat: the thread list shows states. A red dot: proposals wait for you. A green dot: a new reply that you did not see. The chat button gets a dot when the chat is closed.
- A shortcut for each action. Settings → Actions has a key recorder. Ctrl+J stays on the main action.
- Drag the edge of the sidebar or the chat to change its width. Drag it to the window edge to close it, and drag it out again to open it.
- Plan pages have a back link ("← Overview", "← Characters"). Alt+← also goes back.

### Changed
- The model menu looks like the Claude app: model names with versions ("Opus 5.5"), a check on the current model, keys 1–9 and an Effort submenu.
- Settings open on General. The tabs of the open book ("This book" and "Writing rules") are under a line, below the other tabs.
- The writing rules moved from the Plan view to Settings → Writing rules.
- The AI connections are simpler: one row for each provider, with one status and one button. The rest is under "Details".
- The Actions tab is simpler. The built-in instructions show in the language of the interface until you change them.
- The typing options have examples (for example, "texto" → “texto” for smart quotes).
- Effort names (Low, Medium, High…) stay in English in all languages.
- The proposal buttons are larger. "Apply all" is a bar for all the proposals of a reply.
- "Insert into chapter" is now "Insert at cursor".
- A design review of all screens: aligned icons in the title bar, hover and focus states on all controls, better contrast in the dark theme.

### Fixed
- Find (Ctrl+F) scrolls to each match, also in other chapters. The case and whole-word buttons have hover states and aligned icons.
- "Ask the chat about this entry" has a chat icon, not a return arrow.

## 0.3.1 (2026-10-17)

### Changed
- The writing rules are easier to find: the book menu (the book title at the top) and Settings → This book now open them.

### Fixed
- Markdown that you paste into the writing rules or a planning note (for example "## Rules" or "- item") becomes headings and lists. Before, the signs stayed as text, and the AI got them escaped.

## 0.3.0 (2026-10-16)

### New
- Wordelia updates itself. It downloads new versions from GitHub in the background. When a version is ready, the title bar shows "Update ready". Select it to save, restart and install. Settings → General → Updates has the switch and a "Check for updates" button.
- Install 0.3.0 by hand one time. The versions after it come by themselves.

### Changed
- The source code is public on GitHub.

## 0.2.0 (2026-10-15)

### New
- The app is in English, Portuguese (Brazil) and Spanish. Select the language in Settings → General or on the welcome screen. English is the default.
- Dialogue style for each book: a dash at the start of the line, or quotation marks. New books get the style of their language. The AI follows it.

### Changed
- The suggested chat effort is now Medium. Opus at Medium gives very good answers and is faster. Old Claude Code chat settings move from High to Medium.
- More space between the logo and its caret.
- The README has a simpler summary, English screenshots and a logo that you can see on dark pages.

## 0.1.0 (2026-10-15)

The first version.

### Write
- A page with book typography: first-line indents, justified text, scene breaks. Type `--` to get the dialogue dash.
- Chapters in a sidebar. Find and replace, word counts, a daily word goal, focus mode, typewriter scrolling and optional typewriter sounds.
- Version history of each chapter, with compare and restore.

### AI
- Actions on selected text (Polish, Tighten, Fix grammar only, Show don't tell, Expand, or your own). The change shows on the page as a diff. Press `Enter` to accept or `Esc` to reject.
- A chat that reads the book and the planning, and proposes changes as diff cards. "Accept all" applies all the proposals of a reply.
- Connected threads: each thread keeps a digest, and all threads read the digests of the others.
- A model and an effort for each task and each action.
- Providers: Claude Code and Codex (with your own subscription), the Anthropic API and the OpenAI API (with your own key). Model lists come from the providers. Settings show when a newer Claude Code or Codex is out.

### Plan
- Characters, places, world and plot as notes with images and aliases.
- "Sync with manuscript": the AI reads the chapters that changed and proposes new notes and new facts.
- Import Markdown notes, for example from Obsidian.

### Files
- A book is a folder of Markdown files. Import DOCX, Markdown or text. Export a print-ready PDF, a DOCX with real Word styles, Markdown or text.

### Known limits
- The installer has no code signature. Windows SmartScreen shows a warning: select "More info", then "Run anyway".
- Live tests used Claude Code. Codex and the two APIs have tests with a scripted AI only.
