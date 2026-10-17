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
  Scroll,
  SignOut,
  SlidersHorizontal
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { IconButton, Menu, MenuItem, MenuSeparator, Tooltip } from '@/ui'
import { useApp } from '@/stores/app'
import { useBook, type BookView } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { invoke } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { installUpdate, useUpdate } from '@/lib/update'
import { Logo } from './Logo'
import { ProviderBadge } from './ProviderBadge'
import { ChatAttentionDot } from '@/features/chat/status'

const VIEWS: Array<{ id: BookView; icon: React.ReactNode; key: string }> = [
  { id: 'write', icon: <PenNib size={14} />, key: 'Ctrl+1' },
  { id: 'plan', icon: <Notebook size={14} />, key: 'Ctrl+2' }
]

const closeBook = (): void => void useBook.getState().close().then(() => useApp.getState().refreshLibrary())

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
      {/* The wordmark at the far left; the sidebar toggle is in the sidebar header. */}
      <div className="titlebar-left">
        {root ? (
          <Tooltip label={t.app.backToLibrary}>
            <button className="titlebar-logo no-drag" onClick={closeBook} aria-label={t.app.backToLibrary}>
              <Logo height={15} />
            </button>
          </Tooltip>
        ) : (
          <span className="titlebar-logo">
            <Logo height={15} />
          </span>
        )}
        {root && (
          <>
            <span className="titlebar-sep" aria-hidden />
            <Menu
              trigger={
                <button className="titlebar-book no-drag">
                  <BookOpenText size={14} className="icon-book" />
                  <span className="titlebar-book-title">{title}</span>
                  <CaretDown size={11} />
                </button>
              }
            >
              <MenuItem icon={<SlidersHorizontal size={15} />} onSelect={() => openSettings('book')}>
                {t.app.bookSettings}
              </MenuItem>
              <MenuItem icon={<Scroll size={15} />} onSelect={() => useUi.getState().openSettings('rules')}>
                {t.plan.writingRules}
              </MenuItem>
              <MenuItem icon={<Export size={15} />} shortcut="Ctrl+Shift+E" onSelect={() => setExportOpen(true)}>
                {t.app.exportBook}
              </MenuItem>
              <MenuItem icon={<FolderOpen size={15} />} onSelect={() => void invoke('book:reveal', root)}>
                {t.app.showFolder}
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<SignOut size={15} />} onSelect={closeBook}>
                {t.app.closeBook}
              </MenuItem>
            </Menu>
          </>
        )}
      </div>

      {root && (
        <nav className="view-switch no-drag" aria-label={t.app.viewNav}>
          {VIEWS.map((v) => (
            <Tooltip key={v.id} label={t.app.views[v.id]} shortcut={v.key}>
              <button
                className={clsx('view-tab', view === v.id && 'is-active')}
                aria-current={view === v.id ? 'page' : undefined}
                aria-keyshortcuts={v.key.replace('Ctrl', 'Control')}
                onClick={() => setView(v.id)}
              >
                {v.icon}
                <span>{t.app.views[v.id]}</span>
                {view === v.id && <motion.span layoutId="view-underline" className="view-underline" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              </button>
            </Tooltip>
          ))}
        </nav>
      )}

      <div className="titlebar-right">
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
    <Tooltip label={t.app.update.badgeHint(u.version)}>
      <button className="update-badge" onClick={installUpdate}>
        <ArrowCircleUp size={14} weight="bold" />
        <span>{t.app.update.badge}</span>
      </button>
    </Tooltip>
  )
}
