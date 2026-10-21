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
// The reply of an editor's read has three more tags. They are not proposals: they change no file.
//
//   <note lens="continuity" rank="1">
//   <find>the passage, word for word</find>
//   <text>the comment</text>
//   <source file="planning/Plot/Story line.md">a quote that supports it</source>
//   </note>
//
//   <read chapter="manuscript/The Traveller.md" lens="structure"/>
//   <resolved ids="c3 c7"/>
//
// The parser works on partial text too, so the UI can show proposals while they stream.

import { isLens, type CommentSource, type Lens, type LensChoice } from '../comments'
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
  /** A comment of an editor's read on one passage. It is data about the text: it is not a proposal. */
  | { kind: 'note'; lens: Lens; rank: number; find: string; text: string; sources: CommentSource[]; complete: boolean; index: number }
  /** The offer of a read of a chapter. */
  | { kind: 'read'; chapter: string; lens: LensChoice; complete: true; index: number }
  /** The comments that the new text of a chapter seems to fix. */
  | { kind: 'resolved'; ids: string[]; complete: true; index: number }

/** The segments that propose a change to a file. */
export type FileSegment = Extract<Segment, { file: string }>

export function isFileSegment(s: Segment): s is FileSegment {
  return s.kind === 'edit' || s.kind === 'create' || s.kind === 'portrait'
}

type NoteSegment = Extract<Segment, { kind: 'note' }>

// A tag with a body (edit, create, portrait, note) or a tag that closes itself (read, resolved).
const TAG_RE =
  /<(edit|create|portrait)\s+file\s*=\s*"([^"]*)"\s*>|<note((?:\s+[\w-]+\s*=\s*"[^"]*")*)\s*>|<(read|resolved)((?:\s+[\w-]+\s*=\s*"[^"]*")*)\s*\/>/g

const TAG_NAMES = ['edit', 'create', 'portrait', 'note', 'read', 'resolved']

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

/** The attributes of a tag: `lens="style" rank="2"`. */
function readAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

/** The text of a tag body that is still streaming does not end with a part of the closing tag ("</te"). */
function withoutPartialClose(s: string): string {
  return s.replace(/<\/?[a-z]*$/, '')
}

/** A note, or `null` when its lens is not one of the lenses: the note has no segment and no words. */
function parseNote(attrs: Record<string, string>, body: string, complete: boolean, index: number): NoteSegment | null {
  const lens = attrs.lens
  if (!isLens(lens)) return null
  let find: string | undefined
  let text: string | undefined
  const sources: CommentSource[] = []
  const re = /<(find|text)>([\s\S]*?)(?:<\/\1>|$)|<source\s+file\s*=\s*"([^"]*)"\s*>([\s\S]*?)(?:<\/source>|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    if (m[1]) {
      const value = m[0].endsWith(`</${m[1]}>`) ? m[2] : withoutPartialClose(m[2])
      if (m[1] === 'find') find ??= trimTagNewlines(value)
      else text ??= value.trim()
    } else {
      const quote = m[0].endsWith('</source>') ? m[4] : withoutPartialClose(m[4])
      sources.push({ file: m[3].trim(), quote: quote.trim() })
    }
  }
  // A comment with no rank goes after the ones before it.
  const rank = Number.parseInt(attrs.rank ?? '', 10)
  return { kind: 'note', lens, rank: rank > 0 ? rank : index + 1, find: find ?? '', text: text ?? '', sources, complete, index }
}

/** `<read chapter="…" lens="…"/>`, or `null` when it has no chapter. A lens that is not known offers all of them. */
function parseRead(attrs: Record<string, string>, index: number): Extract<Segment, { kind: 'read' }> | null {
  const chapter = attrs.chapter?.trim()
  if (!chapter) return null
  const lens = attrs.lens
  return { kind: 'read', chapter, lens: lens === 'all' || isLens(lens) ? lens : 'all', complete: true, index }
}

/** `<resolved ids="c3 c7"/>`, or `null` when it has no id. */
function parseResolved(attrs: Record<string, string>, index: number): Extract<Segment, { kind: 'resolved' }> | null {
  const ids = (attrs.ids ?? '').split(/[\s,]+/).filter(Boolean)
  return ids.length ? { kind: 'resolved', ids, complete: true, index } : null
}

/** Where a tag that is still being typed ("<ed", "<edit fi") starts in `rest`; -1 when there is none. */
function partialTagAt(rest: string): number {
  for (let i = rest.indexOf('<'); i >= 0; i = rest.indexOf('<', i + 1)) {
    const m = /^<([a-z]*)(\s[^>]*)?$/.exec(rest.slice(i))
    if (!m) continue
    const [, name, attrs] = m
    if (attrs === undefined ? TAG_NAMES.some((n) => n.startsWith(name)) : TAG_NAMES.includes(name)) return i
  }
  return -1
}

/** Split an AI reply into text and proposals. */
export function parseProposals(text: string): Segment[] {
  const segments: Segment[] = []
  let pos = 0
  let index = 0
  TAG_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TAG_RE.exec(text))) {
    if (m.index > pos) segments.push({ kind: 'text', text: text.slice(pos, m.index) })
    const bodyStart = m.index + m[0].length
    if (m[4]) {
      // A tag that closes itself: it has no body.
      const attrs = readAttrs(m[5])
      const seg = m[4] === 'read' ? parseRead(attrs, index) : parseResolved(attrs, index)
      if (seg) {
        segments.push(seg)
        index++
      }
      pos = bodyStart
      TAG_RE.lastIndex = pos
      continue
    }
    const kind = (m[1] ?? 'note') as 'edit' | 'create' | 'portrait' | 'note'
    const file = (m[2] ?? '').trim()
    const closeTag = `</${kind}>`
    const close = text.indexOf(closeTag, bodyStart)
    const complete = close >= 0
    const body = text.slice(bodyStart, complete ? close : text.length)
    if (kind === 'edit') {
      segments.push({ kind, file, hunks: parseHunks(body, complete), complete, index: index++ })
    } else if (kind === 'portrait') {
      segments.push({ kind, file, image: body.trim(), complete, index: index++ })
    } else if (kind === 'note') {
      const note = parseNote(readAttrs(m[3]), body, complete, index)
      if (note) {
        segments.push(note)
        index++
      }
    } else {
      segments.push({ kind, file, content: trimTagNewlines(body), complete, index: index++ })
    }
    pos = complete ? close + closeTag.length : text.length
    TAG_RE.lastIndex = pos
    if (!complete) break
  }
  // Hide a tag that is still being typed ("<ed", "<edit fi").
  let rest = text.slice(pos)
  const partial = partialTagAt(rest)
  if (partial >= 0) rest = rest.slice(0, partial)
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
 * The comments of a read have a line too, but they are not proposals: they never take a state.
 */
export function proposalSummary(text: string, states?: Record<string, HunkState>): string {
  return parseProposals(text)
    .map((s) => {
      if (s.kind === 'text') return s.text
      if (s.kind === 'note') return `[Comment ${s.rank} (${s.lens}) on: "${short(s.find, 80)}"]`
      if (s.kind === 'read') return `[Offered an editor's read of ${s.chapter}]`
      if (s.kind === 'resolved') return `[Said that comments ${s.ids.join(' ')} look fixed]`
      if (s.kind === 'portrait') return `[Proposed the image ${s.image} as the portrait of ${s.file}${states ? `: ${STATE_WORDS[states[hunkKey(s.index, 0)] ?? 'pending']}` : ''}]`
      if (!states) return s.kind === 'edit' ? `[Proposed ${s.hunks.length} change(s) to ${s.file}]` : `[Proposed new file ${s.file}]`
      if (s.kind === 'create') return `[Proposed new file ${s.file}: ${STATE_WORDS[states[hunkKey(s.index, 0)] ?? 'pending']}]`
      return s.hunks
        .map((h, i) => `[Proposed change to ${s.file}, ${STATE_WORDS[states[hunkKey(s.index, i)] ?? 'pending']}: "${short(h.find, 80)}" → "${short(h.replace)}"]`)
        .join('\n')
    })
    .join('')
}

/**
 * The prose of a reply: its text without the proposals and without words about them. Copy and
 * "Insert at cursor" use it, so no proposal marker goes into the book.
 */
export function replyProse(text: string): string {
  return parseProposals(text)
    .filter((s): s is Extract<Segment, { kind: 'text' }> => s.kind === 'text')
    .map((s) => s.text)
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** True when a reply has at least one proposal. The comments of a read are not proposals. */
export function hasProposals(text: string): boolean {
  return parseProposals(text).some(isFileSegment)
}

/** Stable key for a hunk inside a message, for accept/reject state. */
export function hunkKey(segmentIndex: number, hunkIndex: number): string {
  return `${segmentIndex}:${hunkIndex}`
}
