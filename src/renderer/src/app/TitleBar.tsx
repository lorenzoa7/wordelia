import { useLayoutEffect, useRef } from 'react'
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
import { getT, useT } from '@/lib/i18n'
import { askConfirm } from '@/ui/prompt'
import { installUpdate, useUpdate } from '@/lib/update'
import { Logo } from './Logo'
import { ProviderBadge } from './ProviderBadge'
import { ChatAttentionDot } from '@/features/chat/status'

const VIEWS: Array<{ id: BookView; icon: React.ReactNode; key: string }> = [
  { id: 'write', icon: <PenNib size={14} />, key: 'Ctrl+1' },
  { id: 'plan', icon: <Notebook size={14} />, key: 'Ctrl+2' }
]

/** Close the book. When some text is not on disk, ask first, like the close of the window. */
async function closeBookNow(): Promise<void> {
  if (!(await useBook.getState().close())) {
    const t = getT()
    const d = t.main.closeDialog
    const anyway = await askConfirm({
      title: d.message,
      // Plain words: the error of the system (EPERM, the full path) is in the tooltip of the save state.
      message: `${d.fileNotWritten} ${d.syncAppHint}`,
      confirm: d.closeAnyway,
      cancel: t.app.keepBookOpen,
      danger: true
    })
    if (!anyway || !(await useBook.getState().close({ force: true }))) return
  }
  await useApp.getState().refreshLibrary()
}
const closeBook = (): void => void closeBookNow()

/** The width that the children of a row need, with their margins, the gaps and the padding of the row. */
function neededWidth(row: HTMLElement): number {
  const cs = getComputedStyle(row)
  const kids = [...row.children] as HTMLElement[]
  const margins = (k: HTMLElement): number => parseFloat(getComputedStyle(k).marginLeft) + parseFloat(getComputedStyle(k).marginRight)
  const gaps = (parseFloat(cs.columnGap) || 0) * Math.max(0, kids.length - 1)
  return kids.reduce((n, k) => n + k.getBoundingClientRect().width + margins(k), 0) + gaps + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
}

/**
 * The tools on the right never cover the view tabs. When they do not fit in their column (a narrow
 * window, a long language, the update badge and the AI warning together), the AI warning shows only
 * its icon (`fit-1`), then the update badge too (`fit-2`). Their tooltips keep the full text.
 */
function useFitTools(): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const row = ref.current
    if (!row) return
    const fit = (): void => {
      row.classList.remove('fit-1', 'fit-2')
      for (const level of ['fit-1', 'fit-2']) {
        if (neededWidth(row) <= row.clientWidth + 0.5) return
        row.classList.add(level)
      }
    }
    fit()
    // The column has the width of its grid track, not of its content: a class change here never resizes it.
    const size = new ResizeObserver(fit)
    size.observe(row)
    // A badge that comes or goes, or a new language.
    const content = new MutationObserver(fit)
    content.observe(row, { childList: true, subtree: true, characterData: true })
    return () => {
      size.disconnect()
      content.disconnect()
    }
  }, [])
  return ref
}

/** `inert`: a modal screen (the welcome) is open, so the title bar takes no focus and no clicks. */
export function TitleBar({ inert = false }: { inert?: boolean }): React.JSX.Element {
  const t = useT()
  const root = useBook((s) => s.root)
  const title = useBook((s) => s.manifest?.title)
  const view = useBook((s) => s.view)
  const setView = useBook((s) => s.setView)
  const ui = useApp((s) => s.settings?.ui)
  const setUi = useApp((s) => s.setUi)
  const openSettings = useUi((s) => s.openSettings)
  const setExportOpen = useUi((s) => s.setExportOpen)
  const tools = useFitTools()

  return (
    <header className={clsx('titlebar', root && 'has-book')} inert={inert}>
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

      <div className="titlebar-right" ref={tools}>
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
      <button className="update-badge" aria-label={t.app.update.badge} onClick={installUpdate}>
        <ArrowCircleUp size={14} weight="bold" />
        <span>{t.app.update.badge}</span>
      </button>
    </Tooltip>
  )
}
