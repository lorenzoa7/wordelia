// The proposal protocol: how the AI proposes changes to files.
//
//   <edit file="manuscript/The Traveller.md">
//   <find>exact current text</find>
//   <replace>new text</replace>
//   </edit>
//
//   <create file="planning/Characters/Teresa.md">
//   ...full Markdown...
//   </create>
//
// The parser works on partial text too, so the UI can show proposals while they stream.

export interface Hunk {
  find: string
  replace: string
  /** False while the hunk is still streaming */
  complete: boolean
}

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'edit'; file: string; hunks: Hunk[]; complete: boolean; index: number }
  | { kind: 'create'; file: string; content: string; complete: boolean; index: number }

const OPEN_RE = /<(edit|create)\s+file\s*=\s*"([^"]*)"\s*>/g

/** Remove one leading and one trailing newline, the ones next to the tags. */
function trimTagNewlines(s: string): string {
  return s.replace(/^\r?\n/, '').replace(/\r?\n$/, '')
}

function parseHunks(body: string, closed: boolean): Hunk[] {
  const hunks: Hunk[] = []
  const re = /<find>([\s\S]*?)(?:<\/find>|$)\s*(?:<replace>([\s\S]*?)(?:<\/replace>|$))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    if (m[0].length === 0) {
      re.lastIndex++
      continue
    }
    const findClosed = m[0].includes('</find>')
    const replaceClosed = m[0].includes('</replace>')
    hunks.push({
      find: trimTagNewlines(m[1] ?? ''),
      replace: trimTagNewlines(m[2] ?? ''),
      complete: closed || (findClosed && replaceClosed)
    })
    if (!replaceClosed) break
  }
  return hunks
}

/** Split an AI reply into text and proposals. */
export function parseProposals(text: string): Segment[] {
  const segments: Segment[] = []
  let pos = 0
  let index = 0
  OPEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = OPEN_RE.exec(text))) {
    const kind = m[1] as 'edit' | 'create'
    const file = m[2].trim()
    if (m.index > pos) segments.push({ kind: 'text', text: text.slice(pos, m.index) })
    const bodyStart = m.index + m[0].length
    const closeTag = `</${kind}>`
    const close = text.indexOf(closeTag, bodyStart)
    const complete = close >= 0
    const body = text.slice(bodyStart, complete ? close : text.length)
    if (kind === 'edit') {
      segments.push({ kind, file, hunks: parseHunks(body, complete), complete, index: index++ })
    } else {
      segments.push({ kind, file, content: trimTagNewlines(body), complete, index: index++ })
    }
    pos = complete ? close + closeTag.length : text.length
    OPEN_RE.lastIndex = pos
    if (!complete) break
  }
  // Hide a tag that is still being typed ("<ed", "<edit fi").
  let rest = text.slice(pos)
  const partial = /<(?:e(?:d(?:i(?:t(?:\s[^>]*)?)?)?)?|c(?:r(?:e(?:a(?:t(?:e(?:\s[^>]*)?)?)?)?)?)?)?$/.exec(rest)
  if (partial && pos <= text.length) rest = rest.slice(0, partial.index)
  if (rest) segments.push({ kind: 'text', text: rest })
  return mergeText(segments)
}

function mergeText(segments: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const s of segments) {
    const last = out[out.length - 1]
    if (s.kind === 'text' && last?.kind === 'text') last.text += s.text
    else out.push(s)
  }
  return out
}

/** Text of a reply without proposals: for digests and the thread history sent to the AI. */
export function proposalSummary(text: string): string {
  return parseProposals(text)
    .map((s) => {
      if (s.kind === 'text') return s.text
      if (s.kind === 'edit') return `[Proposed ${s.hunks.length} change(s) to ${s.file}]`
      return `[Proposed new file ${s.file}]`
    })
    .join('')
}

/** Stable key for a hunk inside a message, for accept/reject state. */
export function hunkKey(segmentIndex: number, hunkIndex: number): string {
  return `${segmentIndex}:${hunkIndex}`
}
