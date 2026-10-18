import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useEditorState, type Editor } from '@tiptap/react'
import { ArrowsClockwise, Check, Stop, X } from '@phosphor-icons/react'
import { diffStats } from '@shared/text/diff'
import { Kbd, Spinner } from '@/ui'
import { useApp } from '@/stores/app'
import { actionName, useT } from '@/lib/i18n'
import { cancelAction, retryAction, useActionRun } from '@/features/actions/runAction'
import { reviewKey } from './review'
import { isChatReview } from './registry'

/** The floating bar under an inline AI review: Accept, Reject, Retry. */
export function ReviewBar({ editor }: { editor: Editor }): React.JSX.Element {
  const review = useEditorState({ editor, selector: ({ editor: e }) => reviewKey.getState(e.state) ?? null })
  const words = useActionRun((s) => s.words)
  const actionId = useActionRun((s) => s.actionId)
  const action = useApp((s) => s.settings?.actions.find((a) => a.id === actionId))
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!review) {
      setPos(null)
      return
    }
    const place = (): void => {
      const desk = editor.view.dom.closest('.desk') as HTMLElement | null
      if (!desk) return
      const box = desk.getBoundingClientRect()
      const page = editor.view.dom.getBoundingClientRect()
      // While the AI works, the bar stays where the selection menu was: above the start of the selection.
      if (review.phase !== 'ready') {
        const start = editor.view.coordsAtPos(Math.min(review.from, editor.state.doc.content.size))
        const left = Math.max(page.left, Math.min(start.left - 12, page.right - 320))
        setPos({ top: start.top - box.top + desk.scrollTop - 48, left: left - box.left + desk.scrollLeft })
        return
      }
      const gap = editor.view.dom.querySelector('.review-spacer')
      if (gap) {
        const r = gap.getBoundingClientRect()
        setPos({ top: r.top - box.top + desk.scrollTop + 6, left: page.left - box.left + desk.scrollLeft })
        return
      }
      const end = editor.view.coordsAtPos(Math.min(review.to, editor.state.doc.content.size))
      setPos({ top: end.bottom - box.top + desk.scrollTop + 12, left: page.left - box.left + desk.scrollLeft })
    }
    place()
    const id = requestAnimationFrame(place)
    return () => cancelAnimationFrame(id)
  }, [review, editor])

  useEffect(() => {
    if (review?.phase === 'ready') {
      // Scroll the bar into view when the result arrives.
      setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60)
    }
  }, [review?.phase])

  const stats = review?.phase === 'ready' ? diffStats(review.ops) : null
  // The label is the name of the action. Show it in the interface language when it is a built-in name.
  const chat = isChatReview(review?.id)
  const label = !chat && review && action && action.name === review.label ? actionName(t, action) : review?.label

  return (
    <AnimatePresence>
      {review && pos && (
        <motion.div
          ref={ref}
          className="review-bar"
          role="status"
          aria-live="polite"
          style={{ top: pos.top, left: pos.left }}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 34 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {review.phase === 'loading' ? (
            <>
              <Spinner />
              <span className="review-label">
                {label}
                <span className="muted">{words ? ` · ${t.editor.review.words(words)}` : '…'}</span>
              </span>
              <button className="review-btn" onClick={cancelAction}>
                <Stop size={13} weight="fill" /> {t.editor.review.stop} <Kbd>Esc</Kbd>
              </button>
            </>
          ) : (
            <>
              <span className="review-label">
                {label}
                {stats && (
                  <span className="review-stats">
                    <span className="plus">+{stats.added}</span> <span className="minus">−{stats.removed}</span>
                  </span>
                )}
              </span>
              <button className="review-btn review-accept" onClick={() => editor.chain().focus().acceptReview().run()}>
                <Check size={14} weight="bold" /> {t.common.accept} <Kbd>Enter</Kbd>
              </button>
              <button className="review-btn" onClick={() => editor.chain().focus().rejectReview().run()}>
                <X size={13} /> {t.common.reject} <Kbd>Esc</Kbd>
              </button>
              {!chat && (
                <button className="review-btn review-icon" title={t.common.retry} aria-label={t.common.retry} onClick={() => void retryAction()}>
                  <ArrowsClockwise size={14} />
                </button>
              )}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
