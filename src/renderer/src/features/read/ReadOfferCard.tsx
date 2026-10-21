import { Eyeglasses } from '@phosphor-icons/react'
import type { Segment } from '@shared/proposals/parse'
import type { ReadRequest } from '@shared/types'
import { resolveTarget } from '@/features/chat/applyProposal'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { Spinner } from '@/ui'
import { isLastChapter, startRead, useReadRunning } from './start'
import { useComments } from './store'
import './read.css'

/**
 * The offer of a read in an ordinary thread: the AI does not read there, it offers the read with a tag.
 * One click starts the read in the thread of that chapter. A tag with a chapter that is not in the book
 * shows nothing.
 */
export function ReadOfferCard({ segment }: { segment: Extract<Segment, { kind: 'read' }> }): React.JSX.Element | null {
  const t = useT()
  // The chapters change the card: a chapter that goes away takes its offer along.
  const chapters = useBook((s) => s.chapters)
  const target = resolveTarget(segment.chapter)
  const chapter = target.kind === 'chapter' ? target.chapter : null
  const running = useReadRunning(chapter?.id)
  if (!chapter) return null
  const number = chapters.findIndex((c) => c.id === chapter.id) + 1
  const start = (): void => void startRead({ chapterId: chapter.id, lens: segment.lens, inProgress: isLastChapter(chapter.id) })
  const text = t.read.offer(number, t.read.lens[segment.lens])
  return (
    <div className="read-card read-offer" role="group" aria-label={text}>
      <span className="read-card-icon" aria-hidden>
        <Eyeglasses size={18} />
      </span>
      <span className="read-card-text">{text}</span>
      <button className="proposal-btn is-accept read-offer-run" onClick={start} disabled={running} title={running ? t.read.running : undefined}>
        {running && <Spinner size={12} />} {t.read.run}
      </button>
    </div>
  )
}

/**
 * The card above the letter of a read: the glasses, the name of the read, the chapter and the lens, and
 * how many comments the reply has so far (it grows while the reply streams).
 */
export function ReadHead({ read, threadId, messageId }: { read: ReadRequest; threadId: string; messageId: string }): React.JSX.Element {
  const t = useT()
  const index = useBook((s) => s.chapters.findIndex((c) => c.id === read.chapterId))
  const count = useComments((s) => s.list.filter((c) => c.threadId === threadId && c.messageId === messageId).length)
  const lens = t.read.lens[read.lens]
  return (
    <div className="read-card read-head">
      <span className="read-card-icon" aria-hidden>
        <Eyeglasses size={18} />
      </span>
      <span className="read-head-text">
        <span className="read-head-title">{t.read.title}</span>
        <span className="read-head-place">{index >= 0 ? t.read.head.place(index + 1, lens) : lens}</span>
      </span>
      <span className="read-head-count">{t.read.head.comments(count)}</span>
    </div>
  )
}
