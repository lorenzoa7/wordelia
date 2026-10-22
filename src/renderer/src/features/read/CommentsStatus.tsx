// The comments of the editor's read in the status bar of the Write view: "N editor's comments". A click shows
// the comments again (after "Hide", or when the desk gave back their room), or goes to them.

import { Eyeglasses } from '@phosphor-icons/react'
import { useBook } from '@/stores/book'
import { useT } from '@/lib/i18n'
import { Tooltip } from '@/ui'
import { useComments } from './store'
import { makeRoomForComments, selectComment, useReadUi } from './ui'

/**
 * Go to the comments: the first number in the chapter on screen, else the first chapter of the book that has
 * an open comment.
 */
function goToComments(): void {
  const book = useBook.getState()
  const here = book.activeChapterId
  const sheet = here ? document.querySelector<HTMLElement>(`.page[data-chapter="${CSS.escape(here)}"]`) : null
  const num = sheet?.querySelector<HTMLElement>('.cm-num[data-comment]')
  if (num?.dataset.comment) {
    num.scrollIntoView({ block: 'center' })
    selectComment(num.dataset.comment)
    return
  }
  const open = useComments.getState().list.filter((c) => c.state === 'open')
  const chapter = book.chapters.find((ch) => open.some((c) => c.chapterId === ch.id))
  if (chapter) book.selectChapter(chapter.id)
}

export function CommentsStatus(): React.JSX.Element | null {
  const t = useT()
  const s = t.read.status
  const root = useBook((st) => st.root)
  const count = useComments((st) => (st.root === root ? st.list.filter((c) => c.state === 'open').length : 0))
  // The cards are on the desk now: a click goes to them. Else a click shows them, with room for the column.
  const shown = useReadUi((st) => !st.hidden && st.room && st.column)
  if (!count) return null
  const label = s.count(count)
  return (
    <Tooltip label={shown ? s.goTo : s.show} side="top">
      <button className="status-btn status-comments" aria-label={`${label}. ${shown ? s.goTo : s.show}`} onClick={() => (shown ? goToComments() : makeRoomForComments())}>
        <Eyeglasses size={12} /> <span className="status-comments-text">{label}</span>
      </button>
    </Tooltip>
  )
}
