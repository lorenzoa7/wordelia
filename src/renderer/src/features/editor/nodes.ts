// Custom nodes and attributes of the book schema.

import { Extension, InputRule, Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sceneBreak: {
      insertSceneBreak: () => ReturnType
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
