// Smart typing: "--" to the dialogue dash, smart quotes, "..." to an ellipsis.
// Backspace right after a replacement undoes it (core undoInputRule).

import { Extension, InputRule } from '@tiptap/core'

export interface SmartTypingOptions {
  dash: string
  quotes: boolean
  ellipsis: boolean
  /** Quote characters for the book language */
  doubleOpen: string
  doubleClose: string
  singleOpen: string
  singleClose: string
}

export function quotesFor(language: string): Pick<SmartTypingOptions, 'doubleOpen' | 'doubleClose' | 'singleOpen' | 'singleClose'> {
  const l = language.toLowerCase()
  if (l.startsWith('de')) return { doubleOpen: '„', doubleClose: '“', singleOpen: '‚', singleClose: '‘' }
  if (l.startsWith('fr')) return { doubleOpen: '« ', doubleClose: ' »', singleOpen: '‹', singleClose: '›' }
  if (l === 'pt-pt' || l.startsWith('es') || l.startsWith('it')) return { doubleOpen: '«', doubleClose: '»', singleOpen: '“', singleClose: '”' }
  return { doubleOpen: '“', doubleClose: '”', singleOpen: '‘', singleClose: '’' }
}

/** Is the character before the cursor a place where a quote opens? */
const OPENS_AFTER = /[\s([{—―–-]$|^$/

function textBefore(state: import('@tiptap/pm/state').EditorState, pos: number): string {
  const $pos = state.doc.resolve(pos)
  return $pos.parent.textBetween(Math.max(0, $pos.parentOffset - 1), $pos.parentOffset, undefined, '￼')
}

export const SmartTyping = Extension.create<SmartTypingOptions>({
  name: 'smartTyping',

  addOptions() {
    return { dash: '—', quotes: true, ellipsis: true, ...quotesFor('en') }
  },

  addInputRules() {
    const o = this.options
    const rules: InputRule[] = [
      new InputRule({
        find: /--$/,
        handler: ({ state, range }) => {
          state.tr.insertText(o.dash, range.from, range.to)
        }
      })
    ]
    if (o.ellipsis) {
      rules.push(
        new InputRule({
          find: /\.\.\.$/,
          handler: ({ state, range }) => {
            state.tr.insertText('…', range.from, range.to)
          }
        })
      )
    }
    if (o.quotes) {
      rules.push(
        new InputRule({
          find: /"$/,
          handler: ({ state, range }) => {
            const before = textBefore(state, range.from)
            state.tr.insertText(OPENS_AFTER.test(before) ? o.doubleOpen : o.doubleClose, range.from, range.to)
          }
        }),
        new InputRule({
          find: /'$/,
          handler: ({ state, range }) => {
            const before = textBefore(state, range.from)
            state.tr.insertText(OPENS_AFTER.test(before) ? o.singleOpen : o.singleClose, range.from, range.to)
          }
        })
      )
    }
    return rules
  }
})
