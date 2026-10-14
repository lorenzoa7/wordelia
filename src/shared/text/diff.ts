// Word-level diff for AI proposals and inline review.

import { diffWordsWithSpace } from 'diff'

export type DiffOp = { type: 'equal' | 'insert' | 'delete'; text: string }

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
    if (op.type === 'equal' && prev && prev.type !== 'equal' && next && next.type !== 'equal' && /^\s*\S{0,2}\s*$/.test(op.text) && op.text.length <= 3) {
      // Split the short equal run into a delete and an insert.
      pushMerged(out, { type: 'delete', text: op.text })
      pushMerged(out, { type: 'insert', text: op.text })
      continue
    }
    pushMerged(out, { ...op })
  }
  return groupChanges(out)
}

function pushMerged(out: DiffOp[], op: DiffOp): void {
  const last = out[out.length - 1]
  if (last && last.type === op.type) last.text += op.text
  else out.push(op)
}

/** Within each run of changes, put all deletes before all inserts. */
function groupChanges(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = []
  let del = ''
  let ins = ''
  const flush = (): void => {
    if (del) out.push({ type: 'delete', text: del })
    if (ins) out.push({ type: 'insert', text: ins })
    del = ''
    ins = ''
  }
  for (const op of ops) {
    if (op.type === 'equal') {
      flush()
      out.push(op)
    } else if (op.type === 'delete') del += op.text
    else ins += op.text
  }
  flush()
  return out
}

export function diffStats(ops: DiffOp[]): { added: number; removed: number } {
  const words = (s: string): number => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length
  let added = 0
  let removed = 0
  for (const op of ops) {
    if (op.type === 'insert') added += words(op.text)
    if (op.type === 'delete') removed += words(op.text)
  }
  return { added, removed }
}
