// The map page of the Plan view: all entries as a graph, linked by their mentions.

import { useMemo, useRef, useState } from 'react'
import { BookOpenText, Graph, MagnifyingGlass, Path, SquaresFour, X } from '@phosphor-icons/react'
import clsx from 'clsx'
import { markdownToPlain } from '@shared/book'
import { isStoryLine } from '@shared/storyline'
import { buildPlanningMap, filterMap, searchMap, type MapNode } from '@shared/planning/graph'
import { Button, Tooltip } from '@/ui'
import { categoryName, folderCategoryName, useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { CategoryIcon } from '@/features/plan/PlanSidebar'
import { BuildPlanningButton } from '@/features/plan/SyncPanel'
import { MapCanvas } from './MapCanvas'
import { openCards, openEntryFromMap, openLine, openMap } from './nav'
import './graph.css'

interface MapUi {
  /** Category folders that the map does not show */
  hidden: string[]
  chapters: boolean
  query: string
}

/** The filters of each book, for this session. */
const uiMemory = new Map<string, MapUi>()

/** "Cards | Map" on the Plan overview and on the map. */
export function PlanViewSwitch({ active }: { active: 'cards' | 'map' | 'line' }): React.JSX.Element {
  const t = useT()
  return (
    <div className="plan-switch" role="group" aria-label={t.plan.map.views}>
      <button className={clsx('plan-switch-btn', active === 'cards' && 'is-active')} aria-pressed={active === 'cards'} onClick={openCards}>
        <SquaresFour size={14} />
        <span>{t.plan.map.cards}</span>
      </button>
      <button className={clsx('plan-switch-btn', active === 'map' && 'is-active')} aria-pressed={active === 'map'} onClick={openMap}>
        <Graph size={14} />
        <span>{t.plan.map.map}</span>
      </button>
      <button className={clsx('plan-switch-btn', active === 'line' && 'is-active')} aria-pressed={active === 'line'} onClick={openLine}>
        <Path size={14} />
        <span>{t.plan.map.line}</span>
      </button>
    </div>
  )
}

function firstSentence(md: string): string {
  const text = markdownToPlain(md).replace(/\s+/g, ' ').trim()
  const m = /^(.{0,160}?[.!?])(\s|$)/.exec(text)
  return m ? m[1] : text.length > 160 ? `${text.slice(0, 158)}…` : text
}

export function MapView(): React.JSX.Element {
  const t = useT()
  const root = useBook((s) => s.root) ?? ''
  // The story line links to everyone: it is not a node of the map.
  const all = useBook((s) => s.entries)
  const entries = useMemo(() => all.filter((e) => !isStoryLine(e)), [all])
  const chapters = useBook((s) => s.chapters)
  const categories = useBook((s) => s.manifest?.planning.categories) ?? []
  const [ui, setUiState] = useState<MapUi>(() => uiMemory.get(root) ?? { hidden: [], chapters: false, query: '' })
  const setUi = (patch: Partial<MapUi>): void =>
    setUiState((old) => {
      const next = { ...old, ...patch }
      uiMemory.set(root, next)
      return next
    })
  const searchRef = useRef<HTMLInputElement>(null)

  const full = useMemo(
    () => buildPlanningMap(entries, ui.chapters ? { chapters } : {}),
    // Chapters matter only when they are on the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, ui.chapters ? chapters : null, ui.chapters]
  )
  const hidden = useMemo(() => new Set(ui.hidden), [ui.hidden])
  const map = useMemo(() => (hidden.size ? filterMap(full, (n) => n.kind === 'chapter' || !hidden.has(n.category ?? '')) : full), [full, hidden])
  const matches = useMemo(() => searchMap(map, ui.query), [map, ui.query])

  const slots = useMemo(() => new Map(categories.map((c, i) => [c.folder, i])), [categories])
  const byFolder = useMemo(() => new Map(categories.map((c) => [c.folder, c])), [categories])
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of entries) m.set(e.category, (m.get(e.category) ?? 0) + 1)
    return m
  }, [entries])
  const chips = categories.filter((c) => counts.get(c.folder))

  const shownEntries = map.nodes.filter((n) => n.kind === 'entry').length
  const colorOf = (n: MapNode): number => (n.kind === 'chapter' ? -1 : (slots.get(n.category ?? '') ?? 7))
  const labelOf = (n: MapNode): string => (n.kind === 'chapter' ? `${n.order + 1}. ${n.label}` : n.label)
  const iconOf = (n: MapNode): string => byFolder.get(n.category ?? '')?.icon ?? 'Folder'
  const catLabel = (folder: string): string => folderCategoryName(t, folder, categories)

  const open = (n: MapNode): void => {
    if (n.kind === 'chapter') useBook.getState().selectChapter(n.ref)
    else openEntryFromMap(n.ref)
  }

  const toggle = (folder: string): void => setUi({ hidden: hidden.has(folder) ? ui.hidden.filter((f) => f !== folder) : [...ui.hidden, folder] })

  const renderCard = (n: MapNode): React.ReactNode => {
    if (n.kind === 'chapter') {
      return (
        <>
          <span className="map-card-kind">
            <BookOpenText size={12} /> {t.plan.map.chapter(n.order + 1)}
          </span>
          <span className="map-card-name">{n.label}</span>
          <span className="map-card-links">{t.plan.map.links(n.degree)}</span>
        </>
      )
    }
    const e = entryById.get(n.ref)
    const about = e ? e.summary || firstSentence(e.body) : ''
    return (
      <>
        <span className={clsx('map-card-kind', `slot-${colorOf(n) % 8}`)}>
          <CategoryIcon name={iconOf(n)} size={12} /> {catLabel(n.category ?? '')}
        </span>
        <span className="map-card-name">{n.label}</span>
        {about && <span className="map-card-about">{about}</span>}
        <span className="map-card-links">{t.plan.map.links(n.degree)}</span>
      </>
    )
  }

  return (
    <div className="plan-scroll map-wrap">
      <div className="map-page">
        <header className="map-head">
          <div className="map-title-row">
            <div className="map-title">
              <h1>{t.plan.map.map}</h1>
              {entries.length > 0 && <p className="map-stats">{t.plan.map.stats(shownEntries, map.edges.length)}</p>}
            </div>
            <PlanViewSwitch active="map" />
          </div>
          {entries.length > 0 && (
            <div className="map-tools">
              <label className="map-search">
                <MagnifyingGlass size={14} aria-hidden />
                <input
                  ref={searchRef}
                  value={ui.query}
                  placeholder={t.plan.map.searchPlaceholder}
                  aria-label={t.plan.map.search}
                  spellCheck={false}
                  onChange={(e) => setUi({ query: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches[0]) {
                      const n = map.nodes.find((x) => x.id === matches[0])
                      if (n) open(n)
                    } else if (e.key === 'Escape' && ui.query) {
                      e.stopPropagation()
                      setUi({ query: '' })
                    }
                  }}
                />
                {ui.query.trim() && (
                  <>
                    <span className="map-search-count" aria-live="polite">
                      {t.plan.map.matches(matches.length)}
                    </span>
                    <button
                      className="map-search-clear"
                      aria-label={t.plan.map.clearSearch}
                      onClick={() => {
                        setUi({ query: '' })
                        searchRef.current?.focus()
                      }}
                    >
                      <X size={11} />
                    </button>
                  </>
                )}
              </label>
              <div className="map-chips" role="group" aria-label={t.plan.map.categories}>
                {chips.map((c) => {
                  const shown = !hidden.has(c.folder)
                  const label = categoryName(t, c)
                  return (
                    <Tooltip key={c.id} label={t.plan.map.toggleCategory(label, shown)}>
                      <button className={clsx('map-chip', `slot-${(slots.get(c.folder) ?? 7) % 8}`, !shown && 'is-off')} aria-pressed={shown} onClick={() => toggle(c.folder)}>
                        <CategoryIcon name={c.icon} size={13} />
                        <span>{label}</span>
                        <span className="map-chip-count">{counts.get(c.folder)}</span>
                      </button>
                    </Tooltip>
                  )
                })}
                {chapters.length > 0 && (
                  <>
                    <span className="map-chips-rule" aria-hidden />
                    <Tooltip label={t.plan.map.chaptersHint}>
                      <button className={clsx('map-chip map-chip-chapters', !ui.chapters && 'is-off')} aria-pressed={ui.chapters} onClick={() => setUi({ chapters: !ui.chapters })}>
                        <BookOpenText size={13} />
                        <span>{t.plan.map.chapters}</span>
                        <span className="map-chip-count">{chapters.length}</span>
                      </button>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          )}
        </header>

        <div className="map-sheet grain">
          {entries.length === 0 ? (
            <div className="map-empty">
              <Graph size={40} weight="thin" aria-hidden />
              <h2>{t.plan.map.emptyTitle}</h2>
              <p>{t.plan.map.emptyText}</p>
              {chapters.some((c) => c.body.trim()) && <BuildPlanningButton />}
            </div>
          ) : map.nodes.length === 0 ? (
            <div className="map-empty">
              <p>{t.plan.map.allHidden}</p>
              <Button size="sm" onClick={() => setUi({ hidden: [] })}>
                {t.plan.map.showAll}
              </Button>
            </div>
          ) : (
            <>
              <MapCanvas
                map={map}
                memoryKey={root}
                colorOf={colorOf}
                labelOf={labelOf}
                iconOf={iconOf}
                matches={matches}
                ariaLabel={t.plan.map.label(shownEntries, map.edges.length)}
                onOpen={open}
                renderCard={renderCard}
                texts={{ zoomIn: t.plan.map.zoomIn, zoomOut: t.plan.map.zoomOut, fit: t.plan.map.fit }}
              />
              {map.edges.length === 0 && (
                <div className="map-hint" role="note">
                  <strong>{t.plan.map.noLinksTitle}</strong>
                  <span>{t.plan.map.noLinks}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
