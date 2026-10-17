// What the chat shows while a reply streams: the latest thought of the model, or the phase of the reply.
// Pure functions, no store.

import type { Segment } from '@shared/proposals/parse'

export type StreamPhase =
  /** No text yet: the model reads the book and thinks */
  | { kind: 'reading' }
  /** An <edit> tag streams */
  | { kind: 'edit'; file: string }
  /** A <create> tag streams */
  | { kind: 'create'; file: string }
  /** Plain text streams */
  | { kind: 'text' }

export function streamPhase(segments: Segment[]): StreamPhase {
  const last = segments[segments.length - 1]
  if (!last || segments.every((s) => s.kind === 'text' && !s.text.trim())) return { kind: 'reading' }
  if (last.kind === 'edit' && !last.complete) return { kind: 'edit', file: last.file }
  if (last.kind === 'create' && !last.complete) return { kind: 'create', file: last.file }
  return { kind: 'text' }
}

const MIN_WORDS = 4
const MAX_CHARS = 140

function clean(s: string): string {
  return s
    .replace(/\*\*|__|`/g, '')
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length
}

function shorten(s: string): string {
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1).trimEnd()}…` : s
}

/**
 * The latest thought, for one short line. It is the last complete sentence, so the line changes
 * once for each sentence, not for each word. A paragraph that ended (for example a bold heading such as
 * "**Checking the dialogue**") is complete too. Before the first complete sentence: the sentence
 * that the model writes, when it has a few words.
 */
export function latestThought(thinking: string): string {
  const closed = /\n\s*$/.test(thinking)
  const paragraphs = thinking
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const complete: string[] = []
  let partial = ''
  paragraphs.forEach((p, i) => {
    const open = i === paragraphs.length - 1 && !closed
    const parts = p.match(/[^.!?…]+(?:[.!?…]+["”’»)]*|$)/g) ?? []
    for (const part of parts) {
      const s = clean(part)
      if (!s) continue
      if (open && !/[.!?…]["”’»)]*$/.test(part.trim())) partial = s
      else complete.push(s)
    }
  })
  if (complete.length) return shorten(complete[complete.length - 1])
  return words(partial) >= MIN_WORDS ? shorten(partial) : ''
}
