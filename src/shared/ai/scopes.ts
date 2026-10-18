// Where an action is kept: in the app settings (for all books) or in the book folder (for one book).
//
// The global actions are `AppSettings.actions`. The actions of a book are in `ai/actions.json` in the
// book folder, so they go with the book. The open book uses the global actions, then its own actions.
// Rules (see docs/ARCHITECTURE.md §5.4):
// - The settings never give one shortcut to two actions that the open book can use (`shortcutConflict`
//   gets the two groups).
// - A conflict that the settings could not see (a global shortcut set while another book was open, or a
//   book from another computer) goes to the book action: inside its book, the global action has no shortcut.
// - The main action is a global action.

import type { AiAction, Effort, ModelChoice, ProviderId } from '../types'
import { BUILTIN_ACTIONS, DEFAULT_ACTIONS } from './defaults'
import { EFFORT_ORDER } from './effort'
import { RESERVED_SHORTCUTS, isUsableShortcut, normalizeShortcut } from './shortcuts'

export type ActionScope = 'global' | 'book'

/** The context of a new action, in characters before and after the selection. */
export const NEW_ACTION_CONTEXT = 2000

const PROVIDERS: ProviderId[] = ['claude-code', 'codex', 'anthropic', 'openai']
const BUILTIN_IDS = new Set(BUILTIN_ACTIONS.map((a) => a.id))

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isEffort(v: unknown): v is Effort {
  return typeof v === 'string' && (EFFORT_ORDER as string[]).includes(v)
}

function route(v: unknown): ModelChoice | null {
  if (!isObject(v) || !PROVIDERS.includes(v.provider as ProviderId) || typeof v.model !== 'string' || !v.model) return null
  return { provider: v.provider as ProviderId, model: v.model, ...(isEffort(v.effort) ? { effort: v.effort } : {}) }
}

/** An action without its shortcut. */
export function withoutShortcut(a: AiAction): AiAction {
  const { shortcut, ...rest } = a
  void shortcut
  return rest
}

/**
 * The actions of a book from the parsed `ai/actions.json`: `{ "actions": [...] }`. A person or another
 * app can change the file, so this keeps only actions with an id and a name. An id that repeats, a
 * shortcut that repeats (the first action keeps it), a shortcut of the app and a shortcut without Ctrl or
 * Alt are left out. A built-in action can move to a book; only the ids of built-in actions can be built in.
 */
export function parseBookActions(raw: unknown): AiAction[] {
  const list: unknown[] = Array.isArray(raw) ? raw : isObject(raw) && Array.isArray(raw.actions) ? raw.actions : []
  const ids = new Set<string>()
  const keys = new Set<string>()
  const out: AiAction[] = []
  for (const item of list) {
    if (!isObject(item)) continue
    const id = typeof item.id === 'string' ? item.id.trim() : ''
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!id || !name || ids.has(id)) continue
    ids.add(id)
    const shortcut = normalizeShortcut(typeof item.shortcut === 'string' ? item.shortcut : undefined)
    const keep = shortcut && isUsableShortcut(shortcut) && !RESERVED_SHORTCUTS[shortcut] && !keys.has(shortcut)
    if (keep) keys.add(shortcut)
    const context = typeof item.contextChars === 'number' && Number.isFinite(item.contextChars) ? Math.max(0, Math.round(item.contextChars)) : NEW_ACTION_CONTEXT
    out.push({
      id,
      name,
      instructions: typeof item.instructions === 'string' ? item.instructions : '',
      route: route(item.route),
      ...(isEffort(item.effort) ? { effort: item.effort } : {}),
      contextChars: context,
      icon: typeof item.icon === 'string' && item.icon ? item.icon : 'Feather',
      builtIn: item.builtIn === true && BUILTIN_IDS.has(id),
      ...(keep ? { shortcut } : {})
    })
  }
  return out
}

/** The text of `ai/actions.json`. */
export function bookActionsFile(actions: AiAction[]): string {
  return JSON.stringify({ actions }, null, 2) + '\n'
}

/**
 * The actions that the open book uses: the global actions, then the book actions. A global action loses
 * its shortcut when a book action has the same one (the book action wins inside its book). A global action
 * with the id of a book action is left out (for example a built-in action that moved to this book, and
 * that "Restore the built-in actions" gave back to all books while another book was open). Without book
 * actions, the result is `global` itself.
 */
export function mergeActions(global: AiAction[], book: AiAction[]): AiAction[] {
  if (!book.length) return global
  const ids = new Set(book.map((a) => a.id))
  const keys = new Set(book.map((a) => normalizeShortcut(a.shortcut)).filter(Boolean))
  const shown = global.filter((a) => !ids.has(a.id)).map((a) => (a.shortcut && keys.has(normalizeShortcut(a.shortcut)) ? withoutShortcut(a) : a))
  return [...shown, ...book]
}

/** The book action that has the shortcut of the global action `a` inside the book, if any. */
export function shortcutInBook(a: AiAction, book: AiAction[]): AiAction | undefined {
  const s = normalizeShortcut(a.shortcut)
  return s ? book.find((b) => b.id !== a.id && normalizeShortcut(b.shortcut) === s) : undefined
}

/**
 * Put `a` at the end of `group`, to move it to the other group. The action stays the same (a built-in action
 * stays built in, so its name and instructions still show in the interface language). It replaces an
 * action of `group` with the same id. It loses its shortcut when another action of `group` has the same
 * one; `taken` is that action.
 */
export function addToGroup(group: AiAction[], a: AiAction): { group: AiAction[]; action: AiAction; taken?: AiAction } {
  const s = normalizeShortcut(a.shortcut)
  const taken = s ? group.find((g) => g.id !== a.id && normalizeShortcut(g.shortcut) === s) : undefined
  const action = taken ? withoutShortcut(a) : a
  return { group: [...group.filter((g) => g.id !== a.id), action], action, ...(taken ? { taken } : {}) }
}

/**
 * "Restore the built-in actions": the built-in actions come back first in the global group, as the app
 * made them, also a built-in action that moved to the open book. The own actions stay; an own action
 * (global or of the open book) loses a shortcut that a built-in action uses now.
 */
export function restoreBuiltIns(global: AiAction[], book: AiAction[]): { global: AiAction[]; book: AiAction[] } {
  const builtIn = DEFAULT_ACTIONS.map((a) => ({ ...a }))
  const taken = new Set(builtIn.map((a) => a.shortcut).filter(Boolean))
  const free = (a: AiAction): AiAction => (a.shortcut && taken.has(normalizeShortcut(a.shortcut)) ? withoutShortcut(a) : a)
  const own = (list: AiAction[]): AiAction[] => list.filter((a) => !a.builtIn).map(free)
  return { global: [...builtIn, ...own(global)], book: own(book) }
}
