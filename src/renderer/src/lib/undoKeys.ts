// The keys of Undo and Redo: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z (Cmd on macOS).
//
// The browser has an Undo of its own. Outside a text field it undoes the last typing of the page: also in the
// text of a chapter that does not show (the Write view stays under the Plan view and under the revision list),
// and after the focus left the text (a button that went away, for example a card after "Done"). Autosave then
// writes that change. In the view of a book, the app never lets the browser do it there: in a text, Ctrl+Z
// stays the Undo of that text, and the handlers of the app (the Undo of an accepted chat change) still run.

import { useEffect } from 'react'

/** The kinds of `<input>` that hold text that the author writes */
const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])

type Target = { tagName?: string; type?: string; isContentEditable?: boolean } | null

/**
 * A place where the author writes text: an editable text (the pages, the notes, the composer), a text area or
 * a text input. A button, a check box or a list is not one.
 */
export function isTextField(target: EventTarget | null): boolean {
  const el = target as Target
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  return el.tagName === 'INPUT' && TEXT_INPUTS.has(String(el.type ?? 'text').toLowerCase())
}

/** The key of Undo or Redo of an event, or null for another key. */
export function undoKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  const key = e.key.toLowerCase()
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  return key === 'y' ? 'redo' : null
}

/** The key events whose browser Undo the guard stopped */
const guarded = new WeakSet<Event>()

/**
 * True when the guard stopped the Undo of the browser for this key. Its `defaultPrevented` then does not mean
 * that a handler of the app took the key: a handler that comes after the guard can still take it.
 */
export function stoppedByGuard(e: Event): boolean {
  return guarded.has(e)
}

/** Stop the Undo of the browser for a key of Undo or Redo outside a text field (`useUndoGuard`). */
export function guardUndoKey(e: KeyboardEvent): void {
  if (!undoKey(e) || isTextField(e.target) || e.defaultPrevented) return
  guarded.add(e)
  e.preventDefault()
}

/**
 * Outside a text field, Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z never run the Undo of the browser. Use it once, in the
 * view of the open book. It hears the key first (the capture phase of the window), so no handler that stops
 * the key can let the browser undo.
 */
export function useUndoGuard(): void {
  useEffect(() => {
    window.addEventListener('keydown', guardUndoKey, true)
    return () => window.removeEventListener('keydown', guardUndoKey, true)
  }, [])
}
