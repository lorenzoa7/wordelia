// A proposal of the AI on the board: the proposed columns and cards, with marks. New cards and
// columns are green; deleted ones stay where they were, red and struck; moved cards have a mark;
// a changed text shows its word diff. Nothing here can change: the author accepts or rejects.

import { useMemo } from 'react'
import { DotsSixVertical } from '@phosphor-icons/react'
import clsx from 'clsx'
import { diffView, placesOf, plainText, type Board, type DiffCard, type LineView } from '@shared/storyline'
import { wordDiff } from '@shared/text/diff'
import type { Chapter, Entry } from '@shared/types'
import { useT } from '@/lib/i18n'
import { CardView, ColumnShell, movable } from './Board'

function Diff({ before, after }: { before: string; after: string }): React.JSX.Element {
  const ops = useMemo(() => wordDiff(plainText(before), plainText(after)), [before, after])
  return (
    <>
      {ops.map((op, i) => (op.type === 'equal' ? <span key={i}>{op.text}</span> : op.type === 'delete' ? <del key={i}>{op.text}</del> : <ins key={i}>{op.text}</ins>))}
    </>
  )
}

function Tag({ c }: { c: DiffCard }): React.JSX.Element | null {
  const t = useT()
  const moved = c.moved || c.otherMoved
  const label = c.removed ? t.plan.line.markDeleted : c.added ? t.plan.line.markNew : c.changed ? t.plan.line.markChanged : moved ? t.plan.line.markMoved : ''
  if (!label) return null
  const kind = c.removed ? 'removed' : c.added ? 'added' : c.changed ? 'changed' : 'moved'
  return <span className={clsx('line-tag', `is-${kind}`)}>{label}</span>
}

interface Props {
  before: Board
  after: Board
  view: LineView
  chapters: Chapter[]
  notes: Entry[]
  here: string | null
}

export function ReviewBoard({ before, after, view, chapters, notes, here }: Props): React.JSX.Element {
  const cols = useMemo(() => diffView(before, after, view, chapters), [before, after, view, chapters])
  const other = useMemo(() => placesOf(after, view === 'chapter' ? 'order' : 'chapter', chapters), [after, view, chapters])
  return (
    <div className="line-board is-review" data-view={view}>
      {cols.map((col) => (
        <ColumnShell
          key={`${col.key}:${col.mark}`}
          col={{ ...col, cards: [] }}
          view={view}
          here={col.key === here && col.mark !== 'removed'}
          count={col.cards.filter((c) => !c.removed).length}
          mark={col.mark === 'same' ? undefined : col.mark}
          oldTitle={col.oldTitle}
          grip={
            movable(col) ? (
              <span className="line-col-grip is-still">
                <DotsSixVertical size={14} weight="bold" />
              </span>
            ) : undefined
          }
        >
          {col.cards.map((c) => (
            <CardView
              key={`${c.card.id}${c.removed ? ':x' : ''}`}
              card={c.card}
              other={c.removed ? undefined : other.get(c.card.id)}
              planned={view === 'chapter' ? col.kind !== 'chapter' : other.get(c.card.id)?.kind !== 'chapter'}
              view={view}
              notes={notes}
              links={false}
              // A card that moved in the other view shows its new place there, in the line at the bottom.
              className={clsx(c.added && 'is-added', c.removed && 'is-removed', c.moved && 'is-moved', c.otherMoved && 'is-other-moved', c.changed && 'is-changed')}
              text={c.changed && c.before !== undefined ? <Diff before={c.before} after={c.card.text} /> : undefined}
              tag={<Tag c={c} />}
              data-card={c.card.id}
            />
          ))}
        </ColumnShell>
      ))}
    </div>
  )
}
