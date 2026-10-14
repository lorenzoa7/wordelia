import { useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import type { DocNode } from '@shared/types'
import { schemaExtensions } from '@/features/editor/extensions'
import { SmartTyping, quotesFor } from '@/features/editor/smart-typing'
import { useBook } from '@/stores/book'
import { registerFlusher } from '@/lib/flush'

/** A rich-text editor for notes (planning entries, writing rules). Markdown in, Markdown out. */
export function NoteEditor({
  docKey,
  value,
  onChange,
  placeholder,
  rev = 0
}: {
  /** Changes when another note opens */
  docKey: string
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  /** Changes when the file changed outside the editor */
  rev?: number
}): React.JSX.Element {
  const language = useBook((s) => s.manifest?.language ?? 'en')
  const dash = useBook((s) => s.manifest?.typography.dialogueDash ?? '—')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const extensions = useMemo(
    () => [
      ...schemaExtensions(),
      SmartTyping.configure({ dash, quotes: true, ellipsis: true, ...quotesFor(language) }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write here…' })
    ],
    [dash, language, placeholder]
  )

  const editor = useEditor(
    {
      extensions,
      content: parseMarkdown(value) as object,
      editorProps: { attributes: { class: 'note-text prose', spellcheck: 'true', lang: language } },
      onUpdate: ({ editor: e }) => {
        clearTimeout(timer.current)
        timer.current = setTimeout(() => onChangeRef.current(serializeMarkdown(e.getJSON() as DocNode)), 350)
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
        onChangeRef.current(serializeMarkdown(editor.getJSON() as DocNode))
      }
    }
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
      flush()
    }
  }, [editor])

  useEffect(() => {
    if (!editor || rev === 0) return
    editor.commands.setContent(parseMarkdown(value) as object, { emitUpdate: false })
    // Only external changes reload the note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev])

  return <EditorContent editor={editor} />
}
