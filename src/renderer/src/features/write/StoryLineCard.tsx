// The open chapter in the story line, under the chapter list: its moment, its events, the events
// at the same time in other lanes, and the next events of its lanes. A click opens the Line view.

import { useMemo } from 'react'
import { Path } from '@phosphor-icons/react'
import { chapterOf, findStoryLine, momentOfChapter, parseStoryLine, type StoryEvent } from '@shared/storyline'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { openLine } from '@/features/graph'
import '@/features/plan/storyline.css'

/** The text of an event without the "@" of its mentions */
function plain(e: StoryEvent): string {
  return e.text.replace(/@(?=\p{L})/gu, '')
}

export function StoryLineCard(): React.JSX.Element | null {
  const t = useT()
  const entries = useBook((s) => s.entries)
  const chapters = useBook((s) => s.chapters)
  const activeId = useBook((s) => s.activeChapterId)
  const story = useMemo(() => findStoryLine(entries), [entries])
  const info = useMemo(() => {
    if (!story || !activeId) return null
    const line = parseStoryLine(story.body)
    const m = momentOfChapter(line, activeId, chapters)
    if (m < 0) return null
    const moment = line.moments[m]
    const mine = moment.events.filter((e) => e.links.some((l) => chapterOf(l, chapters) === activeId))
    const lanes = new Set(mine.flatMap((e) => e.lanes))
    const same = moment.events.filter((e) => !mine.includes(e))
    const next = line.moments[m + 1]?.events.filter((e) => e.lanes.some((l) => lanes.has(l))) ?? []
    return { label: moment.label, mine, same, next }
  }, [story, activeId, chapters])
  if (!info) return null

  return (
    <button className="line-mini" onClick={openLine} title={t.plan.line.card}>
      <span className="line-mini-head">
        <Path size={12} />
        {t.plan.line.moment(info.label)}
      </span>
      <p className="line-mini-now">{info.mine.map(plain).join(' ')}</p>
      {info.same.length > 0 && (
        <p className="line-mini-row">
          <b>{t.plan.line.sameTime}:</b> {info.same.map(plain).join(' · ')}
        </p>
      )}
      {info.next.length > 0 && (
        <p className="line-mini-row">
          <b>{t.plan.line.next}:</b> {info.next.map(plain).join(' · ')}
        </p>
      )}
    </button>
  )
}
