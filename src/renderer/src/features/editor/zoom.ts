// Page zoom from the keyboard, the mouse wheel and the toolbar, like a word processor:
// Ctrl+= and Ctrl++ zoom in, Ctrl+- zooms out, Ctrl+0 goes back to 100 %, Ctrl+wheel zooms.
//
// The pages are always laid out at 100 %. The zoom is a scale (a CSS transform) of the whole desk
// content, so a change of zoom never moves a word or a page break, and it can be a smooth animation.
// A "sizer" element around the scaled content has the scaled size, so the desk scrolls correctly.
//
// The page always fits: when the desk is narrower than the pages at 100 % (a narrow window with
// the two side panels), the pages scale down to the width of the desk. The zoom of the author
// multiplies this fit.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '@/stores/app'
import { useBook } from '@/stores/book'

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2]

/** Duration of a zoom change */
const ZOOM_MS = 260

/** The next zoom step up (dir 1) or down (dir -1) from a zoom that may be between two steps. */
export function nextZoom(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > zoom + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]
  return [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001) ?? ZOOM_STEPS[0]
}

/** What a key press does to the zoom, or null. */
export function zoomKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>): 'in' | 'out' | 'reset' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null
  if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') return 'in'
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') return 'out'
  if (e.key === '0' || e.code === 'Numpad0') return 'reset'
  return null
}

/** How the next change of zoom happens: the point to keep in place (client coordinates), and an animation or not */
let request: { point?: { x: number; y: number }; animate: boolean } | null = null

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function currentZoom(): number {
  return useApp.getState().settings?.ui.zoom ?? 1
}

/**
 * Set the page zoom. The text at `point` (client coordinates), or at the reading line, stays in place.
 * `animate`: a smooth change (not while the author drags the zoom slider).
 */
export function setPageZoom(to: number, point?: { x: number; y: number }, animate = true): void {
  if (Math.abs(to - currentZoom()) < 0.0005) return
  request = { point, animate }
  useApp.getState().setUi({ zoom: to })
}

/** The scale that makes the pages (at 100 %) as wide as the desk, or 1 when they fit. */
export function fitScale(room: number, pagesWidth: number): number {
  return room > 0 && pagesWidth > room ? room / pagesWidth : 1
}

/** Ease in and out */
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * The zoom of the desk. `inner` has the pages, laid out at 100 %; `sizer` holds it and has its scaled
 * size. Returns the zoom to show in a short badge after a change, or null.
 */
export function useDeskZoom(
  deskRef: React.RefObject<HTMLDivElement | null>,
  sizerRef: React.RefObject<HTMLDivElement | null>,
  innerRef: React.RefObject<HTMLDivElement | null>
): number | null {
  const target = useApp((s) => s.settings?.ui.zoom ?? 1)
  const [badge, setBadge] = useState<number | null>(null)
  /** The zoom of the author on screen now (it moves to `target` during an animation) */
  const shown = useRef(target)
  /** The scale on screen now: the zoom of the author times the fit to the desk width */
  const effective = useRef(target)
  /** The horizontal offset of the scaled pages (they are centered when narrower than the desk) */
  const offset = useRef(0)
  const frame = useRef(0)

  /** Put the scale on the pages and give the sizer the scaled size. */
  const apply = (s: number): void => {
    const desk = deskRef.current
    const sizer = sizerRef.current
    const inner = innerRef.current
    if (!desk || !sizer || !inner) return
    const room = desk.clientWidth
    const e = s * fitScale(room, inner.offsetWidth)
    effective.current = e
    const w = inner.offsetWidth * e
    const h = inner.offsetHeight * e
    offset.current = w < room ? (room - w) / 2 : 0
    sizer.style.width = `${Math.max(room, w)}px`
    sizer.style.height = `${h}px`
    inner.style.transform = `translate(${offset.current}px, 0) scale(${e})`
    sizer.style.setProperty('--desk-scale', String(e))
  }

  // The size of the pages or of the desk changes (typing, a window resize): the same scale, new sizes.
  useLayoutEffect(() => {
    const desk = deskRef.current
    const inner = innerRef.current
    if (!desk || !inner) return
    apply(shown.current)
    const ro = new ResizeObserver(() => {
      // A new width of the desk can give a new fit: the text at the reading line stays in place.
      const before = effective.current
      apply(shown.current)
      if (Math.abs(effective.current - before) > 0.0005) {
        const ay = desk.clientHeight * 0.3
        desk.scrollTop = ((desk.scrollTop + ay) / before) * effective.current - ay
      }
    })
    ro.observe(inner)
    ro.observe(desk)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskRef, innerRef, sizerRef])

  // A new zoom: scale from the zoom on screen to the new one, around the anchor point.
  useLayoutEffect(() => {
    const desk = deskRef.current
    if (!desk) return
    // A new target stops the animation to the old one, also when the scale on screen is already
    // near the new target.
    cancelAnimationFrame(frame.current)
    frame.current = 0
    const from = shown.current
    const req = request ?? { animate: false }
    request = null
    if (Math.abs(from - target) < 0.0005) {
      if (from !== target) {
        shown.current = target
        apply(target)
      }
      return
    }
    const box = desk.getBoundingClientRect()
    const ay = req.point ? req.point.y - box.top : desk.clientHeight * 0.3
    const ax = req.point ? req.point.x - box.left : desk.clientWidth / 2
    // The anchor point in the coordinates of the pages at 100 %
    const cy = (desk.scrollTop + ay) / effective.current
    const cx = (desk.scrollLeft + ax - offset.current) / effective.current
    const inner = innerRef.current
    const step = (s: number): void => {
      shown.current = s
      apply(s)
      desk.scrollTop = cy * effective.current - ay
      desk.scrollLeft = Math.max(0, cx * effective.current + offset.current - ax)
    }
    desk.style.overflowAnchor = 'none'
    const done = (): void => {
      if (inner) inner.style.willChange = ''
      desk.style.overflowAnchor = ''
    }
    if (!req.animate || reducedMotion()) {
      step(target)
      done()
    } else {
      // Scale on a log curve: each part of the animation zooms by the same factor, so it feels even.
      if (inner) inner.style.willChange = 'transform'
      const t0 = performance.now()
      const tick = (now: number): void => {
        const t = Math.min(1, (now - t0) / ZOOM_MS)
        step(from * Math.pow(target / from, ease(t)))
        if (t < 1) frame.current = requestAnimationFrame(tick)
        else {
          frame.current = 0
          done()
        }
      }
      frame.current = requestAnimationFrame(tick)
    }
    setBadge(target)
    const timer = setTimeout(() => setBadge(null), 1100)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // Keys and the mouse wheel
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const k = zoomKey(e)
      // The Write view stays mounted under the Plan view: its zoom keys work only while it shows.
      if (!k || useBook.getState().view !== 'write') return
      e.preventDefault()
      setPageZoom(k === 'reset' ? 1 : nextZoom(currentZoom(), k === 'in' ? 1 : -1))
    }
    let wheel = 0
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      // One step for each notch of the wheel; a touchpad sends many small steps.
      wheel += e.deltaY
      if (Math.abs(wheel) < 60) return
      const dir = wheel < 0 ? 1 : -1
      wheel = 0
      setPageZoom(nextZoom(currentZoom(), dir), { x: e.clientX, y: e.clientY })
    }
    const el = deskRef.current
    window.addEventListener('keydown', onKey)
    el?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      el?.removeEventListener('wheel', onWheel)
    }
  }, [deskRef])

  return badge
}

/** The scale of the desk now, from an element inside the scaled pages (1 when not scaled). */
export function scaleOf(el: HTMLElement): number {
  const w = el.offsetWidth
  return w ? el.getBoundingClientRect().width / w : 1
}
