import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Selection, TextSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plus } from '@phosphor-icons/react'
import clsx from 'clsx'
import { parseMarkdown } from '@shared/markdown/parse'
import { serializeMarkdown } from '@shared/markdown/serialize'
import { countMarkdownWords, countWords } from '@shared/book'
import { chapterLabel, PAGE_SIZES } from '@shared/export/model'
import type { BookManifest, DocNode } from '@shared/types'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { saver } from '@/stores/saver'
import { useUi } from '@/stores/ui'
import { useT } from '@/lib/i18n'
import { fontStack } from '@/lib/fonts'
import { registerFlusher } from '@/lib/flush'
import { editorExtensions } from './extensions'
import { getActiveEditor, getChapterEditor, hasCursor, registerChapterEditor, setActiveEditor, useActiveEditor, whenChapterEditor, type ChapterEditor } from './registry'
import { repaginate, type PageMetrics } from './pagination'
import { Toolbar } from './Toolbar'
import { SelectionMenu } from './SelectionMenu'
import { ReviewBar } from './ReviewBar'
import { FindBar } from './FindBar'
import { resetStats, useEditorStats } from './stats'
import { scaleOf, useDeskZoom } from './zoom'
import { PageCounter, countKey, setPageCount, usePagesOf } from './pageCounts'
import { useProposalUndoKeys } from './inlineProposals'
import { typewriterSound } from './typewriter-sound'
import { cleanPastedHtml, cleanPastedSlice, pasteStyleFor } from './paste'
import { forgetEditorStates, isReload, keepEditorState, loadDoc, takeEditorState } from './keep'
import { restorePlace, savePlace } from './deskPlace'
import { Margin } from '@/features/read/Margin'
import { setColumnShown, useReadUi } from '@/features/read/ui'
import './editor.css'

const MM = 96 / 25.4
/** Space between two sheets of paper, in pixels at zoom 1 */
const SHEET_GAP = 18
/** Typing gives its text to the book store after a pause of this many milliseconds… */
const SAVE_PAUSE = 350
/** …and at least this often while the author types without a pause. The store then writes the file. */
const SAVE_MAX_WAIT = 1500

type Geometry = PageMetrics & { width: number; marginLeft: number; marginRight: number }

/**
 * Page geometry of the book: the page size and margins of the book (Settings → This book), at the
 * zoom of the screen. The screen shows a right-hand page: the inner margin (the spine) is on the left.
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
    gap: SHEET_GAP * zoom,
    zoom
  }
}

/** Measured heights of the chapter sheets at zoom 1, so a sheet that is not on screen keeps its size at any zoom. */
const sheetHeights = new Map<string, number>()

/** The chapter sheet at the reading line (30 % of the desk height), and its top on the desk. */
function sheetAtReadingLine(desk: HTMLElement): { id: string; top: number } | null {
  const box = desk.getBoundingClientRect()
  const line = box.top + box.height * 0.3
  for (const el of desk.querySelectorAll<HTMLElement>('.page[data-chapter]')) {
    const r = el.getBoundingClientRect()
    if (r.top <= line && r.bottom >= line) return { id: el.dataset.chapter!, top: r.top - box.top }
  }
  return null
}

/** Ctrl+Z with the focus outside a text undoes an accepted chat change: only while the text shows (the Write view, without the revision list over it). */
function ProposalUndoKeys(): null {
  useProposalUndoKeys()
  return null
}

/**
 * The manuscript as pages, like a word processor: every chapter starts on a new page, the pages
 * follow one another, and scrolling down goes on into the next chapter. Each chapter has its own
 * editor (its own undo history); chapters far from the screen do not keep an editor, but their
 * editor state stays (keep.ts).
 *
 * The Write view stays mounted while the Plan view shows (BookView), so the scroll, the cursor
 * and the undo history are there when the author comes back.
 */
export function PageEditor(): React.JSX.Element | null {
  const manifest = useBook((s) => s.manifest)
  const chapterIds = useBook((s) => s.chapters.map((c) => c.id).join('|'))
  const ids = useMemo(() => (chapterIds ? chapterIds.split('|') : []), [chapterIds])
  const jump = useBook((s) => s.chapterJump)
  const view = useBook((s) => s.view)
  // The revision list of the editor's reads covers the desk (BookView): the text does not show.
  const revisionOpen = useUi((s) => s.revisionOpen)
  const ui = useApp((s) => s.settings?.ui)
  const active = useActiveEditor((s) => s.active)
  const typo = manifest?.typography
  const deskRef = useRef<HTMLDivElement>(null)
  const sizerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [typing, setTyping] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** The book opens at the place of the author: the desk shows when it is there. */
  const [placing, setPlacing] = useState(true)
  /** The chapter jump that the pages did last */
  const doneJump = useRef(0)
  /** The chapter at the reading line and its top on the desk, for a new order of the chapters */
  const anchor = useRef<{ id: string; top: number } | null>(null)

  // The pages are laid out at 100 %; the zoom is a scale of the whole desk (zoom.ts).
  const geometry = useMemo(() => (manifest ? pageGeometry(manifest, 1) : null), [manifest])

  const onTyping = useCallback((): void => {
    setTyping(true)
    clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => setTyping(false), 1400)
  }, [])

  // Another book: the counts and the kept editor states of the last book go.
  useEffect(() => {
    resetStats()
    return () => {
      forgetEditorStates()
      resetStats()
    }
  }, [])

  // Show the toolbar again when the mouse moves.
  useEffect(() => {
    const onMove = (): void => setTyping(false)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // The book opens where the author was (features/write/place.ts), and the cursor is in the text.
  useEffect(() => {
    const desk = deskRef.current
    if (!desk) return
    return restorePlace(desk, () => setPlacing(false))
  }, [])

  // Save the place: at a pause in the scroll or the typing, when the view changes, when the book closes.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => savePlace(deskRef.current), 600)
    }
    const desk = deskRef.current
    desk?.addEventListener('scroll', later, { passive: true })
    const offSelection = useActiveEditor.subscribe(later)
    const offView = useBook.subscribe((s, p) => {
      if (s.view !== p.view) savePlace(deskRef.current)
    })
    const unflush = registerFlusher(() => savePlace(deskRef.current))
    window.addEventListener('wordelia:selection', later)
    return () => {
      clearTimeout(timer)
      desk?.removeEventListener('scroll', later)
      window.removeEventListener('wordelia:selection', later)
      offSelection()
      offView()
      unflush()
    }
  }, [])

  // Back from the Plan view: the cursor is where it was, also when the focus went to the Plan view.
  useEffect(() => {
    let away: { editor: ChapterEditor | null; jump: number } | null = null
    return useBook.subscribe((s, p) => {
      if (p.view === 'write' && s.view !== 'write') {
        // The focus is still in the text now: the Write view becomes inert after this change.
        away = { editor: hasCursor() ? getActiveEditor() : null, jump: s.chapterJump?.n ?? 0 }
      } else if (p.view !== 'write' && s.view === 'write' && away) {
        const { editor, jump: n } = away
        away = null
        // A jump to a chapter (a proposal of the chat, a chapter of the story line) goes there instead.
        if (!editor || editor.editor.isDestroyed || (s.chapterJump?.n ?? 0) !== n) return
        requestAnimationFrame(() => {
          if (!editor.editor.isDestroyed && useBook.getState().view === 'write') editor.editor.commands.focus(null, { scrollIntoView: false })
        })
      }
    })
  }, [])

  // A jump to a chapter (the sidebar, the history, the chat): scroll its first page into view.
  useEffect(() => {
    if (!jump || jump.n === doneJump.current) return
    doneJump.current = jump.n
    const desk = deskRef.current
    const sheet = desk?.querySelector<HTMLElement>(`.page[data-chapter="${jump.id}"]`)
    if (!desk || !sheet) return
    const top = sheet.getBoundingClientRect().top - desk.getBoundingClientRect().top + desk.scrollTop - 56
    desk.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
    const editor = getChapterEditor(jump.id)
    if (editor) setActiveEditor(editor)
    if (jump.focus) whenChapterEditor(jump.id, (e) => setTimeout(() => e.editor.commands.focus('start'), 30))
  }, [jump])

  /** The chapter on screen is the active one in the sidebar. The toolbar and the actions stay on the chapter with the cursor. */
  const markActive = useCallback((): void => {
    const desk = deskRef.current
    if (!desk) return
    const at = sheetAtReadingLine(desk)
    if (!at) return
    anchor.current = at
    useBook.getState().setActiveChapter(at.id)
    const e = getChapterEditor(at.id)
    if (e && !hasCursor()) setActiveEditor(e)
  }, [])

  useEffect(() => {
    const desk = deskRef.current
    if (!desk) return
    let frame = 0
    const onScroll = (): void => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        markActive()
      })
    }
    desk.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      desk.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [markActive])

  // A new order of the chapters (a drag in the chapter list): the chapter on screen stays on screen,
  // at the same height, so the sidebar, the toolbar and the status bar stay on the chapter that shows.
  const lastIds = useRef(chapterIds)
  // Read during the render, while the sheets are still in the old order (like getSnapshotBeforeUpdate).
  if (lastIds.current !== chapterIds && deskRef.current) anchor.current = sheetAtReadingLine(deskRef.current) ?? anchor.current
  useLayoutEffect(() => {
    const was = lastIds.current
    lastIds.current = chapterIds
    const desk = deskRef.current
    const a = anchor.current
    if (!desk || !a || was === chapterIds) return
    const before = was.split('|')
    if (before.length !== ids.length || !ids.every((id) => before.includes(id))) return
    const sheet = desk.querySelector<HTMLElement>(`.page[data-chapter="${a.id}"]`)
    if (!sheet) return
    desk.scrollTop += sheet.getBoundingClientRect().top - desk.getBoundingClientRect().top - a.top
    markActive()
  }, [chapterIds, ids, markActive])

  useEditorStats(active?.editor ?? null, active?.chapterId ?? null)
  // The desk keeps room for the column of the comments of an editor's read (features/read).
  const commentRoom = useReadUi((s) => s.room)
  const { badge: zoomBadge, column } = useDeskZoom(deskRef, sizerRef, innerRef, commentRoom)
  useEffect(() => setColumnShown(column), [column])
  // The first page number of each chapter: the pages of the chapters before it, plus one.
  const { pages } = usePagesOf()
  const starts = useMemo(() => {
    let n = 1
    return ids.map((id) => {
      const start = n
      n += pages[id] ?? 1
      return start
    })
  }, [ids, pages])

  if (!manifest || !typo || !geometry) return null

  const vars = {
    '--book-font': fontStack(typo.fontFamily),
    '--book-size': `${(typo.fontSize * 4) / 3}px`,
    '--book-lh': String(typo.lineHeight),
    '--book-indent': `${typo.firstLineIndent}em`,
    '--book-para': `${typo.paragraphSpacing}em`,
    '--book-align': typo.align,
    '--page-zoom': '1',
    '--page-w': `${geometry.width}px`,
    '--page-ml': `${geometry.marginLeft}px`,
    '--page-mr': `${geometry.marginRight}px`,
    '--page-mt': `${geometry.marginTop}px`,
    '--page-mb': `${geometry.marginBottom}px`,
    '--page-gap': `${geometry.gap}px`,
    '--page-content-h': `${geometry.contentHeight}px`
  } as React.CSSProperties

  return (
    <div
      className={clsx('write-frame', ui?.focusMode && 'focus-mode', typing && 'is-typing', ui?.typewriterScroll && 'typewriter', typo.indentFirstParagraph && 'indent-first')}
    >
      {view === 'write' && !revisionOpen && <ProposalUndoKeys />}
      {active && <Toolbar editor={active.editor} />}
      {active && <FindBar editor={active.editor} />}
      <div ref={deskRef} className={clsx('desk', placing && 'is-placing')}>
        <div ref={sizerRef} className="desk-zoom">
          <div ref={innerRef} className="desk-inner" style={vars}>
            {ids.map((id, i) => (
              <ChapterSheet key={id} chapterId={id} index={i} firstPage={starts[i]} geometry={geometry} deskRef={deskRef} onTyping={onTyping} />
            ))}
            {ids.length ? <PageEnd /> : <EmptyManuscript />}
            <PageCounter />
          </div>
          {/* Outside the scaled pages, so the cards keep their size at every zoom: the comments beside the page. */}
          <Margin column={column} typing={typing} sizerRef={sizerRef} />
          {/* Outside the scaled pages: the bar keeps its size at every zoom. It stays with its review, in any chapter. */}
          <ReviewBar />
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
  /** The number of its first page in the book */
  firstPage: number
  chapterId: string
  index: number
  geometry: Geometry
  deskRef: React.RefObject<HTMLDivElement | null>
  onTyping: () => void
}

/** One chapter: its heading and its pages. The editor mounts when the chapter comes near the screen. */
function ChapterSheet({ chapterId, index, firstPage, geometry, deskRef, onTyping }: SheetProps): React.JSX.Element | null {
  const chapter = useBook((s) => s.chapters.find((c) => c.id === chapterId))
  const isActive = useBook((s) => s.activeChapterId === chapterId)
  /** This chapter has the cursor (or had it last): focus mode lights its paragraph only */
  const isCurrent = useActiveEditor((s) => s.active?.chapterId === chapterId)
  const ref = useRef<HTMLElement>(null)
  const [near, setNear] = useState(isActive)
  const zoomRef = useRef(geometry.zoom)
  zoomRef.current = geometry.zoom

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
      if (el.querySelector('.manuscript')) sheetHeights.set(chapterId, el.offsetHeight / zoomRef.current)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [chapterId])

  if (!chapter) return null
  const mounted = near || isActive
  // An estimate from the word count, until the chapter is measured once.
  const estimate = (): number => {
    const known = sheetHeights.get(chapterId)
    if (known) return known * geometry.zoom
    // Lines and pages at zoom 1: the number of pages does not change with the zoom.
    const z = geometry.zoom
    const words = countMarkdownWords(chapter.body)
    const lines = (words * 6.2 * 0.5 * parseFloat(getComputedStyle(document.documentElement).fontSize || '16')) / Math.max(200, (geometry.width - geometry.marginLeft - geometry.marginRight) / z)
    const linesPerPage = geometry.contentHeight / z / 26
    const pages = Math.max(1, Math.ceil((lines + 6) / linesPerPage))
    return pages * (geometry.contentHeight + geometry.marginTop + geometry.marginBottom) + (pages - 1) * geometry.gap
  }

  return (
    <article
      ref={ref}
      data-chapter={chapterId}
      className={clsx('page grain', !mounted && 'is-asleep', isCurrent && 'is-current')}
      // The page numbers of the sheet go on from the chapters before it (a CSS counter, editor.css).
      style={{ counterReset: `page ${firstPage - 1}`, ...(mounted ? {} : { height: estimate() }) }}
    >
      <ChapterHead index={index} title={chapter.title} id={chapterId} />
      {mounted && <SheetEditor chapterId={chapterId} index={index} title={chapter.title} geometry={geometry} onTyping={onTyping} sheetRef={ref} />}
    </article>
  )
}

interface EditorProps {
  chapterId: string
  index: number
  title: string
  geometry: PageMetrics
  onTyping: () => void
  sheetRef: React.RefObject<HTMLElement | null>
}

function SheetEditor({ chapterId, index, title, geometry, onTyping, sheetRef }: EditorProps): React.JSX.Element {
  const manifest = useBook((s) => s.manifest)
  const externalRev = useBook((s) => s.externalRev[chapterId] ?? 0)
  const typewriterScroll = useApp((s) => s.settings?.ui.typewriterScroll ?? false)
  const sounds = useApp((s) => s.settings?.editor.typewriterSounds ?? false)
  const typo = manifest?.typography
  const t = useT()

  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  /** The newest document that is not saved yet */
  const dirtyDoc = useRef<PMNode | null>(null)
  /** When the oldest typing that is not in the store yet happened */
  const dirtySince = useRef(0)
  const geometryRef = useRef(geometry)
  geometryRef.current = geometry
  /** The attributes of the text, read at each update: a new title or language shows without a new editor. */
  const attrs = useRef({ lang: 'en', label: '' })
  attrs.current = { lang: manifest?.language ?? 'en', label: t.editor.chapterTextOf(index + 1, title) }
  const holdId = `editor:${chapterId}`

  const flush = useCallback((): void => {
    clearTimeout(saveTimer.current)
    dirtySince.current = 0
    const doc = dirtyDoc.current
    dirtyDoc.current = null
    if (doc) useBook.getState().setChapterBody(chapterId, serializeMarkdown(doc.toJSON() as DocNode))
    saver.release(holdId)
  }, [chapterId, holdId])

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
            // On screen the pages are scaled by the zoom; the measure works at 100 %.
            return (root.getBoundingClientRect().top - sheet.getBoundingClientRect().top) / scaleOf(root as HTMLElement) - geometryRef.current.marginTop
          },
          // The exact page count of this chapter, for the sidebar, the page numbers and the library.
          onCount: (n) => {
            const { chapters, manifest: m } = useBook.getState()
            const ch = chapters.find((c) => c.id === chapterId)
            if (ch && m) setPageCount(chapterId, n, countKey(ch, m))
          }
        },
        proposals: { docId: () => chapterId },
        comments: { chapterId: () => chapterId }
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
        // Pasted text gets the typography of the book (paste.ts).
        transformPasted: (slice, view) => {
          const m = useBook.getState().manifest
          return m ? cleanPastedSlice(slice, view.state.schema, pasteStyleFor(m.language, m.typography)) : slice
        },
        scrollMargin: { top: 130, bottom: 90, left: 0, right: 0 },
        scrollThreshold: { top: 130, bottom: 90, left: 0, right: 0 },
        // Spell check follows the setting of the app: the text has no attribute of its own, so it
        // takes the one of the page (BookView).
        attributes: () => ({ class: 'manuscript', lang: attrs.current.lang, 'aria-label': attrs.current.label }),
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
        // A text from the store (a change from outside, a restored version) is not typing.
        if (!transaction.docChanged || isReload(transaction)) return
        dirtyDoc.current = transaction.doc
        // The status bar shows at once that the change is not on disk yet.
        saver.hold(holdId)
        const now = Date.now()
        if (!dirtySince.current) dirtySince.current = now
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(flush, Math.max(0, Math.min(SAVE_PAUSE, SAVE_MAX_WAIT - (now - dirtySince.current))))
        onTyping()
      },
      onSelectionUpdate: () => {
        window.dispatchEvent(new Event('wordelia:selection'))
      },
      onFocus: () => {
        useBook.getState().setActiveChapter(chapterId)
      }
    },
    [extensions]
  )

  // Register this chapter's editor; the focused one becomes the active one. A chapter that had an
  // editor before gets its state back: the undo history, the cursor and the text (keep.ts).
  useEffect(() => {
    if (!editor) return
    const kept = takeEditorState(chapterId)
    if (kept && !editor.isDestroyed) {
      try {
        editor.view.updateState(kept.state.reconfigure({ plugins: editor.state.plugins }))
        // The text changed while the chapter had no editor (a file from outside, a restore).
        const body = useBook.getState().chapters.find((c) => c.id === chapterId)?.body
        if (body !== undefined && body !== kept.body) loadDoc(editor, editor.schema.nodeFromJSON(parseMarkdown(body)), false)
      } catch {
        /* a state of another schema (an old editor): keep the new one */
      }
    }
    const handle = { editor, chapterId, flush }
    const unregister = registerChapterEditor(handle)
    const unflush = registerFlusher(flush)
    const onFocus = (): void => setActiveEditor(handle)
    editor.on('focus', onFocus)
    return () => {
      editor.off('focus', onFocus)
      flush()
      if (!editor.isDestroyed) {
        const body = useBook.getState().chapters.find((c) => c.id === chapterId)?.body
        if (body !== undefined) keepEditorState(chapterId, editor.state, body)
      }
      unflush()
      unregister()
    }
  }, [editor, chapterId, flush])

  // A new title or language: the label and the language of the text change.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.setProps({})
  }, [editor, title, index, manifest?.language])

  // A file changed outside the app, or a version was restored: load the new text, and keep the
  // cursor and the undo history (keep.ts). Ctrl+Z undoes a restore, not a change from outside.
  const seenRev = useRef(externalRev)
  useEffect(() => {
    if (!editor || externalRev === seenRev.current) return
    seenRev.current = externalRev
    const ch = useBook.getState().chapters.find((c) => c.id === chapterId)
    if (!ch) return
    clearTimeout(saveTimer.current)
    dirtyDoc.current = null
    dirtySince.current = 0
    saver.release(holdId)
    loadDoc(editor, editor.schema.nodeFromJSON(parseMarkdown(ch.body)), useBook.getState().undoableRev[chapterId] === externalRev)
  }, [editor, chapterId, externalRev, holdId])

  // New page geometry (zoom, page size): measure the pages again.
  useEffect(() => {
    if (editor) repaginate(editor.view)
  }, [editor, geometry])

  // Typewriter mode: the line of the cursor stays at the same height on the screen, and the page
  // moves up. The desk eases towards that height frame by frame; a new key press does not restart
  // the movement (a smooth scrollBy for each key never got anywhere while the author typed).
  useEffect(() => {
    if (!editor || !typewriterScroll) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let frame = 0
    const step = (): void => {
      frame = 0
      const box = editor.view.dom.closest('.desk') as HTMLElement | null
      if (!box || editor.isDestroyed || !editor.isFocused) return
      const coords = editor.view.coordsAtPos(editor.state.selection.head)
      const rect = box.getBoundingClientRect()
      const delta = coords.top - (rect.top + rect.height * 0.42)
      if (Math.abs(delta) < 1) return
      const before = box.scrollTop
      box.scrollTop = before + (reduced ? delta : delta * 0.25)
      // The start or the end of the desk: it cannot move further.
      if (box.scrollTop === before) return
      frame = requestAnimationFrame(step)
    }
    const onSel = (): void => {
      if (!frame) frame = requestAnimationFrame(step)
    }
    editor.on('selectionUpdate', onSel)
    return () => {
      editor.off('selectionUpdate', onSel)
      if (frame) cancelAnimationFrame(frame)
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
  const headRef = useRef<HTMLElement>(null)
  /** Escape: the blur after it must not save the new text */
  const cancelled = useRef(false)
  const commit = (): void => {
    const clean = value.trim()
    if (!cancelled.current && clean && clean !== title) void useBook.getState().renameChapter(id, clean)
    else setValue(title)
    cancelled.current = false
  }
  // A long title takes two lines: the text of the first page then starts lower.
  useEffect(() => {
    const el = headRef.current
    if (!el) return
    let last = el.offsetHeight
    const ro = new ResizeObserver(() => {
      if (el.offsetHeight === last) return
      last = el.offsetHeight
      const e = getChapterEditor(id)
      if (e) repaginate(e.editor.view)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [id])
  return (
    <header ref={headRef} className="chapter-head">
      {/* "CHAPTER" above the number: the number says which one, the title says what it is. */}
      <div className="chapter-label caps">{chapterLabel(language)}</div>
      <div className="chapter-number">{index + 1}</div>
      <textarea
        className="chapter-title"
        rows={1}
        value={value}
        aria-label={t.editor.page.chapterTitle}
        spellCheck={false}
        // A title is one line of text, even when it wraps.
        onChange={(e) => setValue(e.target.value.replace(/\s*\n\s*/g, ' '))}
        onBlur={commit}
        onFocus={() => useBook.getState().setActiveChapter(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
            whenChapterEditor(id, (ed) => ed.editor.commands.focus('start'))
          }
          if (e.key === 'Escape') {
            // Cancel: the title stays as it was.
            e.preventDefault()
            cancelled.current = true
            setValue(title)
            ;(e.target as HTMLTextAreaElement).blur()
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
  // The first chapter: its title is the first planned chapter of the story line, else a title
  // without a number in the language of the book ("Untitled").
  return (
    <div className="empty-manuscript">
      <p>{t.editor.page.noChapters}</p>
      <button className="btn btn-primary btn-md" onClick={() => void useBook.getState().addChapter(null)}>
        <Plus size={14} /> {t.editor.page.addFirstChapter}
      </button>
    </div>
  )
}

export { countWords }
