// The editor schema and behavior.

import { Extension, type AnyExtension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { ParagraphIndent, SceneBreak } from './nodes'
import { SmartTyping, quotesFor } from './smart-typing'
import { FindReplace } from './find'
import { Review } from './review'
import { WikiLinks } from './wiki-links'
import { wikiLinkOptions } from '@/features/plan/links'
import { Pagination, type PaginationOptions } from './pagination'

/** Extensions that define the schema. Used by the editor and by HTML import. */
export function schemaExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      horizontalRule: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
      trailingNode: false
    }),
    TextStyle,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ['paragraph', 'heading'], alignments: ['left', 'center', 'right', 'justify'] }),
    Image.configure({ inline: false, allowBase64: false }),
    SceneBreak,
    ParagraphIndent
  ]
}

/** Marks the top-level block that holds the cursor, for focus mode. */
const focusKey = new PluginKey('focusBlock')
const FocusBlock = Extension.create({
  name: 'focusBlock',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: focusKey,
        props: {
          decorations(state) {
            const { $head } = state.selection
            if ($head.depth < 1) return null
            const start = $head.before(1)
            const node = state.doc.nodeAt(start)
            if (!node) return null
            return DecorationSet.create(state.doc, [Decoration.node(start, start + node.nodeSize, { class: 'is-focus' })])
          }
        }
      })
    ]
  }
})

export interface EditorConfig {
  dash: string
  smartQuotes: boolean
  smartEllipsis: boolean
  language: string
  placeholder: string
  /** Pages on screen: geometry and the height of the chapter heading */
  pages?: PaginationOptions
}

export function editorExtensions(cfg: EditorConfig): AnyExtension[] {
  return [
    ...schemaExtensions(),
    SmartTyping.configure({
      dash: cfg.dash,
      quotes: cfg.smartQuotes,
      ellipsis: cfg.smartEllipsis,
      ...quotesFor(cfg.language)
    }),
    Placeholder.configure({
      placeholder: ({ node, pos }) => (pos === 0 && node.type.name === 'paragraph' ? cfg.placeholder : ''),
      showOnlyCurrent: false
    }),
    FindReplace,
    FocusBlock,
    Review,
    WikiLinks.configure(wikiLinkOptions(false)),
    ...(cfg.pages ? [Pagination.configure(cfg.pages)] : [])
  ]
}
