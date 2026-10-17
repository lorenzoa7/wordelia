import { motion } from 'motion/react'
import {
  ArrowCircleUp,
  BookOpenText,
  CaretDown,
  ChatCircleText,
  Export,
  FolderOpen,
  Gear,
  Notebook,
  PenNib,
  SidebarSimple,
  Scroll,
  SignOut,
  SlidersHorizontal
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { IconButton, Menu, MenuItem, MenuSeparator } from '@/ui'
import { useApp } from '@/stores/app'
import { useBook, type BookView } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { invoke } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { installUpdate, useUpdate } from '@/lib/update'
import { Logo } from './Logo'
import { ProviderBadge } from './ProviderBadge'
import { RULES_CATEGORY } from '@/features/plan/PlanSidebar'
import { ChatAttentionDot } from '@/features/chat/status'

const VIEWS: Array<{ id: BookView; icon: React.ReactNode; key: string }> = [
  { id: 'write', icon: <PenNib size={14} />, key: 'Ctrl+1' },
  { id: 'plan', icon: <Notebook size={14} />, key: 'Ctrl+2' }
]

export function TitleBar(): React.JSX.Element {
  const t = useT()
  const root = useBook((s) => s.root)
  const title = useBook((s) => s.manifest?.title)
  const view = useBook((s) => s.view)
  const setView = useBook((s) => s.setView)
  const ui = useApp((s) => s.settings?.ui)
  const setUi = useApp((s) => s.setUi)
  const openSettings = useUi((s) => s.openSettings)
  const setExportOpen = useUi((s) => s.setExportOpen)

  return (
    <header className={clsx('titlebar', root && 'has-book')}>
      <div className="titlebar-left">
        {root && (
          <IconButton
            label={ui?.sidebarOpen ? t.app.hideSidebar : t.app.showSidebar}
            shortcut="Ctrl+\"
            onClick={() => setUi({ sidebarOpen: !ui?.sidebarOpen })}
            className="no-drag"
          >
            <SidebarSimple size={17} />
          </IconButton>
        )}
        <button
          className="titlebar-logo no-drag"
          onClick={() => root && void useBook.getState().close().then(() => useApp.getState().refreshLibrary())}
          aria-label={t.app.library}
          title={root ? t.app.backToLibrary : undefined}
        >
          <Logo height={15} />
        </button>
        {root && (
          <>
            <span className="titlebar-sep" aria-hidden>
              /
            </span>
            <Menu
              trigger={
                <button className="titlebar-book no-drag">
                  <BookOpenText size={14} />
                  <span>{title}</span>
                  <CaretDown size={11} />
                </button>
              }
            >
              <MenuItem icon={<SlidersHorizontal size={15} />} onSelect={() => openSettings('book')}>
                {t.app.bookSettings}
              </MenuItem>
              <MenuItem icon={<Scroll size={15} />} onSelect={() => useBook.getState().selectCategory(RULES_CATEGORY)}>
                {t.plan.writingRules}
              </MenuItem>
              <MenuItem icon={<Export size={15} />} shortcut="Ctrl+Shift+E" onSelect={() => setExportOpen(true)}>
                {t.app.exportBook}
              </MenuItem>
              <MenuItem icon={<FolderOpen size={15} />} onSelect={() => void invoke('book:reveal', root)}>
                {t.app.showFolder}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<SignOut size={15} />}
                onSelect={() => void useBook.getState().close().then(() => useApp.getState().refreshLibrary())}
              >
                {t.app.closeBook}
              </MenuItem>
            </Menu>
          </>
        )}
      </div>

      {root && (
        <nav className="view-switch no-drag" aria-label={t.app.viewNav}>
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={clsx('view-tab', view === v.id && 'is-active')}
              aria-current={view === v.id ? 'page' : undefined}
              onClick={() => setView(v.id)}
              title={`${t.app.views[v.id]} (${v.key})`}
            >
              {v.icon}
              <span>{t.app.views[v.id]}</span>
              {view === v.id && <motion.span layoutId="view-underline" className="view-underline" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            </button>
          ))}
        </nav>
      )}

      <div className="titlebar-right no-drag">
        <UpdateBadge />
        <ProviderBadge />
        {root && (
          <IconButton
            label={ui?.chatOpen ? t.app.hideChat : t.app.showChat}
            shortcut="Ctrl+L"
            active={ui?.chatOpen}
            onClick={() => setUi({ chatOpen: !ui?.chatOpen })}
            className="chat-toggle"
          >
            <ChatCircleText size={17} />
            <ChatAttentionDot hidden={ui?.chatOpen} />
          </IconButton>
        )}
        <IconButton label={t.common.settings} shortcut="Ctrl+," onClick={() => openSettings()}>
          <Gear size={17} />
        </IconButton>
      </div>
    </header>
  )
}

/** A ready update: one click saves, restarts and installs it. */
function UpdateBadge(): React.JSX.Element | null {
  const t = useT()
  const u = useUpdate()
  if (u.state !== 'ready') return null
  return (
    <button className="update-badge" onClick={installUpdate} title={t.app.update.badgeHint(u.version)}>
      <ArrowCircleUp size={14} weight="bold" />
      {t.app.update.badge}
    </button>
  )
}
