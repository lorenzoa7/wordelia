import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { ArrowBendUpLeft } from '@phosphor-icons/react'
import { addQuote } from '@/features/chat/chatStore'
import { Placeholder } from '@tiptap/extensions'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import type { DocNode } from '@shared/types'
import { schemaExtensions } from '@/features/editor/extensions'
import { SmartTyping, quotesFor } from '@/features/editor/smart-typing'
import { useBook } from '@/stores/book'
import { registerFlusher } from '@/lib/flush'
import { useT } from '@/lib/i18n'
import { WikiLinks } from '@/features/editor/wiki-links'
import { wikiLinkOptions } from './links'
import { sliceFromMarkdown } from '@/features/editor/review'
import { InlineProposals } from '@/features/editor/inlineProposals'

/** A rich-text editor for notes (planning entries, writing rules). Markdown in, Markdown out. */
export function NoteEditor({
  docKey,
  value,
  onChange,
  placeholder,
  rev = 0,
  quoteLabel,
  inlineProposals = false
}: {
  /** Changes when another note opens */
  docKey: string
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  /** Changes when the file changed outside the editor */
  rev?: number
  /** Label for quotes sent to the chat (the entry name). No label: no Reply button. */
  quoteLabel?: string
  /** A planning entry: chat proposals for it show in the text, with Accept and Reject (`docKey` is its id) */
  inlineProposals?: boolean
}): React.JSX.Element {
  const t = useT()
  const hint = placeholder ?? t.plan.noteEditor.placeholder
  const language = useBook((s) => s.manifest?.language ?? 'en')
  const dash = useBook((s) => s.manifest?.typography.dialogueDash ?? '—')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  /** The last Markdown this editor sent or loaded. A different `value` comes from outside. */
  const lastSent = useRef(value)
  const send = (md: string): void => {
    lastSent.current = md
    onChangeRef.current(md)
  }

  const extensions = useMemo(
    () => [
      ...schemaExtensions(),
      SmartTyping.configure({ dash, quotes: true, ellipsis: true, ...quotesFor(language) }),
      WikiLinks.configure(wikiLinkOptions(true)),
      Placeholder.configure({ placeholder: hint }),
      ...(inlineProposals ? [InlineProposals.configure({ docId: () => docKey })] : [])
    ],
    [dash, language, hint, inlineProposals, docKey]
  )

  const editor = useEditor(
    {
      extensions,
      content: parseMarkdown(value) as object,
      editorProps: {
        attributes: { class: 'note-text prose', lang: language, 'aria-label': quoteLabel ? t.plan.noteEditor.notesAbout(quoteLabel) : t.plan.noteEditor.notes },
        // Notes are Markdown: pasted text such as "## Rules" or "- item" becomes a heading or a list, not literal signs.
        clipboardTextParser: (text, _context, _plain, view) => sliceFromMarkdown(view.state.schema, text)
      },
      onUpdate: ({ editor: e }) => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => {
          timer.current = undefined
          send(serializeMarkdown(e.getJSON() as DocNode))
        }, 350)
      }
    },
    [extensions, docKey]
  )

  // Save pending text when the note closes, or when the book or the window closes.
  useEffect(() => {
    const flush = (): void => {
      if (timer.current && editor && !editor.isDestroyed) {
        clearTimeout(timer.current)
        timer.current = undefined
        send(serializeMarkdown(editor.getJSON() as DocNode))
      }
    }
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
      flush()
    }
  }, [editor])

  // A new note: its text is the starting point.
  useEffect(() => {
    lastSent.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey])

  // The text changed outside this editor (an accepted AI change, another app): reload,
  // unless the writer is typing right now.
  useEffect(() => {
    if (!editor || editor.isDestroyed || timer.current) return
    if (value === lastSent.current && rev === 0) return
    if (value !== lastSent.current) {
      lastSent.current = value
      editor.commands.setContent(parseMarkdown(value) as object, { emitUpdate: false })
    }
  }, [value, rev, editor])

  return (
    <>
      <EditorContent editor={editor} />
      {editor && quoteLabel && (
        <BubbleMenu
          editor={editor}
          className="selection-menu"
          options={{ placement: 'top', offset: 10 }}
          shouldShow={({ editor: e, from, to }) => from !== to && e.isFocused && e.state.doc.textBetween(from, to, ' ').trim().length > 0}
        >
          <button
            className="sel-btn"
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => {
              const { from, to } = editor.state.selection
              const text = editor.state.doc.textBetween(from, to, '\n\n').trim()
              if (text) addQuote({ text, source: { kind: 'entry', id: docKey, label: quoteLabel } })
              editor.commands.setTextSelection(to)
            }}
          >
            <ArrowBendUpLeft size={14} />
            <span>{t.plan.noteEditor.reply}</span>
          </button>
        </BubbleMenu>
      )}
    </>
  )
}
