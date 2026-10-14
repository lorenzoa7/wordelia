import { useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  CaretRight,
  Folder,
  GlobeHemisphereWest,
  MapPin,
  Notebook,
  Path,
  Plus,
  Scroll,
  SquaresFour,
  UserCircle,
  type IconProps
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { IconButton, Tooltip } from '@/ui'
import { askText } from '@/ui/prompt'
import { useBook } from '@/stores/book'
import { changedChapters, startPlanningSync } from './sync'

const CATEGORY_ICONS: Record<string, React.ComponentType<IconProps>> = {
  UserCircle,
  MapPin,
  GlobeHemisphereWest,
  Path,
  Notebook,
  Folder
}

export function CategoryIcon({ name, size = 15 }: { name: string; size?: number }): React.JSX.Element {
  const Icon = CATEGORY_ICONS[name] ?? Folder
  return <Icon size={size} />
}

export const RULES_CATEGORY = '__rules'

export function PlanSidebar(): React.JSX.Element {
  const manifest = useBook((s) => s.manifest)
  const entries = useBook((s) => s.entries)
  const activeCategory = useBook((s) => s.activeCategory)
  const activeEntry = useBook((s) => s.activeEntryId)
  const chapters = useBook((s) => s.chapters)
  const syncState = useBook((s) => s.syncState)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const pending = useMemo(() => changedChapters().length, [chapters, syncState]) // eslint-disable-line react-hooks/exhaustive-deps

  const categories = manifest?.planning.categories ?? []

  const addEntry = async (folder: string): Promise<void> => {
    const e = await useBook.getState().createEntry(folder, 'New entry')
    useBook.getState().selectEntry(e.id)
    setOpen((o) => ({ ...o, [folder]: true }))
    setTimeout(() => document.querySelector<HTMLInputElement>('.entry-name')?.select(), 80)
  }

  return (
    <div className="sidebar plan-sidebar">
      <div className="sidebar-head">
        <span className="caps">Planning</span>
      </div>

      <Tooltip label={pending ? `${pending} chapter${pending > 1 ? 's' : ''} changed since the last sync` : 'The planning is up to date'} side="right">
        <button className={clsx('sync-btn', pending > 0 && 'has-pending')} onClick={() => void startPlanningSync()}>
          <ArrowsClockwise size={15} />
          <span>Sync with manuscript</span>
          {pending > 0 && <span className="sync-count">{pending}</span>}
        </button>
      </Tooltip>

      <nav className="plan-nav">
        <button className={clsx('plan-item', !activeCategory && !activeEntry && 'is-active')} onClick={() => useBook.getState().selectCategory(null)}>
          <SquaresFour size={15} />
          <span className="plan-item-label">Overview</span>
        </button>
        <button
          className={clsx('plan-item', activeCategory === RULES_CATEGORY && 'is-active')}
          onClick={() => useBook.getState().selectCategory(RULES_CATEGORY)}
        >
          <Scroll size={15} />
          <span className="plan-item-label">Writing rules</span>
        </button>
        <div className="plan-divider" />
        {categories.map((c) => {
          const list = entries.filter((e) => e.category === c.folder).sort((a, b) => a.name.localeCompare(b.name))
          const isOpen = open[c.folder] ?? (activeCategory === c.folder || list.some((e) => e.id === activeEntry))
          return (
            <div key={c.id} className="plan-group">
              <div className={clsx('plan-item', activeCategory === c.folder && !activeEntry && 'is-active')}>
                <button
                  className="plan-caret"
                  onClick={() => setOpen((o) => ({ ...o, [c.folder]: !isOpen }))}
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                >
                  <CaretRight size={10} className={clsx(isOpen && 'is-open')} />
                </button>
                <button className="plan-item-main" onClick={() => useBook.getState().selectCategory(c.folder)}>
                  <CategoryIcon name={c.icon} />
                  <span className="plan-item-label">{c.name}</span>
                  <span className="plan-item-count">{list.length || ''}</span>
                </button>
                <span className="plan-item-add">
                  <IconButton label={`New in ${c.name}`} onClick={() => void addEntry(c.folder)}>
                    <Plus size={13} />
                  </IconButton>
                </span>
              </div>
              {isOpen && (
                <div className="plan-entries">
                  {list.map((e) => (
                    <button
                      key={e.id}
                      className={clsx('plan-entry', e.id === activeEntry && 'is-active')}
                      onClick={() => useBook.getState().selectEntry(e.id)}
                    >
                      {e.name}
                    </button>
                  ))}
                  {list.length === 0 && <span className="plan-empty">Empty</span>}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <button
        className="sidebar-add"
        onClick={() =>
          void askText({ title: 'New category', label: 'Name', placeholder: 'Objects, Factions, Timeline…', confirm: 'Add' }).then(
            (name) => name && useBook.getState().addCategory(name)
          )
        }
      >
        <Plus size={13} /> Add category
      </button>
    </div>
  )
}
