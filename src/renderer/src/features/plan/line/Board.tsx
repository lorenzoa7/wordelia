// The board of the story line: columns of cards. A drag moves a card (in its column, to another
// column, to and from the tray) or a column (by its grip). The drag uses pointer events
// (dnd-kit), not the HTML drag: a move of 5 px starts it, so a click still opens a card.

import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BookOpenText, Clock, DotsSixVertical, DotsThree, PencilSimple, Plus, Trash, Tray } from '@phosphor-icons/react'
import clsx from 'clsx'
import { addCard, addColumn, boardView, deleteColumn, moveColumn, placeCard, placesOf, renameColumn, type Board, type LineCard, type LineView, type ViewColumn } from '@shared/storyline'
import type { Chapter, Entry } from '@shared/types'
import { Menu, MenuItem, Tooltip } from '@/ui'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { toast } from '@/stores/ui'
import { CardText } from './CardText'
import { MentionTextarea } from './MentionTextarea'
import { saveBoard, undoBoard } from './model'

const CARD = 'card:'
const COL = 'col:'
const cardDnd = (id: string): string => CARD + id
const colDnd = (key: string): string => COL + key
const isCol = (id: UniqueIdentifier): boolean => String(id).startsWith(COL)
const unwrap = (id: UniqueIdentifier): string => String(id).replace(/^(card|col):/, '')

/** Planned chapters and moments can move; written chapters and the tray cannot. */
export function movable(c: Pick<ViewColumn, 'kind'>): boolean {
  return c.kind === 'planned' || c.kind === 'moment'
}

/* ------------------------------------------------------------------ */
/* Cards                                                                */
/* ------------------------------------------------------------------ */

export interface CardLook {
  card: LineCard
  /** The place of the card in the other view, for the line at the bottom */
  other?: ViewColumn
  /** Not in a written chapter: a dashed border */
  planned: boolean
}

interface CardViewProps extends CardLook {
  view: LineView
  notes: Entry[]
  /** The text of a changed card, as a word diff */
  text?: ReactNode
  /** The names of the mentions open their notes */
  links?: boolean
}

/** The look of a card: the text, cut to its lines, and its place in the other view. */
export const CardView = forwardRef<HTMLDivElement, CardViewProps & React.HTMLAttributes<HTMLDivElement>>(function CardView(
  { card, other, planned, view, notes, className, text, links = true, ...rest },
  ref
) {
  const t = useT()
  const meta = other ? (view === 'chapter' ? other.title || t.plan.line.untitled : `${other.number} · ${other.title || t.plan.line.untitled}`) : ''
  return (
    <div ref={ref} className={clsx('line-card', planned && 'is-planned', className)} {...rest}>
      <p className="line-card-text">{text ?? <CardText text={card.text} notes={notes} links={links} />}</p>
      <span className="line-card-meta">
        {meta && (
          <>
            {view === 'chapter' ? <Clock size={11} /> : <BookOpenText className="is-book" size={11} />}
            <span className="line-card-place">{meta}</span>
          </>
        )}
      </span>
    </div>
  )
})

function SortableCard({ look, view, notes, onOpen }: { look: CardLook; view: LineView; notes: Entry[]; onOpen(): void }): React.JSX.Element {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: cardDnd(look.card.id) })
  return (
    <CardView
      ref={setNodeRef}
      {...look}
      view={view}
      notes={notes}
      className={clsx(isDragging && 'is-ghost')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-card={look.card.id}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter' && !e.defaultPrevented) {
          e.preventDefault()
          onOpen()
        }
      }}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Columns                                                              */
/* ------------------------------------------------------------------ */

export interface ShellProps {
  col: ViewColumn
  view: LineView
  here: boolean
  count: number
  /** The grip, for a column that moves */
  grip?: ReactNode
  /** The title shows a text box (a double-click on the title, or Rename in the menu) */
  editing?: boolean
  onEditing?(editing: boolean): void
  onRename?(title: string): void
  menu?: ReactNode
  /** The mark of a proposal on the column */
  mark?: 'added' | 'removed' | 'renamed'
  oldTitle?: string
  /** A bar under the header (the decision on a change of the column) */
  notice?: ReactNode
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

/** The name of a column on screen. */
export function columnName(t: ReturnType<typeof useT>, col: Pick<ViewColumn, 'kind' | 'title'>, view: LineView): string {
  if (col.kind === 'tray') return view === 'chapter' ? t.plan.line.trayChapter : t.plan.line.trayTime
  return col.title || t.plan.line.untitled
}

/** The look of a column: the header (grip, number, title, count, menu) and the cards. */
export const ColumnShell = forwardRef<HTMLElement, ShellProps>(function ColumnShell(
  { col, view, here, count, grip, editing = false, onEditing, onRename, menu, mark, oldTitle, notice, children, className, style },
  ref
) {
  const t = useT()
  const [title, setTitle] = useState(col.title)
  const name = columnName(t, col, view)
  const hint =
    col.kind === 'tray'
      ? view === 'chapter'
        ? t.plan.line.trayChapterHint
        : t.plan.line.trayTimeHint
      : col.kind === 'chapter'
        ? t.plan.line.written
        : col.kind === 'planned'
          ? t.plan.line.planned
          : t.plan.line.moment
  useEffect(() => setTitle(col.title), [col.title, editing])
  // The title box gets the focus after the event that opened it: a menu that closes gives the
  // focus back first.
  const input = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    if (!editing) return
    const take = (): void => {
      if (document.activeElement === input.current) return
      input.current?.focus()
      input.current?.select()
    }
    take()
    const id = setTimeout(take, 0)
    return () => clearTimeout(id)
  }, [editing])
  const finish = (keep: boolean): void => {
    onEditing?.(false)
    const next = title.trim()
    if (keep && next && next !== col.title) onRename?.(next)
  }
  return (
    <section ref={ref} className={clsx('line-col', `is-${col.kind}`, here && 'is-here', mark && `is-${mark}`, className)} style={style} data-column={col.key} aria-label={name}>
      <header className="line-col-head">
        {grip}
        {col.kind === 'chapter' && <BookOpenText className="line-col-icon is-book" size={13} aria-hidden />}
        {col.kind === 'tray' && <Tray className="line-col-icon" size={13} aria-hidden />}
        {col.number !== undefined && <span className="line-col-number">{col.number}</span>}
        {editing ? (
          <input
            ref={input}
            className="line-col-input"
            value={title}
            aria-label={col.kind === 'chapter' ? t.plan.line.renameChapter : t.plan.line.rename}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => finish(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finish(true)
              if (e.key === 'Escape') {
                e.stopPropagation()
                finish(false)
              }
            }}
          />
        ) : (
          <Tooltip
            label={
              <span className="line-col-tip">
                <b>{name}</b>
                <span>{hint}</span>
              </span>
            }
          >
            <h3 className="line-col-title" onDoubleClick={() => onRename && onEditing?.(true)}>
              {mark === 'renamed' && oldTitle && <del className="line-col-old">{oldTitle}</del>}
              <span>{name}</span>
            </h3>
          </Tooltip>
        )}
        <span className="line-col-count">
          <span aria-hidden>{count}</span>
          <span className="sr-only">{t.plan.line.cards(count)}</span>
        </span>
        {menu}
      </header>
      {here && (
        <Tooltip label={view === 'chapter' ? t.plan.line.hereChapter : t.plan.line.hereTime}>
          <span className="line-here">{t.plan.line.here}</span>
        </Tooltip>
      )}
      {notice}
      <div className="line-col-body">{children}</div>
    </section>
  )
})

/** The menu of a column: open or rename a chapter; rename or delete a planned chapter or a moment. */
function ColumnMenu({ col, onRename, onDelete }: { col: ViewColumn; onRename(): void; onDelete?(): void }): React.JSX.Element {
  const t = useT()
  // Rename puts the focus in the title box: the menu must not take it back when it closes.
  const renaming = useRef(false)
  return (
    <Menu
      align="end"
      onCloseAutoFocus={(e) => {
        if (renaming.current) e.preventDefault()
        renaming.current = false
      }}
      trigger={
        <button className="line-col-menu" aria-label={t.plan.line.columnMenu(col.title || t.plan.line.untitled)}>
          <DotsThree size={16} weight="bold" />
        </button>
      }
    >
      {col.chapterId && (
        <MenuItem icon={<BookOpenText className="is-book" size={14} />} onSelect={() => useBook.getState().selectChapter(col.chapterId!)}>
          {t.plan.line.openChapter}
        </MenuItem>
      )}
      <MenuItem
        icon={<PencilSimple size={14} />}
        onSelect={() => {
          renaming.current = true
          onRename()
        }}
      >
        {col.chapterId ? t.plan.line.renameChapter : t.plan.line.rename}
      </MenuItem>
      {onDelete && (
        <MenuItem icon={<Trash size={14} />} danger onSelect={onDelete}>
          {t.plan.line.deleteColumn}
        </MenuItem>
      )}
    </Menu>
  )
}

/* ------------------------------------------------------------------ */
/* New cards and new columns                                            */
/* ------------------------------------------------------------------ */

/** "+" under the last card: a box for the text of a new card. Enter adds it and opens the next box. */
function AddCard({ notes, onAdd }: { notes: Entry[]; onAdd(text: string): void }): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const add = (): void => {
    if (text.trim()) onAdd(text)
    setText('')
  }
  if (!open) {
    return (
      <Tooltip label={t.plan.line.addCard}>
        <button className="line-add-card" aria-label={t.plan.line.addCard} onClick={() => setOpen(true)}>
          <Plus size={16} />
        </button>
      </Tooltip>
    )
  }
  return (
    <div className="line-card is-new">
      <MentionTextarea
        value={text}
        onChange={setText}
        onSubmit={add}
        onCancel={() => {
          setText('')
          setOpen(false)
        }}
        onBlur={() => {
          add()
          setOpen(false)
        }}
        notes={notes}
        autoFocus
        floating
        placeholder={t.plan.line.cardPlaceholder}
        aria-label={t.plan.line.addCard}
      />
      <span className="line-card-meta">{t.plan.line.cardKeys}</span>
    </div>
  )
}

/** "+" after the last column: a box for the title of a new column. Enter adds it and keeps the box. */
function AddColumn({ view, onAdd }: { view: LineView; onAdd(title: string): void }): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const label = view === 'chapter' ? t.plan.line.addChapter : t.plan.line.addMoment
  const add = (): void => {
    if (title.trim()) onAdd(title)
    setTitle('')
  }
  return (
    <div className={clsx('line-add-col', open && 'is-open')}>
      {open ? (
        <div className="line-add-col-form">
          <input
            className="line-col-input"
            value={title}
            autoFocus
            aria-label={label}
            placeholder={view === 'chapter' ? t.plan.line.chapterPlaceholder : t.plan.line.momentPlaceholder}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              add()
              setOpen(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') {
                e.stopPropagation()
                setTitle('')
                setOpen(false)
              }
            }}
          />
          <span className="line-add-col-keys">{t.plan.line.columnKeys}</span>
        </div>
      ) : (
        <button className="line-add-col-btn" onClick={() => setOpen(true)}>
          <Plus size={18} />
          <span className="line-add-col-label">{label}</span>
        </button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The board                                                            */
/* ------------------------------------------------------------------ */

interface BoardProps {
  board: Board
  view: LineView
  chapters: Chapter[]
  notes: Entry[]
  here: string | null
  onOpenCard(id: string): void
}

type Items = Record<string, string[]>

/** What a column needs from the board. */
interface Shared {
  board: Board
  view: LineView
  chapters: Chapter[]
  notes: Entry[]
  here: string | null
  items: Items
  byId: Map<string, LineCard>
  look(card: LineCard, col: ViewColumn): CardLook
  onOpenCard(id: string): void
}

interface ColumnProps {
  col: ViewColumn
  shared: Shared
  overlay?: boolean
}

/** A column on the board: it moves by its grip (planned chapters, moments) or only takes cards. */
function BoardColumn(props: ColumnProps): React.JSX.Element {
  if (props.overlay) return <ColumnInner {...props} />
  return movable(props.col) ? <SortableColumn {...props} /> : <StaticColumn {...props} />
}

function SortableColumn(props: ColumnProps): React.JSX.Element {
  const t = useT()
  const { col } = props
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: colDnd(col.key) })
  const grip = (
    <button ref={setActivatorNodeRef} className="line-col-grip" aria-label={t.plan.line.move(col.title || t.plan.line.untitled)} {...attributes} {...listeners}>
      <DotsSixVertical size={14} weight="bold" />
    </button>
  )
  return <ColumnInner {...props} nodeRef={setNodeRef} grip={grip} ghost={isDragging} style={{ transform: CSS.Translate.toString(transform), transition }} />
}

function StaticColumn(props: ColumnProps): React.JSX.Element {
  const { setNodeRef } = useDroppable({ id: colDnd(props.col.key) })
  return <ColumnInner {...props} nodeRef={setNodeRef} />
}

function ColumnInner({
  col,
  shared,
  overlay = false,
  nodeRef,
  grip,
  ghost,
  style
}: ColumnProps & { nodeRef?: (el: HTMLElement | null) => void; grip?: ReactNode; ghost?: boolean; style?: React.CSSProperties }): React.JSX.Element {
  const t = useT()
  const { board, view, chapters, notes, here, items, byId, look, onOpenCard } = shared
  const [editing, setEditing] = useState(false)
  const ids = items[col.key] ?? []
  const cards = ids.flatMap((id) => {
    const c = byId.get(id)
    return c ? [c] : []
  })
  const rename = (title: string): void => {
    if (col.kind === 'chapter' && col.chapterId) void useBook.getState().renameChapter(col.chapterId, title)
    else if (col.columnId) saveBoard(renameColumn(board, view, col.columnId, title))
  }
  const remove =
    movable(col) && col.columnId
      ? (): void => {
          const before = board
          const after = deleteColumn(board, view, col.columnId!)
          saveBoard(after)
          toast(t.plan.line.columnDeleted(col.title || t.plan.line.untitled, col.cards.length, columnName(t, { kind: 'tray', title: '' }, view)), {
            ms: 8000,
            action: { label: t.common.undo, run: () => undoBoard(before, after) }
          })
        }
      : undefined
  const overlayGrip = overlay && movable(col) && (
    <span className="line-col-grip">
      <DotsSixVertical size={14} weight="bold" />
    </span>
  )
  return (
    <ColumnShell
      ref={nodeRef}
      col={col}
      view={view}
      here={col.key === here}
      count={cards.length}
      grip={grip ?? overlayGrip ?? undefined}
      editing={editing}
      onEditing={setEditing}
      onRename={col.kind === 'tray' || overlay ? undefined : rename}
      menu={col.kind === 'tray' || overlay ? undefined : <ColumnMenu col={col} onRename={() => setEditing(true)} onDelete={remove} />}
      style={style}
      className={clsx(overlay && 'is-lifted', ghost && 'is-ghost')}
    >
      {overlay ? (
        cards.map((c) => <CardView key={c.id} {...look(c, col)} view={view} notes={notes} links={false} />)
      ) : (
        <SortableContext items={ids.map(cardDnd)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => (
            <SortableCard key={c.id} look={look(c, col)} view={view} notes={notes} onOpen={() => onOpenCard(c.id)} />
          ))}
          {col.kind !== 'tray' && <AddCard notes={notes} onAdd={(text) => saveBoard(addCard(board, view, col.key, text, chapters).board)} />}
        </SortableContext>
      )}
    </ColumnShell>
  )
}

/** The drop of a card or a column: short, and none for a reader who asks for less motion. */
function dropAnimation(): DropAnimation | null {
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return null
  return { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
}

export function LineBoard({ board, view, chapters, notes, here, onOpenCard }: BoardProps): React.JSX.Element {
  const t = useT()
  const cols = useMemo(() => boardView(board, view, chapters), [board, view, chapters])
  const other = useMemo(() => placesOf(board, view === 'chapter' ? 'order' : 'chapter', chapters), [board, view, chapters])
  const chapterPlace = useMemo(() => (view === 'chapter' ? null : other), [view, other])
  const byId = useMemo(() => new Map(board.cards.map((c) => [c.id, c])), [board.cards])
  const base = useMemo<Items>(() => Object.fromEntries(cols.map((c) => [c.key, c.cards.map((x) => x.id)])), [cols])
  const baseOrder = useMemo(() => cols.filter(movable).map((c) => c.key), [cols])

  // While a drag goes on, the board shows these: a card moves between columns as the pointer goes.
  const [dragItems, setDragItems] = useState<Items | null>(null)
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const [active, setActive] = useState<UniqueIdentifier | null>(null)
  const items = dragItems ?? base
  const order = dragOrder ?? baseOrder
  const lastOver = useRef<UniqueIdentifier | null>(null)
  const movedToNew = useRef(false)

  useEffect(() => {
    requestAnimationFrame(() => (movedToNew.current = false))
  }, [items])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } })
  )

  const containerOf = useCallback(
    (id: UniqueIdentifier): string | undefined => {
      if (isCol(id)) return unwrap(id)
      const card = unwrap(id)
      return Object.keys(items).find((k) => items[k].includes(card))
    },
    [items]
  )

  // A column goes to the nearest column that moves. A card goes to the card under the pointer, or
  // to the nearest card of the column under it, or into an empty column.
  const collision: CollisionDetection = useCallback(
    (args) => {
      if (active && isCol(active)) {
        return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => isCol(c.id) && order.includes(unwrap(c.id))) })
      }
      const hits = pointerWithin(args)
      let over = getFirstCollision(hits.length ? hits : rectIntersection(args), 'id')
      if (over != null) {
        if (isCol(over)) {
          const inside = items[unwrap(over)] ?? []
          if (inside.length) {
            over = closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !isCol(c.id) && inside.includes(unwrap(c.id))) })[0]?.id ?? over
          }
        }
        lastOver.current = over
        return [{ id: over }]
      }
      if (movedToNew.current) lastOver.current = active
      return lastOver.current ? [{ id: lastOver.current }] : []
    },
    [active, items, order]
  )

  const titleOf = (id: UniqueIdentifier | undefined): string => {
    if (id == null) return ''
    const key = isCol(id) ? unwrap(id) : containerOf(id)
    const col = cols.find((c) => c.key === key)
    return col ? columnName(t, col, view) : ''
  }
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => t.plan.line.dndStart(isCol(a.id) ? titleOf(a.id) : (byId.get(unwrap(a.id))?.text ?? '')),
    onDragOver: ({ over: o }) => (o ? t.plan.line.dndOver(titleOf(o.id)) : undefined),
    onDragEnd: ({ over: o }) => (o ? t.plan.line.dndEnd(titleOf(o.id)) : t.plan.line.dndCancel),
    onDragCancel: () => t.plan.line.dndCancel
  }

  const start = ({ active: a }: DragStartEvent): void => {
    setActive(a.id)
    setDragItems(base)
    setDragOrder(baseOrder)
  }

  const over = ({ active: a, over: o }: DragOverEvent): void => {
    if (!o || isCol(a.id)) return
    const from = containerOf(a.id)
    const to = containerOf(o.id)
    if (!from || !to || from === to) return
    setDragItems((cur) => {
      const now = cur ?? base
      const card = unwrap(a.id)
      const target = now[to].filter((x) => x !== card)
      let at = target.length
      if (!isCol(o.id)) {
        const i = target.indexOf(unwrap(o.id))
        const below = a.rect.current.translated && a.rect.current.translated.top > o.rect.top + o.rect.height / 2
        at = i >= 0 ? i + (below ? 1 : 0) : target.length
      }
      movedToNew.current = true
      return { ...now, [from]: now[from].filter((x) => x !== card), [to]: [...target.slice(0, at), card, ...target.slice(at)] }
    })
  }

  const finish = (): void => {
    setActive(null)
    setDragItems(null)
    setDragOrder(null)
  }

  const end = ({ active: a, over: o }: DragEndEvent): void => {
    if (isCol(a.id)) {
      const key = unwrap(a.id)
      const to = o ? order.indexOf(unwrap(o.id)) : -1
      finish()
      if (to >= 0 && to !== order.indexOf(key)) saveBoard(moveColumn(board, view, key, to, chapters))
      return
    }
    const card = unwrap(a.id)
    const container = containerOf(a.id)
    let final = items
    if (container && o && !isCol(o.id)) {
      // A move inside the column: the card takes the place of the card under it.
      const list = items[container]
      const from = list.indexOf(card)
      const to = list.indexOf(unwrap(o.id))
      if (to >= 0 && from !== to) final = { ...items, [container]: arrayMove(list, from, to) }
    }
    finish()
    if (!container || !o) return
    const index = final[container].indexOf(card)
    const was = Object.keys(base).find((k) => base[k].includes(card))
    if (was === container && base[container].indexOf(card) === index) return
    saveBoard(placeCard(board, view, card, container, index, chapters))
  }

  const look = (card: LineCard, col: ViewColumn): CardLook => ({
    card,
    other: other.get(card.id),
    planned: view === 'chapter' ? col.kind !== 'chapter' : chapterPlace?.get(card.id)?.kind !== 'chapter'
  })
  const shared: Shared = { board, view, chapters, notes, here, items, byId, look, onOpenCard }

  const activeCard = active && !isCol(active) ? byId.get(unwrap(active)) : undefined
  const activeCol = active && isCol(active) ? cols.find((c) => c.key === unwrap(active)) : undefined
  const fixed = cols.filter((c) => !movable(c))
  const moving = order.flatMap((k) => cols.filter((c) => c.key === k))

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t.plan.line.dndInstructions } }}
      onDragStart={start}
      onDragOver={over}
      onDragEnd={end}
      onDragCancel={finish}
    >
      <div className="line-board" data-view={view}>
        {fixed.map((c) => (
          <BoardColumn key={c.key} col={c} shared={shared} />
        ))}
        <SortableContext items={moving.map((c) => colDnd(c.key))} strategy={horizontalListSortingStrategy}>
          {moving.map((c) => (
            <BoardColumn key={c.key} col={c} shared={shared} />
          ))}
        </SortableContext>
        <AddColumn view={view} onAdd={(title) => saveBoard(addColumn(board, view, title).board)} />
      </div>
      <DragOverlay dropAnimation={dropAnimation()}>
        {activeCard ? (
          // The tilt is inside: the drag measures the outer box, which keeps the size of the card.
          <div className="line-lift">
            <CardView {...look(activeCard, cols.find((c) => c.key === containerOf(active!)) ?? cols[0])} view={view} notes={notes} links={false} className="is-lifted" />
          </div>
        ) : activeCol ? (
          <BoardColumn col={activeCol} shared={shared} overlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
