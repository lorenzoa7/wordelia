// A text box for the text of a card. "@" and some letters show the notes whose names match; Enter
// or Tab puts "@Name" in the text. The text is one line: Enter submits.

import { forwardRef, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import type { Entry } from '@shared/types'
import { useT } from '@/lib/i18n'
import { MentionIcon } from '@/features/chat/MentionPill'

function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** The "@query" right before the caret, or null. */
function queryAt(text: string, caret: number): { start: number; query: string } | null {
  const m = /(^|[^\p{L}\p{N}])@([^\s@][^@\n]{0,30}|)$/u.exec(text.slice(0, caret))
  if (!m) return null
  return { start: caret - m[2].length - 1, query: m[2] }
}

interface Props {
  value: string
  onChange(value: string): void
  /** Enter, when no suggestion shows */
  onSubmit?(): void
  /** Escape, when no suggestion shows */
  onCancel?(): void
  onBlur?(): void
  notes: Entry[]
  placeholder?: string
  className?: string
  autoFocus?: boolean
  /** The list floats over the page (for a box in a column that scrolls); else it is under the box */
  floating?: boolean
  'aria-label'?: string
}

export interface MentionTextareaHandle {
  focus(): void
}

export const MentionTextarea = forwardRef<MentionTextareaHandle, Props>(function MentionTextarea(
  { value, onChange, onSubmit, onCancel, onBlur, notes, placeholder, className, autoFocus, floating = false, ...rest },
  ref
) {
  const t = useT()
  const box = useRef<HTMLTextAreaElement>(null)
  const listId = useId()
  const [caret, setCaret] = useState(value.length)
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)
  useImperativeHandle(ref, () => ({ focus: () => box.current?.focus() }), [])

  const at = queryAt(value, caret)
  const matches = useMemo(() => {
    if (!at) return []
    const q = fold(at.query)
    // After a space, only longer names go on ("@Ana " still finds "Ana Lúcia", "@Elias " stops).
    const spaced = /\s$/.test(q)
    return notes
      .map((n) => {
        const names = [n.name, ...n.aliases].map(fold)
        const rank = names.some((x) => x.startsWith(q) && (!spaced || x.length > q.length)) ? 0 : !spaced && names.some((x) => x.includes(q)) ? 1 : 2
        return { n, rank }
      })
      .filter((x) => x.rank < 2)
      .sort((a, b) => a.rank - b.rank || a.n.name.localeCompare(b.n.name))
      .slice(0, 6)
      .map((x) => x.n)
  }, [at?.query, notes])
  const open = !closed && matches.length > 0
  const [spot, setSpot] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !floating || !box.current) return
    const r = box.current.getBoundingClientRect()
    setSpot({ left: r.left, top: r.bottom + 4 })
  }, [open, floating, value])

  // After a pick, the caret goes after the name, right when the new text is in the box (before
  // the next key).
  const caretAfter = useRef<number | null>(null)
  // The box grows with its text.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    if (caretAfter.current !== null) {
      el.setSelectionRange(caretAfter.current, caretAfter.current)
      caretAfter.current = null
    }
  }, [value])

  useLayoutEffect(() => {
    if (!autoFocus) return
    const el = box.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus])

  const pick = (n: Entry): void => {
    if (!at) return
    const before = value.slice(0, at.start)
    const after = value.slice(caret).replace(/^\S*/, '')
    const insert = `@${n.name}${after.startsWith(' ') ? '' : ' '}`
    const next = before + insert + after
    const pos = before.length + insert.length
    onChange(next)
    setCaret(pos)
    setActive(0)
    caretAfter.current = pos
    // The list closes after a pick: a longer name ("Ana Lúcia" after "Ana") shows again only when the author types.
    setClosed(true)
  }

  return (
    <div className="line-input-wrap">
      <textarea
        ref={box}
        rows={1}
        className={clsx('line-input', className)}
        value={value}
        placeholder={placeholder}
        spellCheck
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        {...rest}
        onChange={(e) => {
          onChange(e.target.value)
          setCaret(e.target.selectionStart)
          setClosed(false)
          setActive(0)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const n = matches.length
              setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n))
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              pick(matches[Math.min(active, matches.length - 1)])
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setClosed(true)
              return
            }
          }
          if (e.key === 'Enter') {
            // One line: Enter never makes a new line.
            e.preventDefault()
            if (!e.shiftKey) onSubmit?.()
            return
          }
          if (e.key === 'Escape' && onCancel) {
            e.preventDefault()
            e.stopPropagation()
            onCancel()
          }
        }}
      />
      {open && (!floating || spot) && wrapList(
        <ul className={clsx('line-suggest', floating && 'is-floating')} style={floating && spot ? { left: spot.left, top: spot.top } : undefined} id={listId} role="listbox" aria-label={t.plan.line.suggestions}>
          {matches.map((n, i) => (
            <li
              key={n.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={clsx('line-suggest-item', i === active && 'is-active')}
              // Keep the focus in the text box.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(n)}
            >
              <MentionIcon kind="entry" id={n.id} size={13} />
              <span>{n.name}</span>
            </li>
          ))}
        </ul>,
        floating
      )}
    </div>
  )
})

/** A floating list goes to the end of the page, so a column that scrolls does not cut it. */
function wrapList(list: React.JSX.Element, floating: boolean): React.ReactNode {
  return floating ? createPortal(list, document.body) : list
}
