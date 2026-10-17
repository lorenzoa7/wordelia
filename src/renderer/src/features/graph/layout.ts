// Force layout of the planning map (d3-force). The app drives the simulation one tick for each
// animation frame. Nodes without links do not take part: they sit on rings around the others.

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force'
import type { MapNode, PlanningMap } from '@shared/planning/graph'

export interface Point {
  x: number
  y: number
}

/** Screen = world × k + (x, y) */
export interface View {
  x: number
  y: number
  k: number
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface LayoutNode extends SimulationNodeDatum {
  id: string
  r: number
  /** No links: the node sits on a ring */
  lone: boolean
  /** Width of the label, in world units at zoom 1 */
  w: number
}

interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  weight: number
}

export function edgeKey(e: { source: string; target: string }): string {
  return `${e.source}|${e.target}`
}

export const MIN_ZOOM = 0.15
export const MAX_ZOOM = 4

/** Node size grows with the number of links. The smallest token still has room for its icon. A chapter: half the height of its book. */
export function nodeRadius(n: Pick<MapNode, 'degree' | 'kind'>): number {
  const grow = Math.sqrt(n.degree)
  return n.kind === 'chapter' ? 11 + Math.min(grow * 1.3, 5) : 9 + Math.min(grow * 2.5, 12)
}

/** Space between the dots of the background grid at zoom 1, in world units */
export const GRID_STEP = 24
/** The smallest space between two dots on the screen, in pixels */
export const GRID_MIN = 14

export interface Grid {
  /** Space between two dots on the screen. A tile of the pattern is two steps wide: one big dot and three small dots. */
  step: number
  /** Where a tile starts on the screen */
  x: number
  y: number
  /** Opacity of the small dots: they fade out as they come near each other */
  minor: number
}

/**
 * The dot grid of the stage. It moves and zooms with the map, but its dots keep their size on the
 * screen. The step doubles or halves so that it stays between GRID_MIN and 2 × GRID_MIN pixels.
 * Before it doubles, every second dot fades out, so the grid never jumps.
 */
export function dotGrid(v: View): Grid {
  const raw = GRID_STEP * v.k
  const step = raw / Math.pow(2, Math.floor(Math.log2(raw / GRID_MIN)))
  const tile = step * 2
  const wrap = (a: number): number => ((a % tile) + tile) % tile
  return { step, x: wrap(v.x - step / 2), y: wrap(v.y - step / 2), minor: clamp((step - GRID_MIN) / (GRID_MIN / 2), 0, 1) }
}

/** About the width of one character of a label (at zoom 1) */
const CHAR_W = 6.6
/** Height of a label under its node */
const LABEL_H = 17
/** Space around the box of a node and its label */
const PAD_X = 10
const PAD_Y = 6

/** The width of the label of a node, about. */
export function labelWidth(n: Pick<MapNode, 'label' | 'kind'>): number {
  const chars = Math.min(n.label.length + (n.kind === 'chapter' ? 4 : 0), 32)
  return Math.max(chars * CHAR_W, 24)
}

/**
 * Keeps the boxes of two nodes (the dot and the label under it) apart, so labels do not overlap.
 * It moves the two nodes along the axis with the smaller overlap. All pairs: fast enough for 300 nodes.
 * `scale`: the size of a label in the world, compared with zoom 1 (labels keep their size on the screen).
 */
function forceLabels(scale: () => number, strength = 0.5): ((alpha: number) => void) & { initialize: (nodes: LayoutNode[]) => void } {
  let nodes: LayoutNode[] = []
  const force = (): void => {
    const sc = scale()
    const lh = LABEL_H * sc
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      const ax = (a.x ?? 0) + (a.vx ?? 0)
      const ay = (a.y ?? 0) + (a.vy ?? 0)
      const aw = Math.max(a.w * sc, a.r * 2)
      const ah = a.r * 2 + lh
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j]
        const dx = (b.x ?? 0) + (b.vx ?? 0) - ax
        const ox = (aw + Math.max(b.w * sc, b.r * 2)) / 2 + PAD_X - Math.abs(dx)
        if (ox <= 0) continue
        const dy = (b.y ?? 0) + (b.vy ?? 0) - ay
        const oy = (ah + b.r * 2 + lh) / 2 + PAD_Y - Math.abs(dy)
        if (oy <= 0) continue
        if (ox < oy) {
          const m = (ox / 2) * strength * (dx < 0 ? -1 : 1)
          a.vx = (a.vx ?? 0) - m
          b.vx = (b.vx ?? 0) + m
        } else {
          const m = (oy / 2) * strength * (dy < 0 ? -1 : 1)
          a.vy = (a.vy ?? 0) - m
          b.vy = (b.vy ?? 0) + m
        }
      }
    }
  }
  force.initialize = (n: LayoutNode[]): void => {
    nodes = n
  }
  return force
}

/** Space between the nodes on a ring, and between the rings */
const RING_GAP = 100
const RING_STEP = 60
/** Space between the linked nodes and the first ring */
const RING_MARGIN = 56

export class MapLayout {
  readonly nodes: LayoutNode[]
  readonly byId = new Map<string, LayoutNode>()
  /** The edges, with the key `source|target` */
  readonly edges: { key: string; a: LayoutNode; b: LayoutNode }[]
  private readonly sim: Simulation<LayoutNode, LayoutLink>
  private readonly lone: LayoutNode[]
  /** Nodes without links that the user moved: they stay where the user put them */
  private readonly placed = new Set<string>()
  private readonly aspect: number
  /**
   * The size of a label in the world, compared with zoom 1. A label keeps its size on the screen, so a
   * map that fits the stage at zoom 0.7 needs labels about 1.4 times as wide. The canvas sets it from the fit.
   */
  labelScale = 1

  /**
   * `saved`: the places of the last layout. `unchanged`: the links are the same as in that layout.
   * `aspect`: width / height of the stage; the map takes about the same shape.
   */
  constructor(map: PlanningMap, saved: Map<string, Point>, unchanged: boolean, aspect = 1.3) {
    this.aspect = aspect
    const neighbors = new Map<string, string[]>()
    for (const e of map.edges) {
      neighbors.set(e.source, [...(neighbors.get(e.source) ?? []), e.target])
      neighbors.set(e.target, [...(neighbors.get(e.target) ?? []), e.source])
    }
    this.nodes = map.nodes.map((n) => {
      const node: LayoutNode = { id: n.id, r: nodeRadius(n), lone: n.degree === 0, w: labelWidth(n) }
      const p = saved.get(n.id)
      if (p) {
        node.x = p.x
        node.y = p.y
      }
      this.byId.set(n.id, node)
      return node
    })
    // A new node starts near a neighbor that has a place, so the map does not jump.
    for (const node of this.nodes) {
      if (node.x !== undefined || node.lone) continue
      const near = (neighbors.get(node.id) ?? []).map((id) => this.byId.get(id)).find((m) => m?.x !== undefined)
      if (near?.x !== undefined && near.y !== undefined) {
        node.x = near.x + (hash(node.id) % 40) - 20
        node.y = near.y + (hash(node.id + '.') % 40) - 20
      }
    }
    this.lone = this.nodes.filter((n) => n.lone)

    const linked = this.nodes.filter((n) => !n.lone)
    this.edges = map.edges.flatMap((e) => {
      const a = this.byId.get(e.source)
      const b = this.byId.get(e.target)
      return a && b ? [{ key: edgeKey(e), a, b }] : []
    })
    const links: LayoutLink[] = map.edges.map((e) => ({ source: e.source, target: e.target, weight: e.weight }))
    this.sim = forceSimulation<LayoutNode, LayoutLink>(linked)
      .stop()
      .force(
        'link',
        forceLink<LayoutNode, LayoutLink>(links)
          .id((d) => d.id)
          .distance((l) => 50 + (l.source as LayoutNode).r + (l.target as LayoutNode).r)
      )
      .force('charge', forceManyBody<LayoutNode>().strength(-320).distanceMax(800))
      // A wide stage pulls harder up and down, so the map gets wide too.
      .force('x', forceX<LayoutNode>(0).strength(0.05 / Math.sqrt(clamp(aspect, 0.5, 3))))
      .force('y', forceY<LayoutNode>(0).strength(0.05 * Math.sqrt(clamp(aspect, 0.5, 3))))
      .force('collide', forceCollide<LayoutNode>((d) => d.r + 4))
      .force('labels', forceLabels(() => this.labelScale))
    // A map that the user saw before, without changes, starts at rest.
    const known = linked.filter((n) => saved.has(n.id)).length
    this.sim.alpha(!linked.length || (unchanged && known === linked.length) ? 0 : known === 0 ? 1 : 0.5)
    this.placeRings()
  }

  get alpha(): number {
    return this.sim.alpha()
  }

  /** True while the nodes still move */
  get moving(): boolean {
    return this.sim.alpha() > this.sim.alphaMin() || this.sim.alphaTarget() > 0
  }

  /** One step of the simulation. */
  tick(n = 1): void {
    if (this.sim.nodes().length) this.sim.tick(n)
    this.placeRings()
  }

  /** Run until the nodes are at rest (with reduced motion, or for tests). */
  settle(maxTicks = 400): void {
    let i = 0
    while (this.sim.alpha() > this.sim.alphaMin() && i++ < maxTicks) this.sim.tick()
    this.placeRings()
  }

  /** Start to move again, for example after a drag. */
  heat(alpha = 0.3): void {
    this.sim.alpha(Math.max(this.sim.alpha(), alpha))
  }

  dragStart(id: string): void {
    const n = this.byId.get(id)
    if (!n) return
    n.fx = n.x
    n.fy = n.y
    if (!n.lone) this.sim.alphaTarget(0.25)
  }

  dragTo(id: string, p: Point): void {
    const n = this.byId.get(id)
    if (!n) return
    n.fx = p.x
    n.fy = p.y
    if (n.lone) {
      n.x = p.x
      n.y = p.y
      this.placed.add(id)
    }
  }

  dragEnd(id: string): void {
    const n = this.byId.get(id)
    if (!n) return
    if (!n.lone) {
      n.fx = null
      n.fy = null
    }
    this.sim.alphaTarget(0)
  }

  positions(): Map<string, Point> {
    return new Map(this.nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
  }

  /** The box around all nodes, with room for the labels under them. */
  bounds(ids?: Set<string>): Box | null {
    let box: Box | null = null
    for (const n of this.nodes) {
      if (ids && !ids.has(n.id)) continue
      const x = n.x ?? 0
      const y = n.y ?? 0
      const half = Math.max(n.r, n.w / 2)
      const b = { x0: x - half, y0: y - n.r, x1: x + half, y1: y + n.r + LABEL_H + 4 }
      box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b
    }
    return box
  }

  /** Nodes without links go on rings (ellipses) around the linked nodes, the inner ring first. */
  private placeRings(): void {
    const free = this.lone.filter((n) => !this.placed.has(n.id))
    if (!free.length) return
    const linked = this.sim.nodes()
    const wide = Math.sqrt(clamp(this.aspect, 0.5, 3))
    let cx = 0
    let cy = 0
    let rx: number
    let ry: number
    if (linked.length) {
      for (const n of linked) {
        cx += n.x ?? 0
        cy += n.y ?? 0
      }
      cx /= linked.length
      cy /= linked.length
      let ex = 0
      let ey = 0
      for (const n of linked) {
        ex = Math.max(ex, Math.abs((n.x ?? 0) - cx) + n.w / 2)
        ey = Math.max(ey, Math.abs((n.y ?? 0) - cy) + n.r + LABEL_H)
      }
      rx = ex + RING_MARGIN
      ry = ey + RING_MARGIN
    } else if (free.length === 1) {
      free[0].x = free[0].fx = 0
      free[0].y = free[0].fy = 0
      return
    } else {
      rx = 80 * wide
      ry = 80 / wide
    }
    let i = 0
    let ring = 0
    while (i < free.length) {
      // Ramanujan: the length of the ellipse
      const length = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
      const count = Math.min(Math.max(4, Math.floor(length / RING_GAP)), free.length - i)
      // A small turn on each ring, so the rings do not line up
      const turn = -Math.PI / 2 + ring * 0.4
      for (let j = 0; j < count; j++) {
        const n = free[i + j]
        const a = turn + (j / count) * 2 * Math.PI
        n.x = n.fx = cx + Math.cos(a) * rx
        n.y = n.fy = cy + Math.sin(a) * ry
      }
      i += count
      ring++
      rx += RING_STEP * wide
      ry += RING_STEP
    }
  }
}

/** The view that shows the box in a stage of this size. */
export function fitView(box: Box | null, width: number, height: number, maxZoom = 1.6): View {
  // Room at the sides; more on the right, for the zoom buttons
  const pad = { left: 36, right: 64, top: 36, bottom: 36 }
  const w = width - pad.left - pad.right
  const h = height - pad.top - pad.bottom
  if (!box || w <= 0 || h <= 0) return { x: width / 2, y: height / 2, k: 1 }
  const bw = Math.max(box.x1 - box.x0, 1)
  const bh = Math.max(box.y1 - box.y0, 1)
  const k = clamp(Math.min(w / bw, h / bh), MIN_ZOOM, maxZoom)
  return { x: pad.left + w / 2 - ((box.x0 + box.x1) / 2) * k, y: pad.top + h / 2 - ((box.y0 + box.y1) / 2) * k, k }
}

/** Zoom by a factor around a point of the stage. */
export function zoomAt(v: View, factor: number, at: Point): View {
  const k = clamp(v.k * factor, MIN_ZOOM, MAX_ZOOM)
  const f = k / v.k
  return { k, x: at.x - (at.x - v.x) * f, y: at.y - (at.y - v.y) * f }
}

export function toWorld(v: View, p: Point): Point {
  return { x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
