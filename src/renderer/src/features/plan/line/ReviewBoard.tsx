// A proposal of the AI on the board: the board now with the changes that wait for a decision. A card
// that goes away is red where it is; a card that comes is green where it goes; a move is both. A
// bar on each change has Apply and Reject. Nothing else on the board can change until the author
// decides.

import { useMemo, type ReactNode } from 'react'
import { Check, DotsSixVertical, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { parseBoard, placesOf, plainText, reviewView, type LineView, type ReviewColumn, type ReviewSlot } from '@shared/storyline'
import { wordDiff } from '@shared/text/diff'
import type { Chapter, Entry } from '@shared/types'
import { useT } from '@/lib/i18n'
import { CardView, ColumnShell, movable } from './Board'
import { applyLineChanges, proposedBoard, rejectLineChanges, type LineProposal } from './proposal'
import { keepColumn } from './anchor'

function Diff({ before, after }: { before: string; after: string }): React.JSX.Element {
  const ops = useMemo(() => wordDiff(plainText(before), plainText(after)), [before, after])
  return (
    <>
      {ops.map((op, i) => (op.type === 'equal' ? <span key={i}>{op.text}</span> : op.type === 'delete' ? <del key={i}>{op.text}</del> : <ins key={i}>{op.text}</ins>))}
    </>
  )
}

/** The bar of a change: what it does, Reject and Apply. */
function Decision({ tone, label, subject, ids, p }: { tone: 'add' | 'remove'; label: string; subject: string; ids: string[]; p: LineProposal }): React.JSX.Element {
  const t = useT()
  return (
    <div className={clsx('line-decide', `is-${tone}`)} role="group" aria-label={`${label}: ${subject}`}>
      <span className="line-decide-label">{label}</span>
      <button
        className="line-decide-btn"
        onClick={(e) => {
          keepColumn(e.currentTarget)
          rejectLineChanges(p, ids)
        }}
      >
        <X size={11} weight="bold" />
        {t.plan.line.rejectOne}
      </button>
      <button
        className="line-decide-btn is-apply"
        onClick={(e) => {
          keepColumn(e.currentTarget)
          applyLineChanges(p, ids)
        }}
      >
        <Check size={11} weight="bold" />
        {t.plan.line.apply}
      </button>
    </div>
  )
}

interface Props {
  p: LineProposal
  view: LineView
  chapters: Chapter[]
  notes: Entry[]
  here: string | null
}

export function ReviewBoard({ p, view, chapters, notes, here }: Props): React.JSX.Element {
  const t = useT()
  const before = useMemo(() => parseBoard(p.before), [p.before])
  const after = useMemo(() => proposedBoard(p), [p])
  const cols = useMemo(() => reviewView(before, after, view, chapters, p.changes), [before, after, view, chapters, p.changes])
  // The line at the bottom of a card: its place in the other view, now (or in the proposal, for a card that comes).
  const other = useMemo(() => placesOf(before, view === 'chapter' ? 'order' : 'chapter', chapters), [before, view, chapters])
  const otherNext = useMemo(() => placesOf(after, view === 'chapter' ? 'order' : 'chapter', chapters), [after, view, chapters])
  const otherOf = (s: ReviewSlot) => (s.tone === 'add' ? otherNext.get(s.card.id) : undefined) ?? other.get(s.card.id)

  const slotLabel = (s: ReviewSlot): string => {
    if (s.tone === 'remove') return s.changes.some((c) => c.startsWith('delete:')) ? t.plan.line.slotDelete : t.plan.line.slotRemove
    return s.changes.some((c) => c.startsWith('place:') || c.startsWith('add:')) ? t.plan.line.slotAdd : t.plan.line.slotText
  }
  const columnNotice = (col: ReviewColumn): ReactNode => {
    if (!col.changes.length) return null
    const label =
      col.tone === 'add' ? t.plan.line.columnAdd : col.tone === 'remove' ? t.plan.line.columnDelete : col.newTitle !== undefined ? t.plan.line.columnRename : t.plan.line.columnMove
    return <Decision tone={col.tone === 'remove' ? 'remove' : 'add'} label={label} subject={col.newTitle ?? col.title} ids={col.changes} p={p} />
  }

  return (
    <div className="line-board is-review" data-view={view}>
      {cols.map((col) => (
        <ColumnShell
          key={`${col.key}:${col.tone}`}
          col={{ ...col, title: col.newTitle ?? col.title, cards: [] }}
          view={view}
          here={col.key === here && col.tone !== 'add'}
          count={col.slots.filter((s) => s.tone !== 'remove').length}
          mark={col.tone === 'add' ? 'added' : col.tone === 'remove' ? 'removed' : col.newTitle !== undefined ? 'renamed' : undefined}
          oldTitle={col.newTitle !== undefined ? col.title : undefined}
          notice={columnNotice(col)}
          grip={
            movable(col) ? (
              <span className="line-col-grip is-still">
                <DotsSixVertical size={14} weight="bold" />
              </span>
            ) : undefined
          }
        >
          {col.slots.map((s, i) => (
            <div key={`${s.card.id}:${s.tone}:${i}`} className={clsx('line-slot', `is-${s.tone}`)}>
              {s.tone !== 'same' && <Decision tone={s.tone} label={slotLabel(s)} subject={plainText(s.card.text)} ids={s.changes} p={p} />}
              <CardView
                card={s.card}
                other={otherOf(s)}
                planned={view === 'chapter' ? col.kind !== 'chapter' : otherOf(s)?.kind !== 'chapter'}
                view={view}
                notes={notes}
                links={false}
                className={clsx(s.tone === 'add' && 'is-added', s.tone === 'remove' && 'is-removed')}
                text={s.before !== undefined ? <Diff before={s.before} after={s.card.text} /> : undefined}
                data-card={s.card.id}
              />
            </div>
          ))}
        </ColumnShell>
      ))}
    </div>
  )
}
