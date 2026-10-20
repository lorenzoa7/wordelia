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
//   <portrait file="planning/Characters/Teresa.md">_assets/chat/teresa.webp</portrait>
//
// The parser works on partial text too, so the UI can show proposals while they stream.

import type { HunkState } from '../types'

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
  /** An image of the chat as the portrait of an entry. `image` is relative to planning/. */
  | { kind: 'portrait'; file: string; image: string; complete: boolean; index: number }

const OPEN_RE = /<(edit|create|portrait)\s+file\s*=\s*"([^"]*)"\s*>/g

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
    const kind = m[1] as 'edit' | 'create' | 'portrait'
    const file = m[2].trim()
    if (m.index > pos) segments.push({ kind: 'text', text: text.slice(pos, m.index) })
    const bodyStart = m.index + m[0].length
    const closeTag = `</${kind}>`
    const close = text.indexOf(closeTag, bodyStart)
    const complete = close >= 0
    const body = text.slice(bodyStart, complete ? close : text.length)
    if (kind === 'edit') {
      segments.push({ kind, file, hunks: parseHunks(body, complete), complete, index: index++ })
    } else if (kind === 'portrait') {
      segments.push({ kind, file, image: body.trim(), complete, index: index++ })
    } else {
      segments.push({ kind, file, content: trimTagNewlines(body), complete, index: index++ })
    }
    pos = complete ? close + closeTag.length : text.length
    OPEN_RE.lastIndex = pos
    if (!complete) break
  }
  // Hide a tag that is still being typed ("<ed", "<edit fi").
  let rest = text.slice(pos)
  const partial = /<(?:e(?:d(?:i(?:t(?:\s[^>]*)?)?)?)?|c(?:r(?:e(?:a(?:t(?:e(?:\s[^>]*)?)?)?)?)?)?|p(?:o(?:r(?:t(?:r(?:a(?:i(?:t(?:\s[^>]*)?)?)?)?)?)?)?)?)?$/.exec(rest)
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

const STATE_WORDS: Record<HunkState, string> = {
  pending: 'not decided yet',
  accepted: 'accepted by the author',
  rejected: 'rejected by the author',
  failed: 'could not be applied'
}

function short(text: string, max = 200): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/**
 * The text of a reply with each proposal as one short line: for digests and the thread history sent to the AI.
 * With `states`, each line says what the author did with the proposal, and edits show the new text,
 * so the history and the digests know what is now in the book.
 */
export function proposalSummary(text: string, states?: Record<string, HunkState>): string {
  return parseProposals(text)
    .map((s) => {
      if (s.kind === 'text') return s.text
      if (s.kind === 'portrait') return `[Proposed the image ${s.image} as the portrait of ${s.file}${states ? `: ${STATE_WORDS[states[hunkKey(s.index, 0)] ?? 'pending']}` : ''}]`
      if (!states) return s.kind === 'edit' ? `[Proposed ${s.hunks.length} change(s) to ${s.file}]` : `[Proposed new file ${s.file}]`
      if (s.kind === 'create') return `[Proposed new file ${s.file}: ${STATE_WORDS[states[hunkKey(s.index, 0)] ?? 'pending']}]`
      return s.hunks
        .map((h, i) => `[Proposed change to ${s.file}, ${STATE_WORDS[states[hunkKey(s.index, i)] ?? 'pending']}: "${short(h.find, 80)}" → "${short(h.replace)}"]`)
        .join('\n')
    })
    .join('')
}

/** Stable key for a hunk inside a message, for accept/reject state. */
export function hunkKey(segmentIndex: number, hunkIndex: number): string {
  return `${segmentIndex}:${hunkIndex}`
}
