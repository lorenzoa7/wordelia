import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { DotsThree, FileArrowUp, FolderOpen, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import { formatCount } from '@shared/book'
import type { LibraryItem } from '@shared/types'
import { Button, IconButton, Menu, MenuItem } from '@/ui'
import { Logo } from '@/app/Logo'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { invoke, isE2E } from '@/lib/api'
import { NewBookDialog } from './NewBookDialog'
import { ImportDialog } from './ImportDialog'
import './library.css'

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)} min ago`
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`
  if (d < 86400 * 30) return `${Math.floor(d / 86400)} days ago`
  return new Date(iso).toLocaleDateString()
}

export async function openBookAt(root: string): Promise<void> {
  try {
    const snap = await invoke('book:open', root)
    useBook.getState().open(snap)
  } catch (err) {
    toast(`Could not open the book: ${err instanceof Error ? err.message : String(err)}`, { kind: 'error' })
  }
}

export function LibraryView(): React.JSX.Element {
  const library = useApp((s) => s.library)
  const refresh = useApp((s) => s.refreshLibrary)
  const newOpen = useUi((s) => s.newBookOpen)
  const setNewOpen = useUi((s) => s.setNewBookOpen)
  const [importPath, setImportPath] = useState<string | null>(null)

  useEffect(() => {
    if (!isE2E()) return
    const hooks = (window as unknown as { __wordelia?: Record<string, unknown> }).__wordelia
    if (hooks) hooks.importFile = (p: string) => setImportPath(p)
  }, [])

  const openFolder = async (): Promise<void> => {
    const dir = await invoke('book:pickFolder', { title: 'Open a book folder' })
    if (dir) await openBookAt(dir)
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
          <p className="library-tagline">A quiet desk for your book, with an editor at your side.</p>
          <div className="library-actions">
            <Button variant="ribbon" icon={<Plus size={15} weight="bold" />} onClick={() => setNewOpen(true)}>
              New book
            </Button>
            <Button icon={<FolderOpen size={15} />} onClick={() => void openFolder()}>
              Open folder
            </Button>
            <Button variant="ghost" icon={<FileArrowUp size={15} />} onClick={() => void startImport()}>
              Import DOCX or Markdown
            </Button>
          </div>
        </motion.header>

        {library.length > 0 ? (
          <section className="library-shelf">
            <h2 className="caps">Your books</h2>
            <div className="book-grid">
              {library.map((item, i) => (
                <BookCard key={item.root} item={item} index={i} onRemoved={() => void refresh()} />
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
            <div className="empty-sheet grain">
              <p className="empty-line">
                Chapter One<span className="empty-caret" />
              </p>
              <p className="empty-hint">Your first book starts here. Every book is a plain folder of files on this computer.</p>
            </div>
          </motion.section>
        )}
      </div>
      <NewBookDialog open={newOpen} onOpenChange={setNewOpen} />
      <ImportDialog path={importPath} onClose={() => setImportPath(null)} />
    </div>
  )
}

function BookCard({ item, index, onRemoved }: { item: LibraryItem; index: number; onRemoved: () => void }): React.JSX.Element {
  return (
    <motion.div
      className={`book-card${item.missing ? ' is-missing' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 + index * 0.05, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <button className="book-card-face grain" onClick={() => !item.missing && void openBookAt(item.root)} disabled={item.missing}>
        <span className="book-card-rule" />
        <span className="book-card-title">{item.title}</span>
        {item.author && <span className="book-card-author">{item.author}</span>}
        {item.excerpt && <span className="book-card-excerpt">{item.excerpt}</span>}
        <span className="book-card-meta">
          {item.missing ? (
            <>
              <WarningCircle size={13} /> Folder not found
            </>
          ) : (
            <>
              {formatCount(item.words)} words · {item.chapters} {item.chapters === 1 ? 'chapter' : 'chapters'}
            </>
          )}
        </span>
        <span className="book-card-time">{timeAgo(item.openedAt)}</span>
      </button>
      <div className="book-card-menu">
        <Menu
          align="end"
          trigger={
            <IconButton label="Book options">
              <DotsThree size={18} weight="bold" />
            </IconButton>
          }
        >
          {!item.missing && (
            <MenuItem icon={<FolderOpen size={15} />} onSelect={() => void invoke('book:reveal', item.root)}>
              Show folder
            </MenuItem>
          )}
          <MenuItem
            icon={<Trash size={15} />}
            onSelect={() => void invoke('library:remove', item.root).then(onRemoved)}
          >
            Remove from list
          </MenuItem>
        </Menu>
      </div>
    </motion.div>
  )
}
