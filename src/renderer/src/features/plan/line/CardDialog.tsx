// The dialog of a card: its full text, its chapter and its moment, the notes that it mentions.
// Save keeps the changes; Cancel, Esc or a click outside drop them.

import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, Trash } from '@phosphor-icons/react'
import { TRAY, boardView, deleteCard, placeCard, placesOf, updateCard, type Board } from '@shared/storyline'
import type { Chapter, Entry } from '@shared/types'
import { Button, Dialog, Select } from '@/ui'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { MentionIcon } from '@/features/chat/MentionPill'
import { MentionTextarea } from './MentionTextarea'
import { mentionedNotes } from './CardText'
import { saveBoard, undoBoard } from './model'

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
  // Only while a card is open: they read the whole board.
  const chapterCols = useMemo(() => (card ? boardView(board, 'chapter', chapters).filter((c) => c.kind !== 'tray') : []), [board, chapters, card])
  const momentCols = useMemo(() => (card ? boardView(board, 'order', chapters).filter((c) => c.kind !== 'tray') : []), [board, chapters, card])
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
    const after = deleteCard(board, card.id)
    saveBoard(after)
    onClose()
    toast(t.plan.line.cardDeleted, { ms: 8000, action: { label: t.common.undo, run: () => undoBoard(before, after) } })
  }

  const option = (key: string, label: string): { value: string; label: string } => ({ value: key, label })
  const chapterOptions = [
    option(TRAY, t.plan.line.none),
    ...chapterCols.map((c) => option(c.key, `${c.number} · ${c.title || t.plan.line.untitled}`))
  ]
  const momentOptions = [option(TRAY, t.plan.line.none), ...momentCols.map((c) => option(c.key, c.title || t.plan.line.untitled))]
  const mentioned = mentionedNotes(text, notes)
  const chapterId = chapterCols.find((c) => c.key === chapter)?.chapterId

  const openChapter = (): void => {
    if (!chapterId) return
    onClose()
    useBook.getState().selectChapter(chapterId)
  }

  return (
    <Dialog
      open={Boolean(card)}
      onOpenChange={(v) => !v && onClose()}
      title={t.plan.line.cardTitle}
      width={560}
      className="line-dialog"
      // Escape first closes the list of notes of the text box.
      onEscapeKeyDown={(e) => {
        if ((e.target as HTMLElement | null)?.getAttribute?.('aria-expanded') === 'true') e.preventDefault()
      }}
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
            fixed
            className="line-dialog-text"
            placeholder={t.plan.line.cardPlaceholder}
            aria-label={t.plan.line.cardTitle}
          />
          <p className="line-dialog-error" aria-live="polite">
            {error ? t.plan.line.textRequired : ''}
          </p>
          <div className="line-dialog-places">
            <div className="line-dialog-place">
              <div className="line-dialog-place-head">
                <span className="field-label">{t.plan.line.chapter}</span>
                {/* Always there, so the two fields keep one line; it works for a chapter of the book. */}
                <button className="line-dialog-open" onClick={openChapter} disabled={!chapterId}>
                  <BookOpenText className="is-book" size={12} />
                  {t.plan.line.openChapter}
                </button>
              </div>
              <Select value={chapter} onValueChange={setChapter} options={chapterOptions} ariaLabel={t.plan.line.chapter} />
            </div>
            <div className="line-dialog-place">
              <div className="line-dialog-place-head">
                <span className="field-label">{t.plan.line.momentField}</span>
              </div>
              <Select value={moment} onValueChange={setMoment} options={momentOptions} ariaLabel={t.plan.line.momentField} />
            </div>
          </div>
          <div className="line-dialog-notes">
            <span className="field-label">{t.plan.line.mentions}</span>
            <div className="line-dialog-links">
              {mentioned.length ? (
                mentioned.map((n) => (
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
                ))
              ) : (
                <p className="line-dialog-none">{t.plan.line.noMentions}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
