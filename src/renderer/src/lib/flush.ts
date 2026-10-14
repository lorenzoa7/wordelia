// Editors keep a few hundred milliseconds of typing in memory before they save.
// They register a flusher here, so closing a book or the window saves everything first.

const flushers = new Set<() => void>()

export function registerFlusher(fn: () => void): () => void {
  flushers.add(fn)
  return () => flushers.delete(fn)
}

export function runFlushers(): void {
  for (const fn of flushers) {
    try {
      fn()
    } catch {
      /* one editor must not stop the others */
    }
  }
}
