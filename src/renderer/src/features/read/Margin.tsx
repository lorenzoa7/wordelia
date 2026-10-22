// The margin of the comments of an editor's read: the cards of the open comments of the chapter on screen,
// in a column to the right of the page, each next to its passage (or lower, when the card above takes the
// place). A thin line joins the selected card to its passage. In a narrow window there is no column: a
// click on a number in the margin of the page opens its card in a popover.
//
// The cards never move while the author types: they go to their new places at the pause.

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Popover } from 'radix-ui'
import { CaretDown, EyeSlash, Eyeglasses } from '@phosphor-icons/react'
import { LENSES, type LensChoice } from '@shared/comments'
import { getChapterEditor } from '@/features/editor/registry'
import { useT } from '@/lib/i18n'
import { useBook } from '@/stores/book'
import { Menu, MenuItem } from '@/ui'
import { CommentCard, type Card } from './Card'
import { CARD_INSET, layoutCards, type CardBox } from './layout'
import { commentRanges, inChapterOrder, rangesKnown, useMarksDrawn } from './marks'
import { useComments } from './store'
import { hideComments, selectComment, setCommentLens, showCardPopover, useReadUi } from './ui'
import './read.css'

/** The space between two cards, and between the header and the first card */
const CARD_GAP = 10
/** From the top of a card to the middle of its number (read.css): the number of the card is level with the number of its passage. */
const BADGE_MIDDLE = 21

/** The cards of the open comments of a chapter: the comments with a passage in the order of the text, then the lost ones. */
function useChapterCards(chapterId: string | null): Card[] {
  const root = useBook((s) => s.root)
  const list = useComments((s) => s.list)
  const listRoot = useComments((s) => s.root)
  // A new draw of the marks: new passages, new numbers.
  const drawn = useMarksDrawn((s) => s.n)
  return useMemo(() => {
    if (!chapterId || listRoot !== root) return []
    const open = list.filter((c) => c.chapterId === chapterId && c.state === 'open')
    if (!open.length) return []
    const ranges = commentRanges(chapterId)
    const known = rangesKnown(chapterId)
    const placed = inChapterOrder(open.filter((c) => !c.lost), ranges)
    // A comment of a chapter on screen whose passage the editor did not find has no passage now (a text from
    // outside): it shows as lost, and nothing is written.
    const lost = open.filter((c) => c.lost || (known && !ranges.has(c.id)))
    return [...placed.map((c, i) => ({ c, n: i + 1, lost: false })), ...lost.map((c) => ({ c, n: null, lost: true }))]
    // `drawn` is in the list: the ranges are read from the editors.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, list, listRoot, root, drawn])
}

interface MarginProps {
  /** The column has room on the desk (zoom.ts) */
  column: boolean
  /** The author is typing: the cards stay where they are */
  typing: boolean
  /** The element of the desk that scrolls with the pages and has their scaled size */
  sizerRef: React.RefObject<HTMLDivElement | null>
}

export function Margin({ column, typing, sizerRef }: MarginProps): React.JSX.Element | null {
  const chapterId = useBook((s) => s.activeChapterId)
  const chapterNumber = useBook((s) => s.chapters.findIndex((c) => c.id === s.activeChapterId) + 1)
  const hidden = useReadUi((s) => s.hidden)
  const lens = useReadUi((s) => s.lens)
  const selected = useReadUi((s) => s.selected)
  const readOnly = useComments((s) => s.readOnly)
  const all = useChapterCards(chapterId)
  const cards = useMemo(() => all.filter((x) => lens === 'all' || x.c.lens === lens), [all, lens])
  const counts = useMemo(() => {
    const m = new Map<LensChoice, number>([['all', all.length]])
    for (const x of all) m.set(x.c.lens, (m.get(x.c.lens) ?? 0) + 1)
    return m
  }, [all])
  // The card in a popover beside its number (a narrow desk): a click on a number, or goToComment. It belongs
  // to its comment, not to the chapter on screen: a scroll that makes another chapter active keeps it.
  const pop = useReadUi((s) => s.popover)
  // (A book that opens closes it: ui.ts.)
  const popComment = useComments((s) => (pop ? s.list.find((c) => c.id === pop && c.state === 'open') : undefined))
  const popCards = useChapterCards(popComment?.chapterId ?? null)
  const popNumber = useBook((s) => (popComment ? s.chapters.findIndex((c) => c.id === popComment.chapterId) + 1 : 0))

  const headRef = useRef<HTMLElement>(null)
  const colRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<SVGPathElement>(null)
  const cardEls = useRef(new Map<string, HTMLElement>())
  const typingRef = useRef(typing)
  typingRef.current = typing
  const columnRef = useRef(column)
  columnRef.current = column
  /** The cards changed while the author typed: they move at the pause. */
  const pending = useRef(false)
  // The header shows while the desk keeps room for the column, also for a chapter without comments ("· 0").
  const showColumn = column && !hidden

  /** The thin line from the number of the selected comment in the margin of the page to its card. */
  const drawLink = (sizer: HTMLElement, origin: DOMRect): void => {
    const path = linkRef.current
    if (!path) return
    const id = useReadUi.getState().selected
    const el = id ? cardEls.current.get(id) : undefined
    const num = id && el ? sizer.querySelector<HTMLElement>(`.cm-num[data-comment="${CSS.escape(id)}"]`) : null
    if (!el || !num || el.dataset.placed === undefined) {
      path.removeAttribute('d')
      return
    }
    const a = num.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    const x1 = a.right - origin.left + 2
    const y1 = a.top + a.height / 2 - origin.top
    const x2 = b.left - origin.left
    const y2 = b.top - origin.top + BADGE_MIDDLE
    const mid = (x1 + x2) / 2
    path.setAttribute('d', `M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}`)
  }

  /** Put the header and the cards next to their passages, and draw the line of the selected card. */
  const relayoutRef = useRef<() => void>(() => {})
  relayoutRef.current = (): void => {
    if (typingRef.current) {
      pending.current = true
      return
    }
    pending.current = false
    const sizer = sizerRef.current
    const col = colRef.current
    const head = headRef.current
    if (!sizer || !col || !head || !chapterId) return
    const sheet = sizer.querySelector<HTMLElement>(`.page[data-chapter="${CSS.escape(chapterId)}"]`)
    if (!sheet) return
    const origin = sizer.getBoundingClientRect()
    const page = sheet.getBoundingClientRect()
    col.style.left = `${Math.round(page.right - origin.left + CARD_INSET)}px`
    const text = sheet.querySelector<HTMLElement>('.manuscript')
    const start = (text ?? sheet).getBoundingClientRect().top - origin.top
    const items: CardBox[] = []
    let last = start
    for (const { c, n } of cards) {
      const el = cardEls.current.get(c.id)
      if (!el) continue
      const num = n !== null ? sizer.querySelector<HTMLElement>(`.cm-num[data-comment="${CSS.escape(c.id)}"]`) : null
      const box = num?.getBoundingClientRect()
      // A card without a number goes after the card before it.
      const top = box ? box.top + box.height / 2 - origin.top - BADGE_MIDDLE : last
      last = top
      items.push({ id: c.id, top, height: el.offsetHeight })
    }
    const headH = head.offsetHeight
    const headTop = Math.max(page.top - origin.top + CARD_GAP, (items[0]?.top ?? start + headH + CARD_GAP) - headH - CARD_GAP)
    const laid = layoutCards([{ id: '', top: headTop, height: headH }, ...items], CARD_GAP)
    head.style.top = `${Math.round(laid[0].top)}px`
    for (const { id, top } of laid.slice(1)) {
      const el = cardEls.current.get(id)
      if (!el) continue
      el.style.top = `${Math.round(top)}px`
      el.dataset.placed = ''
    }
    drawLink(sizer, origin)
  }

  // After each render: new cards, new heights, a new selection.
  useLayoutEffect(() => {
    if (showColumn) relayoutRef.current()
  })

  // The pause after typing: the cards go to their new places.
  useEffect(() => {
    if (!typing && pending.current) relayoutRef.current()
  }, [typing])

  // The pages or the desk change size (the zoom, a new line, a window resize).
  useEffect(() => {
    const sizer = sizerRef.current
    if (!sizer || !showColumn) return
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => relayoutRef.current())
    })
    ro.observe(sizer)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [sizerRef, showColumn])

  // A click on a number in the margin of the page: select its card, or open it in a popover.
  useEffect(() => {
    const sizer = sizerRef.current
    if (!sizer) return
    const numberOf = (e: Event): HTMLElement | null => (e.target instanceof Element ? e.target.closest<HTMLElement>('.cm-num[data-comment]') : null)
    // The cursor and the focus stay in the text.
    const onDown = (e: MouseEvent): void => {
      if (numberOf(e)) e.preventDefault()
    }
    const onClick = (e: MouseEvent): void => {
      const num = numberOf(e)
      const id = num?.dataset.comment
      if (!num || !id) return
      e.preventDefault()
      const chapter = num.closest<HTMLElement>('.page[data-chapter]')?.dataset.chapter
      if (chapter && chapter !== useBook.getState().activeChapterId) useBook.getState().setActiveChapter(chapter)
      if (columnRef.current) {
        selectComment(id)
        requestAnimationFrame(() => cardEls.current.get(id)?.scrollIntoView({ block: 'nearest' }))
      } else showCardPopover(id)
    }
    sizer.addEventListener('mousedown', onDown, true)
    sizer.addEventListener('click', onClick)
    return () => {
      sizer.removeEventListener('mousedown', onDown, true)
      sizer.removeEventListener('click', onClick)
    }
  }, [sizerRef])

  // The popover belongs to the narrow desk, and to an open comment: it closes when the column comes back, the
  // comments hide, or the comment closes.
  const popCard: Card | undefined = popComment ? (popCards.find((x) => x.c.id === popComment.id) ?? { c: popComment, n: null, lost: Boolean(popComment.lost) }) : undefined
  useEffect(() => {
    if (pop && (column || hidden || !popComment)) showCardPopover(null)
  }, [pop, column, hidden, popComment])

  if (hidden) return null

  const setCardEl =
    (id: string) =>
    (el: HTMLElement | null): void => {
      if (el) cardEls.current.set(id, el)
      else cardEls.current.delete(id)
    }
  const selectedCard = cards.find((x) => x.c.id === selected)

  return (
    <div className="cm-margin">
      {showColumn && (
        <div ref={colRef} className="cm-column">
          <MarginHead headRef={headRef} shown={cards.length} lens={lens} counts={counts} />
          {cards.map((card) => (
            <CommentCard
              key={card.c.id}
              card={card}
              chapterNumber={chapterNumber}
              readOnly={readOnly}
              selected={card.c.id === selected}
              onSelect={() => selectComment(card.c.id)}
              cardRef={setCardEl(card.c.id)}
            />
          ))}
        </div>
      )}
      {showColumn && selectedCard && selectedCard.n !== null && (
        <>
          <svg className="cm-link" width="1" height="1" aria-hidden>
            <path ref={linkRef} className={`cm-${selectedCard.c.lens}`} />
          </svg>
          {/* The number of the selected comment in the margin of the page is full, like its card. */}
          <style>{`.cm-num[data-comment="${CSS.escape(selectedCard.c.id)}"]{background:var(--lens-ink);box-shadow:none;color:var(--paper)}`}</style>
        </>
      )}
      <NumberPopover id={popCard ? pop : null} onClose={() => showCardPopover(null)}>
        {popCard && <CommentCard card={popCard} chapterNumber={popNumber} readOnly={readOnly} selected={false} />}
      </NumberPopover>
    </div>
  )
}

/** The header of the column: the count, the lens filter and "Hide". */
function MarginHead({ headRef, shown, lens, counts }: { headRef: React.RefObject<HTMLElement | null>; shown: number; lens: LensChoice; counts: Map<LensChoice, number> }): React.JSX.Element {
  const t = useT()
  const m = t.read.margin
  const choices = (['all', ...LENSES] as LensChoice[]).filter((l) => l === 'all' || l === lens || counts.get(l))
  return (
    <header ref={headRef} className="cm-head">
      <div className="cm-head-title caps">
        <Eyeglasses size={14} aria-hidden />
        <span>{m.title(shown)}</span>
      </div>
      <div className="cm-head-tools">
        <Menu
          align="start"
          trigger={
            <button type="button" className="cm-filter" aria-label={m.filter}>
              <span>{t.read.lens[lens]}</span>
              <CaretDown size={11} aria-hidden />
            </button>
          }
        >
          {choices.map((l) => (
            <MenuItem key={l} checked={l === lens} shortcut={String(counts.get(l) ?? 0)} onSelect={() => setCommentLens(l)}>
              {t.read.lens[l]}
            </MenuItem>
          ))}
        </Menu>
        <button type="button" className="cm-hide" onClick={hideComments}>
          <EyeSlash size={13} aria-hidden />
          <span>{m.hide}</span>
        </button>
      </div>
    </header>
  )
}

/** The card of a number in a narrow window, beside the number. */
function NumberPopover({ id, onClose, children }: { id: string | null; onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  const idRef = useRef(id)
  idRef.current = id ?? idRef.current
  const last = useRef(new DOMRect())
  const escaped = useRef(false)
  // The number can be drawn again while the popover is open: the anchor finds it each time.
  const anchor = useRef({
    getBoundingClientRect: (): DOMRect => {
      const num = idRef.current ? document.querySelector<HTMLElement>(`.cm-num[data-comment="${CSS.escape(idRef.current)}"]`) : null
      if (num) last.current = num.getBoundingClientRect()
      return last.current
    }
  })
  return (
    <Popover.Root open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <Popover.Anchor virtualRef={anchor} />
      <Popover.Portal>
        <Popover.Content
          className="cm-pop"
          side="right"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          tabIndex={-1}
          // The focus goes to the card, not to its first button: a button with the focus shows its tooltip.
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            ;(e.currentTarget as HTMLElement).focus()
          }}
          onEscapeKeyDown={() => (escaped.current = true)}
          // Esc gives the focus back to the text; a click somewhere else keeps it there.
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            const chapter = useBook.getState().activeChapterId
            if (escaped.current && chapter) getChapterEditor(chapter)?.editor.commands.focus(null, { scrollIntoView: false })
            escaped.current = false
          }}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
