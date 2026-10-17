// The map itself: an SVG graph with pan, zoom, drag and hover.
// React draws the nodes and the edges once. Each animation frame moves them directly in the DOM,
// so 300 nodes stay smooth.
//
// A node is a paper token: a soft shadow, a disc with a ring in the color of its category and the
// icon of the category. The icons are symbols in one sprite (`<defs>`), and each node has a `<use>`:
// React does not draw an icon component for each node. A chapter is a small closed book with a
// ribbon. Behind the map, a dot grid moves and zooms with it.

import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowsIn, Minus, Plus } from '@phosphor-icons/react'
import clsx from 'clsx'
import { adjacency, type MapNode, type PlanningMap } from '@shared/planning/graph'
import { IconButton } from '@/ui'
import { categoryIcon } from '@/features/plan/PlanSidebar'
import { MapLayout, clamp, dotGrid, edgeKey, fitView, nodeRadius, toWorld, zoomAt, type Point, type View } from './layout'

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

/** The setting of the system, also when it changes while the map is open. */
function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduce, setReduce] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = (): void => setReduce(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduce
}

/** All labels show when the map is small or near. */
const ALL_LABELS_NODES = 40
const ALL_LABELS_ZOOM = 1.1
/** Far out, a small map shows only the major labels too: else they cover each other */
const MIN_ALL_LABELS_ZOOM = 0.45
/** Else only the labels of the nodes with the most links */
const MAJOR_LABELS = 14

/** The id of the symbol of an icon in the sprite */
const iconId = (name: string): string => `map-icon-${name.replace(/[^\w-]/g, '_')}`

/** The icon of a token: about the size of the inner ring */
const iconSize = (r: number): number => r * 1.36

/** Size groups of the nodes, for the level of detail: the smallest radius of each group */
const SIZE_GROUPS: [string, number][] = [
  ['l', 16],
  ['m', 12],
  ['s', 0]
]
const sizeGroup = (r: number): string => SIZE_GROUPS.find(([, min]) => r >= min)?.[0] ?? 's'

/**
 * Level of detail. An icon shows when its token is at least 6 px wide on the screen (radius), a shadow
 * from zoom 0.5, the inner ring from zoom 1. Fewer things to paint keep a big map smooth when it is far.
 * near: all · mid: no inner rings · ml: no icons on small tokens · far: icons on big tokens only, no shadows · tiny: none
 */
function levelOfDetail(k: number): string {
  if (k >= 1) return 'near'
  if (k >= 6 / 9) return 'mid'
  if (k >= 6 / 12) return 'ml'
  if (k >= 6 / 16) return 'far'
  return 'tiny'
}

/** A chapter: a closed book, 1.5 × r wide and 2 × r high, with a spine and a ribbon. */
function ChapterBook({ r, n }: { r: number; n: number }): React.JSX.Element {
  const w = r * 1.5
  const left = -w / 2
  const spine = left + r * 0.28
  // The ribbon hangs from the top edge of the cover, at the right
  const rx = w / 2 - r * 0.62
  const rw = r * 0.34
  const bottom = -r + r * 0.8
  const digits = String(n).length
  return (
    <>
      <ellipse className="map-shade" cy={r * 0.34} rx={r * 1.15} ry={r * 1.4} fill="url(#map-shade)" />
      <rect className="map-dot map-book" x={left} y={-r} width={w} height={r * 2} rx={1.6} />
      <line className="map-book-spine" x1={spine} y1={-r} x2={spine} y2={r} />
      <path className="map-book-ribbon" d={`M${rx} ${-r}V${bottom}L${rx + rw / 2} ${bottom - r * 0.2}L${rx + rw} ${bottom}V${-r}Z`} />
      <text className="map-book-no" x={(spine + w / 2) / 2} y={r * 0.38} fontSize={r * (digits > 2 ? 0.6 : 0.88)}>
        {n}
      </text>
    </>
  )
}

export interface MapCanvasProps {
  map: PlanningMap
  /** The book root: each book keeps its own layout */
  memoryKey: string
  /** Color slot of a node (the order of its category), -1 for a chapter */
  colorOf: (n: MapNode) => number
  labelOf: (n: MapNode) => string
  /** The icon name of the category of an entry (`CategoryDef.icon`) */
  iconOf: (n: MapNode) => string
  /** Search results, the best first */
  matches: string[]
  ariaLabel: string
  onOpen: (n: MapNode) => void
  renderCard: (n: MapNode) => ReactNode
  texts: { zoomIn: string; zoomOut: string; fit: string }
}

export function MapCanvas({ map, memoryKey, colorOf, labelOf, iconOf, matches, ariaLabel, onOpen, renderCard, texts }: MapCanvasProps): React.JSX.Element {
  const reduce = usePrefersReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<SVGGElement>(null)
  const gridRef = useRef<SVGPatternElement>(null)
  /** The last values written to the DOM, so a frame writes only what changed */
  const written = useRef({ labels: '', lod: '', grid: '', at: new WeakMap<Element, string>() })
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
  // A node that left the map (a filter, a change on disk) is not under the pointer any more.
  useEffect(() => {
    if (hover && !nodeById.has(hover)) setHover(null)
  }, [hover, nodeById])
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
    const v = viewRef.current
    const done = written.current.at
    // Write an attribute only when its value changes: each write restyles the element.
    const set = (el: Element | undefined, name: string, value: string): void => {
      if (!el) return
      const key = `${name}:${value}`
      if (done.get(el) === key) return
      el.setAttribute(name, value)
      done.set(el, key)
    }
    for (const n of layout.nodes) {
      const x = n.x ?? 0
      const y = n.y ?? 0
      set(nodeEls.current.get(n.id), 'transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`)
      // The labels are in screen units, under the node: they keep their size at every zoom.
      set(tagEls.current.get(n.id), 'transform', `translate(${(x * v.k + v.x).toFixed(1)},${((y + n.r) * v.k + v.y).toFixed(1)})`)
    }
    for (const e of layout.edges) {
      const el = edgeEls.current.get(e.key)
      if (!el) continue
      const key = `${(e.a.x ?? 0).toFixed(1)} ${(e.a.y ?? 0).toFixed(1)} ${(e.b.x ?? 0).toFixed(1)} ${(e.b.y ?? 0).toFixed(1)}`
      if (done.get(el) === key) continue
      done.set(el, key)
      const [x1, y1, x2, y2] = key.split(' ')
      el.setAttribute('x1', x1)
      el.setAttribute('y1', y1)
      el.setAttribute('x2', x2)
      el.setAttribute('y2', y2)
    }
    worldRef.current?.setAttribute('transform', `translate(${v.x.toFixed(2)},${v.y.toFixed(2)}) scale(${v.k.toFixed(4)})`)
    const last = written.current
    const labels = (layout.nodes.length <= ALL_LABELS_NODES && v.k >= MIN_ALL_LABELS_ZOOM) || v.k >= ALL_LABELS_ZOOM ? 'all' : 'major'
    if (labels !== last.labels) {
      svg.dataset.labels = labels
      last.labels = labels
    }
    const lod = levelOfDetail(v.k)
    if (lod !== last.lod) {
      svg.dataset.lod = lod
      last.lod = lod
    }
    paintGrid(v)
    placeCard()
  }

  /** The dot grid follows the view. Its pattern changes only when the view moves. */
  const paintGrid = (v: View): void => {
    const pattern = gridRef.current
    if (!pattern) return
    const g = dotGrid(v)
    const key = `${g.step.toFixed(3)} ${g.x.toFixed(2)} ${g.y.toFixed(2)} ${g.minor.toFixed(2)}`
    if (key === written.current.grid) return
    written.current.grid = key
    const tile = (g.step * 2).toFixed(3)
    pattern.setAttribute('width', tile)
    pattern.setAttribute('height', tile)
    pattern.setAttribute('x', g.x.toFixed(2))
    pattern.setAttribute('y', g.y.toFixed(2))
    const a = (g.step / 2).toFixed(3)
    const b = (g.step * 1.5).toFixed(3)
    // One big dot, then three small dots
    const at = [
      [a, a],
      [b, a],
      [a, b],
      [b, b]
    ]
    pattern.querySelectorAll('circle').forEach((c, i) => {
      c.setAttribute('cx', at[i][0])
      c.setAttribute('cy', at[i][1])
    })
    pattern.querySelector('g')?.setAttribute('opacity', g.minor.toFixed(2))
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
      // When all labels show, they need their room at the zoom of the fit.
      layout.labelScale = layout.nodes.length <= ALL_LABELS_NODES ? clamp(1 / to.k, 1, 1.5) : 1
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
  // One symbol for each icon on the map
  const icons = [...new Set(map.nodes.filter((n) => n.kind === 'entry').map(iconOf))].sort()
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
        role="application"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {/* The dot grid: the tile, its place and the opacity of the small dots change with the view (paintGrid) */}
          <pattern id="map-grid" ref={gridRef} patternUnits="userSpaceOnUse" width={48} height={48}>
            <circle className="map-grid-dot" cx={12} cy={12} r={1} />
            <g>
              <circle className="map-grid-dot" cx={36} cy={12} r={1} />
              <circle className="map-grid-dot" cx={12} cy={36} r={1} />
              <circle className="map-grid-dot" cx={36} cy={36} r={1} />
            </g>
          </pattern>
          {/* The soft shadow under a node */}
          <radialGradient id="map-shade">
            <stop className="map-shade-stop" offset="0" />
            <stop className="map-shade-stop" offset="0.6" stopOpacity={0.45} />
            <stop className="map-shade-stop" offset="1" stopOpacity={0} />
          </radialGradient>
          {icons.map((name) => (
            <symbol key={name} id={iconId(name)} viewBox="0 0 256 256" overflow="visible">
              {createElement(categoryIcon(name), { size: 256, weight: 'bold', overflow: 'visible' })}
            </symbol>
          ))}
        </defs>
        <rect className="map-grid" width="100%" height="100%" fill="url(#map-grid)" />
        <g ref={worldRef} className="map-world">
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
              const s = iconSize(r)
              return (
                <g
                  key={n.id}
                  data-node={n.id}
                  data-size={sizeGroup(r)}
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
                    <ChapterBook r={r} n={n.order + 1} />
                  ) : (
                    <>
                      <circle className="map-shade" cy={r * 0.3} r={r * 1.4} fill="url(#map-shade)" />
                      <circle className="map-dot" r={r} />
                      <circle className="map-rim" r={r - 2.6} />
                      <use className="map-icon" href={`#${iconId(iconOf(n))}`} x={-s / 2} y={-s / 2} width={s} height={s} />
                    </>
                  )}
                </g>
              )
            })}
          </g>
        </g>
        {/* The labels: a layer of their own above all the nodes, in screen units (paint) */}
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
                <text className="map-label" y={3}>
                  {label.length > 32 ? `${label.slice(0, 30)}…` : label}
                </text>
              </g>
            )
          })}
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
