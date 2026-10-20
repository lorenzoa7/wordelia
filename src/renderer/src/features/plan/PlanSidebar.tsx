import { useState } from 'react'
import { CaretRight, DotsThree, DownloadSimple, PencilSimple, Plus, SquaresFour, Trash } from '@phosphor-icons/react'
import clsx from 'clsx'
import { IconButton, Menu, MenuItem } from '@/ui'
import { askConfirm, askText } from '@/ui/prompt'
import type { CategoryDef } from '@shared/types'
import { categoryName, useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { useNotes } from './line/model'
import { HideSidebarButton } from '@/features/book/SidebarToggle'
import { SyncButton, SyncResultCard } from './SyncPanel'
import { importNotes } from './importNotes'
import { categoryIcon } from './categoryIcons'

export { categoryIcon }

export function CategoryIcon({ name, size = 15 }: { name: string; size?: number }): React.JSX.Element {
  const Icon = categoryIcon(name)
  return <Icon size={size} />
}

export function PlanSidebar(): React.JSX.Element {
  const t = useT()
  const manifest = useBook((s) => s.manifest)
  const entries = useNotes()
  const activeCategory = useBook((s) => s.activeCategory)
  const activeEntry = useBook((s) => s.activeEntryId)
  const [open, setOpen] = useState<Record<string, boolean>>({})

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
      <SyncButton />
      <SyncResultCard />

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
          const isPage = activeCategory === c.folder && !activeEntry
          const label = categoryName(t, c)
          const fold = (to: boolean): void => setOpen((o) => ({ ...o, [c.folder]: to }))
          // A click on the row shows the category page and its entries. On the page that shows, it folds or unfolds the list.
          const onRow = (): void => {
            if (isPage) return fold(!isOpen)
            useBook.getState().selectCategory(c.folder)
            fold(true)
          }
          return (
            <div key={c.id} className="plan-group">
              <div className={clsx('plan-item plan-cat', isPage && 'is-active')} onClick={onRow}>
                {/* The caret only folds and unfolds; the page stays. */}
                <button
                  className="plan-caret"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation()
                    fold(!isOpen)
                  }}
                  aria-label={isOpen ? t.plan.sidebar.hideEntries(label) : t.plan.sidebar.showEntries(label)}
                  aria-expanded={isOpen}
                >
                  <CaretRight size={10} weight="bold" className={clsx(isOpen && 'is-open')} />
                </button>
                <button
                  className="plan-item-main"
                  aria-current={isPage ? 'page' : undefined}
                  aria-expanded={isOpen}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowRight' && !isOpen) fold(true)
                    else if (e.key === 'ArrowLeft' && isOpen) fold(false)
                    else return
                    e.preventDefault()
                  }}
                >
                  <CategoryIcon name={c.icon} />
                  <span className="plan-item-label">{label}</span>
                  <span className="plan-item-count">{list.length || ''}</span>
                </button>
                <span className="plan-item-add" onClick={(e) => e.stopPropagation()}>
                  <IconButton label={t.plan.sidebar.importNotesInto(label)} onClick={() => void importNotes(c.folder)}>
                    <DownloadSimple size={13} />
                  </IconButton>
                  <IconButton label={t.plan.sidebar.newIn(label)} onClick={() => void addEntry(c.folder)}>
                    <Plus size={13} />
                  </IconButton>
                  <CategoryMenu category={c} notes={list.length} />
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

/** Rename or delete a category (the sidebar row, the category page). */
export function CategoryMenu({ category, notes }: { category: CategoryDef; notes: number }): React.JSX.Element {
  const t = useT()
  const count = useBook((s) => s.manifest?.planning.categories.length ?? 0)
  const label = categoryName(t, category)
  const rename = (): void => {
    void askText({ title: t.plan.sidebar.renameCategory, label: t.plan.name, initial: label, confirm: t.plan.sidebar.rename }).then(
      (name) => name && useBook.getState().renameCategory(category.id, name)
    )
  }
  const remove = async (): Promise<void> => {
    const ok = await askConfirm({ title: t.plan.sidebar.deleteCategoryTitle(label), message: t.plan.sidebar.deleteCategoryMessage(notes), confirm: t.common.delete, danger: true })
    if (ok) await useBook.getState().deleteCategory(category.id)
  }
  return (
    <Menu
      align="end"
      trigger={
        <IconButton label={t.plan.sidebar.categoryMenu(label)}>
          <DotsThree size={14} weight="bold" />
        </IconButton>
      }
    >
      <MenuItem icon={<PencilSimple size={14} />} onSelect={rename}>
        {t.plan.sidebar.renameCategory}
      </MenuItem>
      <MenuItem icon={<Trash size={14} />} danger disabled={count < 2} onSelect={() => void remove()}>
        {count < 2 ? t.plan.sidebar.lastCategory : t.plan.sidebar.deleteCategory}
      </MenuItem>
    </Menu>
  )
}
