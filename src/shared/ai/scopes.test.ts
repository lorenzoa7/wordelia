import { describe, expect, it } from 'vitest'
import type { AiAction } from '../types'
import { DEFAULT_ACTIONS } from './defaults'
import { actionForKeys, freeShortcut, shortcutConflict, type KeyPress } from './shortcuts'
import { addToGroup, asBookAction, bookActionsFile, mergeActions, parseBookActions, restoreBuiltIns, shortcutInBook, withoutShortcut } from './scopes'

const action = (id: string, shortcut?: string, extra: Partial<AiAction> = {}): AiAction => ({
  id,
  name: id,
  instructions: '',
  route: null,
  contextChars: 1000,
  icon: 'Sparkle',
  builtIn: false,
  ...(shortcut ? { shortcut } : {}),
  ...extra
})
const press = (p: Partial<KeyPress>): KeyPress => ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...p })
const global = DEFAULT_ACTIONS.map((a) => ({ ...a }))

describe('book actions file', () => {
  it('reads what it writes', () => {
    const book = [action('act_voice', 'Alt+5', { name: 'Narrator voice', instructions: 'Keep the narrator dry.', route: { provider: 'claude-code', model: 'opus', effort: 'high' }, effort: 'low' })]
    expect(parseBookActions(JSON.parse(bookActionsFile(book)))).toEqual(book)
  })
  it('keeps only actions with an id and a name, and fills the missing fields', () => {
    const got = parseBookActions({ actions: [{ id: 'a', name: 'A' }, { id: '', name: 'B' }, { id: 'c' }, 'text', null, { id: 'a', name: 'Again' }] })
    expect(got).toEqual([{ id: 'a', name: 'A', instructions: '', route: null, contextChars: 2000, icon: 'Feather', builtIn: false }])
  })
  it('accepts a plain list and an empty or broken file', () => {
    expect(parseBookActions([{ id: 'a', name: 'A' }]).map((a) => a.id)).toEqual(['a'])
    expect(parseBookActions(null)).toEqual([])
    expect(parseBookActions({ actions: 'no' })).toEqual([])
  })
  it('is never a built-in action, and drops a bad model choice', () => {
    const [a] = parseBookActions([{ id: 'polish', name: 'Polish', builtIn: true, route: { provider: 'other', model: 'x' }, effort: 'huge' }])
    expect(a.builtIn).toBe(false)
    expect(a.route).toBeNull()
    expect(a.effort).toBeUndefined()
  })
  it('cleans the shortcuts: one text form, no app keys, no repeats, Ctrl or Alt', () => {
    const got = parseBookActions([
      { id: 'a', name: 'A', shortcut: 'alt + 5' },
      { id: 'b', name: 'B', shortcut: 'Alt+5' },
      { id: 'c', name: 'C', shortcut: 'Ctrl+B' },
      { id: 'd', name: 'D', shortcut: 'K' },
      { id: 'e', name: 'E', shortcut: 'F6' }
    ])
    expect(got.map((a) => a.shortcut ?? null)).toEqual(['Alt+5', null, null, null, 'F6'])
  })
})

describe('merged actions', () => {
  it('lists the global actions, then the book actions', () => {
    const book = [action('act_voice', 'Alt+5')]
    expect(mergeActions(global, book).map((a) => a.id)).toEqual(['polish', 'tighten', 'grammar', 'show', 'act_voice'])
  })
  it('is the global list itself without book actions', () => {
    expect(mergeActions(global, [])).toBe(global)
  })
  it('gives a shared shortcut to the book action inside its book', () => {
    const book = [action('act_voice', 'Alt+2')]
    const merged = mergeActions(global, book)
    expect(merged.find((a) => a.id === 'tighten')?.shortcut).toBeUndefined()
    expect(actionForKeys(press({ key: '2', code: 'Digit2', altKey: true }), merged)?.id).toBe('act_voice')
    expect(shortcutInBook(global[1], book)?.id).toBe('act_voice')
    expect(shortcutInBook(global[0], book)).toBeUndefined()
    // The settings keep the shortcut of the global action for the other books.
    expect(global[1].shortcut).toBe('Alt+2')
  })
  it('leaves out a global action with the id of a book action', () => {
    expect(mergeActions(global, [action('show')]).filter((a) => a.id === 'show')).toHaveLength(1)
  })
})

describe('shortcut conflicts across the two groups', () => {
  const book = [action('act_voice', 'Alt+5')]
  const both = [...global, ...book]
  it('refuses a shortcut of a book action for a global action, and the reverse', () => {
    expect(shortcutConflict('Alt+5', both, 'tighten')).toEqual({ kind: 'action', action: book[0] })
    expect(shortcutConflict('Alt+2', both, 'act_voice')).toEqual({ kind: 'action', action: global[1] })
    expect(shortcutConflict('Alt+5', both, 'act_voice')).toBeNull()
  })
  it('gives a new action a shortcut that no action of the two groups has', () => {
    // A new book action: the next position is free.
    expect(freeShortcut(both, both.length)).toBe('Alt+6')
    // A new global action at position 5: the book action has Alt+5, so the first free key.
    expect(freeShortcut(both, global.length)).toBe('Alt+1')
  })
})

describe('moving an action to the other group', () => {
  it('keeps the shortcut when the other group does not have it', () => {
    const r = addToGroup([action('b1', 'Alt+6')], action('own', 'Alt+5'))
    expect(r.group.map((a) => [a.id, a.shortcut])).toEqual([
      ['b1', 'Alt+6'],
      ['own', 'Alt+5']
    ])
    expect(r.taken).toBeUndefined()
  })
  it('drops the shortcut that an action of the other group has', () => {
    const r = addToGroup(global, action('voice', 'Alt+2'))
    expect(r.action.shortcut).toBeUndefined()
    expect(r.taken?.id).toBe('tighten')
    expect(r.group.at(-1)?.id).toBe('voice')
  })
  it('makes a built-in action an own action of the book, with the texts that the settings show', () => {
    const a = asBookAction(global[1], { id: 'act_new', name: 'Enxugar', instructions: 'Corte palavras.' })
    expect(a).toMatchObject({ id: 'act_new', name: 'Enxugar', instructions: 'Corte palavras.', builtIn: false, shortcut: 'Alt+2' })
    const own = action('own')
    expect(asBookAction(own, { id: 'x', name: 'y', instructions: 'z' })).toBe(own)
  })
})

describe('restoring the built-in actions', () => {
  it('frees the shortcuts of the built-in actions in the two groups', () => {
    const r = restoreBuiltIns([global[0], action('own', 'Alt+3'), action('mine', 'Alt+7')], [action('voice', 'Alt+4'), action('tone', 'Alt+8')])
    expect(r.global.map((a) => [a.id, a.shortcut ?? null])).toEqual([
      ['polish', 'Ctrl+J'],
      ['tighten', 'Alt+2'],
      ['grammar', 'Alt+3'],
      ['show', 'Alt+4'],
      ['own', null],
      ['mine', 'Alt+7']
    ])
    expect(r.book.map((a) => [a.id, a.shortcut ?? null])).toEqual([
      ['voice', null],
      ['tone', 'Alt+8']
    ])
  })
  it('removes only the shortcut', () => {
    expect(withoutShortcut(action('a', 'Alt+2'))).toEqual(action('a'))
  })
})
