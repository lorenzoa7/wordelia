# 0004 — Actions for one book in the book folder

Date: 2026-10-18. Status: accepted.

## Context

Each book has its own style. The author wants some actions only in one book, and other actions in all books. Before, all actions were in the app settings, so every book had the same actions.

## Decision

1. The actions for all books stay in the app settings (`AppSettings.actions`). The actions of one book are in a new file in the book folder: `ai/actions.json`, with the form `{ "actions": [ ...AiAction ] }`.
2. A separate file, not the manifest (`wordelia.json`):
   - The folder `ai/` already holds the other AI files of the book: the writing rules, the threads and the sync state. The actions are the same kind of thing as the writing rules.
   - The manifest describes the book (chapters, typography, export). The app writes it at each change of the chapter order or of the typography. Long instructions do not make it harder to read or to compare in git.
   - The file goes with the book folder: a copy, a sync client or git takes it too. A book without the file has no book actions. Older versions of the app do not read the file, and they do not change it.
3. The open book uses the global actions, then its own actions. The settings refuse a shortcut that an action of the other group has. When two actions get one shortcut anyway (a global shortcut that the author set while another book was open, or a book from another computer), the book action wins inside its book. The settings show this on the global action. The settings cannot check books that are not open, so a rule for a conflict is necessary; the action that is nearer to the book is the clear winner.
4. The main action (`defaultActionId`) stays a global setting, and it cannot move to a book. The first button above the selection and its shortcut then do the same thing in every book.
5. An action that moves to the other group stays the same, with its id. A built-in action stays built in, so its texts still show in the interface language and it can go back without a change. "Restore the built-in actions" puts the built-in actions back in the global group. A global action with the id of a book action is left out of the list of that book.

## Consequences

- The rules are pure functions in `src/shared/ai/scopes.ts`, with unit tests: `parseBookActions` (the file can come from another app or a person), `mergeActions`, `shortcutInBook`, `addToGroup` and `restoreBuiltIns`.
- Code that needs the actions uses `useAllActions()`, `allActions()` or `findAction()` (`src/renderer/src/features/actions/allActions.ts`), not `settings.actions`. Only Settings → Actions reads the two groups apart.
- The watcher already reports changes to JSON files in the book folder. The book store loads `ai/actions.json` again when another program changes it.
