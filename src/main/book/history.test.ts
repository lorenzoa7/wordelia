import { describe, expect, it } from 'vitest'
import { MAX_VERSIONS, versionsToDrop } from './history'

const NOW = Date.parse('2026-10-21T12:00:00.000Z')
const MIN = 60 * 1000

/** A version saved `ago` milliseconds before now */
function version(ago: number): { id: string; at: string } {
  const at = new Date(NOW - ago).toISOString()
  return { id: at.replace(/[:.]/g, '-'), at }
}

describe('versionsToDrop', () => {
  it('keeps every version of the last day', () => {
    const today = Array.from({ length: 150 }, (_, i) => version(i * 8 * MIN))
    expect(versionsToDrop(today, NOW)).toEqual([])
  })

  it('keeps the old versions after a long day of writing', () => {
    const today = Array.from({ length: 150 }, (_, i) => version(i * 8 * MIN))
    const lastMonth = [version(30 * 24 * 60 * MIN), version(31 * 24 * 60 * MIN)]
    const drop = versionsToDrop([...today, ...lastMonth], NOW)
    for (const v of lastMonth) expect(drop).not.toContain(v.id)
  })

  it('keeps one version for each hour of the last week, and one for each day before', () => {
    const threeDaysAgo = 3 * 24 * 60 * MIN
    const sameHour = [version(threeDaysAgo + 5 * MIN), version(threeDaysAgo + 15 * MIN), version(threeDaysAgo + 25 * MIN)]
    const twentyDaysAgo = 20 * 24 * 60 * MIN
    const sameDay = [version(twentyDaysAgo), version(twentyDaysAgo + 3 * 60 * MIN)]
    const drop = versionsToDrop([...sameHour, ...sameDay], NOW)
    expect(drop).toHaveLength(3)
    // The newest of each group stays.
    expect(drop).not.toContain(sameHour[0].id)
    expect(drop).not.toContain(sameDay[0].id)
  })

  it('never keeps more than the limit', () => {
    const many = Array.from({ length: MAX_VERSIONS + 20 }, (_, i) => version(i * MIN))
    expect(versionsToDrop(many, NOW)).toHaveLength(20)
  })
})
