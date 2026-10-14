import { motion } from 'motion/react'
import {
  BookOpenText,
  CaretDown,
  ChatCircleText,
  Export,
  FolderOpen,
  Gear,
  Notebook,
  PenNib,
  SidebarSimple,
  SignOut,
  SlidersHorizontal
} from '@phosphor-icons/react'
import clsx from 'clsx'
import { IconButton, Menu, MenuItem, MenuSeparator } from '@/ui'
import { useApp } from '@/stores/app'
import { useBook, type BookView } from '@/stores/book'
import { useUi } from '@/stores/ui'
import { invoke } from '@/lib/api'
import { Logo } from './Logo'
import { ProviderBadge } from './ProviderBadge'

const VIEWS: Array<{ id: BookView; label: string; icon: React.ReactNode; key: string }> = [
  { id: 'write', label: 'Write', icon: <PenNib size={14} />, key: 'Ctrl+1' },
  { id: 'plan', label: 'Plan', icon: <Notebook size={14} />, key: 'Ctrl+2' }
]

export function TitleBar(): React.JSX.Element {
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
            label={ui?.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
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
          aria-label="Library"
          title={root ? 'Back to the library' : undefined}
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
                Book settings
              </MenuItem>
              <MenuItem icon={<Export size={15} />} shortcut="Ctrl+Shift+E" onSelect={() => setExportOpen(true)}>
                Export…
              </MenuItem>
              <MenuItem icon={<FolderOpen size={15} />} onSelect={() => void invoke('book:reveal', root)}>
                Show folder
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<SignOut size={15} />}
                onSelect={() => void useBook.getState().close().then(() => useApp.getState().refreshLibrary())}
              >
                Close book
              </MenuItem>
            </Menu>
          </>
        )}
      </div>

      {root && (
        <nav className="view-switch no-drag" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={clsx('view-tab', view === v.id && 'is-active')}
              aria-current={view === v.id ? 'page' : undefined}
              onClick={() => setView(v.id)}
              title={`${v.label} (${v.key})`}
            >
              {v.icon}
              <span>{v.label}</span>
              {view === v.id && <motion.span layoutId="view-underline" className="view-underline" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            </button>
          ))}
        </nav>
      )}

      <div className="titlebar-right no-drag">
        <ProviderBadge />
        {root && (
          <IconButton
            label={ui?.chatOpen ? 'Hide chat' : 'Show chat'}
            shortcut="Ctrl+L"
            active={ui?.chatOpen}
            onClick={() => setUi({ chatOpen: !ui?.chatOpen })}
          >
            <ChatCircleText size={17} />
          </IconButton>
        )}
        <IconButton label="Settings" shortcut="Ctrl+," onClick={() => openSettings()}>
          <Gear size={17} />
        </IconButton>
      </div>
    </header>
  )
}
