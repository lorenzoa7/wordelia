// Selection helpers for actions. Pure ProseMirror code.

import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * A selection that ends at the very start of a paragraph (or starts at the very end of one)
 * includes an empty piece of that paragraph. Leave that piece out, so a one-paragraph rewrite
 * does not join two paragraphs.
 */
export function normalizeRange(doc: PMNode, from: number, to: number): { from: number; to: number } {
  let a = from
  let b = to
  const $b = doc.resolve(b)
  if (b > a && $b.parent.isTextblock && $b.parentOffset === 0) {
    // Move back to the end of the previous textblock.
    let pos = $b.before() // position before this block
    while (pos > a) {
      const $p = doc.resolve(pos)
      const before = $p.nodeBefore
      if (!before) break
      if (before.isTextblock) {
        b = pos - 1
        break
      }
      pos -= before.nodeSize
    }
  }
  const $a = doc.resolve(a)
  if (b > a && $a.parent.isTextblock && $a.parentOffset === $a.parent.content.size) {
    let pos = $a.after()
    while (pos < b) {
      const after = doc.resolve(pos).nodeAfter
      if (!after) break
      if (after.isTextblock) {
        a = pos + 1
        break
      }
      pos += after.nodeSize
    }
  }
  // Spaces at the ends of the selection stay out: the AI gets the text without them,
  // so a rewrite that kept them in the range would delete them and join two words.
  while (b > a && /^\s$/.test(doc.textBetween(b - 1, b))) b--
  while (b > a && /^\s$/.test(doc.textBetween(a, a + 1))) a++
  return { from: a, to: Math.max(a, b) }
}
