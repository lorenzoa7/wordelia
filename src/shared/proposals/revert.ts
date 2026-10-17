// Undo accepted proposals: put the old text back where the text of the AI still is.

import { applyHunk } from './apply'

export interface AppliedChange {
  /** The text before the change */
  find: string
  /** The text that the change put in the file */
  replace: string
}

export interface RevertResult {
  text: string
  /** Changes that are undone */
  reverted: number
  /** Changes that stay, because their text changed after the AI change (or a deletion left nothing to find) */
  failed: number
}

/**
 * Undo changes in the reverse order of their application. A change is undone only when its new text
 * is still in the file, unchanged and only once. Other changes stay, so later words of the user are not lost.
 */
export function revertChanges(text: string, changes: AppliedChange[]): RevertResult {
  let out = text
  let reverted = 0
  let failed = 0
  for (const c of [...changes].reverse()) {
    // A deletion leaves nothing to find, so the old text has no place to go back to.
    if (!c.replace.trim()) {
      failed++
      continue
    }
    const r = applyHunk(out, c.replace, c.find)
    if (!r.ok) {
      failed++
      continue
    }
    out = r.text
    reverted++
  }
  // Undoing an appended passage leaves empty lines at the end.
  if (reverted && out !== text) out = out.replace(/\n{2,}$/, '\n')
  return { text: out, reverted, failed }
}
