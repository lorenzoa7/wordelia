# 0003 — A shortcut for each action; built-in instructions in the interface language

Date: 2026-10-17. Status: accepted.

## Context

Before, Ctrl+J ran the main action and Alt+1…9 ran the actions by their position in the list. The user could not choose a shortcut. A new order of the list changed the shortcuts.

The instructions of the built-in actions were in English, also when the interface was in Portuguese or Spanish. The author reads the instructions in the settings and wants to read them in the language of the interface.

## Decision

1. Each action has its own shortcut: `AiAction.shortcut`, a text such as "Ctrl+J", "Alt+2" or "Ctrl+Shift+K". The text form and the rules are in `src/shared/ai/shortcuts.ts`: the modifiers in the order Ctrl, Alt, Shift, then a letter, a digit or F1–F12. A shortcut needs Ctrl or Alt, except a function key.
2. The settings refuse a shortcut that another action uses, or that the app or the editor uses (`RESERVED_SHORTCUTS`). The message names the owner of the shortcut.
3. Settings version 4 gives the actions of old settings the shortcuts that they had: Ctrl+J for the main action, Alt and the position (1–9) for the others. After version 4, an action without a shortcut is one that the user cleared.
4. The shortcut belongs to the action. "Make it the main action" does not move Ctrl+J.
5. The instructions of a built-in action stay in English in the settings file. While they are equal to the English default, the settings show them in the interface language (`common.builtinActionInstructions`), and the app sends that text to the AI (`actionInstructions` in `src/shared/i18n`). When the user edits them, the edited text is theirs and goes to the AI as it is.

## Consequences

- A new key for the app or the editor must also go into `RESERVED_SHORTCUTS`, so that no action can take it.
- Keys are read from `KeyboardEvent.key` for Latin letters and from `KeyboardEvent.code` for digits and other layouts. AltGr is never a shortcut, so it can still type characters such as "/" on a Brazilian keyboard.
- A Portuguese interface sends Portuguese instructions for the built-in actions. The rest of the action prompt stays in English (`src/shared/prompts`).
