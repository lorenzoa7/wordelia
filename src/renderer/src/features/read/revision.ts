// The revision list: which comments it shows, in which order, and the counts of its filters and of its
// chapters. Pure code: RevisionList.tsx gives it the comments of the book and the place of each passage.

import { LENSES, type CommentState, type EditorComment, type LensChoice } from '@shared/comments'
import type { Chapter } from '@shared/types'
import type { RevisionFilter } from '@/stores/ui'

/** The choices of the state filter: all states, or one */
export type StateChoice = RevisionFilter['state']

/** The states in the order of the list: the open comments first, then the decisions of the author. */
export const STATES: CommentState[] = ['open', 'intentional', 'done', 'ignored']

/** The comments of one chapter in the list, with the counts of its header. */
export interface RevisionGroup {
  chapter: Chapter
  /** The number of the chapter in the book */
  number: number
  rows: EditorComment[]
  /** The comments of the chapter in each state, in the lens of the filter */
  counts: Record<CommentState, number>
}

const lensOk = (c: EditorComment, lens: LensChoice): boolean => lens === 'all' || c.lens === lens
const stateOk = (c: EditorComment, state: StateChoice): boolean => state === 'all' || c.state === state

/**
 * The counts of the two filters. Each filter counts the comments that the other filter lets through: with the
 * state "Open", the lens counts are counts of open comments.
 */
export function revisionCounts(list: EditorComment[], filter: RevisionFilter): { lens: Record<LensChoice, number>; state: Record<StateChoice, number> } {
  const lens = Object.fromEntries((['all', ...LENSES] as LensChoice[]).map((l) => [l, 0])) as Record<LensChoice, number>
  const state = Object.fromEntries((['all', ...STATES] as StateChoice[]).map((s) => [s, 0])) as Record<StateChoice, number>
  for (const c of list) {
    if (stateOk(c, filter.state)) {
      lens.all++
      lens[c.lens]++
    }
    if (lensOk(c, filter.lens)) {
      state.all++
      state[c.state]++
    }
  }
  return { lens, state }
}

/**
 * The groups of the list: one for each chapter that has rows after the filters, in book order. In a chapter,
 * the open comments come first, then the intentional, done and ignored ones; in each state, the order of the
 * passages in the text (`place`; a comment without a place comes last).
 */
export function revisionGroups(list: EditorComment[], chapters: Chapter[], filter: RevisionFilter, place: (c: EditorComment) => number | null): RevisionGroup[] {
  const groups: RevisionGroup[] = []
  chapters.forEach((chapter, i) => {
    const mine = list.filter((c) => c.chapterId === chapter.id && lensOk(c, filter.lens))
    const shown = mine.filter((c) => stateOk(c, filter.state))
    if (!shown.length) return
    const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<CommentState, number>
    for (const c of mine) counts[c.state]++
    const at = new Map(shown.map((c) => [c.id, place(c)]))
    const key = (c: EditorComment): number => at.get(c.id) ?? Number.POSITIVE_INFINITY
    const rows = [...shown].sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || key(a) - key(b) || a.rank - b.rank)
    groups.push({ chapter, number: i + 1, rows, counts })
  })
  return groups
}
