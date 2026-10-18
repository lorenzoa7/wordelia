// Keep the end of the thread in view: after the user sends a message, when a thread opens, and while a reply streams.

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

/** The view is at the end when it is this close to it, in pixels. */
const AT_END = 4
/** A scroll down to this close to the end starts the follow again, also when the reply grows during the scroll. */
const NEAR_END = 40
/** After a jump to the end, and after a reply ends, late changes (fonts, images, cards) keep the end in view for this long. */
const SETTLE_MS = 1500

/**
 * Follow the end of a scroll box. While the box follows, a change of size of the box or of its content puts
 * the end in view again at once, before the browser paints: new text, the thinking line, a font that loads.
 * Changes of the content are followed while `busy` (a reply streams) and for a short time after `follow()`
 * and after the reply ends. A change of the box itself (for example a taller composer) is followed always.
 * The user stops it with a scroll up, and starts it again with a scroll back to the end.
 * Returns `follow`: go to the end now and follow.
 */
export function useFollowEnd(box: HTMLElement | null, content: HTMLElement | null, busy: boolean): () => void {
  const on = useRef(true)
  const until = useRef(0)
  const busyNow = useRef(busy)
  const last = useRef({ top: 0, height: 0 })

  const toEnd = useCallback((): void => {
    if (!box) return
    box.scrollTop = box.scrollHeight
    last.current = { top: box.scrollTop, height: box.scrollHeight }
  }, [box])

  const follow = useCallback((): void => {
    on.current = true
    until.current = performance.now() + SETTLE_MS
    toEnd()
  }, [toEnd])

  // The reply ends: the saved message takes the place of the streamed one. Follow it for a moment more.
  useLayoutEffect(() => {
    const was = busyNow.current
    busyNow.current = busy
    if (was && !busy && on.current) follow()
  }, [busy, follow])

  useEffect(() => {
    if (!box || !content) return
    last.current = { top: box.scrollTop, height: box.scrollHeight }
    const gap = (): number => box.scrollHeight - box.scrollTop - box.clientHeight
    const onScroll = (): void => {
      const prev = last.current
      // The view went up and the content did not get shorter: the user scrolled up.
      const up = box.scrollTop < prev.top - 1 && box.scrollHeight >= prev.height
      // A scroll up never starts the follow, also when its first step is still near the end.
      if (up) {
        if (gap() > AT_END) on.current = false
      } else if (gap() <= NEAR_END) on.current = true
      last.current = { top: box.scrollTop, height: box.scrollHeight }
    }
    // The wheel or a key goes up: stop at once, before the scroll starts. Else the next change of size
    // could put the view back at the end in the middle of the scroll.
    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY < 0 && box.scrollTop > 0) on.current = false
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') on.current = false
    }
    const ro = new ResizeObserver((entries) => {
      if (!on.current) return
      const ofContent = entries.some((e) => e.target === content)
      if (!ofContent || busyNow.current || performance.now() < until.current) toEnd()
      // At rest, for example when the user opens the thinking of a reply: do not move the view.
      else on.current = gap() <= NEAR_END
    })
    ro.observe(box)
    ro.observe(content)
    box.addEventListener('scroll', onScroll, { passive: true })
    box.addEventListener('wheel', onWheel, { passive: true })
    box.addEventListener('keydown', onKey)
    return () => {
      ro.disconnect()
      box.removeEventListener('scroll', onScroll)
      box.removeEventListener('wheel', onWheel)
      box.removeEventListener('keydown', onKey)
    }
  }, [box, content, toEnd])

  return follow
}
