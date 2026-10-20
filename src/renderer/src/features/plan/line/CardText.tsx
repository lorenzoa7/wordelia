// The text of a card: plain words, and mentions as underlined names. A click on a name opens the note.

import { useMemo } from 'react'
import { mentionPieces } from '@shared/storyline'
import type { Entry } from '@shared/types'
import { useBook } from '@/stores/book'

export function CardText({ text, notes, links = true }: { text: string; notes: Entry[]; links?: boolean }): React.JSX.Element {
  const pieces = useMemo(() => mentionPieces(text, notes), [text, notes])
  return (
    <>
      {pieces.map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.text}</span>
        ) : links ? (
          <span
            key={i}
            className="line-mention"
            // The name is not a drag handle: a press on it does not start a drag.
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              useBook.getState().selectEntry(p.entryId)
            }}
          >
            {p.text.slice(1)}
          </span>
        ) : (
          <span key={i} className="line-mention is-static">
            {p.text.slice(1)}
          </span>
        )
      )}
    </>
  )
}

/** The notes that a text mentions, each one once, in order. */
export function mentionedNotes(text: string, notes: Entry[]): Entry[] {
  const ids = [...new Set(mentionPieces(text, notes).flatMap((p) => (p.kind === 'mention' ? [p.entryId] : [])))]
  return ids.flatMap((id) => notes.filter((n) => n.id === id))
}
