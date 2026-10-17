// Page zoom from the keyboard and the mouse wheel, like a word processor:
// Ctrl+= and Ctrl++ zoom in, Ctrl+- zooms out, Ctrl+0 goes back to 100 %, Ctrl+wheel zooms.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

/**
 * Zoom shortcuts for the desk. The text at the reading line (or under the mouse) stays in place.
 * Returns the zoom to show in a short badge after a change, or null.
 */
export function usePageZoom(deskRef: React.RefObject<HTMLDivElement | null>): number | null {
  const zoom = useApp((s) => s.settings?.ui.zoom ?? 1)
  const [badge, setBadge] = useState<number | null>(null)
  /** The point to keep in place, in desk coordinates, and the zoom before the change */
  const anchor = useRef<{ y: number; x: number; from: number } | null>(null)

  useEffect(() => {
    const set = (to: number, point?: { x: number; y: number }): void => {
      const desk = deskRef.current
      const cur = useApp.getState().settings?.ui.zoom ?? 1
      if (!desk || Math.abs(to - cur) < 0.001) return
      const box = desk.getBoundingClientRect()
      anchor.current = {
        y: point ? point.y - box.top : desk.clientHeight * 0.3,
        x: point ? point.x - box.left : desk.clientWidth / 2,
        from: cur
      }
      useApp.getState().setUi({ zoom: to })
    }
    const onKey = (e: KeyboardEvent): void => {
      const k = zoomKey(e)
      if (!k) return
      e.preventDefault()
      const cur = useApp.getState().settings?.ui.zoom ?? 1
      set(k === 'reset' ? 1 : nextZoom(cur, k === 'in' ? 1 : -1))
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
      set(nextZoom(useApp.getState().settings?.ui.zoom ?? 1, dir), { x: e.clientX, y: e.clientY })
    }
    const desk = deskRef.current
    window.addEventListener('keydown', onKey)
    desk?.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKey)
      desk?.removeEventListener('wheel', onWheel)
    }
  }, [deskRef])

  // After the pages get their new size, scroll so the anchor point shows the same text.
  useLayoutEffect(() => {
    const a = anchor.current
    const desk = deskRef.current
    if (!a || !desk) return
    anchor.current = null
    const ratio = zoom / a.from
    desk.scrollTop = (desk.scrollTop + a.y) * ratio - a.y
    desk.scrollLeft = Math.max(0, (desk.scrollLeft + a.x) * ratio - a.x)
    setBadge(zoom)
    const timer = setTimeout(() => setBadge(null), 1100)
    return () => clearTimeout(timer)
  }, [zoom, deskRef])

  return badge
}
