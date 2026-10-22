import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useEditorState, type Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, CaretRight, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { markdownToPlain } from '@shared/book'
import { Button, Dialog } from '@/ui'
import { useBook } from '@/stores/book'
import { showText, toast, useUi } from '@/stores/ui'
import { getT, useT } from '@/lib/i18n'
import { findKey } from './find'
import { scrollToPos, setActiveEditor, whenChapterEditor } from './registry'
import { matchesInBook, replaceInBook, type ChapterMatches } from './replaceBook'

function countIn(text: string, q: string, cs: boolean, ww: boolean): number {
  if (!q) return 0
  const body = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(ww ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, cs ? 'gu' : 'giu')
  return text.match(re)?.length ?? 0
}

/** The plain text of each chapter, made again only when the text of the chapter changes. */
const plainOf = new Map<string, { body: string; plain: string }>()
function plainText(c: { id: string; body: string }): string {
  const known = plainOf.get(c.id)
  if (known && known.body === c.body) return known.plain
  const plain = markdownToPlain(c.body)
  plainOf.set(c.id, { body: c.body, plain })
  return plain
}

export function FindBar({ editor }: { editor: Editor }): React.JSX.Element {
  const open = useUi((s) => s.findOpen)
  const setOpen = useUi((s) => s.setFindOpen)
  const [query, setQuery] = useState('')
  const [replace, setReplace] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [cs, setCs] = useState(false)
  const [ww, setWw] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  /** "Replace in all chapters": the chapters with matches, waiting for the confirm */
  const [inBook, setInBook] = useState<ChapterMatches[] | null>(null)
  const chapters = useBook((s) => s.chapters)
  const activeId = useBook((s) => s.activeChapterId)
  const t = useT()
  const tf = t.editor.find

  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const f = findKey.getState(e.state)
      return { count: f?.matches.length ?? 0, current: f?.current ?? -1 }
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      // The Write view stays mounted under the Plan view: Ctrl+F works only while it shows.
      if (mod && (e.key === 'f' || e.key === 'h') && useBook.getState().view === 'write') {
        e.preventDefault()
        // The find bar looks in the text: the text shows (the revision list closes).
        showText()
        setOpen(true)
        if (e.key === 'h') setShowReplace(true)
        const { from, to } = editor.state.selection
        const sel = editor.state.doc.textBetween(from, to, ' ')
        if (sel && sel.length < 80) setQuery(sel)
        setTimeout(() => input.current?.select(), 30)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, setOpen])

  useEffect(() => {
    if (open) editor.commands.setFind(query, { caseSensitive: cs, wholeWord: ww })
    else editor.commands.clearFind()
  }, [open, query, cs, ww, editor, activeId])

  const [slowQuery, setSlowQuery] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setSlowQuery(query), 200)
    return () => clearTimeout(t)
  }, [query])
  const others = useMemo(() => {
    if (!open || !slowQuery) return []
    return chapters
      .filter((c) => c.id !== activeId)
      .map((c) => ({ id: c.id, title: c.title, n: countIn(plainText(c), slowQuery, cs, ww) }))
      .filter((c) => c.n > 0)
  }, [open, slowQuery, cs, ww, chapters, activeId])

  /**
   * Close the bar and leave the text where it is. The cursor goes to the match that shows, so the
   * search ends there (a focus at the old cursor would scroll the text back to it).
   */
  const close = (): void => {
    const f = findKey.getState(editor.state)
    const m = f && f.current >= 0 ? f.matches[f.current] : null
    setOpen(false)
    if (m) editor.commands.setTextSelection({ from: m.from, to: m.to })
    editor.commands.focus(null, { scrollIntoView: false })
  }

  /** Bring the current match into view. */
  const showCurrent = (ed: Editor): void => {
    const f = findKey.getState(ed.state)
    const m = f && f.current >= 0 ? f.matches[f.current] : null
    if (m) scrollToPos(ed, m.from)
  }

  // A new search: show the first match.
  useEffect(() => {
    if (!open || !query) return
    const id = setTimeout(() => showCurrent(editor), 30)
    return () => clearTimeout(id)
  }, [open, query, cs, ww, editor])

  // A search from another view (a chip of "In the manuscript" on a note): the text goes into the
  // box, and the chapter shows its first match.
  const seed = useUi((s) => s.findSeed)
  useEffect(() => {
    if (!seed) return
    useUi.setState({ findSeed: null })
    setQuery(seed.query)
    setCs(false)
    setWw(true)
    whenChapterEditor(seed.chapterId, (e) =>
      setTimeout(() => {
        setActiveEditor(e)
        e.editor.commands.setTextSelection(0)
        e.editor.commands.setFind(seed.query, { caseSensitive: false, wholeWord: true })
        e.editor.commands.findCurrent()
        showCurrent(e.editor)
      }, 60)
    )
  }, [seed]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Next or previous match; after the last match of the chapter, go on in the next chapter that has one. */
  const go = (dir: 1 | -1): void => {
    // Enter right after typing or a paste: the search of the text in the box is not there yet. Make
    // it, and go to its first match (the nearest after the cursor).
    const before = findKey.getState(editor.state)
    if (!before || before.query !== query || before.caseSensitive !== cs || before.wholeWord !== ww) {
      editor.commands.setFind(query, { caseSensitive: cs, wholeWord: ww })
      if (findKey.getState(editor.state)?.matches.length) {
        editor.commands.findCurrent()
        showCurrent(editor)
        return
      }
    }
    const f = findKey.getState(editor.state)
    const count = f?.matches.length ?? 0
    const atEdge = !count || (dir === 1 ? (f?.current ?? 0) >= count - 1 : (f?.current ?? 0) <= 0)
    const book = useBook.getState()
    const i = book.chapters.findIndex((c) => c.id === book.activeChapterId)
    const order = dir === 1 ? book.chapters.slice(i + 1) : book.chapters.slice(0, Math.max(0, i)).reverse()
    const target = atEdge ? order.find((c) => countIn(plainText(c), query, cs, ww) > 0) : undefined
    if (!target) {
      if (dir === 1) editor.commands.findNext()
      else editor.commands.findPrev()
      showCurrent(editor)
      return
    }
    book.selectChapter(target.id)
    whenChapterEditor(target.id, (e) =>
      setTimeout(() => {
        setActiveEditor(e)
        e.editor.commands.setTextSelection(dir === 1 ? 0 : e.editor.state.doc.content.size)
        e.editor.commands.setFind(query, { caseSensitive: cs, wholeWord: ww })
        if (dir === 1) e.editor.commands.findNext()
        else e.editor.commands.findPrev()
        showCurrent(e.editor)
      }, 60)
    )
  }

  /** Replace the current match and show the next one (find.ts selects it). */
  const replaceOne = (): void => {
    if (editor.commands.replaceCurrent(replace)) showCurrent(editor)
  }

  /** Replace in all chapters, after the confirm. The toast has the result and an Undo. */
  const replaceEverywhere = (): void => {
    setInBook(null)
    const r = replaceInBook(query, replace, { caseSensitive: cs, wholeWord: ww })
    const tt = getT()
    toast(tt.editor.replacedInBook(r.total, r.chapters), {
      action: {
        label: tt.common.undo,
        run: () => {
          const n = r.undo()
          if (n < r.chapters) toast(getT().editor.replaceUndoPartly(r.chapters - n), { kind: 'error' })
        }
      }
    })
  }
  const inBookTotal = inBook?.reduce((n, c) => n + c.count, 0) ?? 0

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div
          className="find-bar"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 500, damping: 36 }}
        >
          <div className="find-row">
            <button className={clsx('find-toggle', showReplace && 'is-open')} onClick={() => setShowReplace(!showReplace)} aria-label={tf.replaceToggle} aria-expanded={showReplace}>
              <CaretRight size={12} />
            </button>
            <input
              ref={input}
              autoFocus
              className="find-input"
              aria-label={tf.find}
              placeholder={tf.find}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  go(e.shiftKey ? -1 : 1)
                }
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  go(e.key === 'ArrowDown' ? 1 : -1)
                }
                if (e.key === 'Escape') close()
              }}
            />
            <span className="find-count" aria-live="polite">{query ? (st.count ? (st.current >= 0 ? `${st.current + 1}/${st.count}` : String(st.count)) : tf.noResults) : ''}</span>
            <button className={clsx('find-opt', cs && 'is-on')} onClick={() => setCs(!cs)} title={tf.matchCase} aria-label={tf.matchCase} aria-pressed={cs}>
              Aa
            </button>
            <button className={clsx('find-opt', ww && 'is-on')} onClick={() => setWw(!ww)} title={tf.wholeWord} aria-label={tf.wholeWord} aria-pressed={ww}>
              {tf.wholeWordShort}
            </button>
            <button className="icon-btn find-nav" onClick={() => go(-1)} aria-label={tf.previous} title={`${tf.previous} (Shift+Enter)`}>
              <ArrowUp size={14} />
            </button>
            <button className="icon-btn find-nav" onClick={() => go(1)} aria-label={tf.next} title={`${tf.next} (Enter)`}>
              <ArrowDown size={14} />
            </button>
            <button className="icon-btn" onClick={close} aria-label={t.common.close}>
              <X size={14} />
            </button>
          </div>
          {showReplace && (
            <div className="find-row">
              <span className="find-toggle-space" />
              <input
                className="find-input"
                aria-label={tf.replaceWith}
                placeholder={tf.replace}
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    replaceOne()
                  }
                  if (e.key === 'Escape') close()
                }}
              />
              <button className="find-text-btn" disabled={st.current < 0} onClick={replaceOne}>
                {tf.replace}
              </button>
              <button className="find-text-btn" disabled={!st.count} onClick={() => editor.commands.replaceAll(replace)}>
                {tf.replaceAll}
              </button>
            </div>
          )}
          {showReplace && (
            <div className="find-row find-row-all">
              <button className="find-link-btn" disabled={!query} onClick={() => setInBook(matchesInBook(query, { caseSensitive: cs, wholeWord: ww }))}>
                {t.editor.replaceInAllChapters}
              </button>
            </div>
          )}
          {others.length > 0 && (
            <div className="find-others">
              <span className="caps">{tf.otherChapters}</span>
              {others.map((c) => (
                <button
                  key={c.id}
                  className="find-other"
                  onClick={() => {
                    useBook.getState().selectChapter(c.id)
                    whenChapterEditor(c.id, (e) =>
                      setTimeout(() => {
                        setActiveEditor(e)
                        e.editor.commands.setTextSelection(0)
                        e.editor.commands.setFind(query, { caseSensitive: cs, wholeWord: ww })
                        e.editor.commands.findNext()
                        showCurrent(e.editor)
                      }, 60)
                    )
                  }}
                >
                  <span>{c.title}</span>
                  <span className="find-other-n">{c.n}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
    <Dialog
      open={inBook !== null}
      onOpenChange={(v) => !v && setInBook(null)}
      title={t.editor.replaceInBookTitle}
      description={inBook?.length ? t.editor.replaceInBookWhat(query, replace) : t.editor.replaceInBookNone(query)}
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={() => setInBook(null)}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" disabled={!inBookTotal} onClick={replaceEverywhere}>
            {t.editor.replaceInBookButton(inBookTotal)}
          </Button>
        </>
      }
    >
      {inBook && inBook.length > 0 && (
        <ul className="replace-book-list">
          {inBook.map((c) => (
            <li key={c.chapterId}>
              <span>{c.title}</span>
              <span className="replace-book-n">{t.editor.replaceCount(c.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
    </>
  )
}
