import { useMemo, useState } from 'react'
import {
  ArrowsClockwise,
  CaretRight,
  DownloadSimple,
  Folder,
  GlobeHemisphereWest,
  MapPin,
  Notebook,
  Path,
  Plus,
  SquaresFour,
  UserCircle,
  type IconProps
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { IconButton, Tooltip } from '@/ui'
import { askText } from '@/ui/prompt'
import { categoryName, useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { HideSidebarButton } from '@/features/book/SidebarToggle'
import { changedChapters, startPlanningSync } from './sync'
import { importNotes } from './importNotes'

const CATEGORY_ICONS: Record<string, React.ComponentType<IconProps>> = {
  UserCircle,
  MapPin,
  GlobeHemisphereWest,
  Path,
  Notebook,
  Folder
}

/** The icon of a category; an unknown name gets the folder. */
export function categoryIcon(name: string): React.ComponentType<IconProps> {
  return CATEGORY_ICONS[name] ?? Folder
}

export function CategoryIcon({ name, size = 15 }: { name: string; size?: number }): React.JSX.Element {
  const Icon = categoryIcon(name)
  return <Icon size={size} />
}

export function PlanSidebar(): React.JSX.Element {
  const t = useT()
  const manifest = useBook((s) => s.manifest)
  const entries = useBook((s) => s.entries)
  const activeCategory = useBook((s) => s.activeCategory)
  const activeEntry = useBook((s) => s.activeEntryId)
  const chapters = useBook((s) => s.chapters)
  const syncState = useBook((s) => s.syncState)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const pending = useMemo(() => changedChapters().length, [chapters, syncState]) // eslint-disable-line react-hooks/exhaustive-deps

  const categories = manifest?.planning.categories ?? []
  const isOverview = !activeEntry && !categories.some((c) => c.folder === activeCategory)

  const addEntry = async (folder: string): Promise<void> => {
    const e = await useBook.getState().createEntry(folder, t.plan.newEntryName)
    useBook.getState().selectEntry(e.id)
    setOpen((o) => ({ ...o, [folder]: true }))
    setTimeout(() => document.querySelector<HTMLInputElement>('.entry-name')?.select(), 80)
  }

  return (
    <div className="sidebar plan-sidebar">
      <div className="sidebar-head">
        <span className="caps">{t.plan.sidebar.planning}</span>
        <span className="sidebar-head-tools">
          <HideSidebarButton />
        </span>
      </div>

      {/* The planning sync: the AI reads the changed chapters and proposes changes to the notes. */}
      <Tooltip
        side="right"
        label={
          <span className="sync-tip">
            <span>{t.plan.sidebar.updateNotesHint}</span>
            <b>{pending ? t.plan.sidebar.changedChapters(pending) : t.plan.sidebar.upToDate}</b>
          </span>
        }
      >
        <button
          className={clsx('sync-btn', pending > 0 && 'has-pending')}
          aria-label={t.plan.sidebar.sync}
          onClick={() => void startPlanningSync()}
        >
          <ArrowsClockwise size={15} />
          <span className="sync-text">
            <span className="sync-label">{t.plan.sidebar.sync}</span>
          </span>
          {pending > 0 && <span className="sync-count">{pending}</span>}
        </button>
      </Tooltip>

      <nav className="plan-nav">
        <button
          className={clsx('plan-item plan-item-top', isOverview && 'is-active')}
          aria-current={isOverview ? 'page' : undefined}
          onClick={() => useBook.getState().selectCategory(null)}
        >
          <SquaresFour size={15} />
          <span className="plan-item-label">{t.plan.sidebar.overview}</span>
        </button>
        <div className="plan-divider" />
        {categories.map((c) => {
          const list = entries.filter((e) => e.category === c.folder).sort((a, b) => a.name.localeCompare(b.name))
          const isOpen = open[c.folder] ?? (activeCategory === c.folder || list.some((e) => e.id === activeEntry))
          const label = categoryName(t, c)
          return (
            <div key={c.id} className="plan-group">
              <div className={clsx('plan-item', activeCategory === c.folder && !activeEntry && 'is-active')}>
                <button
                  className="plan-caret"
                  onClick={() => setOpen((o) => ({ ...o, [c.folder]: !isOpen }))}
                  aria-label={t.plan.sidebar.showEntries(label)}
                  aria-expanded={isOpen}
                >
                  <CaretRight size={10} className={clsx(isOpen && 'is-open')} />
                </button>
                <button
                  className="plan-item-main"
                  aria-current={activeCategory === c.folder && !activeEntry ? 'page' : undefined}
                  onClick={() => useBook.getState().selectCategory(c.folder)}
                >
                  <CategoryIcon name={c.icon} />
                  <span className="plan-item-label">{label}</span>
                  <span className="plan-item-count">{list.length || ''}</span>
                </button>
                <span className="plan-item-add">
                  <IconButton label={t.plan.sidebar.importNotesInto(label)} onClick={() => void importNotes(c.folder)}>
                    <DownloadSimple size={13} />
                  </IconButton>
                  <IconButton label={t.plan.sidebar.newIn(label)} onClick={() => void addEntry(c.folder)}>
                    <Plus size={13} />
                  </IconButton>
                </span>
              </div>
              {isOpen && (
                <div className="plan-entries">
                  {list.map((e) => (
                    <button
                      key={e.id}
                      aria-current={e.id === activeEntry ? 'page' : undefined}
                      className={clsx('plan-entry', e.id === activeEntry && 'is-active')}
                      onClick={() => useBook.getState().selectEntry(e.id)}
                    >
                      {e.name}
                    </button>
                  ))}
                  {list.length === 0 && <span className="plan-empty">{t.plan.sidebar.empty}</span>}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <button
        className="sidebar-add"
        onClick={() =>
          void askText({
            title: t.plan.sidebar.newCategory,
            label: t.plan.name,
            placeholder: t.plan.sidebar.categoryPlaceholder,
            confirm: t.plan.sidebar.add
          }).then((name) => name && useBook.getState().addCategory(name))
        }
      >
        <Plus size={13} /> {t.plan.sidebar.addCategory}
      </button>
    </div>
  )
}
