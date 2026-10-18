import { useEffect, useRef, useState } from 'react'
import { Popover } from 'radix-ui'
import { CaretDown, Minus, Plus } from '@phosphor-icons/react'
import { useApp } from '@/stores/app'
import { useT } from '@/lib/i18n'
import { nextZoom, setPageZoom, ZOOM_STEPS } from './zoom'

const MIN = Math.round(ZOOM_STEPS[0] * 100)
const MAX = Math.round(ZOOM_STEPS[ZOOM_STEPS.length - 1] * 100)

/**
 * The zoom of the page in the toolbar: the percentage opens a slider. A double click on the slider
 * goes back to 100 %. While the author drags, the zoom follows at once (no animation); − and + use
 * the zoom steps with the smooth change.
 */
export function ZoomControl(): React.JSX.Element {
  const zoom = useApp((s) => s.settings?.ui.zoom ?? 1)
  const t = useT()
  const tb = t.editor.toolbar
  const pct = Math.round(zoom * 100)
  // The value under the thumb while the author drags; the zoom follows it one time per frame.
  const [drag, setDrag] = useState<number | null>(null)
  const frame = useRef(0)
  const pending = useRef<number | null>(null)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const follow = (value: number): void => {
    setDrag(value)
    pending.current = value
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      if (pending.current !== null) setPageZoom(pending.current / 100, undefined, false)
    })
  }

  return (
    <Popover.Root onOpenChange={(open) => !open && setDrag(null)}>
      <Popover.Trigger asChild>
        <button className="toolbar-select toolbar-zoom" aria-label={tb.zoom}>
          <span>{pct}%</span>
          <CaretDown size={10} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="zoom-pop" side="bottom" align="end" sideOffset={8} onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="zoom-pop-head">
            <span className="caps">{tb.zoom}</span>
            <span className="zoom-pop-value">{drag ?? pct}%</span>
          </div>
          <div className="zoom-pop-row">
            <button className="icon-btn zoom-pop-step" aria-label={tb.zoomOut} title={tb.zoomOut} onClick={() => setPageZoom(nextZoom(zoom, -1))}>
              <Minus size={14} />
            </button>
            <input
              className="zoom-slider"
              type="range"
              min={MIN}
              max={MAX}
              step={5}
              value={drag ?? pct}
              aria-label={tb.zoom}
              title={tb.zoomSliderHint}
              onChange={(e) => follow(Number(e.currentTarget.value))}
              onPointerUp={() => setDrag(null)}
              onKeyUp={() => setDrag(null)}
              onDoubleClick={() => {
                // The clicks of the double click moved the thumb: drop that change.
                cancelAnimationFrame(frame.current)
                frame.current = 0
                pending.current = null
                setDrag(null)
                setPageZoom(1)
              }}
            />
            <button className="icon-btn zoom-pop-step" aria-label={tb.zoomIn} title={tb.zoomIn} onClick={() => setPageZoom(nextZoom(zoom, 1))}>
              <Plus size={14} />
            </button>
          </div>
          <button className="zoom-pop-reset" onClick={() => setPageZoom(1)} disabled={pct === 100}>
            {tb.zoomReset} <kbd className="kbd">Ctrl+0</kbd>
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
