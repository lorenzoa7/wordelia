import { describe, expect, it } from 'vitest'
import type { AiAction } from '../types'
import { DEFAULT_ACTIONS } from './defaults'
import {
  actionForKeys,
  freeShortcut,
  heldModifiers,
  isUsableShortcut,
  normalizeShortcut,
  shortcutConflict,
  shortcutFromKeys,
  withDefaultShortcuts,
  type KeyPress
} from './shortcuts'

const press = (p: Partial<KeyPress>): KeyPress => ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...p })
const action = (id: string, shortcut?: string): AiAction => ({ id, name: id, instructions: '', route: null, contextChars: 1000, icon: 'Sparkle', builtIn: false, ...(shortcut ? { shortcut } : {}) })

describe('shortcuts', () => {
  it('reads letters, digits and function keys', () => {
    expect(shortcutFromKeys(press({ key: 'j', code: 'KeyJ', ctrlKey: true }))).toBe('Ctrl+J')
    expect(shortcutFromKeys(press({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+K')
    // Shift changes the character of a digit key, not its code.
    expect(shortcutFromKeys(press({ key: '@', code: 'Digit2', altKey: true, shiftKey: true }))).toBe('Alt+Shift+2')
    expect(shortcutFromKeys(press({ key: 'F6', code: 'F6' }))).toBe('F6')
    // Cmd counts as Ctrl.
    expect(shortcutFromKeys(press({ key: 'p', code: 'KeyP', metaKey: true }))).toBe('Ctrl+P')
  })
  it('uses the physical key when the layout has no Latin letter', () => {
    expect(shortcutFromKeys(press({ key: 'о', code: 'KeyJ', ctrlKey: true }))).toBe('Ctrl+J')
  })
  it('ignores modifiers alone, other keys and AltGr', () => {
    expect(shortcutFromKeys(press({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toBeNull()
    expect(shortcutFromKeys(press({ key: 'Enter', code: 'Enter', ctrlKey: true }))).toBeNull()
    expect(shortcutFromKeys(press({ key: '/', code: 'KeyQ', ctrlKey: true, altKey: true, altGraph: true }))).toBeNull()
    expect(heldModifiers(press({ ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+')
  })
  it('needs Ctrl or Alt, except for function keys', () => {
    expect(isUsableShortcut('Shift+K')).toBe(false)
    expect(isUsableShortcut('K')).toBe(false)
    expect(isUsableShortcut('Alt+K')).toBe(true)
    expect(isUsableShortcut('F7')).toBe(true)
  })
  it('normalizes hand-written shortcuts', () => {
    expect(normalizeShortcut('shift + ctrl + k')).toBe('Ctrl+Shift+K')
    expect(normalizeShortcut('Alt+2')).toBe('Alt+2')
    expect(normalizeShortcut('f5')).toBe('F5')
    expect(normalizeShortcut('')).toBeUndefined()
    expect(normalizeShortcut('Ctrl+')).toBeUndefined()
  })
  it('finds conflicts with the app and with other actions', () => {
    const actions = [action('a', 'Ctrl+J'), action('b', 'Alt+2')]
    expect(shortcutConflict('Ctrl+B', actions)).toEqual({ kind: 'app', use: 'bold' })
    expect(shortcutConflict('Alt+2', actions, 'a')).toEqual({ kind: 'action', action: actions[1] })
    expect(shortcutConflict('Alt+2', actions, 'b')).toBeNull()
    expect(shortcutConflict('Ctrl+K', actions, 'a')).toBeNull()
  })
  it('gives defaults by position, Ctrl+J to the main action', () => {
    const old = [action('polish'), action('tighten'), action('grammar')]
    expect(withDefaultShortcuts(old, 'polish').map((a) => a.shortcut)).toEqual(['Ctrl+J', 'Alt+2', 'Alt+3'])
    expect(withDefaultShortcuts(old, 'grammar').map((a) => a.shortcut)).toEqual(['Alt+1', 'Alt+2', 'Ctrl+J'])
    // An unknown main action: the first action is the main one.
    expect(withDefaultShortcuts(old, 'gone')[0].shortcut).toBe('Ctrl+J')
  })
  it('keeps shortcuts that exist and never gives one twice', () => {
    const mixed = [action('a'), action('b', 'Alt+3'), action('c')]
    expect(withDefaultShortcuts(mixed, 'a').map((a) => a.shortcut)).toEqual(['Ctrl+J', 'Alt+3', undefined])
  })
  it('the built-in actions have the default shortcuts', () => {
    expect(withDefaultShortcuts(DEFAULT_ACTIONS, 'polish')).toEqual(DEFAULT_ACTIONS)
    expect(DEFAULT_ACTIONS.map((a) => a.shortcut)).toEqual(['Ctrl+J', 'Alt+2', 'Alt+3', 'Alt+4'])
  })
  it('finds a free shortcut for a new action', () => {
    expect(freeShortcut(DEFAULT_ACTIONS, 4)).toBe('Alt+5')
    expect(freeShortcut([action('a', 'Alt+2')], 1)).toBe('Alt+1')
  })
  it('finds the action of a key press', () => {
    const actions = [action('a', 'Ctrl+J'), action('b', 'alt+2')]
    expect(actionForKeys(press({ key: '2', code: 'Digit2', altKey: true }), actions)?.id).toBe('b')
    expect(actionForKeys(press({ key: 'j', code: 'KeyJ', ctrlKey: true, shiftKey: true }), actions)).toBeUndefined()
  })
})
