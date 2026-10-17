import { At, BookOpenText, ChatsCircle, Notebook } from '@phosphor-icons/react'
import clsx from 'clsx'
import type { Mention } from '@shared/types'
import { useT } from '@/lib/i18n'
import { mentionLabel } from './send'

export function MentionIcon({ kind }: { kind: Mention['kind'] }): React.JSX.Element {
  if (kind === 'chapter') return <BookOpenText size={11} />
  if (kind === 'entry') return <Notebook size={11} />
  if (kind === 'thread') return <ChatsCircle size={11} />
  return <At size={11} />
}

/** A mention in the text: in the composer, and in a sent message. */
export function MentionPill({ mention, selected }: { mention: Mention; selected?: boolean }): React.JSX.Element {
  const t = useT()
  return (
    <span className={clsx('mention-pill', `is-${mention.kind}`, selected && 'is-selected')} data-mention-id={mention.id}>
      <MentionIcon kind={mention.kind} />
      <span className="mention-pill-label">{mentionLabel(t, mention)}</span>
    </span>
  )
}
