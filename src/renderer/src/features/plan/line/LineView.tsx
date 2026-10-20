// The Line view of Plan: the story line as a board, by chapter or by time. The author fills it by
// hand or asks the AI (the banner opens a new chat thread with a draft). A proposal of the AI for
// the line shows on the board with its changes, with Accept and Reject.

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, ChatCircleText, Check, Clock, Sparkle } from '@phosphor-icons/react'
import clsx from 'clsx'
import { boardStats, boardView, hereKey, parseBoard, type LineView as View } from '@shared/storyline'
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
import { acceptLineProposal, rejectLineProposal, useLineProposal, useLineWriting, type LineProposal } from './proposal'
import './line.css'

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
        <BookOpenText size={14} />
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

  const review = useMemo(
    () => (proposal && proposal.after !== null ? { before: parseBoard(proposal.before), after: parseBoard(proposal.after) } : null),
    [proposal?.before, proposal?.after] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const stats = useMemo(() => (review ? boardStats(review.before, review.after, chapters) : null), [review, chapters])
  const shown = review?.after ?? board
  const here = hereKey(shown, view, chapters)
  const cols = boardView(shown, view, chapters).filter((c) => c.kind !== 'tray')
  const count = view === 'chapter' ? t.plan.line.statsChapters(cols.length, shown.cards.length) : t.plan.line.statsMoments(cols.length, shown.cards.length)

  // "You are here" is on screen when the view opens.
  useLayoutEffect(() => {
    const box = scroll.current
    const col = box?.querySelector<HTMLElement>('.line-col.is-here')
    if (!box || !col) return
    const left = col.offsetLeft
    if (left + col.offsetWidth > box.scrollLeft + box.clientWidth || left < box.scrollLeft) box.scrollLeft = Math.max(0, left - (box.clientWidth - col.offsetWidth) / 2)
  }, [view, Boolean(review)]) // eslint-disable-line react-hooks/exhaustive-deps

  let bar: React.ReactNode = null
  if (proposal && proposal.after !== null && stats) {
    bar = (
      <div className="line-bar is-review" role="status">
        <Sparkle size={14} weight="fill" className="line-bar-icon" />
        <div className="line-bar-text is-one-line">
          <b>{t.plan.line.reviewTitle}</b>
          <span>{t.plan.line.reviewStats(stats)}</span>
        </div>
        <IconButton label={t.plan.line.showInChat} onClick={() => showInChat(proposal)}>
          <ChatCircleText size={15} />
        </IconButton>
        <Button size="sm" variant="secondary" onClick={() => rejectLineProposal(proposal)}>
          {t.common.reject}
        </Button>
        <Button size="sm" variant="primary" icon={<Check size={13} weight="bold" />} onClick={() => void acceptLineProposal(proposal)}>
          {t.common.accept}
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
        <Button size="sm" variant="secondary" onClick={askToFill}>
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
          <ReviewBoard before={review.before} after={review.after} view={view} chapters={chapters} notes={notes} here={here} />
        ) : (
          <LineBoard board={board} view={view} chapters={chapters} notes={notes} here={here} onOpenCard={setOpenCard} />
        )}
      </div>
      <CardDialog cardId={review ? null : openCard} board={board} chapters={chapters} notes={notes} onClose={() => setOpenCard(null)} />
    </div>
  )
}
