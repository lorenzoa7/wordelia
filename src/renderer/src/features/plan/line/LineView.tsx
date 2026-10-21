// The Line view of Plan: the story line as a board, by chapter or by time. The author fills it by
// hand or asks the AI (the banner opens a new chat thread with a draft). A proposal of the AI for
// the line shows on the board with its changes, with Accept and Reject.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowBendUpLeft, BookOpenText, ChatCircleText, Check, Clock, Sparkle } from '@phosphor-icons/react'
import clsx from 'clsx'
import { boardView, hereKey, type LineView as View } from '@shared/storyline'
import { Button, IconButton, Spinner } from '@/ui'
import { getT, useT } from '@/lib/i18n'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { focusComposer, useChat } from '@/features/chat/chatStore'
import { newThread } from '@/features/chat/send'
import { PlanViewSwitch } from '@/features/graph'
import { LineBoard } from './Board'
import { CardDialog } from './CardDialog'
import { ReviewBoard } from './ReviewBoard'
import { useLineUi, useStoryLine } from './model'
import { keepBoard, restoreColumn } from './anchor'
import { acceptLineProposal, rejectLineProposal, useLineProposal, useLineWriting, type LineProposal } from './proposal'
import './line.css'

/** Where the board was, for each book and view: the Line comes back to it (for example after a note). */
const scrolls = new Map<string, { left: number; columns: Record<string, number> }>()

/** A new chat thread with a draft that asks the AI to fill the line. The author completes it and sends it. */
export function askToFill(): void {
  const t = getT()
  useApp.getState().setUi({ chatOpen: true })
  const chat = useChat.getState()
  chat.openBlank(newThread(t.plan.line.threadTitle))
  useChat.setState({ quotes: [], images: [] })
  chat.setDraft(t.plan.line.bannerDraft)
  focusComposer(250)
}

function showInChat(p: LineProposal): void {
  useApp.getState().setUi({ chatOpen: true })
  useChat.getState().setActiveThread(p.thread.id)
}

function ViewSwitch({ view }: { view: View }): React.JSX.Element {
  const t = useT()
  const setView = useLineUi((s) => s.setView)
  return (
    <div className="plan-switch line-switch" role="group" aria-label={t.plan.line.views}>
      <button className={clsx('plan-switch-btn', view === 'chapter' && 'is-active')} aria-pressed={view === 'chapter'} onClick={() => setView('chapter')}>
        <BookOpenText className="is-book" size={14} />
        <span>{t.plan.line.byChapter}</span>
      </button>
      <button className={clsx('plan-switch-btn', view === 'order' && 'is-active')} aria-pressed={view === 'order'} onClick={() => setView('order')}>
        <Clock size={14} />
        <span>{t.plan.line.byTime}</span>
      </button>
    </div>
  )
}

export function LineView(): React.JSX.Element {
  const t = useT()
  const chapters = useBook((s) => s.chapters)
  const { board, notes } = useStoryLine()
  const view = useLineUi((s) => s.view)
  const proposal = useLineProposal()
  const writing = useLineWriting()
  const [openCard, setOpenCard] = useState<string | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  // A proposal shows: a card that was open closes (the board cannot change until the decision).
  const reviewing = Boolean(proposal)
  useEffect(() => {
    if (reviewing) setOpenCard(null)
  }, [reviewing])

  // A proposal that fits the line shows on the board, with its changes.
  const review = proposal && proposal.after !== null ? proposal : null
  const shown = board
  const here = hereKey(shown, view, chapters)
  const cols = boardView(shown, view, chapters).filter((c) => c.kind !== 'tray')
  const count = view === 'chapter' ? t.plan.line.statsChapters(cols.length, shown.cards.length) : t.plan.line.statsMoments(cols.length, shown.cards.length)

  // "You are here" is on screen when the view opens. The board then starts at a column, so no
  // column is cut at the left edge.
  const root = useBook((s) => s.root)
  // One place for a view, with or without a proposal: the board does not jump when a review starts or ends.
  const place = `${root}:${view}`
  useLayoutEffect(() => {
    const box = scroll.current
    const here = box?.querySelector<HTMLElement>('.line-col.is-here')
    const board = box?.firstElementChild as HTMLElement | null
    if (!box || !board) return
    // Back on the board (for example from a note): the board and its columns where they were.
    const saved = scrolls.get(place)
    if (saved) {
      box.scrollLeft = saved.left
      for (const body of board.querySelectorAll<HTMLElement>('.line-col-body')) {
        const key = body.closest<HTMLElement>('.line-col')?.dataset.column
        if (key && saved.columns[key]) body.scrollTop = saved.columns[key]
      }
      return
    }
    if (!here) return
    const origin = box.getBoundingClientRect().left - box.scrollLeft
    const at = (el: HTMLElement): number => el.getBoundingClientRect().left - origin
    const right = at(here) + here.offsetWidth + 16
    if (at(here) >= box.scrollLeft && right <= box.scrollLeft + box.clientWidth) return
    const pad = parseFloat(getComputedStyle(board).paddingLeft) || 0
    const cols = [...board.querySelectorAll<HTMLElement>(':scope > .line-col')]
    const first = cols.find((c) => at(c) - pad >= right - box.clientWidth) ?? here
    box.scrollLeft = Math.max(0, at(first) - pad)
  }, [place]) // eslint-disable-line react-hooks/exhaustive-deps
  // Remember where the board and each column are (a scroll does not bubble: listen in the capture phase).
  useEffect(() => {
    const box = scroll.current
    if (!box) return
    const onScroll = (e: Event): void => {
      const el = e.target as HTMLElement
      const saved = scrolls.get(place) ?? { left: box.scrollLeft, columns: {} }
      if (el === box) saved.left = box.scrollLeft
      else if (el.classList?.contains('line-col-body')) {
        const key = el.closest<HTMLElement>('.line-col')?.dataset.column
        if (key) saved.columns[key] = el.scrollTop
      }
      scrolls.set(place, saved)
    }
    box.addEventListener('scroll', onScroll, true)
    return () => box.removeEventListener('scroll', onScroll, true)
  }, [place])
  // After a decision on a proposal, the column that the author worked on is where it was (anchor.ts).
  // This runs last, so nothing above moves the board after it.
  useLayoutEffect(() => restoreColumn(scroll.current))

  let bar: React.ReactNode = null
  if (review) {
    bar = (
      <div className="line-bar is-review" role="status">
        <Sparkle size={14} weight="fill" className="line-bar-icon" aria-label={t.plan.line.reviewTitle} />
        <div className="line-bar-text is-one-line">
          <b>{t.plan.line.fromAi(review.changes.length)}</b>
        </div>
        <IconButton label={t.plan.line.showInChat} onClick={() => showInChat(review)}>
          <ChatCircleText size={15} />
        </IconButton>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            keepBoard()
            rejectLineProposal(review)
          }}
        >
          {t.plan.line.rejectAll}
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={<Check size={13} weight="bold" />}
          onClick={() => {
            keepBoard()
            void acceptLineProposal(review)
          }}
        >
          {t.plan.line.applyAll}
        </Button>
      </div>
    )
  } else if (proposal) {
    bar = (
      <div className="line-bar is-stale" role="status">
        <span className="line-bar-text">{t.plan.line.reviewStale}</span>
        <IconButton label={t.plan.line.showInChat} onClick={() => showInChat(proposal)}>
          <ChatCircleText size={15} />
        </IconButton>
        <Button size="sm" variant="secondary" onClick={() => rejectLineProposal(proposal)}>
          {t.common.reject}
        </Button>
      </div>
    )
  } else if (writing) {
    bar = (
      <div className="line-bar is-writing" role="status">
        <Spinner size={12} />
        <span className="line-bar-text">{t.plan.line.writing}</span>
      </div>
    )
  } else if (!board.cards.length) {
    bar = (
      <div className="line-bar is-banner">
        <Sparkle size={14} weight="fill" className="line-bar-icon" />
        <span className="line-bar-text">{t.plan.line.bannerText}</span>
        <Button size="sm" variant="ribbon" icon={<ArrowBendUpLeft size={14} weight="bold" />} onClick={askToFill}>
          {t.plan.line.bannerAction}
        </Button>
      </div>
    )
  }

  return (
    <div className="line-wrap">
      <header className="line-head">
        <div className="line-title-row">
          <div className="line-title">
            <h1>{t.plan.line.title}</h1>
            <p className="line-stats">{count}</p>
          </div>
          <PlanViewSwitch active="line" />
        </div>
        <div className="line-tools">
          <div className="line-tools-left">{bar}</div>
          <ViewSwitch view={view} />
        </div>
      </header>
      <div className="line-scroll" ref={scroll}>
        {review ? (
          <ReviewBoard p={review} view={view} chapters={chapters} notes={notes} here={here} />
        ) : (
          <LineBoard board={board} view={view} chapters={chapters} notes={notes} here={here} onOpenCard={setOpenCard} />
        )}
      </div>
      <CardDialog cardId={review ? null : openCard} board={board} chapters={chapters} notes={notes} onClose={() => setOpenCard(null)} />
    </div>
  )
}
