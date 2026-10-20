// The open chapter in the story line, under the chapter list: the cards of the chapter, in order,
// and their moments. A click opens the Line view, by chapter.

import { useMemo } from 'react'
import { Clock, Path } from '@phosphor-icons/react'
import { boardView, findStoryLine, parseBoard, placesOf, plainText } from '@shared/storyline'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { openLine } from '@/features/graph'
import { useLineUi } from '@/features/plan/line/model'
import '@/features/plan/line/line.css'

const SHOWN = 4

export function StoryLineCard(): React.JSX.Element | null {
  const t = useT()
  const entries = useBook((s) => s.entries)
  const chapters = useBook((s) => s.chapters)
  const activeId = useBook((s) => s.activeChapterId)
  const story = useMemo(() => findStoryLine(entries), [entries])
  const info = useMemo(() => {
    if (!story || !activeId) return null
    const board = parseBoard(story.body)
    const col = boardView(board, 'chapter', chapters).find((c) => c.chapterId === activeId)
    if (!col?.cards.length) return null
    const moments = placesOf(board, 'order', chapters)
    const names = [...new Set(col.cards.flatMap((c) => (moments.get(c.id) ? [moments.get(c.id)!.title] : [])))]
    return { number: col.number ?? 0, cards: col.cards, moments: names }
  }, [story, activeId, chapters])
  if (!info) return null

  return (
    <button
      className="line-mini"
      onClick={() => {
        useLineUi.getState().setView('chapter')
        openLine()
      }}
      title={t.plan.line.card}
    >
      <span className="line-mini-head">
        <Path size={12} />
        {t.plan.line.inLine(info.number)}
      </span>
      {/* A button holds only phrasing content: spans, shown as blocks. */}
      <span className="line-mini-list">
        {info.cards.slice(0, SHOWN).map((c) => (
          <span key={c.id} className="line-mini-item">
            {plainText(c.text)}
          </span>
        ))}
      </span>
      {info.cards.length > SHOWN && <span className="line-mini-more">{t.plan.line.more(info.cards.length - SHOWN)}</span>}
      {info.moments.length > 0 && (
        <span className="line-mini-moments" title={info.moments.join(' · ')}>
          <Clock size={11} aria-label={t.plan.line.momentField} />
          <span>{info.moments.join(' · ')}</span>
        </span>
      )}
    </button>
  )
}
