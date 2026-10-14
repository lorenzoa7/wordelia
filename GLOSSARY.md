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
| **Entry** | One planning note, for example one character. One Markdown file. | `Entry` |
| **Alias** | Another name for an entry. The app uses aliases to find mentions in the manuscript. | `aliases` |
| **Sync** | The AI compares the manuscript with the planning and proposes changes to the planning. | `planningSync` |

## AI

| Term | Meaning | In code |
|---|---|---|
| **Provider** | A connection to an AI service: Claude Code, Codex, Anthropic API or OpenAI API. | `Provider` |
| **Model route** | The model that the app uses for one task: chat, action, sync or background. | `ModelRoute` |
| **Thread** | One chat conversation with the AI. A book has many threads. | `Thread` |
| **Brief** | The purpose of a thread, written by the user. Example: "Heitor's arc". | `thread.brief` |
| **Digest** | A short summary of a thread that the AI keeps up to date. All other threads read it. | `thread.digest` |
| **Action** | A configurable AI operation on selected text, for example **Polish**. | `Action` |
| **Writing rules** | The rules of the author that apply to all AI work on this book. | `writingRules` |
| **Proposal** | A change that the AI proposes. The user must accept or reject it. | `Proposal` |
| **Hunk** | One part of a proposal: one find-and-replace on one file. | `Hunk` |
| **Reply** | To quote selected text into the chat composer. | `reply` |

## Views

| Term | Meaning |
|---|---|
| **Write view** | The main view. The chapter tabs, the page and the chat. |
| **Plan view** | The view for planning entries. |
| **Desk** | The background of the app, around the page. |
| **Page** | The paper surface where the user writes. |
