import { useState } from 'react'
import { Reorder } from 'motion/react'
import { ArrowDown, ArrowUp, ChatCircleText, ClockCounterClockwise, DotsThree, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import clsx from 'clsx'
import { countMarkdownWords } from '@shared/book'
import type { Chapter } from '@shared/types'
import { IconButton, Menu, MenuItem, MenuSeparator } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { useChat } from '@/features/chat/chatStore'
import { useApp } from '@/stores/app'
import { useT } from '@/lib/i18n'
import { HideSidebarButton } from '@/features/book/SidebarToggle'
import { usePagesOf } from '@/features/editor/pageCounts'
import { StoryLineCard } from './StoryLineCard'

export function ChapterSidebar(): React.JSX.Element {
  const t = useT()
  const chapters = useBook((s) => s.chapters)
  const activeId = useBook((s) => s.activeChapterId)
  const [renaming, setRenaming] = useState<string | null>(null)
  const { pages } = usePagesOf()

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <span className="caps">{t.write.chapters}</span>
        <span className="sidebar-head-tools">
          <IconButton label={t.write.newChapter} onClick={() => void useBook.getState().addChapter(activeId)}>
            <Plus size={15} />
          </IconButton>
          <HideSidebarButton />
        </span>
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
              pages={pages[c.id] ?? 1}
              last={i === chapters.length - 1}
              active={c.id === activeId}
              renaming={renaming === c.id}
              onRename={() => setRenaming(c.id)}
              onRenamed={() => setRenaming(null)}
            />
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <StoryLineCard />
      <button className="sidebar-add" onClick={() => void useBook.getState().addChapter(chapters[chapters.length - 1]?.id ?? null)}>
        <Plus size={13} /> {t.write.addChapter}
      </button>
    </div>
  )
}

function ChapterItem({
  chapter,
  index,
  pages,
  last,
  active,
  renaming,
  onRename,
  onRenamed
}: {
  chapter: Chapter
  index: number
  /** Pages of the chapter on screen */
  pages: number
  last: boolean
  active: boolean
  renaming: boolean
  onRename: () => void
  onRenamed: () => void
}): React.JSX.Element {
  const t = useT()
  const words = countMarkdownWords(chapter.body)
  const [value, setValue] = useState(chapter.title)

  const move = (delta: number): void => {
    const st = useBook.getState()
    const i = st.chapters.findIndex((c) => c.id === chapter.id)
    const to = i + delta
    if (i < 0 || to < 0 || to >= st.chapters.length) return
    st.moveChapter(chapter.id, to)
    setTimeout(() => document.querySelector<HTMLElement>(`[data-chapter="${chapter.id}"]`)?.focus(), 30)
  }

  const remove = async (): Promise<void> => {
    const ok = await askConfirm({
      title: t.write.deleteTitle(chapter.title),
      message: t.write.deleteMessage,
      confirm: t.common.delete,
      danger: true
    })
    if (!ok) return
    await useBook.getState().deleteChapter(chapter.id)
    toast(t.write.deleted(chapter.title))
  }

  return (
    <div
      className={clsx('chapter-item', active && 'is-active')}
      role="button"
      tabIndex={renaming ? -1 : 0}
      data-chapter={chapter.id}
      aria-current={active ? 'page' : undefined}
      aria-label={t.write.chapterLabel(index + 1, chapter.title, words)}
      onClick={() => !renaming && useBook.getState().selectChapter(chapter.id)}
      onDoubleClick={onRename}
      onKeyDown={(e) => {
        if (renaming || e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          useBook.getState().selectChapter(chapter.id)
        } else if (e.key === 'F2') {
          e.preventDefault()
          setValue(chapter.title)
          onRename()
        } else if (e.altKey && e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        } else if (e.altKey && e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const items = [...document.querySelectorAll<HTMLElement>('[data-chapter]')]
          const i = items.indexOf(e.currentTarget)
          items[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus()
        }
      }}
    >
      <span className="chapter-item-num">{String(index + 1).padStart(2, '0')}</span>
      {renaming ? (
        <input
          className="chapter-item-input"
          aria-label={t.write.chapterTitle}
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
      <span className="chapter-item-words" title={t.write.chapterWords(words)}>
        {t.write.chapterPages(pages)}
      </span>
      <span className="chapter-item-menu" onClick={(e) => e.stopPropagation()}>
        <Menu
          align="start"
          side="right"
          trigger={
            <IconButton label={t.write.chapterOptions}>
              <DotsThree size={16} weight="bold" />
            </IconButton>
          }
        >
          <MenuItem icon={<PencilSimple size={15} />} onSelect={() => { setValue(chapter.title); onRename() }}>
            {t.common.rename}
          </MenuItem>
          <MenuItem icon={<Plus size={15} />} onSelect={() => void useBook.getState().addChapter(chapter.id)}>
            {t.write.newChapterAfter}
          </MenuItem>
          <MenuItem icon={<ArrowUp size={15} />} shortcut="Alt+↑" disabled={index === 0} onSelect={() => move(-1)}>
            {t.write.moveUp}
          </MenuItem>
          <MenuItem icon={<ArrowDown size={15} />} shortcut="Alt+↓" disabled={last} onSelect={() => move(1)}>
            {t.write.moveDown}
          </MenuItem>
          <MenuItem
            icon={<ChatCircleText size={15} />}
            onSelect={() => {
              useChat.getState().addMention({ kind: 'chapter', id: chapter.id, label: chapter.title })
              useApp.getState().setUi({ chatOpen: true })
              setTimeout(() => document.querySelector<HTMLTextAreaElement>('.composer-input')?.focus(), 200)
            }}
          >
            {t.write.mention}
          </MenuItem>
          <MenuItem icon={<ClockCounterClockwise size={15} />} onSelect={() => useUi.getState().openHistory(chapter.id)}>
            {t.write.versionHistoryMenu}
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger icon={<Trash size={15} className="icon-trash" />} onSelect={() => void remove()}>
            {t.write.deleteChapter}
          </MenuItem>
        </Menu>
      </span>
    </div>
  )
}
