import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { EditorState } from '@tiptap/pm/state'
import { motion } from 'motion/react'
import { Plus } from '@phosphor-icons/react'
import clsx from 'clsx'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import { countWords } from '@shared/book'
import type { DocNode } from '@shared/types'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { fontStack } from '@/lib/fonts'
import { editorExtensions } from './extensions'
import { setActiveEditor } from './registry'
import { Toolbar } from './Toolbar'
import { SelectionMenu } from './SelectionMenu'
import { ReviewBar } from './ReviewBar'
import { FindBar } from './FindBar'
import { useEditorStats } from './stats'
import './editor.css'

const NUMBER_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty']

export function PageEditor(): React.JSX.Element | null {
  const manifest = useBook((s) => s.manifest)
  const chapterId = useBook((s) => s.activeChapterId)
  const chapterIndex = useBook((s) => s.chapters.findIndex((c) => c.id === s.activeChapterId))
  const chapter = useBook((s) => s.chapters.find((c) => c.id === s.activeChapterId))
  const externalRev = useBook((s) => (s.activeChapterId ? (s.externalRev[s.activeChapterId] ?? 0) : 0))
  const ui = useApp((s) => s.settings?.ui)
  const spellcheck = useApp((s) => s.settings?.editor.spellcheck ?? true)
  const typo = manifest?.typography

  const scrollRef = useRef<HTMLDivElement>(null)
  const [typing, setTyping] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Per-chapter editor states: each chapter keeps its own undo history and cursor.
  const stateCache = useRef(new Map<string, { state: EditorState; body: string }>())
  const currentId = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dirty = useRef(false)

  const extensions = useMemo(
    () =>
      editorExtensions({
        dash: typo?.dialogueDash ?? '—',
        smartQuotes: typo?.smartQuotes ?? true,
        smartEllipsis: typo?.smartEllipsis ?? true,
        language: manifest?.language ?? 'en',
        placeholder: 'Begin here…'
      }),
    // Typing rules change rarely; the editor is rebuilt when they do.
    [typo?.dialogueDash, typo?.smartQuotes, typo?.smartEllipsis, manifest?.language]
  )

  const flush = useCallback((): void => {
    clearTimeout(saveTimer.current)
    const ed = editorRef.current
    const id = currentId.current
    if (!ed || !id || !dirty.current) return
    dirty.current = false
    const body = serializeMarkdown(ed.getJSON() as DocNode)
    useBook.getState().setChapterBody(id, body)
    const cached = stateCache.current.get(id)
    if (cached) cached.body = body
  }, [])

  const editor = useEditor(
    {
      extensions,
      content: chapter ? (parseMarkdown(chapter.body) as object) : '',
      editorProps: {
        attributes: {
          class: 'manuscript',
          spellcheck: String(spellcheck),
          lang: manifest?.language ?? 'en',
          'aria-label': 'Chapter text'
        }
      },
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged) return
        dirty.current = true
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(flush, 350)
        setTyping(true)
        clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => setTyping(false), 1400)
      }
    },
    [extensions]
  )
  const editorRef = useRef(editor)
  editorRef.current = editor

  // A new editor (new typing rules) cannot use states made for the old one.
  const lastEditor = useRef(editor)
  if (lastEditor.current !== editor) {
    lastEditor.current = editor
    stateCache.current.clear()
    currentId.current = null
  }

  // Switch chapters: save the old state, load the new one.
  useEffect(() => {
    if (!editor || !chapterId) return
    const prev = currentId.current
    if (prev === chapterId) return
    if (prev) {
      flush()
      const body = useBook.getState().chapters.find((c) => c.id === prev)?.body ?? ''
      stateCache.current.set(prev, { state: editor.state, body })
    }
    currentId.current = chapterId
    const ch = useBook.getState().chapters.find((c) => c.id === chapterId)
    const cached = stateCache.current.get(chapterId)
    let next: EditorState
    if (cached && ch && cached.body === ch.body) {
      next = cached.state
    } else {
      const doc = editor.schema.nodeFromJSON(parseMarkdown(ch?.body ?? ''))
      next = EditorState.create({ doc, plugins: editor.state.plugins, schema: editor.schema })
    }
    editor.view.updateState(next)
    setActiveEditor({ editor, chapterId, flush })
    scrollRef.current?.scrollTo({ top: 0 })
  }, [editor, chapterId, flush])

  // A file changed outside the app: reload it.
  useEffect(() => {
    if (!editor || !chapterId || externalRev === 0) return
    const ch = useBook.getState().chapters.find((c) => c.id === chapterId)
    if (!ch) return
    const doc = editor.schema.nodeFromJSON(parseMarkdown(ch.body))
    editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins, schema: editor.schema }))
    stateCache.current.delete(chapterId)
    dirty.current = false
  }, [editor, chapterId, externalRev])

  useEffect(() => {
    if (!editor) return
    setActiveEditor({ editor, chapterId: currentId.current ?? '', flush })
    return () => {
      flush()
      setActiveEditor(null)
    }
  }, [editor, flush])

  // Typewriter scrolling: keep the line of the cursor near the middle of the screen.
  useEffect(() => {
    if (!editor || !ui?.typewriterScroll) return
    const onSel = (): void => {
      const box = scrollRef.current
      if (!box || !editor.isFocused) return
      const coords = editor.view.coordsAtPos(editor.state.selection.head)
      const rect = box.getBoundingClientRect()
      const target = rect.top + rect.height * 0.42
      const delta = coords.top - target
      if (Math.abs(delta) > 24) box.scrollBy({ top: delta, behavior: 'smooth' })
    }
    editor.on('selectionUpdate', onSel)
    return () => {
      editor.off('selectionUpdate', onSel)
    }
  }, [editor, ui?.typewriterScroll])

  // Show the toolbar again when the mouse moves.
  useEffect(() => {
    const onMove = (): void => setTyping(false)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEditorStats(editor)

  if (!manifest || !typo) return null

  const pageStyle = {
    '--book-font': fontStack(typo.fontFamily),
    '--book-size': `${(typo.fontSize * 4) / 3}px`,
    '--book-lh': String(typo.lineHeight),
    '--book-indent': `${typo.firstLineIndent}em`,
    '--book-para': `${typo.paragraphSpacing}em`,
    '--book-align': typo.align,
    '--page-zoom': String(ui?.zoom ?? 1)
  } as React.CSSProperties

  return (
    <div
      ref={scrollRef}
      className={clsx('desk', ui?.focusMode && 'focus-mode', typing && 'is-typing', typo.indentFirstParagraph && 'indent-first')}
    >
      {editor && <Toolbar editor={editor} />}
      {editor && <FindBar editor={editor} />}
      {chapter ? (
        <motion.article
          key={chapter.id}
          className="page grain"
          style={pageStyle}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          onMouseDown={(e) => {
            // Click in the empty bottom area of the page: put the cursor at the end.
            if (e.target === e.currentTarget && editor) {
              e.preventDefault()
              editor.commands.focus('end')
            }
          }}
        >
          <ChapterHead index={chapterIndex} title={chapter.title} id={chapter.id} onEnter={() => editor?.commands.focus('start')} />
          <EditorContent editor={editor} />
        </motion.article>
      ) : (
        <EmptyManuscript />
      )}
      {chapter && <PageEnd />}
      {editor && <SelectionMenu editor={editor} />}
      {editor && <ReviewBar editor={editor} />}
    </div>
  )
}

function ChapterHead({ index, title, id, onEnter }: { index: number; title: string; id: string; onEnter: () => void }): React.JSX.Element {
  const [value, setValue] = useState(title)
  useEffect(() => setValue(title), [title, id])
  const commit = (): void => {
    if (value.trim() && value !== title) void useBook.getState().renameChapter(id, value)
    else setValue(title)
  }
  return (
    <header className="chapter-head">
      <div className="chapter-label caps">Chapter {NUMBER_WORDS[index] ?? index + 1}</div>
      <div className="chapter-number">{index + 1}</div>
      <input
        className="chapter-title"
        value={value}
        aria-label="Chapter title"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            onEnter()
          }
          if (e.key === 'Escape') {
            setValue(title)
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      <div className="chapter-rule" aria-hidden>
        <span />
      </div>
    </header>
  )
}

function PageEnd(): React.JSX.Element {
  const chapterId = useBook((s) => s.activeChapterId)
  const isLast = useBook((s) => s.chapters[s.chapters.length - 1]?.id === s.activeChapterId)
  return (
    <div className="page-end">
      {isLast && (
        <button className="page-end-btn" onClick={() => void useBook.getState().addChapter(chapterId)}>
          <Plus size={13} /> Start the next chapter
        </button>
      )}
    </div>
  )
}

function EmptyManuscript(): React.JSX.Element {
  return (
    <div className="empty-manuscript">
      <p>This book has no chapters yet.</p>
      <button className="btn btn-primary btn-md" onClick={() => void useBook.getState().addChapter(null, 'Chapter One')}>
        <Plus size={14} /> Add the first chapter
      </button>
    </div>
  )
}

export { countWords }
