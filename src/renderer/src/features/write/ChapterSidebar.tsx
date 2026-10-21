import { useEffect, useRef, useState } from 'react'
import { Reorder } from 'motion/react'
import { ArrowDown, ArrowUp, ChatCircleText, ClockCounterClockwise, DotsThree, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import clsx from 'clsx'
import type { Chapter } from '@shared/types'
import { IconButton, Menu, MenuItem, MenuSeparator } from '@/ui'
import { askConfirm } from '@/ui/prompt'
import { useBook } from '@/stores/book'
import { toast, useUi } from '@/stores/ui'
import { useChat } from '@/features/chat/chatStore'
import { useApp } from '@/stores/app'
import { getT, useT } from '@/lib/i18n'
import { HideSidebarButton } from '@/features/book/SidebarToggle'
import { usePagesOf } from '@/features/editor/pageCounts'
import { chapterWordCount } from '@/features/editor/stats'
import { StoryLineCard } from './StoryLineCard'

export function ChapterSidebar(): React.JSX.Element {
  const t = useT()
  const chapters = useBook((s) => s.chapters)
  const activeId = useBook((s) => s.activeChapterId)
  const active = chapters.find((c) => c.id === activeId)
  const [renaming, setRenaming] = useState<string | null>(null)
  const { pages } = usePagesOf()
  // A drag changes only this list. The book (and the pages) get the new order when the drag ends:
  // a drag across many places makes one change of the book, not one for each place.
  const [dragOrder, setDragOrder] = useState<Chapter[] | null>(null)
  const dragRef = useRef<Chapter[] | null>(null)
  const list = dragOrder ?? chapters
  const endDrag = (): void => {
    const next = dragRef.current
    dragRef.current = null
    setDragOrder(null)
    const ids = next?.map((c) => c.id)
    if (ids && ids.join('|') !== useBook.getState().chapters.map((c) => c.id).join('|')) useBook.getState().reorderChapters(ids)
  }

  return (
    <div className="sidebar">
      <div className="sidebar-head">
        <span className="caps">{t.write.chapters}</span>
        <span className="sidebar-head-tools">
          {/* After the chapter on screen; the button under the list adds one at the end. */}
          <IconButton label={active ? t.write.newChapterAfterOne(active.title) : t.write.addChapterAtEnd} onClick={() => void useBook.getState().addChapter(activeId)}>
            <Plus size={15} />
          </IconButton>
          <HideSidebarButton />
        </span>
      </div>
      <Reorder.Group
        axis="y"
        values={list}
        onReorder={(next: Chapter[]) => {
          dragRef.current = next
          setDragOrder(next)
        }}
        className="chapter-list"
      >
        {list.map((c, i) => (
          <Reorder.Item key={c.id} value={c} className="chapter-item-wrap" whileDrag={{ scale: 1.02, boxShadow: 'var(--shadow-pop)' }} onDragEnd={endDrag}>
            <ChapterItem
              chapter={c}
              index={i}
              pages={pages[c.id] ?? 1}
              last={i === list.length - 1}
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
        <Plus size={13} /> {t.write.addChapterAtEnd}
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
  // Counted again only when the text of this chapter changes.
  const words = chapterWordCount(chapter)
  const [value, setValue] = useState(chapter.title)
  // The rename box starts from the title now, also after a rename on the page or on the story line.
  useEffect(() => {
    if (renaming) setValue(chapter.title)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renaming])
  /** Escape: the blur after it must not save */
  const cancelled = useRef(false)

  const move = (delta: number): void => {
    const st = useBook.getState()
    const i = st.chapters.findIndex((c) => c.id === chapter.id)
    const to = i + delta
    if (i < 0 || to < 0 || to >= st.chapters.length) return
    st.moveChapter(chapter.id, to)
    setTimeout(() => document.querySelector<HTMLElement>(`.chapter-item[data-chapter="${chapter.id}"]`)?.focus(), 30)
  }

  const remove = async (): Promise<void> => {
    const ok = await askConfirm({
      title: t.write.deleteTitle(chapter.title),
      message: t.write.deleteMessage,
      confirm: t.common.delete,
      danger: true
    })
    if (!ok) return
    const undo = await useBook.getState().deleteChapter(chapter.id)
    const tt = getT()
    // Undo puts the chapter back in its place, with its text.
    toast(tt.write.deleted(chapter.title), undo ? { action: { label: tt.common.undo, run: () => void undo() } } : undefined)
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
          onRename()
        } else if (e.altKey && e.key === 'ArrowUp') {
          e.preventDefault()
          move(-1)
        } else if (e.altKey && e.key === 'ArrowDown') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const items = [...document.querySelectorAll<HTMLElement>('.chapter-item[data-chapter]')]
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
            // The title of the chapter now, not the one when the list showed: Enter without a change does nothing.
            const clean = value.trim()
            const now = useBook.getState().chapters.find((c) => c.id === chapter.id)?.title
            if (!cancelled.current && clean && clean !== now) void useBook.getState().renameChapter(chapter.id, clean)
            cancelled.current = false
            onRenamed()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              cancelled.current = true
              ;(e.target as HTMLInputElement).blur()
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
          <MenuItem icon={<PencilSimple size={15} />} onSelect={onRename}>
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
