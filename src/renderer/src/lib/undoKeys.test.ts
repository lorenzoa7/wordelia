import { describe, expect, it } from 'vitest'
import { guardUndoKey, isTextField, stoppedByGuard, undoKey } from './undoKeys'

const el = (tagName: string, extra: { type?: string; isContentEditable?: boolean } = {}): EventTarget => ({ tagName, isContentEditable: false, ...extra }) as unknown as EventTarget

function key(k: string, mods: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}, target: EventTarget | null = el('BODY')): KeyboardEvent {
  const e = {
    key: k,
    ctrlKey: Boolean(mods.ctrl),
    metaKey: Boolean(mods.meta),
    shiftKey: Boolean(mods.shift),
    altKey: Boolean(mods.alt),
    target,
    defaultPrevented: false,
    preventDefault() {
      e.defaultPrevented = true
    }
  }
  return e as unknown as KeyboardEvent
}

describe('the keys of Undo and Redo', () => {
  it('Ctrl+Z is Undo; Ctrl+Y and Ctrl+Shift+Z are Redo; Cmd on macOS too', () => {
    expect(undoKey(key('z', { ctrl: true }))).toBe('undo')
    expect(undoKey(key('Z', { ctrl: true, shift: true }))).toBe('redo')
    expect(undoKey(key('y', { ctrl: true }))).toBe('redo')
    expect(undoKey(key('z', { meta: true }))).toBe('undo')
    expect(undoKey(key('z'))).toBeNull()
    expect(undoKey(key('z', { ctrl: true, alt: true }))).toBeNull()
    expect(undoKey(key('x', { ctrl: true }))).toBeNull()
  })
})

describe('a place where the author writes text', () => {
  it('is an editable text, a text area or a text input', () => {
    expect(isTextField(el('DIV', { isContentEditable: true }))).toBe(true)
    expect(isTextField(el('TEXTAREA'))).toBe(true)
    expect(isTextField(el('INPUT', { type: 'text' }))).toBe(true)
    expect(isTextField(el('INPUT', { type: 'search' }))).toBe(true)
  })

  it('is not a button, a check box, a list, the page or nothing', () => {
    expect(isTextField(el('BUTTON'))).toBe(false)
    expect(isTextField(el('INPUT', { type: 'checkbox' }))).toBe(false)
    expect(isTextField(el('SELECT'))).toBe(false)
    expect(isTextField(el('BODY'))).toBe(false)
    expect(isTextField(null)).toBe(false)
  })
})

describe('the guard of the Undo of the browser', () => {
  it('stops Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z outside a text field, and says that it did', () => {
    for (const e of [key('z', { ctrl: true }, el('BUTTON')), key('y', { ctrl: true }), key('z', { ctrl: true, shift: true }, el('INPUT', { type: 'checkbox' }))]) {
      guardUndoKey(e)
      expect(e.defaultPrevented).toBe(true)
      expect(stoppedByGuard(e)).toBe(true)
    }
  })

  it('leaves Ctrl+Z in a text to the text, and leaves the other keys alone', () => {
    for (const e of [key('z', { ctrl: true }, el('DIV', { isContentEditable: true })), key('z', { ctrl: true }, el('INPUT', { type: 'text' })), key('c', { ctrl: true }), key('z')]) {
      guardUndoKey(e)
      expect(e.defaultPrevented).toBe(false)
      expect(stoppedByGuard(e)).toBe(false)
    }
  })

  it('a key that a handler took before the guard is not marked as stopped by the guard', () => {
    const e = key('z', { ctrl: true })
    e.preventDefault()
    guardUndoKey(e)
    expect(stoppedByGuard(e)).toBe(false)
  })
})
