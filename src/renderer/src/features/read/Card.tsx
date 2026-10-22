// One card of a comment of an editor's read: its number, its lens, its text, for Continuity the two quotes
// in conflict, and its buttons. The margin beside the page and its popover in a narrow window show it.

import { useEffect, useLayoutEffect, useRef } from 'react'
import clsx from 'clsx'
import { BookOpenText, ChatCircleText, Check, Notebook, NotePencil, Path, Sparkle, Warning, X } from '@phosphor-icons/react'
import type { CommentState, EditorComment } from '@shared/comments'
import { chapterRef, entryRef } from '@shared/prompts/context'
import { isStoryLine } from '@shared/storyline'
import type { Chapter, Entry } from '@shared/types'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { Tooltip } from '@/ui'
import { decideComments } from './ui'
import './read.css'

type T = ReturnType<typeof useT>

/** A card: the comment, its number in the chapter (as in the margin of the page), and whether its passage is gone. */
export interface Card {
  c: EditorComment
  /** null for a comment without a passage in the text */
  n: number | null
  lost: boolean
}

/** What a source of a Continuity comment is: a chapter, the story line or a planning note. */
export function sourceOf(file: string, chapters: Chapter[], entries: Entry[], t: T): { icon: React.ReactNode; label: string; note?: string } {
  const m = t.read.margin
  const ci = chapters.findIndex((c) => chapterRef(c) === file || c.file === file)
  if (ci >= 0) return { icon: <BookOpenText size={12} className="icon-book" />, label: m.chapter(ci + 1) }
  const entry = entries.find((e) => entryRef(e) === file || e.file === file)
  if (entry && isStoryLine(entry)) return { icon: <Path size={12} />, label: m.storyLine }
  if (entry) return { icon: <Notebook size={12} />, label: m.note, note: entry.name }
  const name = file.slice(file.lastIndexOf('/') + 1).replace(/\.md$/i, '')
  return { icon: <Notebook size={12} />, label: name }
}

export interface CardProps {
  card: Card
  chapterNumber: number
  readOnly: boolean
  selected: boolean
  onSelect?: () => void
  cardRef?: (el: HTMLElement | null) => void
}

/** One comment: its number, its lens, its text; for Continuity the two quotes; its buttons. */
export function CommentCard({ card, chapterNumber, readOnly, selected, onSelect, cardRef }: CardProps): React.JSX.Element {
  const t = useT()
  const m = t.read.margin
  const chapters = useBook((s) => s.chapters)
  const entries = useBook((s) => s.entries)
  const { c, n, lost } = card
  const continuity = c.lens === 'continuity'
  const sources = continuity ? c.sources.map((s) => ({ ...sourceOf(s.file, chapters, entries, t), quote: s.quote })) : []
  const subject = sources.find((s) => s.note)?.note

  // The decisions go through decideComments. The other actions open the chat or the editor (the actions of a comment).
  const decide = (state: CommentState): void => {
    if (!readOnly) decideComments([c.id], state)
  }
  // One row: the work on the comment with the chat or the editor, a smaller decision, and "Done" on the right.
  const work = lost
    ? []
    : continuity
      ? [<Act key="note" kind="work" icon={<NotePencil size={13} />} label={m.updateNote} />]
      : [<Act key="discuss" kind="work" icon={<ChatCircleText size={13} />} label={m.discuss} />, <Act key="polish" kind="work" icon={<Sparkle size={13} />} label={m.polish} />]
  const minor =
    continuity && !lost ? (
      <Act key="intentional" kind="minor" className="cm-act-intentional" icon={<Check size={13} />} label={m.intentional} off={readOnly} offTip={m.readOnly} />
    ) : (
      <Act key="ignore" kind="minor" className="cm-act-ignore" icon={<X size={13} />} label={m.ignore} off={readOnly} offTip={m.readOnly} onClick={() => decide('ignored')} />
    )
  const done = <Act key="done" kind="done" className="cm-act-done" icon={<Check size={13} weight="bold" />} label={m.done} off={readOnly} offTip={m.readOnly} onClick={() => decide('done')} />
  const rowRef = useFitRow()

  return (
    <article
      ref={cardRef}
      className={clsx('cm-card', `cm-${c.lens}`, selected && 'is-selected', lost && 'is-lost')}
      data-comment={c.id}
      aria-label={m.card(n, t.read.lens[c.lens])}
      onClick={onSelect}
      onFocus={onSelect}
    >
      <div className="cm-card-head">
        {n !== null && <span className="cm-badge">{n}</span>}
        <span className="cm-tag">{t.read.lens[c.lens]}</span>
        {subject && <span className="cm-subject">· {subject}</span>}
      </div>
      {lost && (
        <p className="cm-lost">
          <Warning size={13} aria-hidden />
          <span>{m.lost}</span>
        </p>
      )}
      <p className="cm-text">{c.text}</p>
      {continuity && (
        <div className="cm-quotes">
          <div className="cm-quote">
            <span className="cm-quote-label caps">
              <BookOpenText size={12} className="icon-book" aria-hidden />
              {m.chapter(chapterNumber)}
            </span>
            <span className="cm-quote-text is-passage">{m.quote(c.passage)}</span>
          </div>
          {sources.map((s, i) => (
            <div key={i} className="cm-quote">
              <span className="cm-quote-label caps">
                {s.icon}
                {s.label}
              </span>
              <span className="cm-quote-text">{m.quote(s.quote)}</span>
            </div>
          ))}
        </div>
      )}
      <div ref={rowRef} className="cm-actions">
        {work}
        {minor}
        {done}
      </div>
    </article>
  )
}

/**
 * The buttons of a card are on one line. When they do not fit (a narrow card, a long language), the smaller
 * decision shows only its icon (`data-compact="1"`), then the work buttons too (`"2"`). "Done" keeps its
 * label. The name of each button stays in its tooltip and its aria-label.
 */
function useFitRow(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  const fit = (): void => {
    const row = ref.current
    if (!row) return
    delete row.dataset.compact
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0
    const kids = [...row.children] as HTMLElement[]
    const needed = (): number => kids.reduce((n, k) => n + k.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1)
    for (const level of ['1', '2']) {
      if (needed() <= row.clientWidth + 0.5) return
      row.dataset.compact = level
    }
  }
  // After each render (new labels, a new language), and when the card gets a new width.
  useLayoutEffect(fit)
  useEffect(() => {
    const row = ref.current
    if (!row) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(row)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ref
}

/**
 * A button of a card. `kind`: a work with the chat or the editor (a light button), a smaller decision, or
 * "Done". `off`: it does nothing, and its tooltip says why.
 */
function Act({
  kind,
  icon,
  label,
  className,
  onClick,
  off,
  offTip
}: {
  kind: 'work' | 'minor' | 'done'
  icon: React.ReactNode
  label: string
  className?: string
  onClick?: () => void
  off?: boolean
  offTip?: string
}): React.JSX.Element {
  const button = (
    <button
      type="button"
      className={clsx('cm-act', `cm-act-${kind}`, className)}
      aria-label={label}
      aria-disabled={off || undefined}
      onClick={() => {
        if (!off) onClick?.()
      }}
    >
      {icon}
      <span className="cm-act-label">{label}</span>
    </button>
  )
  // The tooltip names a button that shows only its icon, or says why a button is off.
  const tip = off && offTip ? offTip : kind === 'done' ? null : label
  return tip ? <Tooltip label={tip}>{button}</Tooltip> : button
}
