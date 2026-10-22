// The links of the letter of a read to its comments. In the letter, each problem has "(→ N)", where N is the
// rank of its comment in the reply. The chat shows each one as a small chip with the number of that comment
// in the margin (so the author sees one numbering), or its state when it is closed. A click goes to the
// comment. A rank without a comment (the app dropped its note) stays text.

import { useMemo } from 'react'
import type { Components } from 'react-markdown'
import clsx from 'clsx'
import { Check, Warning, X } from '@phosphor-icons/react'
import type { EditorComment } from '@shared/comments'
import { ChatLink, Markdown } from '@/features/chat/ChatMarkdown'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { Tooltip } from '@/ui'
import { goToComment } from './actions'
import { commentRefRank, linkCommentRefs } from './fromReply'
import { marginNumbers, useMarksDrawn } from './marks'
import { useComments } from './store'
import './read.css'

const NONE: EditorComment[] = []

interface RefProps {
  /** The thread and the reply of the letter */
  threadId: string
  messageId: string
  /** The rank of the comment in the reply */
  rank: number
  /** The words of the letter ("→ N"), for a rank without a comment */
  children: React.ReactNode
}

/** One link of the letter to a comment of its reply. */
export function CommentRef({ threadId, messageId, rank, children }: RefProps): React.JSX.Element {
  const t = useT()
  const root = useBook((s) => s.root)
  const chapters = useBook((s) => s.chapters)
  const list = useComments((s) => (s.root === root ? s.list : NONE))
  // A new draw of the marks: new passages, new numbers.
  const drawn = useMarksDrawn((s) => s.n)
  // A comment of a chapter that is not in the book (a sync can bring one back after a delete) has no link.
  const c = useMemo(
    () => list.find((x) => x.threadId === threadId && x.messageId === messageId && x.rank === rank && chapters.some((ch) => ch.id === x.chapterId)),
    [list, chapters, threadId, messageId, rank]
  )
  const n = useMemo(
    () => (c?.state === 'open' ? (marginNumbers(c.chapterId).get(c.id) ?? null) : null),
    // `list`, `chapters` and `drawn` are in the list: the numbers come from the comments and the editors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c, list, chapters, drawn]
  )
  if (!c) return <>{children}</>
  const lens = t.read.lens[c.lens]
  const open = c.state === 'open'
  const label = c.state === 'open' ? t.read.letterRef.open(n, lens) : t.read.letterRef[c.state](lens)
  const mark = open ? (n ?? <Warning size={11} weight="bold" />) : c.state === 'ignored' ? <X size={11} weight="bold" /> : <Check size={11} weight="bold" />
  return (
    <Tooltip label={label}>
      <button
        type="button"
        className={clsx('read-ref', `cm-${c.lens}`, !open && 'is-closed')}
        data-comment={c.id}
        data-n={n ?? undefined}
        aria-label={label}
        onClick={() => goToComment(c)}
      >
        {mark}
      </button>
    </Tooltip>
  )
}

/** The text of the letter of a read: Markdown, with its "(→ N)" as links to the comments of the reply. */
export function LetterText({ text, threadId, messageId }: { text: string; threadId: string; messageId: string }): React.JSX.Element {
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => {
        const rank = commentRefRank(href)
        if (rank === null) return <ChatLink href={href}>{children}</ChatLink>
        return (
          <CommentRef threadId={threadId} messageId={messageId} rank={rank}>
            {children}
          </CommentRef>
        )
      }
    }),
    [threadId, messageId]
  )
  return <Markdown text={linkCommentRefs(text)} components={components} />
}
