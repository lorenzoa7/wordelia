// The story line: the events of the story in lanes (rows) and moments (columns). The AI builds and
// changes it through chat proposals; the author can drag a card to another cell. src/shared/storyline.ts
// parses the entry and places the cards, so they never overlap.

import { useMemo, useState } from 'react'
import { BookOpenText, NotePencil } from '@phosphor-icons/react'
import clsx from 'clsx'
import { chapterOf, findStoryLine, isStoryLine, layoutStoryLine, mentionPieces, momentOfChapter, moveEvent, parseStoryLine, type StoryEvent } from '@shared/storyline'
import type { Chapter, Entry } from '@shared/types'
import { Button, Tooltip } from '@/ui'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { PlanViewSwitch } from '@/features/graph'
import { MentionPill } from '@/features/chat/MentionPill'
import { BuildStoryLineDialog } from './BuildStoryLine'
import './storyline.css'

export function StoryLineView(): React.JSX.Element {
  const t = useT()
  const all = useBook((s) => s.entries)
  const chapters = useBook((s) => s.chapters)
  const activeChapterId = useBook((s) => s.activeChapterId)
  const story = useMemo(() => findStoryLine(all), [all])
  const entries = useMemo(() => all.filter((e) => !isStoryLine(e)), [all])
  const line = useMemo(() => (story ? parseStoryLine(story.body) : null), [story])
  const layout = useMemo(() => (line ? layoutStoryLine(line) : null), [line])
  const [building, setBuilding] = useState(false)
  const [drag, setDrag] = useState<StoryEvent | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const events = line?.moments.reduce((n, m) => n + m.events.length, 0) ?? 0
  const here = line && activeChapterId ? momentOfChapter(line, activeChapterId, chapters) : -1

  return (
    <div className="plan-scroll line-wrap">
      <div className="line-page">
        <header className="line-head">
          <div className="line-title-row">
            <div className="line-title">
              <h1>{t.plan.line.title}</h1>
              {line && <p className="line-stats">{t.plan.line.stats(line.lanes.length, events)}</p>}
            </div>
            <PlanViewSwitch active="line" />
          </div>
          {story && (
            <div className="line-tools">
              <p className="line-hint">{t.plan.line.hint}</p>
              <Button size="sm" variant="ghost" icon={<NotePencil size={13} />} onClick={() => useBook.getState().selectEntry(story.id)}>
                {t.plan.line.editText}
              </Button>
            </div>
          )}
        </header>

        {!story || !line || !layout ? (
          <div className="line-empty">
            <h2>{t.plan.line.emptyTitle}</h2>
            <p>{t.plan.line.emptyText}</p>
            <Button variant="primary" onClick={() => setBuilding(true)}>
              {t.plan.line.build}
            </Button>
          </div>
        ) : (
          <LineGrid
            story={story}
            line={line}
            layout={layout}
            here={here}
            chapters={chapters}
            entries={entries}
            activeChapterId={activeChapterId}
            drag={drag}
            over={over}
            setDrag={setDrag}
            setOver={setOver}
          />
        )}
      </div>
      <BuildStoryLineDialog open={building} onClose={() => setBuilding(false)} />
    </div>
  )
}

interface GridProps {
  story: Entry
  line: ReturnType<typeof parseStoryLine>
  layout: ReturnType<typeof layoutStoryLine>
  here: number
  chapters: Chapter[]
  entries: Entry[]
  activeChapterId: string | null
  drag: StoryEvent | null
  over: string | null
  setDrag: (e: StoryEvent | null) => void
  setOver: (key: string | null) => void
}

function LineGrid({ story, line, layout, here, chapters, entries, activeChapterId, drag, over, setDrag, setOver }: GridProps): React.JSX.Element {
  const t = useT()
  // The first grid column of each moment: column 1 holds the lane names.
  const starts: number[] = []
  let col = 2
  for (const n of layout.subs) {
    starts.push(col)
    col += n
  }
  const columns = col - 2
  const rowName = (lane: string): string => (lane ? lane : t.plan.line.other)
  // Single events of one cell share one box; a meeting has its own card over its rows.
  const cells = new Map<string, { moment: number; sub: number; row: number; events: StoryEvent[] }>()
  const meetings = layout.placed.filter((p) => p.event.lanes.length > 1)
  for (const p of layout.placed) {
    if (p.event.lanes.length > 1) continue
    const key = `${p.moment}:${p.sub}:${p.rows[0]}`
    const cell = cells.get(key) ?? { moment: p.moment, sub: p.sub, row: p.rows[0], events: [] }
    cell.events.push(p.event)
    cells.set(key, cell)
  }
  const drop = (moment: number, row: number): void => {
    if (!drag) return
    const body = moveEvent(story.body, line, drag, moment, layout.rows[row])
    if (body !== story.body) useBook.getState().updateEntry(story.id, { body })
    setDrag(null)
    setOver(null)
  }
  const card = (event: StoryEvent, meeting: boolean, rows: number[]): React.JSX.Element => (
    <EventCard
      key={event.line}
      event={event}
      meeting={meeting}
      lanesApart={meeting && rows.some((r) => !event.lanes.includes(layout.rows[r]))}
      chapters={chapters}
      entries={entries}
      activeChapterId={activeChapterId}
      onDragStart={() => setDrag(event)}
      onDragEnd={() => {
        setDrag(null)
        setOver(null)
      }}
    />
  )

  return (
    <div className="line-scroll">
      <div
        className={clsx('line-grid', drag && 'is-dragging')}
        style={{ gridTemplateColumns: `var(--line-lane-w) repeat(${columns}, var(--line-col-w))`, gridTemplateRows: `auto repeat(${layout.rows.length}, minmax(var(--line-row-h), auto))` }}
      >
        {layout.rows.map((_, r) => (
          <div key={`band-${r}`} className="line-band" style={{ gridRow: r + 2, gridColumn: '1 / -1' }} />
        ))}
        {here >= 0 && <div className="line-here" style={{ gridRow: `1 / span ${layout.rows.length + 1}`, gridColumn: `${starts[here]} / span ${layout.subs[here]}` }} />}
        {line.moments.map((m, i) => (
          <div key={`m-${i}`} className={clsx('line-moment', i === here && 'is-here')} style={{ gridRow: 1, gridColumn: `${starts[i]} / span ${layout.subs[i]}` }}>
            <span className="line-moment-label">{m.label}</span>
            {i === here && <span className="line-moment-here">{t.plan.line.here}</span>}
          </div>
        ))}
        {layout.rows.map((lane, r) => (
          <div key={`lane-${r}`} className={clsx('line-lane', lane === line.past && 'is-past', !lane && 'is-other')} style={{ gridRow: r + 2, gridColumn: 1 }}>
            <span className="line-lane-dot" style={{ background: `var(--map-${(r % 8) + 1})` }} aria-hidden />
            <span className="line-lane-name">{rowName(lane)}</span>
          </div>
        ))}
        {[...cells.values()].map((c) => (
          <div key={`c-${c.moment}-${c.sub}-${c.row}`} className="line-cell" style={{ gridRow: c.row + 2, gridColumn: starts[c.moment] + c.sub }}>
            {c.events.map((e) => card(e, false, [c.row]))}
          </div>
        ))}
        {meetings.map((p) => (
          <div key={`g-${p.event.line}`} className="line-cell is-meeting" style={{ gridRow: `${p.rows[0] + 2} / span ${p.rows.length}`, gridColumn: starts[p.moment] + p.sub }}>
            {card(p.event, true, p.rows)}
          </div>
        ))}
        {drag &&
          line.moments.flatMap((_, i) =>
            layout.rows.map((lane, r) => {
              const key = `${i}:${r}`
              return (
                <div
                  key={`d-${key}`}
                  className={clsx('line-drop', over === key && 'is-over')}
                  style={{ gridRow: r + 2, gridColumn: `${starts[i]} / span ${layout.subs[i]}` }}
                  aria-label={`${line.moments[i].label} · ${rowName(lane)}`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (over !== key) setOver(key)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    drop(i, r)
                  }}
                />
              )
            })
          )}
      </div>
      <p className="line-drag-hint">{t.plan.line.dragHint}</p>
    </div>
  )
}

interface CardProps {
  event: StoryEvent
  meeting: boolean
  /** A meeting whose lanes are not next to each other: the card names its lanes */
  lanesApart: boolean
  chapters: Chapter[]
  entries: Entry[]
  activeChapterId: string | null
  onDragStart: () => void
  onDragEnd: () => void
}

function EventCard({ event, meeting, lanesApart, chapters, entries, activeChapterId, onDragStart, onDragEnd }: CardProps): React.JSX.Element {
  const t = useT()
  const links = event.links.map((l) => ({ text: l, id: chapterOf(l, chapters) }))
  const written = links.some((l) => l.id)
  const open = activeChapterId ? links.some((l) => l.id === activeChapterId) : false
  const pieces = useMemo(() => mentionPieces(event.text, entries), [event.text, entries])
  return (
    <div
      className={clsx('line-card', !written && 'is-planned', meeting && 'is-meeting', open && 'is-open')}
      draggable
      title={written ? undefined : t.plan.line.planned}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', event.text)
        onDragStart()
      }}
      onDragEnd={onDragEnd}
    >
      {lanesApart && <span className="line-card-lanes">{event.lanes.join(' + ')}</span>}
      <p className="line-card-text">
        {pieces.map((p, i) =>
          p.kind === 'text' ? (
            <span key={i}>{p.text}</span>
          ) : (
            <button key={i} className="line-mention" onClick={() => useBook.getState().selectEntry(p.entryId)}>
              <MentionPill mention={{ kind: 'entry', id: p.entryId, label: p.text.slice(1) }} />
            </button>
          )
        )}
      </p>
      {links.length > 0 && (
        <span className="line-card-chapters">
          {links.map((l) => {
            const title = chapters.find((c) => c.id === l.id)?.title ?? l.text
            return l.id ? (
              <Tooltip key={l.text} label={t.plan.line.openChapter(title)}>
                <button className="line-chapter" onClick={() => useBook.getState().selectChapter(l.id!)}>
                  <BookOpenText size={11} />
                  <span>{title}</span>
                </button>
              </Tooltip>
            ) : (
              <span key={l.text} className="line-chapter is-missing">
                {l.text}
              </span>
            )
          })}
        </span>
      )}
    </div>
  )
}
