import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { EditorState } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { motion } from 'motion/react'
import { Plus } from '@phosphor-icons/react'
import clsx from 'clsx'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import { countWords } from '@shared/book'
import { chapterWord } from '@shared/export/model'
import type { DocNode } from '@shared/types'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { fontStack } from '@/lib/fonts'
import { editorExtensions } from './extensions'
import { setActiveEditor } from './registry'
import { registerFlusher } from '@/lib/flush'
import { Toolbar } from './Toolbar'
import { SelectionMenu } from './SelectionMenu'
import { ReviewBar } from './ReviewBar'
import { FindBar } from './FindBar'
import { useEditorStats } from './stats'
import { typewriterSound } from './typewriter-sound'
import { cleanPastedHtml } from './paste'
import './editor.css'

export function PageEditor(): React.JSX.Element | null {
  const manifest = useBook((s) => s.manifest)
  const chapterId = useBook((s) => s.activeChapterId)
  const chapterIndex = useBook((s) => s.chapters.findIndex((c) => c.id === s.activeChapterId))
  const chapter = useBook((s) => s.chapters.find((c) => c.id === s.activeChapterId))
  const externalRev = useBook((s) => (s.activeChapterId ? (s.externalRev[s.activeChapterId] ?? 0) : 0))
  const ui = useApp((s) => s.settings?.ui)
  const spellcheck = useApp((s) => s.settings?.editor.spellcheck ?? true)
  const typo = manifest?.typography
  const t = useT()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [typing, setTyping] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Per-chapter editor states: each chapter keeps its own undo history and cursor.
  const stateCache = useRef(new Map<string, { state: EditorState; body: string }>())
  const currentId = useRef<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** The newest document that is not saved yet. It belongs to the chapter `currentId`. */
  const dirtyDoc = useRef<PMNode | null>(null)

  const extensions = useMemo(
    () =>
      editorExtensions({
        dash: typo?.dialogueDash ?? '—',
        smartQuotes: typo?.smartQuotes ?? true,
        smartEllipsis: typo?.smartEllipsis ?? true,
        language: manifest?.language ?? 'en',
        placeholder: t.editor.page.placeholder
      }),
    // Typing rules and the interface language change rarely; the editor is rebuilt when they do.
    [typo?.dialogueDash, typo?.smartQuotes, typo?.smartEllipsis, manifest?.language, t.editor.page.placeholder]
  )

  const flush = useCallback((): void => {
    clearTimeout(saveTimer.current)
    const doc = dirtyDoc.current
    const id = currentId.current
    if (!doc || !id) return
    dirtyDoc.current = null
    // The saved document, not the editor: the editor may be gone (new typing rules).
    const body = serializeMarkdown(doc.toJSON() as DocNode)
    useBook.getState().setChapterBody(id, body)
    const cached = stateCache.current.get(id)
    if (cached) cached.body = body
  }, [])

  const editor = useEditor(
    {
      extensions,
      content: chapter ? (parseMarkdown(chapter.body) as object) : '',
      // Prose, not Markdown: "- " or "* " at the start of a line must stay text (dialogue!).
      // Only the book's own typing rules run.
      enableInputRules: ['smartTyping', 'sceneBreak'],
      enablePasteRules: false,
      editorProps: {
        transformPastedHTML: cleanPastedHtml,
        scrollMargin: { top: 130, bottom: 90, left: 0, right: 0 },
        scrollThreshold: { top: 130, bottom: 90, left: 0, right: 0 },
        attributes: {
          class: 'manuscript',
          spellcheck: String(spellcheck),
          lang: manifest?.language ?? 'en',
          'aria-label': t.editor.page.chapterText
        }
      },
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged) return
        dirtyDoc.current = transaction.doc
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(flush, 350)
        setTyping(true)
        clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => setTyping(false), 1400)
      }
    },
    [extensions]
  )

  // A new editor (new typing rules) cannot use states made for the old one.
  // This runs after the cleanup below saved the typing of the old editor.
  const lastEditor = useRef(editor)
  useEffect(() => {
    if (lastEditor.current === editor) return
    lastEditor.current = editor
    stateCache.current.clear()
    currentId.current = null
  }, [editor])

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
    dirtyDoc.current = null
  }, [editor, chapterId, externalRev])

  useEffect(() => {
    if (!editor) return
    setActiveEditor({ editor, chapterId: currentId.current ?? '', flush })
    const unregister = registerFlusher(flush)
    return () => {
      unregister()
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

  // Optional typewriter sounds.
  const sounds = useApp((s) => s.settings?.editor.typewriterSounds ?? false)
  useEffect(() => {
    if (!editor || !sounds) return
    const dom = editor.view.dom
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') typewriterSound('bell')
      else if (e.ctrlKey || e.metaKey || e.altKey) return
      else if (e.key === 'Enter') typewriterSound('enter')
      else if (e.key === 'Backspace' || e.key === 'Delete') typewriterSound('back')
      else if (e.key === ' ') typewriterSound('space')
      else if (e.key.length === 1) typewriterSound('key')
    }
    dom.addEventListener('keydown', onKey)
    return () => dom.removeEventListener('keydown', onKey)
  }, [editor, sounds])

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
          // Hyphenation and spell check follow the language of the book, not the language of the interface.
          lang={manifest?.language ?? 'en'}
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
  const language = useBook((s) => s.manifest?.language ?? 'en')
  const t = useT()
  const [value, setValue] = useState(title)
  useEffect(() => setValue(title), [title, id])
  const commit = (): void => {
    if (value.trim() && value !== title) void useBook.getState().renameChapter(id, value)
    else setValue(title)
  }
  return (
    <header className="chapter-head">
      <div className="chapter-label caps">{chapterWord(language, index + 1)}</div>
      <div className="chapter-number">{index + 1}</div>
      <input
        className="chapter-title"
        value={value}
        aria-label={t.editor.page.chapterTitle}
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
  const t = useT()
  return (
    <div className="page-end">
      {isLast && (
        <button className="page-end-btn" onClick={() => void useBook.getState().addChapter(chapterId)}>
          <Plus size={13} /> {t.editor.page.nextChapter}
        </button>
      )}
    </div>
  )
}

function EmptyManuscript(): React.JSX.Element {
  const t = useT()
  // The first chapter title is book text: it follows the language of the book.
  const language = useBook((s) => s.manifest?.language ?? 'en')
  return (
    <div className="empty-manuscript">
      <p>{t.editor.page.noChapters}</p>
      <button className="btn btn-primary btn-md" onClick={() => void useBook.getState().addChapter(null, chapterWord(language, 1))}>
        <Plus size={14} /> {t.editor.page.addFirstChapter}
      </button>
    </div>
  )
}

export { countWords }
