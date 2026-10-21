// [[Note name]] links, like Obsidian. They stay plain text in the file.
// The editor shows them as links; Ctrl+click opens the note, a plain click puts the caret in the text.
// [[Name#Heading]] opens the note at its heading. [[Name|shown text]] shows only "shown text" while
// the caret is not in the link; with the caret in it, the whole link shows, so the writer can edit it.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { WIKI_LINK, parseWikiTarget } from '@shared/planning/notes'

export interface WikiLinkOptions {
  /** Return true when a note with this name or alias exists */
  exists: (name: string) => boolean
  /** Open the note (at the heading, when there is one) */
  open: (name: string, heading?: string) => void
  /** Open on a plain click too, not only with Ctrl/Cmd */
  plainClick: boolean
  /** The tooltip of a link */
  hint?: (exists: boolean) => string
}

interface LinkState {
  decorations: DecorationSet
  /** A link with a shown text is in the text: a move of the caret can show or hide its parts */
  alias: boolean
}

const key = new PluginKey<LinkState>('wikiLinks')

function build(state: EditorState, o: WikiLinkOptions): LinkState {
  const decos: Decoration[] = []
  let alias = false
  const caret = state.selection.empty ? state.selection.from : -1
  const re = new RegExp(WIKI_LINK.source, 'g')
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(node.text))) {
      const target = parseWikiTarget(m[1])
      if (!target.name) continue
      const from = pos + m.index
      const to = from + m[0].length
      const exists = o.exists(target.name)
      const attrs = {
        class: exists ? 'wiki-link' : 'wiki-link is-missing',
        'data-wiki': target.name,
        'data-heading': target.heading,
        ...(o.hint ? { title: o.hint(exists) } : {})
      }
      // [[Name|shown text]] with the caret outside: the brackets and the name do not show.
      const bar = m[1].indexOf('|')
      if (target.alias) alias = true
      if (target.alias && bar >= 0 && !(caret > from && caret < to)) {
        const shownFrom = from + 2 + bar + 1
        decos.push(Decoration.inline(from, shownFrom, { class: 'wiki-syntax' }))
        decos.push(Decoration.inline(shownFrom, to - 2, attrs))
        decos.push(Decoration.inline(to - 2, to, { class: 'wiki-syntax' }))
        continue
      }
      decos.push(Decoration.inline(from, to, attrs))
    }
  })
  return { decorations: DecorationSet.create(state.doc, decos), alias }
}

export const WikiLinks = Extension.create<WikiLinkOptions>({
  name: 'wikiLinks',
  addOptions() {
    return { exists: () => false, open: () => {}, plainClick: false, hint: undefined }
  },
  addProseMirrorPlugins() {
    const o = this.options
    return [
      new Plugin<LinkState>({
        key,
        state: {
          init: (_c, state) => build(state, o),
          // The caret shows or hides the parts of a link with a shown text: build again when it moves.
          apply: (tr, old, _before, state) => (tr.docChanged || (tr.selectionSet && old.alias) ? build(state, o) : old)
        },
        props: {
          decorations: (state) => key.getState(state)?.decorations,
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement | null)?.closest?.('[data-wiki]') as HTMLElement | null
            if (!el) return false
            if (!o.plainClick && !(event.ctrlKey || event.metaKey)) return false
            o.open(el.dataset.wiki ?? '', el.dataset.heading ?? '')
            return true
          }
        }
      })
    ]
  }
})
