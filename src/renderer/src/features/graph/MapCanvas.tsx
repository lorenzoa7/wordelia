// The map itself: an SVG graph with pan, zoom, drag and hover.
// React draws the nodes and the edges once. Each animation frame moves them directly in the DOM,
// so 300 nodes stay smooth.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'
import { ArrowsIn, Minus, Plus } from '@phosphor-icons/react'
import clsx from 'clsx'
import { adjacency, type MapNode, type PlanningMap } from '@shared/planning/graph'
import { IconButton } from '@/ui'
import { MapLayout, clamp, edgeKey, fitView, nodeRadius, toWorld, zoomAt, type Point, type View } from './layout'

interface Memory {
  pos: Map<string, Point>
  view: View | null
  /** The user moved or zoomed the view: do not fit it again */
  userView: boolean
  sig: string
}

/** The last layout and view of each book, for this session. */
const memory = new Map<string, Memory>()

function signature(map: PlanningMap): string {
  return `${map.nodes.map((n) => n.id).join(',')}|${map.edges.map(edgeKey).join(',')}`
}

/** All labels show when the map is small or near. */
const ALL_LABELS_NODES = 40
const ALL_LABELS_ZOOM = 1.1
/** Else only the labels of the nodes with the most links */
const MAJOR_LABELS = 14

export interface MapCanvasProps {
  map: PlanningMap
  /** The book root: each book keeps its own layout */
  memoryKey: string
  /** Color slot of a node (the order of its category), -1 for a chapter */
  colorOf: (n: MapNode) => number
  labelOf: (n: MapNode) => string
  /** Search results, the best first */
  matches: string[]
  ariaLabel: string
  onOpen: (n: MapNode) => void
  renderCard: (n: MapNode) => ReactNode
  texts: { zoomIn: string; zoomOut: string; fit: string }
}

export function MapCanvas({ map, memoryKey, colorOf, labelOf, matches, ariaLabel, onOpen, renderCard, texts }: MapCanvasProps): React.JSX.Element {
  const reduce = useReducedMotion() ?? false
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const nodeEls = useRef(new Map<string, SVGGElement>())
  const edgeEls = useRef(new Map<string, SVGLineElement>())
  const tagEls = useRef(new Map<string, SVGGElement>())
  const layoutRef = useRef<MapLayout | null>(null)
  const viewRef = useRef<View>({ x: 0, y: 0, k: 1 })
  const sizeRef = useRef({ w: 0, h: 0 })
  const autoFit = useRef(true)
  /** The map was on screen before this layout */
  const shown = useRef(false)
  const anim = useRef<{ from: View; to: View; t0: number } | null>(null)
  const raf = useRef(0)
  const hoverRef = useRef<string | null>(null)
  const drag = useRef<{ id: string | null; start: Point; view: View; moved: boolean; pointer: number } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [grabbing, setGrabbing] = useState<'pan' | 'node' | null>(null)

  const nodeById = useMemo(() => new Map(map.nodes.map((n) => [n.id, n])), [map])
  const adj = useMemo(() => adjacency(map), [map])
  const major = useMemo(() => {
    const ranked = map.nodes.filter((n) => n.degree > 0).sort((a, b) => b.degree - a.degree)
    return new Set(ranked.slice(0, MAJOR_LABELS).map((n) => n.id))
  }, [map])
  const matchSet = useMemo(() => new Set(matches), [matches])
  const near = useMemo(() => (hover ? new Set([hover, ...(adj.get(hover) ?? [])]) : null), [hover, adj])

  /* ---------- Drawing (only refs: also safe from old closures) ---------- */

  const placeCard = (): void => {
    const card = cardRef.current
    const id = hoverRef.current
    const n = id ? layoutRef.current?.byId.get(id) : null
    if (!card || !n) return
    const v = viewRef.current
    const { w, h } = sizeRef.current
    const sx = (n.x ?? 0) * v.k + v.x
    const sy = (n.y ?? 0) * v.k + v.y
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    // Right of the node and its label; left of them near the right edge
    const gap = Math.max(n.r * v.k, n.w / 2) + 12
    const left = sx + gap + cw > w - 8 ? sx - gap - cw : sx + gap
    card.style.transform = `translate(${clamp(left, 8, Math.max(8, w - cw - 8)).toFixed(0)}px, ${clamp(sy - ch / 2, 8, Math.max(8, h - ch - 8)).toFixed(0)}px)`
  }

  const paint = (): void => {
    const layout = layoutRef.current
    const svg = svgRef.current
    if (!layout || !svg) return
    for (const n of layout.nodes) {
      const at = `translate(${(n.x ?? 0).toFixed(1)},${(n.y ?? 0).toFixed(1)})`
      nodeEls.current.get(n.id)?.setAttribute('transform', at)
      tagEls.current.get(n.id)?.setAttribute('transform', at)
    }
    for (const e of layout.edges) {
      const el = edgeEls.current.get(e.key)
      if (!el) continue
      el.setAttribute('x1', (e.a.x ?? 0).toFixed(1))
      el.setAttribute('y1', (e.a.y ?? 0).toFixed(1))
      el.setAttribute('x2', (e.b.x ?? 0).toFixed(1))
      el.setAttribute('y2', (e.b.y ?? 0).toFixed(1))
    }
    const v = viewRef.current
    worldRef.current?.setAttribute('transform', `translate(${v.x.toFixed(2)},${v.y.toFixed(2)}) scale(${v.k.toFixed(4)})`)
    svg.style.setProperty('--map-k', v.k.toFixed(4))
    svg.dataset.labels = layout.nodes.length <= ALL_LABELS_NODES || v.k >= ALL_LABELS_ZOOM ? 'all' : 'major'
    placeCard()
  }

  const fitTarget = (): View => {
    const { w, h } = sizeRef.current
    return fitView(layoutRef.current?.bounds() ?? null, w, h)
  }

  const frame = (now: number): void => {
    raf.current = 0
    const layout = layoutRef.current
    if (!layout) return
    let again = false
    if (layout.moving) {
      layout.tick()
      again = true
    }
    if (anim.current) {
      const { from, to, t0 } = anim.current
      const t = Math.min(1, (now - t0) / 280)
      const e = 1 - Math.pow(1 - t, 3)
      viewRef.current = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k + (to.k - from.k) * e }
      if (t < 1) again = true
      else anim.current = null
    } else if (autoFit.current) {
      // The view follows the map while it settles.
      const to = fitTarget()
      const v = viewRef.current
      const f = reduceRef.current ? 1 : 0.14
      const next = { x: v.x + (to.x - v.x) * f, y: v.y + (to.y - v.y) * f, k: v.k + (to.k - v.k) * f }
      viewRef.current = next
      if (Math.abs(to.x - next.x) > 0.5 || Math.abs(to.y - next.y) > 0.5 || Math.abs(to.k - next.k) > 0.001) again = true
    }
    paint()
    if (again) raf.current = requestAnimationFrame(frame)
  }

  const kick = (): void => {
    if (!raf.current) raf.current = requestAnimationFrame(frame)
  }

  const reduceRef = useRef(reduce)
  reduceRef.current = reduce
  const setView = (to: View, animate: boolean): void => {
    autoFit.current = false
    const mem = memory.get(memoryKey)
    if (mem) mem.userView = true
    if (animate && !reduceRef.current) {
      anim.current = { from: viewRef.current, to, t0: performance.now() }
      kick()
    } else {
      anim.current = null
      viewRef.current = to
      paint()
    }
  }
  // Long-lived listeners call the functions of the last render.
  const latest = useRef({ setView, paint, fitTarget })
  latest.current = { setView, paint, fitTarget }

  /* ---------- Layout ---------- */

  useLayoutEffect(() => {
    const mem: Memory = memory.get(memoryKey) ?? { pos: new Map(), view: null, userView: false, sig: '' }
    memory.set(memoryKey, mem)
    const sig = signature(map)
    const stage = stageRef.current
    if (stage) sizeRef.current = { w: stage.clientWidth, h: stage.clientHeight }
    const { w, h } = sizeRef.current
    const layout = new MapLayout(map, mem.pos, mem.sig === sig, w > 0 && h > 0 ? w / h : 1.3)
    mem.sig = sig
    // A head start: the first frame already has the shape of the map.
    if (reduceRef.current) layout.settle()
    else if (layout.alpha >= 1) layout.tick(40)
    layoutRef.current = layout
    if (mem.view && mem.userView) {
      viewRef.current = mem.view
      autoFit.current = false
    } else if (!shown.current) {
      viewRef.current = fitTarget()
      autoFit.current = true
    }
    // Else the map changed on screen (a filter): the view moves to the new fit in the next frames.
    shown.current = true
    paint()
    kick()
    return () => {
      cancelAnimationFrame(raf.current)
      raf.current = 0
      for (const [id, p] of layout.positions()) mem.pos.set(id, p)
      mem.view = viewRef.current
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, memoryKey])

  // Keep the center when the stage changes size (a side panel opens, the window grows).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(() => {
      const w = stage.clientWidth
      const h = stage.clientHeight
      const old = sizeRef.current
      if (w === old.w && h === old.h) return
      sizeRef.current = { w, h }
      const v = viewRef.current
      viewRef.current = autoFit.current ? latest.current.fitTarget() : { ...v, x: v.x + (w - old.w) / 2, y: v.y + (h - old.h) / 2 }
      latest.current.paint()
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [])

  // The hover card follows its node.
  useLayoutEffect(() => {
    hoverRef.current = hover
    placeCard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover])

  /* ---------- Input ---------- */

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current?.getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }

  // Wheel zoom needs a listener that is not passive.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const step = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY
      const r = svg.getBoundingClientRect()
      latest.current.setView(zoomAt(viewRef.current, Math.exp(-step * 0.0018), { x: e.clientX - r.left, y: e.clientY - r.top }), false)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return
    const el = (e.target as Element).closest<SVGGElement>('[data-node]')
    drag.current = { id: el?.dataset.node ?? null, start: { x: e.clientX, y: e.clientY }, view: viewRef.current, moved: false, pointer: e.pointerId }
    e.currentTarget.setPointerCapture(e.pointerId)
    anim.current = null
  }

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    const dx = e.clientX - d.start.x
    const dy = e.clientY - d.start.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return
      d.moved = true
      setGrabbing(d.id ? 'node' : 'pan')
      if (d.id) layoutRef.current?.dragStart(d.id)
    }
    if (d.id) {
      layoutRef.current?.dragTo(d.id, toWorld(viewRef.current, local(e)))
      layoutRef.current?.heat(0.12)
      // The view stays still while the user drags a node.
      autoFit.current = false
      kick()
    } else {
      setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy }, false)
    }
  }

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>): void => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    drag.current = null
    setGrabbing(null)
    if (d.id && d.moved) {
      layoutRef.current?.dragEnd(d.id)
      kick()
    } else if (d.id && e.type === 'pointerup') {
      const n = nodeById.get(d.id)
      if (n) onOpen(n)
    }
  }

  const center = (): Point => ({ x: sizeRef.current.w / 2, y: sizeRef.current.h / 2 })
  const zoomBy = (f: number): void => setView(zoomAt(viewRef.current, f, center()), true)
  const fit = (): void => setView(fitTarget(), true)

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const pan = 80
    const v = viewRef.current
    const keys: Record<string, () => void> = {
      '+': () => zoomBy(1.3),
      '=': () => zoomBy(1.3),
      '-': () => zoomBy(1 / 1.3),
      '0': fit,
      ArrowLeft: () => setView({ ...v, x: v.x + pan }, true),
      ArrowRight: () => setView({ ...v, x: v.x - pan }, true),
      ArrowUp: () => setView({ ...v, y: v.y + pan }, true),
      ArrowDown: () => setView({ ...v, y: v.y - pan }, true)
    }
    const run = keys[e.key]
    if (!run) return
    e.preventDefault()
    run()
  }

  // Show the search results when one of them is out of view.
  useEffect(() => {
    const layout = layoutRef.current
    if (!matches.length || !layout) return
    const { w, h } = sizeRef.current
    const box = layout.bounds(new Set(matches))
    const v = viewRef.current
    if (!box) return
    const outside = box.x0 * v.k + v.x < 0 || box.y0 * v.k + v.y < 0 || box.x1 * v.k + v.x > w || box.y1 * v.k + v.y > h
    if (outside) setView(fitView(box, w, h, Math.max(v.k, 1)), true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches])

  /* ---------- Render ---------- */

  const hovered = hover ? nodeById.get(hover) : undefined
  const best = matches[0]
  /** The classes of a node, and of its label */
  const states = (n: MapNode): string =>
    clsx(
      n.kind === 'chapter' ? 'is-chapter' : `slot-${((colorOf(n) % 8) + 8) % 8}`,
      major.has(n.id) && 'is-major',
      near?.has(n.id) && 'is-near',
      hover === n.id && 'is-hover',
      matchSet.has(n.id) && 'is-match',
      best === n.id && 'is-best'
    )

  return (
    <div className="map-stage" ref={stageRef}>
      <svg
        ref={svgRef}
        className={clsx('map-svg', hover && 'has-focus', !hover && matches.length > 0 && 'has-search', grabbing && `is-grabbing-${grabbing}`)}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <g ref={worldRef}>
          <g className="map-edges">
            {map.edges.map((e) => {
              const key = edgeKey(e)
              const chapter = nodeById.get(e.source)?.kind === 'chapter' || nodeById.get(e.target)?.kind === 'chapter'
              return (
                <line
                  key={key}
                  ref={(el) => {
                    if (el) edgeEls.current.set(key, el)
                    else edgeEls.current.delete(key)
                  }}
                  className={clsx('map-edge', chapter && 'is-chapter', e.explicit && 'is-explicit', hover && (e.source === hover || e.target === hover) && 'is-near')}
                  style={{ '--w': (1 + Math.min(Math.log2(e.weight), 3) * 0.5).toFixed(2) } as React.CSSProperties}
                />
              )
            })}
          </g>
          <g className="map-nodes">
            {map.nodes.map((n) => {
              const r = nodeRadius(n)
              return (
                <g
                  key={n.id}
                  data-node={n.id}
                  data-label={labelOf(n)}
                  ref={(el) => {
                    if (el) nodeEls.current.set(n.id, el)
                    else nodeEls.current.delete(n.id)
                  }}
                  className={clsx('map-node', states(n))}
                  onPointerEnter={() => !drag.current && setHover(n.id)}
                  onPointerLeave={() => !drag.current && setHover((h) => (h === n.id ? null : h))}
                >
                  <circle className="map-hit" r={r + 7} />
                  {n.kind === 'chapter' ? (
                    <rect className="map-dot" x={-r * 0.8} y={-r} width={r * 1.6} height={r * 2} rx={1.5} />
                  ) : (
                    <circle className="map-dot" r={r} />
                  )}
                </g>
              )
            })}
          </g>
          {/* The labels have a layer of their own, above all the nodes */}
          <g className="map-tags">
            {map.nodes.map((n) => {
              const label = labelOf(n)
              return (
                <g
                  key={n.id}
                  ref={(el) => {
                    if (el) tagEls.current.set(n.id, el)
                    else tagEls.current.delete(n.id)
                  }}
                  className={clsx('map-tag', states(n))}
                >
                  <text className="map-label" y={nodeRadius(n) + 3}>
                    {label.length > 32 ? `${label.slice(0, 30)}…` : label}
                  </text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      <div className="map-zoom">
        <IconButton label={texts.zoomIn} shortcut="+" side="left" onClick={() => zoomBy(1.4)}>
          <Plus size={15} />
        </IconButton>
        <IconButton label={texts.zoomOut} shortcut="-" side="left" onClick={() => zoomBy(1 / 1.4)}>
          <Minus size={15} />
        </IconButton>
        <IconButton label={texts.fit} shortcut="0" side="left" onClick={fit}>
          <ArrowsIn size={15} />
        </IconButton>
      </div>

      <div ref={cardRef} className={clsx('map-card', hovered && !grabbing && 'is-open')} aria-hidden>
        {hovered && renderCard(hovered)}
      </div>
    </div>
  )
}
