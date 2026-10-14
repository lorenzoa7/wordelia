// Words written today, per book. Kept in local storage: it is a personal, per-computer count.

const KEY = 'wordelia.today'

interface Day {
  date: string
  /** Book words when the day started */
  start: number
}

type Store = Record<string, Day>

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store
  } catch {
    return {}
  }
}

/** Words written today in this book (never below zero). */
export function wordsToday(bookId: string, bookWords: number): number {
  const store = read()
  const day = store[bookId]
  if (!day || day.date !== today()) {
    store[bookId] = { date: today(), start: bookWords }
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* storage may be off */
    }
    return 0
  }
  return Math.max(0, bookWords - day.start)
}
