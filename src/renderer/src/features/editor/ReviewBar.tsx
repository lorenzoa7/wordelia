import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'motion/react'
import { useEditorState, type Editor } from '@tiptap/react'
import { Article, ArrowsClockwise, Check, Rows, Stop, TextStrikethrough, X } from '@phosphor-icons/react'
import { diffStats } from '@shared/text/diff'
import { Kbd, Spinner } from '@/ui'
import { useApp } from '@/stores/app'
import { useT } from '@/lib/i18n'
import { cancelAction, retryAction, useActionRun } from '@/features/actions/runAction'
import { actionLabel } from '@/features/actions/names'
import { useAllActions } from '@/features/actions/allActions'
import { cursorInPassage, reviewKey, useReviewCue, useReviewHost, type ReviewData } from './review'
import { DIFF_VIEWS, setDiffView, useDiffView, type DiffView } from './diffView'
import { scaleOf } from './zoom'

const VIEW_ICONS: Record<DiffView, React.ReactNode> = {
  words: <TextStrikethrough size={14} />,
  stacked: <Rows size={14} />,
  new: <Article size={14} />
}

/** The review bar of the book: it stays with its review, also when the cursor is in another chapter. */
export function ReviewBar(): React.JSX.Element {
  const editor = useReviewHost((s) => s.editor)
  const id = useReviewHost((s) => s.id)
  return <AnimatePresence>{editor && id && !editor.isDestroyed && <Bar key={id} editor={editor} />}</AnimatePresence>
}

/** The floating bar of an inline AI review, above the passage: Accept, Reject, Retry, and the view of the change. */
function Bar({ editor }: { editor: Editor }): React.JSX.Element | null {
  const live = useEditorState({ editor, selector: ({ editor: e }) => (e && !e.isDestroyed ? (reviewKey.getState(e.state) ?? null) : null) })
  // While the bar fades out, it shows the review as it was.
  const last = useRef<ReviewData | null>(live)
  if (live) last.current = live
  const review = live ?? last.current
  const words = useActionRun((s) => s.words)
  const actions = useAllActions()
  const zoom = useApp((s) => s.settings?.ui.zoom ?? 1)
  const t = useT()
  const view = useDiffView()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const cueCount = useReviewCue((s) => s.n)
  const [cueBase] = useState(cueCount)
  const [locked, setLocked] = useState(false)

  // The bar sits in the room above the paragraph of the passage (review.ts), at the start of the passage.
  useLayoutEffect(() => {
    if (!live) return
    const place = (): void => {
      if (editor.isDestroyed) return
      const dom = editor.view.dom as HTMLElement
      const box = dom.closest('.desk-zoom') as HTMLElement | null
      if (!box) return
      const bar = ref.current
      const barH = bar?.offsetHeight || 38
      const barW = bar?.offsetWidth || 420
      // The room is as high as the bar on screen: the pages are scaled by the zoom, the bar is not.
      const room = `${Math.ceil((barH + 8) / (scaleOf(dom) || 1))}px`
      if (dom.style.getPropertyValue('--review-room-h') !== room) dom.style.setProperty('--review-room-h', room)
      const page = dom.getBoundingClientRect()
      const origin = box.getBoundingClientRect()
      const start = editor.view.coordsAtPos(Math.min(live.from, editor.state.doc.content.size))
      const roomEl = dom.querySelector<HTMLElement>('.review-room')
      const top = roomEl ? roomEl.getBoundingClientRect().top + 4 : start.top - barH - 6
      const left = Math.max(page.left, Math.min(start.left - 12, page.right - barW))
      setPos((p) => {
        const next = { top: Math.round(top - origin.top), left: Math.round(left - origin.left) }
        return p && p.top === next.top && p.left === next.left ? p : next
      })
    }
    place()
    const frame = requestAnimationFrame(place)
    // Pages that move (a new page gap, typing above the passage) move the passage too.
    const ro = new ResizeObserver(() => place())
    ro.observe(editor.view.dom)
    window.addEventListener('resize', place)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [live, editor, zoom])

  useEffect(() => {
    // Scroll the bar into view when the result arrives, but only when the author waits for it in the passage.
    if (live?.phase === 'ready' && cursorInPassage(editor.state, live)) {
      const id = setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60)
      return () => clearTimeout(id)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.phase])

  // A key that the locked passage refused: a short ring and a short word on the bar.
  useEffect(() => {
    if (cueCount <= cueBase) return
    setLocked(true)
    const id = setTimeout(() => setLocked(false), 1800)
    return () => clearTimeout(id)
  }, [cueCount, cueBase])

  if (!review || !pos) return null
  const ready = review.phase === 'ready'
  const stats = ready ? diffStats(review.ops) : null
  const action = actions.find((a) => a.id === review.actionId)
  const label = action ? actionLabel(t, action) : review.label
  const retryTitle = action?.shortcut ? `${t.common.retry} (${action.shortcut})` : t.common.retry
  const status = locked
    ? ready
      ? t.editor.review.lockedReady
      : t.editor.review.lockedWorking
    : ready && stats
      ? t.editor.review.readyStatus(label, stats.added, stats.removed)
      : t.editor.review.working(label)

  const reject = (): void => {
    if (ready) editor.chain().focus().rejectReview().run()
    else cancelAction()
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      reject()
      return
    }
    // Shift+Tab from the first button goes back to the passage.
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
    if (e.key === 'Tab' && e.shiftKey && document.activeElement === buttons[0]) {
      e.preventDefault()
      editor.view.focus()
      return
    }
    // The views are a group of radio buttons: the arrow keys choose one.
    const viewIndex = DIFF_VIEWS.indexOf(view)
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && (document.activeElement as HTMLElement | null)?.classList.contains('review-view')) {
      e.preventDefault()
      const next = DIFF_VIEWS[(viewIndex + (e.key === 'ArrowRight' ? 1 : DIFF_VIEWS.length - 1)) % DIFF_VIEWS.length]
      setDiffView(next)
      ref.current?.querySelector<HTMLButtonElement>(`.review-view[data-view="${next}"]`)?.focus()
    }
  }

  return (
    <motion.div
      ref={ref}
      className="review-bar"
      role="group"
      aria-label={t.editor.review.barLabel(label)}
      data-phase={review.phase}
      data-cue={cueCount > cueBase ? cueCount : undefined}
      style={{ top: pos.top, left: pos.left }}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      onMouseDown={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
    >
      {cueCount > cueBase && <span key={cueCount} className="review-cue" aria-hidden />}
      {/* Only this text is a live region: the screen reader says the state, not each new word count. */}
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>
      {!ready ? (
        <>
          <Spinner />
          <span className="review-label" aria-hidden>
            {/* The cue takes the place of the name for a moment; the bar keeps its width. */}
            <span className={clsx('review-label-text', locked && 'is-hidden')}>
              {label}
              <span className="muted">{words ? ` · ${t.editor.review.words(words)}` : '…'}</span>
            </span>
            <span className={clsx('review-locked', !locked && 'is-hidden')}>{t.editor.review.lockedShort}</span>
          </span>
          <button className="review-btn" onClick={cancelAction}>
            <Stop size={13} weight="fill" /> {t.editor.review.stop} <Kbd>Esc</Kbd>
          </button>
        </>
      ) : (
        <>
          <span className="review-label" aria-hidden>
            <span className={clsx('review-label-text', locked && 'is-hidden')}>
              {label}
              {stats && (
                <span className="review-stats">
                  <span className="plus">+{stats.added}</span> <span className="minus">−{stats.removed}</span>
                </span>
              )}
            </span>
            <span className={clsx('review-locked', !locked && 'is-hidden')}>{t.editor.review.lockedShort}</span>
          </span>
          <button className="review-btn review-accept" onClick={() => editor.chain().focus().acceptReview().run()}>
            <Check size={14} weight="bold" /> {t.common.accept} <Kbd>Enter</Kbd>
          </button>
          <button className="review-btn" onClick={reject}>
            <X size={13} /> {t.common.reject} <Kbd>Esc</Kbd>
          </button>
          <button className="review-btn review-icon" title={retryTitle} aria-label={retryTitle} onClick={() => void retryAction()}>
            <ArrowsClockwise size={14} />
          </button>
          <span className="review-views" role="radiogroup" aria-label={t.editor.review.viewLabel}>
            {DIFF_VIEWS.map((v) => (
              <button
                key={v}
                className="review-view"
                data-view={v}
                role="radio"
                aria-checked={view === v}
                tabIndex={view === v ? 0 : -1}
                title={t.editor.review.views[v]}
                aria-label={t.editor.review.views[v]}
                onClick={() => setDiffView(v)}
              >
                {VIEW_ICONS[v]}
              </button>
            ))}
          </span>
        </>
      )}
    </motion.div>
  )
}
