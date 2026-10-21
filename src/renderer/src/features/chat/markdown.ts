// Markdown of a reply that is cut: it streams, or the author stopped it. A cut "**bold" shows its
// stars as text. These helpers close the open marks of the last paragraph, so the text shows as it
// will look. Pure functions, so the tests can use them.

/** Positions of a mark in a text, without the marks inside code. */
function marks(text: string, re: RegExp): number[] {
  const out: number[] = []
  let code = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`') {
      code = !code
      continue
    }
    if (code) continue
    re.lastIndex = i
    const m = re.exec(text)
    if (m && m.index === i) {
      out.push(i)
      i += m[0].length - 1
    }
  }
  return out
}

/**
 * Close the open Markdown marks at the end of a cut text: a code block, inline code, bold and
 * italic. A mark at the very end with no text after it goes away.
 */
export function closeMarkdown(text: string): string {
  let out = text.replace(/\s+$/, '')
  // A code block that is open.
  const fences = out.match(/^\s*```/gm)?.length ?? 0
  if (fences % 2 === 1) return `${out}\n\`\`\``
  // The last paragraph only: a mark never goes over a blank line.
  const cut = out.lastIndexOf('\n\n')
  const head = out.slice(0, cut + 1)
  let tail = out.slice(cut + 1)
  // An opening mark with nothing after it: "Text **" or a list item "- *".
  tail = tail.replace(/(^|\s)(\*{1,3}|_{1,2}|`)$/, '$1').replace(/\s+$/, '')
  // List bullets at the start of a line are not italic marks.
  const body = tail.replace(/^(\s*)[*+-]\s/gm, (_m, sp: string) => `${sp}  `)
  const closers: Array<{ at: number; mark: string }> = []
  const ticks = (body.match(/`/g) ?? []).length
  if (ticks % 2 === 1) closers.push({ at: body.lastIndexOf('`'), mark: '`' })
  else {
    const bold = marks(body, /\*\*/y)
    if (bold.length % 2 === 1) closers.push({ at: bold[bold.length - 1], mark: '**' })
    const single = marks(body.replace(/\*\*/g, '  '), /\*/y)
    if (single.length % 2 === 1) closers.push({ at: single[single.length - 1], mark: '*' })
  }
  // The mark that opened last closes first.
  closers.sort((a, b) => b.at - a.at)
  out = head + tail + closers.map((c) => c.mark).join('')
  return out
}
