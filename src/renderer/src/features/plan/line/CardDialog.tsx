// The dialog of a card: its full text, its chapter and its moment, the notes that it mentions.
// Save keeps the changes; Cancel, Esc or a click outside drop them.

import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, Trash } from '@phosphor-icons/react'
import { TRAY, boardView, deleteCard, placeCard, placesOf, updateCard, type Board } from '@shared/storyline'
import type { Chapter, Entry } from '@shared/types'
import { Button, Dialog, Field, Select } from '@/ui'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { MentionIcon } from '@/features/chat/MentionPill'
import { MentionTextarea } from './MentionTextarea'
import { mentionedNotes } from './CardText'
import { saveBoard } from './model'

interface Props {
  cardId: string | null
  board: Board
  chapters: Chapter[]
  notes: Entry[]
  onClose(): void
}

export function CardDialog({ cardId, board, chapters, notes, onClose }: Props): React.JSX.Element {
  const t = useT()
  const card = board.cards.find((c) => c.id === cardId) ?? null
  const chapterCols = useMemo(() => boardView(board, 'chapter', chapters).filter((c) => c.kind !== 'tray'), [board, chapters])
  const momentCols = useMemo(() => boardView(board, 'order', chapters).filter((c) => c.kind !== 'tray'), [board, chapters])
  const placeNow = useMemo(
    () => (card ? { chapter: placesOf(board, 'chapter', chapters).get(card.id)?.key ?? TRAY, moment: placesOf(board, 'order', chapters).get(card.id)?.key ?? TRAY } : null),
    [board, chapters, card]
  )
  const [text, setText] = useState('')
  const [chapter, setChapter] = useState(TRAY)
  const [moment, setMoment] = useState(TRAY)
  const [error, setError] = useState(false)

  // A new card opens: its values come in.
  useEffect(() => {
    if (!card || !placeNow) return
    setText(card.text)
    setChapter(placeNow.chapter)
    setMoment(placeNow.moment)
    setError(false)
    // Only when another card opens, not when the board changes.
  }, [cardId]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (): void => {
    if (!card || !placeNow) return
    if (!text.trim()) {
      setError(true)
      return
    }
    let next = updateCard(board, card.id, text)
    // A new place goes at the end of the column.
    if (chapter !== placeNow.chapter) next = placeCard(next, 'chapter', card.id, chapter, Infinity, chapters)
    if (moment !== placeNow.moment) next = placeCard(next, 'order', card.id, moment, Infinity, chapters)
    saveBoard(next)
    onClose()
  }

  const remove = (): void => {
    if (!card) return
    const before = board
    saveBoard(deleteCard(board, card.id))
    onClose()
    toast(t.plan.line.cardDeleted, { ms: 8000, action: { label: t.common.undo, run: () => saveBoard(before) } })
  }

  const option = (key: string, label: string): { value: string; label: string } => ({ value: key, label })
  const chapterOptions = [
    option(TRAY, t.plan.line.none),
    ...chapterCols.map((c) => option(c.key, `${c.number} · ${c.title || t.plan.line.untitled}`))
  ]
  const momentOptions = [option(TRAY, t.plan.line.none), ...momentCols.map((c) => option(c.key, c.title || t.plan.line.untitled))]
  const mentioned = mentionedNotes(text, notes)
  const chapterId = chapterCols.find((c) => c.key === chapter)?.chapterId

  return (
    <Dialog
      open={Boolean(card)}
      onOpenChange={(v) => !v && onClose()}
      title={t.plan.line.cardTitle}
      width={520}
      className="line-dialog"
      footer={
        <>
          <Button variant="ghost" className="line-dialog-delete" icon={<Trash size={14} />} onClick={remove}>
            {t.plan.line.deleteCard}
          </Button>
          <span className="line-dialog-spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant="primary" onClick={save}>
            {t.common.save}
          </Button>
        </>
      }
    >
      {card && (
        <div className="line-dialog-body">
          <MentionTextarea
            value={text}
            onChange={(v) => {
              setText(v)
              if (v.trim()) setError(false)
            }}
            onSubmit={save}
            notes={notes}
            autoFocus
            className="line-dialog-text"
            placeholder={t.plan.line.cardPlaceholder}
            aria-label={t.plan.line.cardTitle}
          />
          {error && <p className="line-dialog-error">{t.plan.line.textRequired}</p>}
          <div className="line-dialog-places">
            <Field label={t.plan.line.chapter}>
              <Select value={chapter} onValueChange={setChapter} options={chapterOptions} />
            </Field>
            <Field label={t.plan.line.momentField}>
              <Select value={moment} onValueChange={setMoment} options={momentOptions} />
            </Field>
          </div>
          {(mentioned.length > 0 || chapterId) && (
            <div className="line-dialog-links">
              {chapterId && (
                <button
                  className="mention-link"
                  onClick={() => {
                    onClose()
                    useBook.getState().selectChapter(chapterId)
                  }}
                >
                  <BookOpenText size={13} />
                  <span>{t.plan.line.openChapter}</span>
                </button>
              )}
              {mentioned.map((n) => (
                <button
                  key={n.id}
                  className="mention-link"
                  onClick={() => {
                    onClose()
                    useBook.getState().selectEntry(n.id)
                  }}
                >
                  <MentionIcon kind="entry" id={n.id} size={13} />
                  <span>{n.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
