import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { EditorState, Selection, TextSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plus } from '@phosphor-icons/react'
import clsx from 'clsx'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import { countMarkdownWords, countWords } from '@shared/book'
import { chapterWord, PAGE_SIZES } from '@shared/export/model'
import type { BookManifest, DocNode } from '@shared/types'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { fontStack } from '@/lib/fonts'
import { registerFlusher } from '@/lib/flush'
import { editorExtensions } from './extensions'
import { getChapterEditor, hasCursor, registerChapterEditor, setActiveEditor, useActiveEditor, whenChapterEditor } from './registry'
import { repaginate, type PageMetrics } from './pagination'
import { Toolbar } from './Toolbar'
import { SelectionMenu } from './SelectionMenu'
import { ReviewBar } from './ReviewBar'
import { FindBar } from './FindBar'
import { useEditorStats } from './stats'
import { usePageZoom } from './zoom'
import { useInlineProposalSync } from './inlineProposals'
import { typewriterSound } from './typewriter-sound'
import { cleanPastedHtml } from './paste'
import './editor.css'

const MM = 96 / 25.4
/** Space between two sheets of paper, in pixels at zoom 1 */
const SHEET_GAP = 18

type Geometry = PageMetrics & { width: number; marginLeft: number; marginRight: number }

/**
 * Page geometry of the book: the page size and margins of its export settings, at the zoom of the
 * screen. The screen shows a right-hand page: the inner margin (the spine) is on the left.
 */
function pageGeometry(m: BookManifest, zoom: number): Geometry {
  const size = PAGE_SIZES[m.export.pageSize] ?? PAGE_SIZES.A5
  const mg = m.export.margins
  const marginTop = mg.top * MM * zoom
  const marginBottom = mg.bottom * MM * zoom
  const height = size.h * MM * zoom
  return {
    width: size.w * MM * zoom,
    marginLeft: mg.inner * MM * zoom,
    marginRight: mg.outer * MM * zoom,
    marginTop,
    marginBottom,
    contentHeight: height - marginTop - marginBottom,
    gap: SHEET_GAP * zoom
  }
}

/** Measured heights of the chapter sheets, so a sheet that is not on screen keeps its size. */
const sheetHeights = new Map<string, number>()

/**
 * The manuscript as pages, like a word processor: every chapter starts on a new page, the pages
 * follow one another, and scrolling down goes on into the next chapter. Each chapter has its own
 * editor (its own undo history); chapters far from the screen do not keep an editor.
 */
export function PageEditor(): React.JSX.Element | null {
  const manifest = useBook((s) => s.manifest)
  const chapterIds = useBook((s) => s.chapters.map((c) => c.id).join('|'))
  const ids = useMemo(() => (chapterIds ? chapterIds.split('|') : []), [chapterIds])
  const jump = useBook((s) => s.chapterJump)
  const ui = useApp((s) => s.settings?.ui)
  const active = useActiveEditor((s) => s.active)
  const typo = manifest?.typography
  const deskRef = useRef<HTMLDivElement>(null)
  const [typing, setTyping] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const zoom = ui?.zoom ?? 1

  const geometry = useMemo(() => (manifest ? pageGeometry(manifest, zoom) : null), [manifest, zoom])

  const onTyping = useCallback((): void => {
    setTyping(true)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => setTyping(false), 1400)
  }, [])

  // Show the toolbar again when the mouse moves.
  useEffect(() => {
    const onMove = (): void => setTyping(false)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // A jump to a chapter (the sidebar, the history, the chat): scroll its first page into view.
  useEffect(() => {
    if (!jump) return
    const desk = deskRef.current
    const sheet = desk?.querySelector<HTMLElement>(`[data-chapter="${jump.id}"]`)
    if (!desk || !sheet) return
    const top = sheet.getBoundingClientRect().top - desk.getBoundingClientRect().top + desk.scrollTop - 56
    desk.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
    const editor = getChapterEditor(jump.id)
    if (editor) setActiveEditor(editor)
    if (jump.focus) whenChapterEditor(jump.id, (e) => setTimeout(() => e.editor.commands.focus('start'), 30))
  }, [jump])

  // The chapter on screen is the active one in the sidebar, like the outline of a word processor.
  // The toolbar and the actions stay on the chapter with the cursor, if there is one.
  useEffect(() => {
    const desk = deskRef.current
    if (!desk) return
    let frame = 0
    const onScroll = (): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const box = desk.getBoundingClientRect()
        const line = box.top + box.height * 0.3
        for (const el of desk.querySelectorAll<HTMLElement>('[data-chapter]')) {
          const r = el.getBoundingClientRect()
          if (r.top <= line && r.bottom >= line) {
            const id = el.dataset.chapter!
            useBook.getState().setActiveChapter(id)
            const e = getChapterEditor(id)
            if (e && !hasCursor()) setActiveEditor(e)
            break
          }
        }
      })
    }
    desk.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      desk.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  useEditorStats(active?.editor ?? null)
  const zoomBadge = usePageZoom(deskRef)
  useInlineProposalSync()

  if (!manifest || !typo || !geometry) return null

  const vars = {
    '--book-font': fontStack(typo.fontFamily),
    '--book-size': `${(typo.fontSize * 4) / 3}px`,
    '--book-lh': String(typo.lineHeight),
    '--book-indent': `${typo.firstLineIndent}em`,
    '--book-para': `${typo.paragraphSpacing}em`,
    '--book-align': typo.align,
    '--page-zoom': String(zoom),
    '--page-w': `${geometry.width}px`,
    '--page-ml': `${geometry.marginLeft}px`,
    '--page-mr': `${geometry.marginRight}px`,
    '--page-mt': `${geometry.marginTop}px`,
    '--page-mb': `${geometry.marginBottom}px`,
    '--page-gap': `${geometry.gap}px`,
    '--page-content-h': `${geometry.contentHeight}px`
  } as React.CSSProperties

  return (
    <div className={clsx('write-frame', ui?.focusMode && 'focus-mode', typing && 'is-typing', typo.indentFirstParagraph && 'indent-first')}>
      {active && <Toolbar editor={active.editor} />}
      {active && <FindBar editor={active.editor} />}
      <div ref={deskRef} className="desk">
        <div className="desk-inner" style={vars}>
          {ids.map((id, i) => (
            <ChapterSheet key={id} chapterId={id} index={i} geometry={geometry} deskRef={deskRef} onTyping={onTyping} />
          ))}
          {ids.length ? <PageEnd /> : <EmptyManuscript />}
          {active && <ReviewBar editor={active.editor} />}
        </div>
      </div>
      {active && <SelectionMenu editor={active.editor} />}
      {zoomBadge !== null && (
        <div className="zoom-badge" role="status">
          {Math.round(zoomBadge * 100)}%
        </div>
      )}
    </div>
  )
}

interface SheetProps {
  chapterId: string
  index: number
  geometry: Geometry
  deskRef: React.RefObject<HTMLDivElement | null>
  onTyping: () => void
}

/** One chapter: its heading and its pages. The editor mounts when the chapter comes near the screen. */
function ChapterSheet({ chapterId, index, geometry, deskRef, onTyping }: SheetProps): React.JSX.Element | null {
  const chapter = useBook((s) => s.chapters.find((c) => c.id === chapterId))
  const isActive = useBook((s) => s.activeChapterId === chapterId)
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(isActive)

  useEffect(() => {
    const el = ref.current
    const root = deskRef.current
    if (!el || !root) return
    const io = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), { root, rootMargin: '1600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [deskRef])

  // Remember the real height, for the time the editor is not mounted.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (el.querySelector('.manuscript')) sheetHeights.set(chapterId, el.offsetHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [chapterId])

  if (!chapter) return null
  const mounted = near || isActive
  // An estimate from the word count, until the chapter is measured once.
  const estimate = (): number => {
    const known = sheetHeights.get(chapterId)
    if (known) return known
    const words = countMarkdownWords(chapter.body)
    const lines = (words * 6.2 * 0.5 * parseFloat(getComputedStyle(document.documentElement).fontSize || '16')) / Math.max(200, geometry.width - geometry.marginLeft - geometry.marginRight)
    const linesPerPage = geometry.contentHeight / 26
    const pages = Math.max(1, Math.ceil((lines + 6) / linesPerPage))
    return pages * (geometry.contentHeight + geometry.marginTop + geometry.marginBottom) + (pages - 1) * geometry.gap
  }

  return (
    <article ref={ref} data-chapter={chapterId} className={clsx('page grain', !mounted && 'is-asleep')} style={mounted ? undefined : { height: estimate() }}>
      <ChapterHead index={index} title={chapter.title} id={chapterId} />
      {mounted && <SheetEditor chapterId={chapterId} geometry={geometry} onTyping={onTyping} sheetRef={ref} />}
    </article>
  )
}

interface EditorProps {
  chapterId: string
  geometry: PageMetrics
  onTyping: () => void
  sheetRef: React.RefObject<HTMLElement | null>
}

function SheetEditor({ chapterId, geometry, onTyping, sheetRef }: EditorProps): React.JSX.Element {
  const manifest = useBook((s) => s.manifest)
  const externalRev = useBook((s) => s.externalRev[chapterId] ?? 0)
  const spellcheck = useApp((s) => s.settings?.editor.spellcheck ?? true)
  const typewriterScroll = useApp((s) => s.settings?.ui.typewriterScroll ?? false)
  const sounds = useApp((s) => s.settings?.editor.typewriterSounds ?? false)
  const typo = manifest?.typography
  const t = useT()

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** The newest document that is not saved yet */
  const dirtyDoc = useRef<PMNode | null>(null)
  const geometryRef = useRef(geometry)
  geometryRef.current = geometry

  const flush = useCallback((): void => {
    clearTimeout(saveTimer.current)
    const doc = dirtyDoc.current
    if (!doc) return
    dirtyDoc.current = null
    useBook.getState().setChapterBody(chapterId, serializeMarkdown(doc.toJSON() as DocNode))
  }, [chapterId])

  const extensions = useMemo(
    () =>
      editorExtensions({
        dash: typo?.dialogueDash ?? '—',
        smartQuotes: typo?.smartQuotes ?? true,
        smartEllipsis: typo?.smartEllipsis ?? true,
        language: manifest?.language ?? 'en',
        placeholder: t.editor.page.placeholder,
        pages: {
          metrics: () => geometryRef.current,
          // The chapter heading takes the top of the first page.
          firstPageOffset: () => {
            const sheet = sheetRef.current
            const root = sheet?.querySelector('.manuscript')
            if (!sheet || !root) return 0
            return root.getBoundingClientRect().top - sheet.getBoundingClientRect().top - geometryRef.current.marginTop
          }
        },
        proposals: { chapterId: () => chapterId }
      }),
    // Typing rules and the interface language change rarely; the editor is rebuilt when they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [typo?.dialogueDash, typo?.smartQuotes, typo?.smartEllipsis, manifest?.language, t.editor.page.placeholder]
  )

  const editor = useEditor(
    {
      extensions,
      content: parseMarkdown(useBook.getState().chapters.find((c) => c.id === chapterId)?.body ?? '') as object,
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
        },
        // The book is one long text: the arrows go on into the next or the previous chapter.
        handleKeyDown: (view, event) => {
          // Ctrl+Home / Ctrl+End: the start or the end of the chapter. The browser cannot do it
          // itself, because the empty end of the last page is not text.
          if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === 'Home' || event.key === 'End')) {
            const { doc, selection } = view.state
            const target = event.key === 'End' ? Selection.atEnd(doc) : Selection.atStart(doc)
            const sel = event.shiftKey ? TextSelection.create(doc, selection.anchor, target.head) : target
            view.dispatch(view.state.tr.setSelection(sel).scrollIntoView())
            return true
          }
          if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false
          const { selection, doc } = view.state
          if (!selection.empty) return false
          const chapters = useBook.getState().chapters
          const i = chapters.findIndex((c) => c.id === chapterId)
          const atEnd = selection.from >= doc.content.size - 1
          const atStart = selection.from <= 1
          if ((event.key === 'ArrowDown' || event.key === 'ArrowRight') && atEnd && view.endOfTextblock(event.key === 'ArrowDown' ? 'down' : 'right')) {
            const next = chapters[i + 1]
            if (!next) return false
            useBook.getState().selectChapter(next.id)
            whenChapterEditor(next.id, (e) => e.editor.commands.focus('start'))
            return true
          }
          if ((event.key === 'ArrowUp' || event.key === 'ArrowLeft') && atStart && view.endOfTextblock(event.key === 'ArrowUp' ? 'up' : 'left')) {
            const prev = chapters[i - 1]
            if (!prev) return false
            useBook.getState().selectChapter(prev.id)
            whenChapterEditor(prev.id, (e) => e.editor.commands.focus('end'))
            return true
          }
          return false
        }
      },
      onUpdate: ({ transaction }) => {
        if (!transaction.docChanged) return
        dirtyDoc.current = transaction.doc
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(flush, 350)
        onTyping()
      },
      onFocus: () => {
        useBook.getState().setActiveChapter(chapterId)
      }
    },
    [extensions]
  )

  // Register this chapter's editor; the focused one becomes the active one.
  useEffect(() => {
    if (!editor) return
    const handle = { editor, chapterId, flush }
    const unregister = registerChapterEditor(handle)
    const unflush = registerFlusher(flush)
    const onFocus = (): void => setActiveEditor(handle)
    editor.on('focus', onFocus)
    return () => {
      editor.off('focus', onFocus)
      flush()
      unflush()
      unregister()
    }
  }, [editor, chapterId, flush])

  // A file changed outside the app, or a version was restored: reload the text.
  const seenRev = useRef(externalRev)
  useEffect(() => {
    if (!editor || externalRev === seenRev.current) return
    seenRev.current = externalRev
    const ch = useBook.getState().chapters.find((c) => c.id === chapterId)
    if (!ch) return
    const doc = editor.schema.nodeFromJSON(parseMarkdown(ch.body))
    editor.view.updateState(EditorState.create({ doc, plugins: editor.state.plugins, schema: editor.schema }))
    dirtyDoc.current = null
  }, [editor, chapterId, externalRev])

  // New page geometry (zoom, page size): measure the pages again.
  useEffect(() => {
    if (editor) repaginate(editor.view)
  }, [editor, geometry])

  // Typewriter scrolling: keep the line of the cursor near the middle of the screen.
  useEffect(() => {
    if (!editor || !typewriterScroll) return
    const onSel = (): void => {
      const box = editor.view.dom.closest('.desk') as HTMLElement | null
      if (!box || !editor.isFocused) return
      const coords = editor.view.coordsAtPos(editor.state.selection.head)
      const rect = box.getBoundingClientRect()
      const delta = coords.top - (rect.top + rect.height * 0.42)
      if (Math.abs(delta) > 24) box.scrollBy({ top: delta, behavior: 'smooth' })
    }
    editor.on('selectionUpdate', onSel)
    return () => {
      editor.off('selectionUpdate', onSel)
    }
  }, [editor, typewriterScroll])

  // Optional typewriter sounds.
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

  return <EditorContent editor={editor} />
}

function ChapterHead({ index, title, id }: { index: number; title: string; id: string }): React.JSX.Element {
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
        onFocus={() => useBook.getState().setActiveChapter(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            whenChapterEditor(id, (ed) => ed.editor.commands.focus('start'))
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
  const lastId = useBook((s) => s.chapters[s.chapters.length - 1]?.id ?? null)
  const t = useT()
  return (
    <div className="page-end">
      <button className="page-end-btn" onClick={() => void useBook.getState().addChapter(lastId)}>
        <Plus size={13} /> {t.editor.page.nextChapter}
      </button>
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
