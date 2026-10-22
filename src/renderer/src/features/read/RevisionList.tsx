// The revision list: all the comments of the editor's reads of the book, on one page of the Write view
// (mockup 4b). The page covers the desk; the Write view stays mounted under it. Filters by lens and by state,
// with counts. The comments are grouped by chapter, in book order. The actions of a row are the actions of a
// card of the margin (actions.ts), and "Go to passage". The item at the top of the chapter list opens it.

import { useEffect, useId, useLayoutEffect, useMemo, useRef } from 'react'
import clsx from 'clsx'
import { RadioGroup } from 'radix-ui'
import { ArrowsLeftRight, BookOpenText, ChatCircleText, CheckCircle, Circle, ListChecks, SealCheck, Warning, XCircle } from '@phosphor-icons/react'
import { markdownToPlainBlocks } from '@shared/book'
import { LENSES, type CommentState, type EditorComment, type Lens, type LensChoice } from '@shared/comments'
import { findText } from '@shared/proposals/apply'
import type { Chapter } from '@shared/types'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { showText, useUi, type RevisionFilter } from '@/stores/ui'
import { goToComment } from './actions'
import { Act, commentButtons, sourceOf } from './Card'
import { commentRanges, rangesKnown, useMarksDrawn } from './marks'
import { NewReadButton } from './ReadPopover'
import { revisionCounts, revisionGroups, type RevisionGroup, type StateChoice } from './revision'
import { chapterName } from './start'
import { useComments } from './store'
import { inBook } from './ui'
import './read.css'

const NONE: EditorComment[] = []

/** The states in the filter and in the header of a chapter, as in mockup 4b */
const SHOWN_STATES: CommentState[] = ['open', 'done', 'ignored', 'intentional']

/** The comments of the open book, in its chapters: never a comment of another book, or of a chapter that is not in the book. */
function useBookComments(): EditorComment[] {
  const root = useBook((s) => s.root)
  const chapters = useBook((s) => s.chapters)
  const list = useComments((s) => (s.root === root ? s.list : NONE))
  return useMemo(() => inBook(list, chapters), [list, chapters])
}

/** The open comments of the book, and of each chapter: the counts of the chapter list (the same as the status bar). */
export function useOpenCounts(): { total: number; byChapter: Map<string, number> } {
  const comments = useBookComments()
  return useMemo(() => {
    const byChapter = new Map<string, number>()
    let total = 0
    for (const c of comments) {
      if (c.state !== 'open') continue
      total++
      byChapter.set(c.chapterId, (byChapter.get(c.chapterId) ?? 0) + 1)
    }
    return { total, byChapter }
  }, [comments])
}

/** The item at the top of the chapter list: it opens and closes the revision list, with the open comments of the book. */
export function RevisionListItem({ open }: { open: number }): React.JSX.Element {
  const t = useT()
  const l = t.read.list
  const shown = useUi((s) => s.revisionOpen)
  return (
    <button
      type="button"
      className={clsx('revision-item', shown && 'is-active')}
      aria-pressed={shown}
      aria-label={open ? `${l.title} · ${l.openCount(open)}` : l.title}
      onClick={() => useUi.getState().setRevisionOpen(!shown)}
    >
      <ListChecks size={15} aria-hidden />
      <span className="revision-item-title">{l.title}</span>
      {open > 0 && (
        <span className="revision-item-count" title={l.openCount(open)}>
          {open}
        </span>
      )}
    </button>
  )
}

/**
 * The place of the passage of each comment in its chapter: its live range in the editor of a chapter on screen,
 * else the place of the passage in the text of the chapter. Null when the passage is not in the text.
 */
function placesIn(chapters: Chapter[]): (c: EditorComment) => number | null {
  const plain = new Map<string, string>()
  return (c) => {
    if (rangesKnown(c.chapterId)) return commentRanges(c.chapterId).get(c.id)?.from ?? null
    let text = plain.get(c.chapterId)
    if (text === undefined) {
      text = markdownToPlainBlocks(chapters.find((ch) => ch.id === c.chapterId)?.body ?? '')
      plain.set(c.chapterId, text)
    }
    return c.passage.trim() ? (findText(text, c.passage)?.start ?? null) : null
  }
}

/** The revision list. It shows while `useUi.revisionOpen`, in the Write view (BookView). */
export function RevisionList(): React.JSX.Element {
  const t = useT()
  const l = t.read.list
  const chapters = useBook((s) => s.chapters)
  const comments = useBookComments()
  const readOnly = useComments((s) => s.readOnly)
  // A new draw of the marks: new places of the passages, and passages that are gone.
  const drawn = useMarksDrawn((s) => s.n)
  // The filters and the scroll stay while the book is open: "Go to passage", a fix, and back to the same place.
  const filter = useUi((s) => s.revisionFilter)
  const setFilter = (f: RevisionFilter): void => useUi.getState().setRevisionFilter(f)
  const scrollRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = useUi.getState().revisionScroll
  }, [])
  const counts = useMemo(() => revisionCounts(comments, filter), [comments, filter])
  const groups = useMemo(
    () => revisionGroups(comments, chapters, filter, placesIn(chapters)),
    // `drawn` is in the list: the places come from the editors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comments, chapters, filter, drawn]
  )

  // The text under the list must not change where the author cannot see it. Outside a field, Ctrl+Z and
  // Ctrl+Y do nothing while the list shows: else the browser undoes the last edit of the page, also in the
  // text of a chapter that does not show. (The Ctrl+Z of chat changes is off too: PageEditor.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const lensOptions = (['all', ...LENSES] as LensChoice[]).map((v) => ({ value: v, label: v === 'all' ? l.all : t.read.lens[v], count: counts.lens[v], lens: v === 'all' ? undefined : v }))
  const stateOptions = (['all', ...SHOWN_STATES] as StateChoice[]).map((v) => ({ value: v, label: v === 'all' ? l.all : l.states[v], count: counts.state[v] }))

  return (
    <div className="revision">
      <div ref={scrollRef} className="revision-scroll" onScroll={(e) => useUi.getState().setRevisionScroll(e.currentTarget.scrollTop)}>
        <div className="revision-inner">
          <header className="revision-hero">
            <div className="revision-hero-top">
              <h1>{l.title}</h1>
              <NewReadButton />
            </div>
            <p className="revision-intro">{l.intro}</p>
          </header>
          {comments.length > 0 && (
            <div className="revision-filters">
              <Filter name="lens" label={l.lensFilter} value={filter.lens} options={lensOptions} onChange={(lens) => setFilter({ ...filter, lens })} />
              <Filter name="state" label={l.stateFilter} value={filter.state} options={stateOptions} onChange={(state) => setFilter({ ...filter, state })} />
            </div>
          )}
          {!comments.length ? (
            <p className="revision-empty">{l.empty}</p>
          ) : !groups.length ? (
            <p className="revision-empty">{l.noMatch}</p>
          ) : (
            groups.map((g) => <Group key={g.chapter.id} group={g} readOnly={readOnly} />)
          )}
        </div>
      </div>
    </div>
  )
}

interface Option<V extends string> {
  value: V
  label: string
  count: number
  /** A lens: a dot in its color */
  lens?: Lens
}

/** A filter: its name, and one chip for each choice, with its count. */
function Filter<V extends string>({ name, label, value, options, onChange }: { name: string; label: string; value: V; options: Option<V>[]; onChange: (v: V) => void }): React.JSX.Element {
  const labelId = useId()
  return (
    <div className="revision-filter" data-filter={name}>
      <span className="caps" id={labelId}>
        {label}
      </span>
      <RadioGroup.Root className="revision-seg" value={value} onValueChange={(v) => onChange(v as V)} aria-labelledby={labelId} orientation="horizontal">
        {options.map((o) => (
          <RadioGroup.Item key={o.value} value={o.value} data-value={o.value} className={clsx('revision-chip', o.lens && `cm-${o.lens}`)}>
            {o.lens && <span className="revision-dot" aria-hidden />}
            <span className="revision-chip-label">{o.label}</span>
            <span className="revision-chip-count">{o.count}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  )
}

/** The comments of one chapter: its header ("Ch. 2 · O Visitante", "3 open · 1 done") and its rows. */
function Group({ group, readOnly }: { group: RevisionGroup; readOnly: boolean }): React.JSX.Element {
  const t = useT()
  const l = t.read.list
  const titleId = useId()
  const drawn = useMarksDrawn((s) => s.n)
  const chapterId = group.chapter.id
  // An open comment whose passage is not in the text now: the file says so, or the editor of the chapter on
  // screen did not find it (a text from outside). As in the margin.
  const lost = useMemo(() => {
    const known = rangesKnown(chapterId)
    const ranges = commentRanges(chapterId)
    return new Set(group.rows.filter((c) => c.state === 'open' && (c.lost || (known && !ranges.has(c.id)))).map((c) => c.id))
    // `drawn` is in the list: the ranges come from the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, chapterId, drawn])
  return (
    <section className="revision-group" aria-labelledby={titleId}>
      <header className="revision-group-head">
        <h2 className="revision-group-title" id={titleId}>
          <BookOpenText size={16} className="icon-book" aria-hidden />
          <span>
            {t.read.margin.chapter(group.number)} · {chapterName(group.chapter.title)}
          </span>
        </h2>
        <span className="revision-group-counts">
          {SHOWN_STATES.filter((s) => group.counts[s])
            .map((s) => l.count[s](group.counts[s]))
            .join(' · ')}
        </span>
      </header>
      <ul className="revision-rows">
        {group.rows.map((c) => (
          <li key={c.id}>
            <Row c={c} chapterNumber={group.number} lost={lost.has(c.id)} readOnly={readOnly} />
          </li>
        ))}
      </ul>
    </section>
  )
}

const STATE_ICONS: Record<CommentState, React.ReactNode> = {
  open: <Circle size={16} />,
  done: <CheckCircle size={16} weight="fill" />,
  ignored: <XCircle size={16} />,
  intentional: <SealCheck size={16} />
}

/**
 * One comment: its state, its text, the quote of its passage (for Continuity, first the chip of the conflict),
 * the reason of an intentional comment, its lens and its state. The actions take the place of the lens and the
 * state on hover and on focus: "Go to passage", then the buttons of its card (icons; their names in tooltips).
 * The text of the comment is the name of the row, so its buttons have a context for a screen reader.
 */
function Row({ c, chapterNumber, lost, readOnly }: { c: EditorComment; chapterNumber: number; lost: boolean; readOnly: boolean }): React.JSX.Element {
  const t = useT()
  const l = t.read.list
  const m = t.read.margin
  const chapters = useBook((s) => s.chapters)
  const entries = useBook((s) => s.entries)
  const textId = useId()
  const sources = c.lens === 'continuity' ? c.sources.map((s) => sourceOf(s.file, chapters, entries, t)) : []
  const here = m.chapter(chapterNumber)

  // "Go to passage": the list closes first, so the passage and its card are on screen.
  const goTo = (): void => {
    showText()
    goToComment(c)
  }

  return (
    <article className={clsx('revision-row', `cm-${c.lens}`, `is-${c.state}`)} data-comment={c.id} data-state={c.state} aria-labelledby={textId}>
      <span className="revision-state-icon" aria-hidden>
        {STATE_ICONS[c.state]}
      </span>
      <div className="revision-body">
        <p className="revision-text" id={textId}>
          {c.text}
        </p>
        <div className="revision-meta">
          {sources.map((s, i) => {
            const source = s.note ? `${s.label} · ${s.note}` : s.label
            return (
              <span key={i} className="revision-source" title={l.conflict(here, source)}>
                <span>{here}</span>
                <ArrowsLeftRight size={11} aria-hidden />
                {s.icon}
                <span>{source}</span>
              </span>
            )
          })}
          {c.passage && <span className="revision-quote">{m.quote(c.passage)}</span>}
        </div>
        {lost && (
          <p className="cm-lost">
            <Warning size={13} aria-hidden />
            <span>{m.lost}</span>
          </p>
        )}
        {c.state === 'intentional' && c.reason && (
          <p className="revision-reason">
            <ChatCircleText size={13} aria-hidden />
            <span className="revision-reason-label">{l.reason}</span>
            <span className="revision-reason-text">{c.reason}</span>
          </p>
        )}
      </div>
      <div className="revision-side">
        <span className="cm-tag">{t.read.lens[c.lens]}</span>
        <span className="revision-state">{l.state[c.state]}</span>
      </div>
      <div className="revision-acts">
        <Act key="go" kind="go" named icon={null} label={l.goTo} onClick={goTo} />
        {commentButtons(c, lost, readOnly, t)}
      </div>
    </article>
  )
}
