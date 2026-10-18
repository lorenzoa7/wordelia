// Custom nodes and attributes of the book schema.

import { Extension, InputRule, Node, mergeAttributes } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
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
 * Stored as `<!-- page break -->` on its own line. It has no height; the page gap shows it. When it is
 * selected, a mark "Page break" shows where it is (editor.css).
 */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
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
            // At the start of a paragraph: the whole paragraph goes to the next page.
            const before = $pos.before()
            tr = tr.insert(before, type.create())
            caret = before + 2
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
     * Backspace at the start of the block after a page break, or Delete at the end of the block before
     * it: the first press selects the page break (its mark shows), the second press removes it.
     */
    const removeNext = (dir: -1 | 1): boolean => {
      const { state, view } = this.editor
      if (state.selection instanceof NodeSelection && state.selection.node.type.name === this.name) {
        view.dispatch(state.tr.deleteSelection().scrollIntoView())
        return true
      }
      const { $from, empty } = state.selection
      if (!empty || $from.depth !== 1) return false
      const atEdge = dir < 0 ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size
      if (!atEdge) return false
      const index = $from.index(0) + dir
      if (index < 0 || index >= state.doc.childCount) return false
      const node = state.doc.child(index)
      if (node.type.name !== this.name) return false
      const pos = dir < 0 ? $from.before() - node.nodeSize : $from.after()
      view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView())
      return true
    }
    return {
      'Mod-Enter': () => this.editor.commands.insertPageBreak(),
      Backspace: () => removeNext(-1),
      Delete: () => removeNext(1)
    }
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
