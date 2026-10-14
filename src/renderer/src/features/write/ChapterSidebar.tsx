import { useState } from 'react'
import { Reorder } from 'motion/react'
import { DotsThree, PencilSimple, Plus, Trash, ArrowBendUpLeft } from '@phosphor-icons/react'
import clsx from 'clsx'
import { countMarkdownWords, formatCount } from '@shared/book'
import type { Chapter } from '@shared/types'
import { IconButton, Menu, MenuItem, MenuSeparator } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { useChat } from '@/features/chat/chatStore'
import { useApp } from '@/stores/app'

export function ChapterSidebar(): React.JSX.Element {
  const chapters = useBook((s) => s.chapters)
  const activeId = useBook((s) => s.activeChapterId)
  const [renaming, setRenaming] = useState<string | null>(null)

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <span className="caps">Chapters</span>
        <IconButton label="New chapter" onClick={() => void useBook.getState().addChapter(activeId)}>
          <Plus size={15} />
        </IconButton>
      </div>
      <Reorder.Group
        axis="y"
        values={chapters}
        onReorder={(next: Chapter[]) => useBook.getState().reorderChapters(next.map((c) => c.id))}
        className="chapter-list"
      >
        {chapters.map((c, i) => (
          <Reorder.Item key={c.id} value={c} className="chapter-item-wrap" whileDrag={{ scale: 1.02, boxShadow: 'var(--shadow-pop)' }}>
            <ChapterItem
              chapter={c}
              index={i}
              active={c.id === activeId}
              renaming={renaming === c.id}
              onRename={() => setRenaming(c.id)}
              onRenamed={() => setRenaming(null)}
            />
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <button className="sidebar-add" onClick={() => void useBook.getState().addChapter(chapters[chapters.length - 1]?.id ?? null)}>
        <Plus size={13} /> Add chapter
      </button>
    </div>
  )
}

function ChapterItem({
  chapter,
  index,
  active,
  renaming,
  onRename,
  onRenamed
}: {
  chapter: Chapter
  index: number
  active: boolean
  renaming: boolean
  onRename: () => void
  onRenamed: () => void
}): React.JSX.Element {
  const words = countMarkdownWords(chapter.body)
  const [value, setValue] = useState(chapter.title)

  const remove = async (): Promise<void> => {
    const ok = await askConfirm({
      title: `Delete "${chapter.title}"?`,
      message: "The file moves to the book's .wordelia/trash folder. You can get it back from there.",
      confirm: 'Delete',
      danger: true
    })
    if (!ok) return
    await useBook.getState().deleteChapter(chapter.id)
    toast(`"${chapter.title}" moved to the trash folder.`)
  }

  return (
    <div
      className={clsx('chapter-item', active && 'is-active')}
      onClick={() => !renaming && useBook.getState().selectChapter(chapter.id)}
      onDoubleClick={onRename}
    >
      <span className="chapter-item-num">{String(index + 1).padStart(2, '0')}</span>
      {renaming ? (
        <input
          className="chapter-item-input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            if (value.trim() && value !== chapter.title) void useBook.getState().renameChapter(chapter.id, value)
            onRenamed()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setValue(chapter.title)
              onRenamed()
            }
          }}
        />
      ) : (
        <span className="chapter-item-title">{chapter.title}</span>
      )}
      <span className="chapter-item-words">{formatCount(words)}</span>
      <span className="chapter-item-menu" onClick={(e) => e.stopPropagation()}>
        <Menu
          align="start"
          side="right"
          trigger={
            <IconButton label="Chapter options">
              <DotsThree size={16} weight="bold" />
            </IconButton>
          }
        >
          <MenuItem icon={<PencilSimple size={15} />} onSelect={() => { setValue(chapter.title); onRename() }}>
            Rename
          </MenuItem>
          <MenuItem icon={<Plus size={15} />} onSelect={() => void useBook.getState().addChapter(chapter.id)}>
            New chapter after this
          </MenuItem>
          <MenuItem
            icon={<ArrowBendUpLeft size={15} />}
            onSelect={() => {
              useChat.getState().addMention({ kind: 'chapter', id: chapter.id, label: chapter.title })
              useApp.getState().setUi({ chatOpen: true })
              setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus(), 200)
            }}
          >
            Mention in chat
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<Trash size={15} />} onSelect={() => void remove()}>
            Delete chapter
          </MenuItem>
        </Menu>
      </span>
    </div>
  )
}
