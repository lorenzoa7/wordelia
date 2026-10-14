// [[Entry name]] links, like Obsidian. They stay plain text in the file.
// The editor shows them as links; Ctrl+click (or a plain click in notes) opens the entry.

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface WikiLinkOptions {
  /** Return true when an entry with this name or alias exists */
  exists: (name: string) => boolean
  /** Open the entry */
  open: (name: string) => void
  /** Open on a plain click (notes) or only with Ctrl/Cmd (manuscript) */
  plainClick: boolean
}

const RE = /\[\[([^[\]\n|]{1,80})(?:\|([^[\]\n]{1,80}))?\]\]/g
const key = new PluginKey('wikiLinks')

function build(doc: PMNode, exists: (n: string) => boolean): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = RE.exec(node.text))) {
      const name = m[1].trim()
      decos.push(
        Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
          class: exists(name) ? 'wiki-link' : 'wiki-link is-missing',
          'data-wiki': name
        })
      )
    }
  })
  return DecorationSet.create(doc, decos)
}

export const WikiLinks = Extension.create<WikiLinkOptions>({
  name: 'wikiLinks',
  addOptions() {
    return { exists: () => false, open: () => {}, plainClick: false }
  },
  addProseMirrorPlugins() {
    const o = this.options
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_c, state) => build(state.doc, o.exists),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc, o.exists) : old)
        },
        props: {
          decorations: (state) => key.getState(state),
          handleClick(_view, _pos, event) {
            const el = (event.target as HTMLElement | null)?.closest?.('[data-wiki]') as HTMLElement | null
            if (!el) return false
            if (!o.plainClick && !(event.ctrlKey || event.metaKey)) return false
            o.open(el.dataset.wiki ?? '')
            return true
          }
        }
      })
    ]
  }
})
