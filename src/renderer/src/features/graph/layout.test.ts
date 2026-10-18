import { describe, expect, it } from 'vitest'
import { GRID_MIN, GRID_STEP, dotGrid, nodeRadius } from './layout'

describe('dotGrid', () => {
  it('keeps the step between GRID_MIN and twice GRID_MIN at every zoom', () => {
    for (let k = 0.15; k <= 4; k *= 1.07) {
      const g = dotGrid({ x: 0, y: 0, k })
      expect(g.step).toBeGreaterThanOrEqual(GRID_MIN - 1e-9)
      expect(g.step).toBeLessThan(GRID_MIN * 2)
      expect(g.minor).toBeGreaterThanOrEqual(0)
      expect(g.minor).toBeLessThanOrEqual(1)
    }
  })

  it('shows all dots at zoom 1, one world step apart', () => {
    const g = dotGrid({ x: 0, y: 0, k: 1 })
    expect(g.step).toBe(GRID_STEP)
    expect(g.minor).toBe(1)
  })

  it('does not jump when the step doubles', () => {
    // Just above the limit only the big dots show (2 × GRID_MIN apart); just below, the new step
    // is 2 × GRID_MIN with all dots: the same dots.
    const k = GRID_MIN / GRID_STEP
    const above = dotGrid({ x: 0, y: 0, k: k * 1.0001 })
    const below = dotGrid({ x: 0, y: 0, k: k * 0.9999 })
    expect(above.minor).toBeLessThan(0.01)
    expect(below.minor).toBe(1)
    expect(below.step).toBeCloseTo(above.step * 2, 1)
  })

  it('moves with the view: a dot stays on the same world point', () => {
    const v = { x: 137.4, y: -52.8, k: 1.7 }
    const g = dotGrid(v)
    // The big dot of a tile is half a step into the tile; it sits on a world point that is a whole number of steps from the origin.
    const world = (g.x + g.step / 2 - v.x) / v.k
    const steps = world / (g.step / v.k)
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6)
    expect(g.x).toBeGreaterThanOrEqual(0)
    expect(g.x).toBeLessThan(g.step * 2)
    expect(g.y).toBeGreaterThanOrEqual(0)
    expect(g.y).toBeLessThan(g.step * 2)
  })
})

describe('nodeRadius', () => {
  it('grows with the links and leaves room for the icon of the smallest token', () => {
    expect(nodeRadius({ degree: 0, kind: 'entry' })).toBe(9)
    expect(nodeRadius({ degree: 4, kind: 'entry' })).toBeGreaterThan(nodeRadius({ degree: 1, kind: 'entry' }))
    expect(nodeRadius({ degree: 400, kind: 'entry' })).toBe(21)
    expect(nodeRadius({ degree: 400, kind: 'chapter' })).toBe(16)
  })
})
