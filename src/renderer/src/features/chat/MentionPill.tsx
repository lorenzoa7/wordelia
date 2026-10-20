import { At, Book, ChatsCircle, Notebook } from '@phosphor-icons/react'
import clsx from 'clsx'
import type { Mention } from '@shared/types'
import { useT } from '@/lib/i18n'
import { useEntryIcon } from '@/features/plan/categoryIcons'
import { mentionLabel } from './send'

/**
 * The icon of a mention, the same as on the map of the Plan view: the icon of the category of an
 * entry (a person for a character, a pin for a place…), a book for a chapter.
 */
export function MentionIcon({ kind, id, size = 12 }: { kind: Mention['kind']; id?: string; size?: number }): React.JSX.Element {
  const EntryIcon = useEntryIcon(kind === 'entry' ? id : undefined)
  if (kind === 'chapter') return <Book size={size} />
  if (kind === 'entry') return EntryIcon ? <EntryIcon size={size} /> : <Notebook size={size} />
  if (kind === 'thread') return <ChatsCircle size={size} />
  return <At size={size} />
}

/** A mention in the text: in the composer, and in a sent message. */
export function MentionPill({ mention, selected }: { mention: Mention; selected?: boolean }): React.JSX.Element {
  const t = useT()
  return (
    <span className={clsx('mention-pill', `is-${mention.kind}`, selected && 'is-selected')} data-mention-id={mention.id}>
      <MentionIcon kind={mention.kind} id={mention.id} />
      <span className="mention-pill-label">{mentionLabel(t, mention)}</span>
    </span>
  )
}
