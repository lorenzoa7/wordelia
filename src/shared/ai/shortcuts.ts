// Keyboard shortcuts of the actions: read key presses, keep one text form, find conflicts.
//
// Text form: the modifiers in the order Ctrl, Alt, Shift, then one key.
// Examples: "Ctrl+J", "Alt+2", "Ctrl+Shift+K", "F6". Cmd on a Mac counts as Ctrl.

import type { AiAction } from '../types'

/** The parts of a keyboard event that a shortcut needs. No DOM types: this module is pure. */
export interface KeyPress {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
  /** AltGr is down. Then the keys type a character (for example "/" on a Brazilian keyboard): not a shortcut. */
  altGraph?: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'OS'])

/** True for Ctrl, Alt, Shift and the other keys that only change other keys. */
export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key)
}

/** The key part of a shortcut: a letter, a digit or F1–F12. Null for other keys. */
function keyName(e: Pick<KeyPress, 'key' | 'code'>): string | null {
  // The letter on the keyboard layout of the user; the physical key for other layouts.
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase()
  const letter = /^Key([A-Z])$/.exec(e.code)
  if (letter) return letter[1]
  // The physical digit key: Shift changes e.key ("!") but not e.code ("Digit1").
  const digit = /^Digit(\d)$/.exec(e.code)
  if (digit) return digit[1]
  if (/^F([1-9]|1[0-2])$/.test(e.key)) return e.key
  return null
}

/** The modifiers that are down, as the start of a shortcut: "Ctrl+Shift+". */
export function heldModifiers(e: KeyPress): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  return parts.map((p) => `${p}+`).join('')
}

/** The shortcut of a key press, or null when the keys cannot be a shortcut. */
export function shortcutFromKeys(e: KeyPress): string | null {
  if (e.altGraph) return null
  const key = keyName(e)
  if (!key) return null
  return `${heldModifiers(e)}${key}`
}

/** The text form of a shortcut that a person or an old version wrote, for example "alt + 2" → "Alt+2". */
export function normalizeShortcut(text: string | undefined): string | undefined {
  if (!text) return undefined
  const parts = text
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean)
  if (!parts.length) return undefined
  const mods = new Set<string>()
  let key = ''
  for (const p of parts) {
    const l = p.toLowerCase()
    if (l === 'ctrl' || l === 'control' || l === 'cmd' || l === 'meta' || l === 'mod') mods.add('Ctrl')
    else if (l === 'alt' || l === 'option') mods.add('Alt')
    else if (l === 'shift') mods.add('Shift')
    else key = /^f\d{1,2}$/.test(l) ? l.toUpperCase() : p.length === 1 ? p.toUpperCase() : p
  }
  if (!key) return undefined
  return `${['Ctrl', 'Alt', 'Shift'].filter((m) => mods.has(m)).map((m) => `${m}+`).join('')}${key}`
}

/** A shortcut needs Ctrl or Alt. Only a function key (F1–F12) can be alone, or with Shift. */
export function isUsableShortcut(shortcut: string): boolean {
  const parts = shortcut.split('+')
  const key = parts[parts.length - 1]
  if (/^F\d{1,2}$/.test(key)) return true
  return parts.includes('Ctrl') || parts.includes('Alt')
}

/** What the app and the editor already do with a shortcut. The settings show these names. */
export type ReservedShortcut =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'code'
  | 'undo'
  | 'redo'
  | 'selectAll'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'pastePlain'
  | 'save'
  | 'find'
  | 'replace'
  | 'chat'
  | 'write'
  | 'plan'
  | 'export'
  | 'align'
  | 'quote'
  | 'list'
  | 'heading'
  | 'rename'
  | 'closeWindow'

/**
 * Shortcuts that an action cannot use: the editor (TipTap), the app (src/renderer/src/app/shortcuts.ts)
 * and the system. Ctrl+, and Ctrl+\ cannot be recorded (only letters, digits and F keys can).
 */
export const RESERVED_SHORTCUTS: Record<string, ReservedShortcut> = {
  'Ctrl+A': 'selectAll',
  'Ctrl+B': 'bold',
  'Ctrl+C': 'copy',
  'Ctrl+E': 'code',
  'Ctrl+F': 'find',
  'Ctrl+H': 'replace',
  'Ctrl+I': 'italic',
  'Ctrl+L': 'chat',
  'Ctrl+S': 'save',
  'Ctrl+U': 'underline',
  'Ctrl+V': 'paste',
  'Ctrl+X': 'cut',
  'Ctrl+Y': 'redo',
  'Ctrl+Z': 'undo',
  'Ctrl+1': 'write',
  'Ctrl+2': 'plan',
  'Ctrl+Shift+Z': 'redo',
  'Ctrl+Shift+V': 'pastePlain',
  'Ctrl+Shift+S': 'strike',
  'Ctrl+Shift+B': 'quote',
  'Ctrl+Shift+E': 'export',
  'Ctrl+Shift+L': 'align',
  'Ctrl+Shift+R': 'align',
  'Ctrl+Shift+J': 'align',
  'Ctrl+Shift+7': 'list',
  'Ctrl+Shift+8': 'list',
  'Ctrl+Shift+9': 'list',
  'Ctrl+Alt+0': 'heading',
  'Ctrl+Alt+1': 'heading',
  'Ctrl+Alt+2': 'heading',
  'Ctrl+Alt+3': 'heading',
  F2: 'rename',
  'Alt+F4': 'closeWindow'
}

export type ShortcutConflict = { kind: 'action'; action: AiAction } | { kind: 'app'; use: ReservedShortcut }

/** Another action or the app already uses this shortcut. `selfId`: the action that gets it. */
export function shortcutConflict(shortcut: string, actions: AiAction[], selfId?: string): ShortcutConflict | null {
  const use = RESERVED_SHORTCUTS[shortcut]
  if (use) return { kind: 'app', use }
  const other = actions.find((a) => a.id !== selfId && normalizeShortcut(a.shortcut) === shortcut)
  return other ? { kind: 'action', action: other } : null
}

/** The default shortcut of the action at `index`: Ctrl+J for the main action, else Alt and its position (1–9). */
export function defaultShortcut(index: number, isMain: boolean): string | undefined {
  if (isMain) return 'Ctrl+J'
  return index < 9 ? `Alt+${index + 1}` : undefined
}

/**
 * Settings version 4: give each action without a shortcut its default, when no other action has it.
 * The main action is `mainId`, or the first action when no action has that id.
 */
export function withDefaultShortcuts(actions: AiAction[], mainId: string): AiAction[] {
  const mainIndex = Math.max(0, actions.findIndex((a) => a.id === mainId))
  const taken = new Set(actions.map((a) => normalizeShortcut(a.shortcut)).filter(Boolean))
  return actions.map((a, i) => {
    if (a.shortcut) return a
    const s = defaultShortcut(i, i === mainIndex)
    if (!s || taken.has(s)) return a
    taken.add(s)
    return { ...a, shortcut: s }
  })
}

/** A free Alt shortcut for a new action at `index`: Alt and its position, else the first free one, else none. */
export function freeShortcut(actions: AiAction[], index: number): string | undefined {
  const taken = new Set(actions.map((a) => normalizeShortcut(a.shortcut)))
  const wanted = index < 9 ? `Alt+${index + 1}` : undefined
  if (wanted && !taken.has(wanted)) return wanted
  for (let n = 1; n <= 9; n++) if (!taken.has(`Alt+${n}`)) return `Alt+${n}`
  return undefined
}

/** The action that a key press runs, if any. */
export function actionForKeys(e: KeyPress, actions: AiAction[]): AiAction | undefined {
  const pressed = shortcutFromKeys(e)
  if (!pressed) return undefined
  return actions.find((a) => normalizeShortcut(a.shortcut) === pressed)
}
