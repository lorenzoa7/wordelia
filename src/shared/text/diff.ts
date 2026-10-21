// Word-level diff for AI proposals and inline review.

import { diffWordsWithSpace } from 'diff'

/**
 * One part of a diff. `marks` (only from `styledDiff`): the formatting of each character of `text`
 * in the new text, for example "italic" or "" (see `StyledText`).
 */
export type DiffOp = { type: 'equal' | 'insert' | 'delete'; text: string; marks?: string[] }

/** Diff two texts by words, keeping spaces and punctuation as their own tokens. */
export function wordDiff(before: string, after: string): DiffOp[] {
  const parts = diffWordsWithSpace(before, after)
  const ops: DiffOp[] = []
  for (const p of parts) {
    const type: DiffOp['type'] = p.added ? 'insert' : p.removed ? 'delete' : 'equal'
    const last = ops[ops.length - 1]
    if (last && last.type === type) last.text += p.value
    else ops.push({ type, text: p.value })
  }
  return tidy(ops)
}

/** A short equal run between two changes: one space or one small word. */
function isShortRun(text: string): boolean {
  return /^\s*\S{0,2}\s*$/.test(text) && text.length <= 3
}

/**
 * Make diffs easier to read: a short equal run (one space or one small word)
 * between two changes joins them, so the reader sees one change, not three.
 */
function tidy(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = []
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const prev = out[out.length - 1]
    const next = ops[i + 1]
    if (op.type === 'equal' && prev && prev.type !== 'equal' && next && next.type !== 'equal' && isShortRun(op.text)) {
      // Split the short equal run into a delete and an insert.
      pushMerged(out, { type: 'delete', text: op.text })
      pushMerged(out, { type: 'insert', text: op.text, ...(op.marks ? { marks: op.marks } : {}) })
      continue
    }
    pushMerged(out, { ...op })
  }
  return groupChanges(out)
}

function pushMerged(out: DiffOp[], op: DiffOp): void {
  const last = out[out.length - 1]
  if (last && last.type === op.type) {
    if (last.marks || op.marks) last.marks = [...(last.marks ?? blank(last.text.length)), ...(op.marks ?? blank(op.text.length))]
    last.text += op.text
  } else out.push({ ...op, ...(op.marks ? { marks: [...op.marks] } : {}) })
}

function blank(n: number): string[] {
  return Array.from({ length: n }, () => '')
}

/** Within each run of changes, put all deletes before all inserts. */
function groupChanges(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = []
  let del: DiffOp | null = null
  let ins: DiffOp | null = null
  const flush = (): void => {
    if (del) out.push(del)
    if (ins) out.push(ins)
    del = null
    ins = null
  }
  const add = (into: DiffOp | null, op: DiffOp): DiffOp => {
    if (!into) return { ...op, ...(op.marks ? { marks: [...op.marks] } : {}) }
    const merged: DiffOp[] = [into]
    pushMerged(merged, op)
    return merged[0]
  }
  for (const op of ops) {
    if (op.type === 'equal') {
      flush()
      out.push(op)
    } else if (op.type === 'delete') del = add(del, op)
    else ins = add(ins, op)
  }
  flush()
  return out
}

/** A text and the formatting of each character ("italic", "bold italic", or "" for none). */
export interface StyledText {
  text: string
  marks: string[]
}

/**
 * A word diff that also sees formatting: a word that only loses or gets italics (or another mark)
 * is a change too, so it shows, and Accept does not change formatting without a mark in the diff.
 * Spaces do not count: a space inside or outside an italic span is the same space. The insert and
 * equal parts get the formatting of the new text (`DiffOp.marks`).
 */
export function styledDiff(before: StyledText, after: StyledText): DiffOp[] {
  const out: DiffOp[] = []
  let i = 0
  let j = 0
  for (const op of wordDiff(before.text, after.text)) {
    const n = op.text.length
    if (op.type === 'delete') {
      out.push({ type: 'delete', text: op.text })
      i += n
      continue
    }
    if (op.type === 'insert') {
      out.push({ type: 'insert', text: op.text, marks: after.marks.slice(j, j + n) })
      j += n
      continue
    }
    // An equal run: cut it where the formatting is not the same.
    const same = (k: number): boolean => /\s/.test(op.text[k]) || (before.marks[i + k] ?? '') === (after.marks[j + k] ?? '')
    let k = 0
    while (k < n) {
      const s = same(k)
      let e = k
      while (e < n && same(e) === s) e++
      const piece = op.text.slice(k, e)
      const marks = after.marks.slice(j + k, j + e)
      if (s) out.push({ type: 'equal', text: piece, marks })
      else out.push({ type: 'delete', text: piece }, { type: 'insert', text: piece, marks })
      k = e
    }
    i += n
    j += n
  }
  return tidy(out)
}

/** True when the diff has a change. */
export function hasChanges(ops: DiffOp[]): boolean {
  return ops.some((o) => o.type !== 'equal')
}

/**
 * The size of one change, for "+3 −2": its words. A change without words counts its punctuation
 * marks (a scene break "* * *" is one), and a change without either counts its paragraph breaks.
 * Thus a change of one comma or a joined paragraph is never "+0 −0".
 */
function changeSize(text: string): number {
  const words = (text.match(/[\p{L}\p{N}]+/gu) ?? []).length
  if (words) return words
  const marks = (text.replace(/\*[ \t]\*[ \t]\*/g, '*').match(/[^\s\p{L}\p{N}]+/gu) ?? []).length
  if (marks) return marks
  return (text.match(/\n[ \t]*\n/g) ?? []).length
}

export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const op of ops) {
    if (op.type === 'insert') added += changeSize(op.text)
    if (op.type === 'delete') removed += changeSize(op.text)
  }
  return { added, removed }
}
