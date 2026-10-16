import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useEditorState, type Editor } from '@tiptap/react'
import { ArrowDown, ArrowUp, CaretRight, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { markdownToPlain } from '@shared/book'
import { useBook } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { useT } from '@/lib/i18n'
import { findKey } from './find'

function countIn(text: string, q: string, cs: boolean, ww: boolean): number {
  if (!q) return 0
  const body = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(ww ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body, cs ? 'gu' : 'giu')
  return text.match(re)?.length ?? 0
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
      if (mod && (e.key === 'f' || e.key === 'h')) {
        e.preventDefault()
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

  // Plain text of the other chapters, made once per chapter text.
  const plain = useMemo(() => new Map(chapters.map((c) => [c.id, markdownToPlain(c.body)])), [chapters])
  const [slowQuery, setSlowQuery] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => setSlowQuery(query), 200)
    return () => clearTimeout(t)
  }, [query])
  const others = useMemo(() => {
    if (!open || !slowQuery) return []
    return chapters
      .filter((c) => c.id !== activeId)
      .map((c) => ({ id: c.id, title: c.title, n: countIn(plain.get(c.id) ?? '', slowQuery, cs, ww) }))
      .filter((c) => c.n > 0)
  }, [open, slowQuery, cs, ww, chapters, activeId, plain])

  const close = (): void => {
    setOpen(false)
    editor.commands.focus()
  }

  return (
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
                  if (e.shiftKey) editor.commands.findPrev()
                  else editor.commands.findNext()
                }
                if (e.key === 'Escape') close()
              }}
            />
            <span className="find-count" aria-live="polite">{query ? (st.count ? `${st.current + 1}/${st.count}` : tf.noResults) : ''}</span>
            <button className={clsx('find-opt', cs && 'is-on')} onClick={() => setCs(!cs)} title={tf.matchCase} aria-label={tf.matchCase} aria-pressed={cs}>
              Aa
            </button>
            <button className={clsx('find-opt', ww && 'is-on')} onClick={() => setWw(!ww)} title={tf.wholeWord} aria-label={tf.wholeWord} aria-pressed={ww}>
              {tf.wholeWordShort}
            </button>
            <button className="icon-btn" onClick={() => editor.commands.findPrev()} aria-label={tf.previous}>
              <ArrowUp size={14} />
            </button>
            <button className="icon-btn" onClick={() => editor.commands.findNext()} aria-label={tf.next}>
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
                    editor.commands.replaceCurrent(replace)
                  }
                  if (e.key === 'Escape') close()
                }}
              />
              <button className="find-text-btn" disabled={!st.count} onClick={() => editor.commands.replaceCurrent(replace)}>
                {tf.replace}
              </button>
              <button className="find-text-btn" disabled={!st.count} onClick={() => editor.commands.replaceAll(replace)}>
                {tf.replaceAll}
              </button>
            </div>
          )}
          {others.length > 0 && (
            <div className="find-others">
              <span className="caps">{tf.otherChapters}</span>
              {others.map((c) => (
                <button key={c.id} className="find-other" onClick={() => useBook.getState().selectChapter(c.id)}>
                  <span>{c.title}</span>
                  <span className="find-other-n">{c.n}</span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
