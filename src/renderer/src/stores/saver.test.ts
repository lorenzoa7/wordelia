import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const writes: Array<{ rel: string; content: string; at: number }> = []
let fail: string | null = null

vi.mock('@/lib/api', () => ({
  invoke: (_channel: string, _root: string, rel: string, content: string) => {
    if (fail) return Promise.reject(new Error(fail))
    writes.push({ rel, content, at: Date.now() })
    return Promise.resolve()
  }
}))

const { saver, saveProblemOf } = await import('./saver')

describe('saver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    writes.length = 0
    fail = null
  })
  afterEach(async () => {
    fail = null
    await saver.flush()
    vi.useRealTimers()
  })

  it('writes at least every 2 seconds while the text changes', async () => {
    const start = Date.now()
    // One key every 200 ms for 6 seconds.
    for (let i = 0; i < 30; i++) {
      saver.write('/book', 'manuscript/a.md', `text ${i}`)
      await vi.advanceTimersByTimeAsync(200)
    }
    expect(writes.length).toBeGreaterThanOrEqual(2)
    expect(writes[0].at - start).toBeLessThanOrEqual(2000)
  })

  it('says "saving" while an editor holds text that is not on disk', () => {
    const states: string[] = []
    const off = saver.subscribe((s) => states.push(s))
    saver.hold('editor:ch_1')
    saver.release('editor:ch_1')
    off()
    expect(states).toEqual(['saved', 'saving', 'saved'])
  })

  it('keeps the text after an error and writes it on Try again', async () => {
    fail = "Error invoking remote method 'book:writeFile': Error: EPERM: operation not permitted, open 'x'"
    saver.write('/book', 'manuscript/b.md', 'text', true)
    await vi.advanceTimersByTimeAsync(10)
    expect(saver.problem).toBe('readOnly')
    fail = null
    saver.retry()
    await vi.advanceTimersByTimeAsync(10)
    expect(writes.map((w) => w.content)).toEqual(['text'])
  })
})

describe('saveProblemOf', () => {
  it('reads the code of the error', () => {
    expect(saveProblemOf('Error: ENOSPC: no space left on device')).toBe('diskFull')
    expect(saveProblemOf('Error: ENOENT: no such file or directory')).toBe('missing')
    expect(saveProblemOf('Error: EBUSY: resource busy or locked')).toBe('busy')
    expect(saveProblemOf('Something else')).toBe('other')
  })
})
