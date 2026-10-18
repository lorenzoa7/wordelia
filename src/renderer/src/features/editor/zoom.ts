// Page zoom from the keyboard, the mouse wheel and the toolbar, like a word processor:
// Ctrl+= and Ctrl++ zoom in, Ctrl+- zooms out, Ctrl+0 goes back to 100 %, Ctrl+wheel zooms.
//
// Everything on the desk follows the zoom in CSS (`--page-zoom`): page sizes, fonts, the chapter
// heading and the page gaps. So a new zoom shows in one frame, a page holds the same text at every
// zoom, and the scroll position only has to scale.

import { useEffect, useLayoutEffect, useState } from 'react'
import { useApp } from '@/stores/app'

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.2, 1.35, 1.5, 1.75, 2]

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

/** The desk of the Write view, while it is on screen */
let desk: HTMLElement | null = null
/** The point to keep in place (desk coordinates), the scroll position and the zoom before the change */
let anchor: { x: number; y: number; top: number; left: number; from: number; animate: boolean } | null = null

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function currentZoom(): number {
  return useApp.getState().settings?.ui.zoom ?? 1
}

/**
 * Set the page zoom. The text at `point` (client coordinates), or at the reading line, stays in place.
 * `animate`: a short, smooth change of size (not while the author drags the zoom slider).
 */
export function setPageZoom(to: number, point?: { x: number; y: number }, animate = true): void {
  const cur = currentZoom()
  if (Math.abs(to - cur) < 0.001) return
  if (desk) {
    // The browser keeps an element in place when sizes change (scroll anchoring). Here the app
    // scales the scroll position itself, so the browser must not move it too.
    desk.style.overflowAnchor = 'none'
    const box = desk.getBoundingClientRect()
    anchor = {
      y: point ? point.y - box.top : desk.clientHeight * 0.3,
      x: point ? point.x - box.left : desk.clientWidth / 2,
      // Read now: a smaller zoom makes the desk shorter, and the browser then pulls the scroll up.
      top: desk.scrollTop,
      left: desk.scrollLeft,
      from: cur,
      animate
    }
  }
  useApp.getState().setUi({ zoom: to })
}

/** Zoom shortcuts for the desk. Returns the zoom to show in a short badge after a change, or null. */
export function usePageZoom(deskRef: React.RefObject<HTMLDivElement | null>): number | null {
  const zoom = useApp((s) => s.settings?.ui.zoom ?? 1)
  const [badge, setBadge] = useState<number | null>(null)

  useEffect(() => {
    desk = deskRef.current
    const onKey = (e: KeyboardEvent): void => {
      const k = zoomKey(e)
      if (!k) return
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
      if (desk === el) desk = null
      window.removeEventListener('keydown', onKey)
      el?.removeEventListener('wheel', onWheel)
    }
  }, [deskRef])

  // The new sizes are on the page now: scale the scroll position around the anchor point. The top
  // padding of the desk does not follow the zoom.
  useLayoutEffect(() => {
    const a = anchor
    const el = deskRef.current
    if (!a || !el) return
    anchor = null
    const ratio = zoom / a.from
    const inner = el.firstElementChild as HTMLElement | null
    const pad = inner ? parseFloat(getComputedStyle(inner).paddingTop) || 0 : 0
    el.scrollTop = (a.top + a.y - pad) * ratio + pad - a.y
    el.scrollLeft = Math.max(0, (a.left + a.x) * ratio - a.x)
    // A smooth change, like a word processor: the pages have their new size already; show them at the
    // old size around the anchor point, and let them grow or shrink to the new size. Only a transform
    // moves: the text is laid out one time.
    if (inner && a.animate && !reducedMotion()) {
      inner.style.transition = 'none'
      inner.style.transformOrigin = `${el.scrollLeft + a.x}px ${el.scrollTop + a.y}px`
      inner.style.transform = `scale(${1 / ratio})`
      void inner.offsetWidth
      inner.style.transition = 'transform 160ms var(--ease-out)'
      inner.style.transform = ''
      const clear = (): void => {
        inner.style.transition = ''
        inner.style.transformOrigin = ''
      }
      inner.addEventListener('transitionend', clear, { once: true })
      setTimeout(clear, 250)
    }
    // Scroll anchoring again from the next frame: when a chapter far away gets its editor and its
    // real height, the browser keeps the text on screen in place.
    const restore = requestAnimationFrame(() => {
      if (!anchor) el.style.overflowAnchor = ''
    })
    setBadge(zoom)
    const timer = setTimeout(() => setBadge(null), 1100)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(restore)
    }
  }, [zoom, deskRef])

  return badge
}
