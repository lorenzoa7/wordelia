import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import clsx from 'clsx'
import { Tooltip } from '@/ui'
import { useT } from '@/lib/i18n'

const SPRING = { type: 'spring', stiffness: 380, damping: 40 } as const
/** A panel dragged narrower than this part of its minimum width snaps closed. */
const SNAP = 0.55
/** Half the width of the drag edge, in pixels */
const EDGE = 4

/**
 * A side panel of the book view (the sidebar on the left, the chat on the right).
 * Its edge resizes it. Drag it past the minimum width and the panel snaps closed;
 * drag the edge out again, or click it, and the panel opens.
 */
export function SidePanel({
  side,
  open,
  width,
  min,
  max,
  defaultWidth,
  fit,
  label,
  className,
  edgeClassName,
  onChange,
  children
}: {
  side: 'left' | 'right'
  open: boolean
  width: number
  min: number
  max: number
  defaultWidth: number
  /** The widest the panel can be now (a narrow window). The saved width does not change. */
  fit?: number
  /** aria-label of the drag edge */
  label: string
  className: string
  edgeClassName?: string
  onChange: (patch: { open?: boolean; width?: number }) => void
  children: ReactNode
}): React.JSX.Element {
  const t = useT()
  const reduce = useReducedMotion()
  const spring = reduce ? { duration: 0 } : SPRING
  const cap = Math.max(min, Math.min(max, fit ?? max))
  const clamp = (v: number): number => Math.min(cap, Math.max(min, v))
  const openWidth = clamp(width)
  /** The width on screen: 0 when closed. */
  const w = useMotionValue(open ? openWidth : 0)
  /** The width of the content: it keeps its size while the panel closes. */
  const inner = useMotionValue(openWidth)
  const opacity = useTransform(w, [0, min * SNAP], [0, 1])
  // The edge sits on the line between the panel and the page.
  const edgeX = useTransform(w, (v) => (side === 'left' ? Math.max(0, v - EDGE) : EDGE - v))
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)

  // Follow the settings: toggle buttons, shortcuts, the end of a drag.
  useEffect(() => {
    if (draggingRef.current) return
    inner.jump(openWidth)
    const a = animate(w, open ? openWidth : 0, spring)
    return () => a.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openWidth])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    e.preventDefault()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = open ? w.get() : 0
    let closed = !open
    let last = openWidth
    let moved = false
    let settleUntil = 0
    draggingRef.current = true
    setDragging(true)

    const move = (ev: PointerEvent): void => {
      const dx = side === 'left' ? ev.clientX - startX : startX - ev.clientX
      if (Math.abs(dx) > 3) moved = true
      if (!moved) return
      const raw = startW + dx
      if (raw < min * SNAP) {
        if (!closed) {
          closed = true
          animate(w, 0, spring)
        }
        return
      }
      last = clamp(raw)
      inner.jump(last)
      if (closed) {
        // Snap open, then follow the pointer.
        closed = false
        settleUntil = performance.now() + 260
        animate(w, last, spring)
      } else if (performance.now() < settleUntil) animate(w, last, spring)
      else w.jump(last)
    }
    const up = (): void => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      draggingRef.current = false
      setDragging(false)
      if (!moved) {
        // A click on the edge of a closed panel opens it.
        if (!open) onChange({ open: true })
        return
      }
      if (closed) {
        if (open) onChange({ open: false })
        else animate(w, 0, spring)
      } else onChange({ open: true, width: Math.round(last) })
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange({ open: !open })
      return
    }
    const step = e.shiftKey ? 60 : 20
    const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight'
    if (e.key !== grow && e.key !== shrink) return
    e.preventDefault()
    if (!open) {
      if (e.key === grow) onChange({ open: true })
      return
    }
    onChange({ width: clamp(openWidth + (e.key === grow ? step : -step)) })
  }

  return (
    <>
      <motion.div className={clsx('side-panel', `side-panel-${side}`, className, dragging && 'is-resizing')} style={{ width: w, opacity }}>
        <motion.div className="side-panel-inner" style={{ width: inner }} inert={!open}>
          {children}
        </motion.div>
      </motion.div>
      <Tooltip label={open ? t.app.resizeHint : t.app.openHint} side={side === 'left' ? 'right' : 'left'} delay={900}>
        <motion.div
          className={clsx('panel-edge', `panel-edge-${side}`, edgeClassName, dragging && 'is-dragging', !open && 'is-closed')}
          style={{ x: edgeX }}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={open ? Math.round(openWidth) : 0}
          onPointerDown={onPointerDown}
          onDoubleClick={() => onChange({ open: true, width: defaultWidth })}
          onKeyDown={onKeyDown}
        />
      </Tooltip>
    </>
  )
}
