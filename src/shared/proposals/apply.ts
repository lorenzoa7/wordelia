// Apply a find-and-replace hunk to Markdown text, with tolerant matching.

export interface MatchResult {
  start: number
  end: number
  /** How the match was found */
  mode: 'exact' | 'normalized'
  /** How many times the text appears. More than 1 means the target is ambiguous. */
  count: number
}

function countOf(haystack: string, needle: string): number {
  let n = 0
  let at = haystack.indexOf(needle)
  while (at >= 0) {
    n++
    at = haystack.indexOf(needle, at + 1)
  }
  return n
}

/** Characters that the AI often changes by mistake: quotes, dashes, spaces. */
function normChar(c: string): string {
  switch (c) {
    case '“':
    case '”':
    case '„':
    case '«':
    case '»':
      return '"'
    case '‘':
    case '’':
      return "'"
    case '—':
    case '―':
    case '–':
      return '-'
    case ' ':
    case '\t':
    case '\n':
    case '\r':
      return ' '
    default:
      return c
  }
}

/**
 * Normalize text and keep a map from each normalized index to the original index.
 * Markdown escapes and runs of spaces collapse.
 */
function normalizeWithMap(src: string): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  let prevSpace = false
  for (let i = 0; i < src.length; i++) {
    let c = src[i]
    // Skip Markdown escapes: "\*" matches "*"
    if (c === '\\' && i + 1 < src.length && /[\\*_`[\]<>~{}&#+=|.!-]/.test(src[i + 1])) continue
    c = normChar(c)
    if (c === ' ') {
      if (prevSpace) continue
      prevSpace = true
    } else prevSpace = false
    text += c
    map.push(i)
  }
  return { text, map }
}

export function findText(haystack: string, needle: string): MatchResult | null {
  if (!needle) return null
  const exact = haystack.indexOf(needle)
  if (exact >= 0) return { start: exact, end: exact + needle.length, mode: 'exact', count: countOf(haystack, needle) }
  const h = normalizeWithMap(haystack)
  const n = normalizeWithMap(needle).text.trim()
  if (!n) return null
  const at = h.text.indexOf(n)
  if (at < 0) return null
  const start = h.map[at]
  const lastIdx = at + n.length - 1
  const end = h.map[lastIdx] + 1
  return { start, end, mode: 'normalized', count: countOf(h.text, n) }
}

export function applyHunk(
  markdown: string,
  find: string,
  replace: string
): { ok: true; text: string } | { ok: false; reason: string; code: 'not-found' | 'ambiguous' } {
  // An empty find means "append".
  if (!find.trim()) {
    const sep = markdown.endsWith('\n\n') || markdown === '' ? '' : markdown.endsWith('\n') ? '\n' : '\n\n'
    return { ok: true, text: markdown + sep + replace + '\n' }
  }
  const m = findText(markdown, find)
  if (!m) return { ok: false, code: 'not-found', reason: 'The text to change was not found. It may have changed since the AI read it.' }
  if (m.count > 1) return { ok: false, code: 'ambiguous', reason: 'The text to change appears more than once, so the right place is not clear. Ask the AI for a longer passage.' }
  return { ok: true, text: markdown.slice(0, m.start) + replace + markdown.slice(m.end) }
}
