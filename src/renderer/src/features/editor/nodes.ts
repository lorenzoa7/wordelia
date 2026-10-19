// Custom nodes and attributes of the book schema.

import { Extension, InputRule, Node, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey, Selection, TextSelection } from '@tiptap/pm/state'
import { getT } from '@/lib/i18n'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneBreak: {
      insertSceneBreak: () => ReturnType
    }
    pageBreak: {
      insertPageBreak: () => ReturnType
    }
    paragraphIndent: {
      toggleNoIndent: () => ReturnType
    }
  }
}

/** A scene break between two scenes. Stored as `* * *`. */
export const SceneBreak = Node.create({
  name: 'sceneBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'hr' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'scene-break', 'data-scene-break': '', contenteditable: 'false' }), ['span']]
  },

  addCommands() {
    return {
      insertSceneBreak:
        () =>
        ({ chain, state }) => {
          const { $to } = state.selection
          const atEnd = $to.parentOffset === $to.parent.content.size
          return chain()
            .insertContent(atEnd ? [{ type: this.name }, { type: 'paragraph' }] : [{ type: this.name }])
            .run()
        }
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-Enter': () => this.editor.commands.insertSceneBreak()
    }
  },

  addInputRules() {
    // "* * *" or "***" alone in a paragraph, then a space or Enter
    return [
      new InputRule({
        find: /^(?:\*\s?\*\s?\*|⁂)\s$/,
        handler: ({ state, range, chain }) => {
          const $from = state.doc.resolve(range.from)
          if ($from.parent.type.name !== 'paragraph') return null
          const start = $from.before()
          const end = $from.after()
          chain()
            .deleteRange({ from: start, to: end })
            .insertContentAt(start, [{ type: this.name }, { type: 'paragraph' }])
            .setTextSelection(start + 2)
            .run()
        }
      })
    ]
  }
})

/**
 * A page break (Ctrl+Enter), like a word processor: the text after it starts on a new page.
 * Stored as `<!-- page break -->` on its own line. It has no height and no mark of its own: the page
 * gap shows it. It is never selected; Backspace at the start of the new page, or Delete at the end
 * of the page before it, removes it at once.
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,
  // Before the hard break of StarterKit, which also listens to Mod-Enter.
  priority: 1000,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'page-break', 'data-page-break': '', 'data-label': getT().editor.pageBreak, contenteditable: 'false' })]
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ state, dispatch }) => {
          const type = state.schema.nodes.pageBreak
          const para = state.schema.nodes.paragraph
          let tr = state.tr.deleteSelection()
          const $pos = tr.selection.$from
          if (!$pos.parent.isTextblock || $pos.depth !== 1) return false
          if (!dispatch) return true
          let caret: number
          if ($pos.parentOffset === 0) {
            // At the start of a paragraph: the whole paragraph goes to the next page. When nothing is
            // before it on its page (the start of the chapter, or a page break: an empty page), an
            // empty paragraph keeps that page, so each Ctrl+Enter makes one more page.
            const before = $pos.before()
            const index = $pos.index(0)
            const empty = index === 0 || tr.doc.child(index - 1).type === type
            tr = tr.insert(before, empty ? [para.create(), type.create()] : type.create())
            caret = before + (empty ? 4 : 2)
          } else if ($pos.parentOffset === $pos.parent.content.size) {
            // At the end: a new empty paragraph on the next page.
            const after = $pos.after()
            tr = tr.insert(after, [type.create(), para.create()])
            caret = after + 2
          } else {
            // In the middle: the rest of the paragraph goes to the next page.
            tr = tr.split($pos.pos)
            const second = tr.selection.$from.before()
            tr = tr.insert(second, type.create())
            caret = second + 2
          }
          tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView()
          dispatch(tr)
          return true
        }
    }
  },

  addKeyboardShortcuts() {
    /**
     * Like Google Docs. Backspace at the start of the page after a page break removes the page break.
     * When that page has only an empty paragraph, the paragraph goes too, and the cursor goes back to
     * the end of the text of the page before. Delete at the end of the page before a page break removes
     * the page break, and an empty paragraph after it.
     */
    const removeBreak = (dir: -1 | 1): boolean => {
      const { state, view } = this.editor
      const { $from, empty } = state.selection
      if (!empty || $from.depth !== 1 || !$from.parent.isTextblock) return false
      const atEdge = dir < 0 ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size
      if (!atEdge) return false
      const index = $from.index(0)
      const near = state.doc.maybeChild(index + dir)
      if (near?.type.name !== this.name) return false
      const tr = state.tr
      if (dir < 0) {
        const at = $from.before() - near.nodeSize
        // The first block of the chapter stays, so the chapter is never empty.
        if ($from.parent.content.size === 0 && at > 0) {
          tr.delete(at, $from.after())
          const back = Selection.findFrom(tr.doc.resolve(at), -1, true)
          if (back) tr.setSelection(back)
        } else {
          tr.delete(at, at + near.nodeSize)
        }
      } else {
        const at = $from.after()
        const next = state.doc.maybeChild(index + 2)
        const end = at + near.nodeSize + (next?.isTextblock && next.content.size === 0 ? next.nodeSize : 0)
        tr.delete(at, end)
      }
      view.dispatch(tr.scrollIntoView())
      return true
    }
    return {
      'Mod-Enter': () => this.editor.commands.insertPageBreak(),
      Backspace: () => removeBreak(-1),
      Delete: () => removeBreak(1)
    }
  },

  addProseMirrorPlugins() {
    const name = this.name
    return [
      new Plugin({
        key: new PluginKey('pageBreakTidy'),
        // Two page breaks in a row make one page, and a page break at the end of the chapter makes
        // none: remove them, so each page break is one page that Backspace removes.
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged)) return null
          const extra: number[] = []
          let after = false
          state.doc.forEach((node, offset, i) => {
            const isBreak = node.type.name === name
            if (isBreak && (after || i === state.doc.childCount - 1)) extra.push(offset)
            after = isBreak
          })
          if (!extra.length) return null
          const tr = state.tr.setMeta('allowDuringReview', true)
          for (const at of extra.reverse()) tr.delete(at, at + 1)
          return tr
        }
      })
    ]
  }
})

/** `noIndent` on paragraphs: a paragraph without first-line indent. */
export const ParagraphIndent = Extension.create({
  name: 'paragraphIndent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          noIndent: {
            default: false,
            parseHTML: (el) => el.getAttribute('data-no-indent') === 'true' || el.style.textIndent === '0px',
            renderHTML: (attrs) => (attrs.noIndent ? { 'data-no-indent': 'true' } : {})
          }
        }
      }
    ]
  },
  addCommands() {
    return {
      toggleNoIndent:
        () =>
        ({ state, commands }) => {
          const node = state.selection.$from.parent
          if (node.type.name !== 'paragraph') return false
          return commands.updateAttributes('paragraph', { noIndent: !node.attrs.noIndent })
        }
    }
  }
})
