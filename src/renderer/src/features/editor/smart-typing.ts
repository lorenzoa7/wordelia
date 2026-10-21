// Smart typing: "--" to the dialogue dash, smart quotes, "..." to an ellipsis.
// Backspace right after a replacement undoes it (core undoInputRule).

import { Extension, InputRule } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { apostropheN, quoteOpensAfter, quotesFor, singleQuoteFor } from '@shared/text/quotes'

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

export { quotesFor }

/** The last characters of the text block before a position. */
function textBefore(state: EditorState, pos: number, n = 3): string {
  const $pos = state.doc.resolve(pos)
  return $pos.parent.textBetween(Math.max(0, $pos.parentOffset - n), $pos.parentOffset, undefined, '￼')
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
            state.tr.insertText(quoteOpensAfter(textBefore(state, range.from)) ? o.doubleOpen : o.doubleClose, range.from, range.to)
          }
        }),
        new InputRule({
          find: /'$/,
          handler: ({ state, range }) => {
            const before = textBefore(state, range.from)
            // "rock 'n' roll": the quote before the n becomes an apostrophe too.
            const n = apostropheN(before, '', o)
            if (n !== null) {
              const start = range.from - before.length
              state.tr.insertText(`${n}’`, start, range.to)
              return
            }
            state.tr.insertText(singleQuoteFor(before, '', o), range.from, range.to)
          }
        }),
        // A digit after an opening single quote: it was an apostrophe ('90s).
        new InputRule({
          find: new RegExp(`${escapeRe(o.singleOpen)}(\\d)$`),
          handler: ({ state, range, match }) => {
            if (!quoteOpensAfter(textBefore(state, range.from))) return null
            state.tr.insertText(`’${match[1]}`, range.from, range.to)
          }
        })
      )
    }
    return rules
  }
})

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
