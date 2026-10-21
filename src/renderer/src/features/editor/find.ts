// Find and replace inside the open chapter.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface FindMatch {
  from: number
  to: number
}

export interface FindState {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  matches: FindMatch[]
  current: number
  decorations: DecorationSet
}

export const findKey = new PluginKey<FindState>('find')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    find: {
      setFind: (query: string, opts?: { caseSensitive?: boolean; wholeWord?: boolean }) => ReturnType
      findNext: () => ReturnType
      findPrev: () => ReturnType
      /** Select the match that shows now (the nearest one after a new search) */
      findCurrent: () => ReturnType
      replaceCurrent: (text: string) => ReturnType
      replaceAll: (text: string) => ReturnType
      clearFind: () => ReturnType
    }
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function findMatches(doc: PMNode, query: string, caseSensitive: boolean, wholeWord: boolean): FindMatch[] {
  if (!query) return []
  const flags = caseSensitive ? 'gu' : 'giu'
  const body = escapeRe(query)
  const re = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, flags)
  const out: FindMatch[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Text of the block with a map from text index to doc position.
    let text = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) {
          text += child.text![i]
          map.push(pos + 1 + offset + i)
        }
      } else {
        text += '￼'
        map.push(pos + 1 + offset)
      }
    })
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex++
        continue
      }
      out.push({ from: map[m.index], to: map[m.index + m[0].length - 1] + 1 })
    }
    return false
  })
  return out
}

function build(state: FindState, doc: PMNode): FindState {
  const decorations = DecorationSet.create(
    doc,
    state.matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === state.current ? 'find-hit is-current' : 'find-hit' }))
  )
  return { ...state, decorations }
}

const empty: FindState = { query: '', caseSensitive: false, wholeWord: false, matches: [], current: -1, decorations: DecorationSet.empty }

function nearestIndex(matches: FindMatch[], pos: number): number {
  if (!matches.length) return -1
  const i = matches.findIndex((m) => m.from >= pos)
  return i < 0 ? 0 : i
}

export const FindReplace = Extension.create({
  name: 'findReplace',

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => empty,
          apply(tr: Transaction, prev: FindState, _old: EditorState, next: EditorState): FindState {
            const meta = tr.getMeta(findKey) as Partial<FindState> | 'clear' | undefined
            if (meta === 'clear') return empty
            if (meta) {
              const merged = { ...prev, ...meta }
              const matches = meta.query !== undefined || meta.caseSensitive !== undefined || meta.wholeWord !== undefined
                ? findMatches(next.doc, merged.query, merged.caseSensitive, merged.wholeWord)
                : merged.matches
              const current = meta.current ?? (matches.length ? nearestIndex(matches, next.selection.from) : -1)
              return build({ ...merged, matches, current: Math.min(current, matches.length - 1) }, next.doc)
            }
            if (tr.docChanged && prev.query) {
              const matches = findMatches(next.doc, prev.query, prev.caseSensitive, prev.wholeWord)
              return build({ ...prev, matches, current: Math.min(prev.current, matches.length - 1) }, next.doc)
            }
            return prev
          }
        },
        props: {
          decorations: (state) => findKey.getState(state)?.decorations
        }
      })
    ]
  },

  addCommands() {
    const select =
      (index: number) =>
      ({ tr, state, dispatch }: { tr: Transaction; state: EditorState; dispatch?: (tr: Transaction) => void }): boolean => {
        const s = findKey.getState(state)
        if (!s || !s.matches.length) return false
        const i = ((index % s.matches.length) + s.matches.length) % s.matches.length
        if (dispatch) {
          const m = s.matches[i]
          tr.setMeta(findKey, { current: i })
          tr.setSelection(TextSelection.create(tr.doc, m.from, m.to))
          tr.scrollIntoView()
        }
        return true
      }
    return {
      setFind:
        (query, opts = {}) =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(findKey, { query, ...opts })
          return true
        },
      findNext:
        () =>
        ({ state, ...rest }) => {
          const s = findKey.getState(state)
          return select((s?.current ?? -1) + 1)({ state, ...rest })
        },
      findPrev:
        () =>
        ({ state, ...rest }) => {
          const s = findKey.getState(state)
          return select((s?.current ?? 0) - 1)({ state, ...rest })
        },
      findCurrent:
        () =>
        ({ state, ...rest }) => {
          const s = findKey.getState(state)
          return select(Math.max(0, s?.current ?? 0))({ state, ...rest })
        },
      replaceCurrent:
        (text) =>
        ({ state, tr, dispatch }) => {
          const s = findKey.getState(state)
          if (!s || s.current < 0) return false
          const m = s.matches[s.current]
          if (dispatch) {
            if (text) tr.insertText(text, m.from, m.to)
            else tr.delete(m.from, m.to)
          }
          return true
        },
      replaceAll:
        (text) =>
        ({ state, tr, dispatch }) => {
          const s = findKey.getState(state)
          if (!s || !s.matches.length) return false
          if (dispatch) {
            for (let i = s.matches.length - 1; i >= 0; i--) {
              const m = s.matches[i]
              if (text) tr.insertText(text, m.from, m.to)
              else tr.delete(m.from, m.to)
            }
          }
          return true
        },
      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(findKey, 'clear')
          return true
        }
    }
  }
})
