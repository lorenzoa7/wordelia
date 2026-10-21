import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { DotsThree, FileArrowUp, FolderOpen, MagnifyingGlass, Plus, WarningCircle, X } from '@phosphor-icons/react'
import type { Messages } from '@shared/i18n'
import type { FolderInfo, OpenBookOptions } from '@shared/ipc'
import type { LibraryItem } from '@shared/types'
import { Button, Dialog, Field, IconButton, Menu, MenuItem, Select } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { Logo } from '@/app/Logo'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { invoke, isE2E } from '@/lib/api'
import { getT, useT } from '@/lib/i18n'
import { NewBookDialog, guessLanguage, languageOptions } from './NewBookDialog'
import { ImportDialog } from './ImportDialog'
import './library.css'

function timeAgo(t: Messages, iso: string): string {
  const rtf = new Intl.RelativeTimeFormat(t.common.locale, { numeric: 'auto' })
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return t.library.justNow
  if (d < 3600) return rtf.format(-Math.floor(d / 60), 'minute')
  if (d < 86400) return rtf.format(-Math.floor(d / 3600), 'hour')
  if (d < 86400 * 30) return rtf.format(-Math.floor(d / 86400), 'day')
  return new Date(iso).toLocaleDateString(t.common.locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function openBookAt(root: string, opts: OpenBookOptions = {}): Promise<void> {
  try {
    // The language is for a new manifest only: a damaged one that the app cannot read, or a folder that becomes a book.
    const snap = await invoke('book:open', root, { language: guessLanguage(), ...opts })
    useBook.getState().open(snap)
  } catch (err) {
    toast(getT().library.couldNotOpen(err instanceof Error ? err.message : String(err)), { kind: 'error' })
  }
}

/** A folder that the writer chose, that is not a book yet */
interface PlainFolder {
  path: string
  info: Extract<FolderInfo, { kind: 'folder' }>
}

export function LibraryView(): React.JSX.Element {
  const t = useT()
  const library = useApp((s) => s.library)
  const refresh = useApp((s) => s.refreshLibrary)
  const newOpen = useUi((s) => s.newBookOpen)
  const setNewOpen = useUi((s) => s.setNewBookOpen)
  const [importPath, setImportPath] = useState<string | null>(null)
  const [plain, setPlain] = useState<PlainFolder | null>(null)

  useEffect(() => {
    if (!isE2E()) return
    const hooks = (window as unknown as { __wordelia?: Record<string, unknown> }).__wordelia
    if (hooks) hooks.importFile = (p: string) => setImportPath(p)
  }, [])

  const openFolder = async (): Promise<void> => {
    const dir = await invoke('book:pickFolder', { title: t.library.openFolderTitle })
    if (!dir) return
    const info = await invoke('book:inspectFolder', dir)
    if (info.kind === 'book') return openBookAt(dir)
    if (info.kind === 'inside') {
      // The writer chose a folder of a book, for example its manuscript folder: open the book, not a book in the book.
      const ok = await askConfirm({ title: t.library.insideBookTitle, message: t.library.insideBook(info.title), confirm: t.library.openThatBook })
      if (ok) await openBookAt(info.root)
      return
    }
    setPlain({ path: dir, info })
  }

  const startImport = async (): Promise<void> => {
    const path = await invoke('import:pick')
    if (path) setImportPath(path)
  }

  return (
    <div className="library">
      <div className="library-inner">
        <motion.header
          className="library-hero"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <Logo height={44} blink />
          <p className="library-tagline">{t.library.tagline}</p>
          <div className="library-actions">
            <Button variant="ribbon" icon={<Plus size={15} weight="bold" />} onClick={() => setNewOpen(true)}>
              {t.library.newBook}
            </Button>
            <Button icon={<FolderOpen size={15} />} onClick={() => void openFolder()}>
              {t.library.openFolder}
            </Button>
            <Button variant="ghost" icon={<FileArrowUp size={15} />} onClick={() => void startImport()}>
              {t.library.importFile}
            </Button>
          </div>
        </motion.header>

        {library.length > 0 ? (
          <section className="library-shelf">
            <h2 className="caps">{t.library.yourBooks}</h2>
            <div className="book-grid">
              {library.map((item, i) => (
                <BookCard key={item.root} item={item} index={i} onChanged={() => void refresh()} />
              ))}
            </div>
          </section>
        ) : (
          <motion.section
            className="library-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.6 }}
          >
            {/* The empty sheet looks like a page, so a click on it starts the first book. */}
            <button className="empty-sheet grain" onClick={() => setNewOpen(true)}>
              <span className="empty-line">
                {t.library.emptyLine}
                <span className="empty-caret" />
              </span>
              <span className="empty-hint">{t.library.emptyHint}</span>
              <span className="empty-start">
                <Plus size={13} weight="bold" /> {t.library.emptyStart}
              </span>
            </button>
          </motion.section>
        )}
      </div>
      <NewBookDialog open={newOpen} onOpenChange={setNewOpen} />
      <ImportDialog path={importPath} onClose={() => setImportPath(null)} />
      <PlainFolderDialog
        folder={plain}
        onClose={() => setPlain(null)}
        onImport={(path) => {
          setPlain(null)
          setImportPath(path)
        }}
      />
    </div>
  )
}

/**
 * "Open folder" with a folder that is not a book: say what the app would add, and offer Import for a
 * folder of Markdown files (Import copies them into a new book, so the folder does not change).
 */
function PlainFolderDialog({ folder, onClose, onImport }: { folder: PlainFolder | null; onClose: () => void; onImport: (path: string) => void }): React.JSX.Element {
  const t = useT()
  const [language, setLanguage] = useState(guessLanguage())
  const [busy, setBusy] = useState(false)
  const info = folder?.info
  const notes = info ? info.notes > 0 && info.chapters === 0 : false

  const make = async (): Promise<void> => {
    if (!folder) return
    setBusy(true)
    await openBookAt(folder.path, { makeBook: true, language })
    setBusy(false)
    onClose()
  }

  return (
    <Dialog
      open={folder !== null}
      onOpenChange={(v) => !v && onClose()}
      title={t.library.notBookTitle}
      description={info ? t.library.notBookText(info.name) : undefined}
      width={500}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button variant={notes ? 'secondary' : 'primary'} onClick={() => void make()} disabled={busy}>
            {t.library.makeBook}
          </Button>
          {notes && folder && (
            <Button variant="primary" onClick={() => onImport(folder.path)}>
              {t.library.importNotes}
            </Button>
          )}
        </>
      }
    >
      {info && (
        <div className="plain-folder">
          {notes && <p>{t.library.notBookNotes(info.notes)}</p>}
          <p>{info.chapters > 0 ? t.library.notBookChapters(info.chapters) : t.library.notBookMake}</p>
          <Field label={t.library.language} hint={t.library.languageHint}>
            <Select value={language} onValueChange={setLanguage} options={languageOptions(t)} ariaLabel={t.library.languageAria} />
          </Field>
        </div>
      )}
    </Dialog>
  )
}

/** "Find the folder…" for a book that moved: the library points to the folder when it has the same book. */
async function findFolder(item: LibraryItem, onChanged: () => void): Promise<void> {
  const t = getT().library
  const dir = await invoke('book:pickFolder', { title: t.findFolderTitle(item.title) })
  if (!dir) return
  const r = await invoke('library:relocate', item.root, dir)
  if (r.ok) {
    toast(t.folderFound(item.title))
    onChanged()
  } else {
    toast(r.reason === 'notBook' ? t.notABookFolder : t.notThisBook(r.title ?? ''), { kind: 'error' })
  }
}

/** Remove a card. The files stay on disk, and Undo puts the card back. */
async function removeCard(item: LibraryItem, onChanged: () => void): Promise<void> {
  const t = getT()
  await invoke('library:remove', item.root)
  onChanged()
  toast(t.library.removed(item.title), {
    action: {
      label: t.common.undo,
      run: () => void invoke('library:restore', item).then(onChanged)
    }
  })
}

function BookCard({ item, index, onChanged }: { item: LibraryItem; index: number; onChanged: () => void }): React.JSX.Element {
  const t = useT()
  return (
    <motion.div
      className={`book-card${item.missing ? ' is-missing' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 + index * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        className="book-card-face grain"
        onClick={() => void (item.missing ? findFolder(item, onChanged) : openBookAt(item.root))}
        title={item.missing ? t.library.findFolder : undefined}
      >
        <span className="book-card-rule" />
        <span className="book-card-title">{item.title}</span>
        {item.author && <span className="book-card-author">{item.author}</span>}
        {item.excerpt && <span className="book-card-excerpt">{item.excerpt}</span>}
        <span className="book-card-meta">
          {item.missing ? (
            <>
              <WarningCircle size={13} /> {t.library.folderNotFound}
            </>
          ) : (
            <>
              {item.pages != null && <span className="book-card-pages">{t.library.bookPages(item.pages, item.pagesExact)}</span>}
              <span>{t.library.bookMeta(item.words, item.chapters)}</span>
            </>
          )}
        </span>
        <span className="book-card-time">{timeAgo(t, item.openedAt)}</span>
      </button>
      <div className="book-card-menu">
        <Menu
          align="end"
          trigger={
            <IconButton label={t.library.bookOptions}>
              <DotsThree size={18} weight="bold" />
            </IconButton>
          }
        >
          {item.missing ? (
            <MenuItem icon={<MagnifyingGlass size={15} />} onSelect={() => void findFolder(item, onChanged)}>
              {t.library.findFolder}
            </MenuItem>
          ) : (
            <MenuItem icon={<FolderOpen size={15} />} onSelect={() => void invoke('book:reveal', item.root)}>
              {t.library.showFolder}
            </MenuItem>
          )}
          <MenuItem icon={<X size={15} />} onSelect={() => void removeCard(item, onChanged)}>
            {t.library.removeFromList}
          </MenuItem>
        </Menu>
      </div>
    </motion.div>
  )
}
