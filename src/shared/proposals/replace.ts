// A <create> for a note that exists replaces the whole file of the note. These helpers say what
// changes, so the card can show a diff and tell what the note loses before the author accepts.

import { readFrontmatter } from '../markdown/frontmatter'

export interface NoteSide {
  summary: string
  aliases: string[]
  /** The other fields of the front matter, as text (not id, aliases and summary) */
  fields: Record<string, string>
  body: string
}

export interface NoteReplace {
  before: NoteSide
  after: NoteSide
  /** What the note loses: other names, fields of the front matter and sections (headings) */
  lost: { aliases: string[]; fields: string[]; sections: string[] }
}

function asText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(asText).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function side(file: string): NoteSide {
  const { data, body } = readFrontmatter(file.replace(/\r\n?/g, '\n'))
  const { id: _id, aliases, summary, ...rest } = data
  const list = Array.isArray(aliases) ? aliases.map(asText) : typeof aliases === 'string' && aliases ? [aliases] : []
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(rest)) {
    const text = asText(v).trim()
    if (text) fields[k] = text
  }
  return { summary: asText(summary).trim(), aliases: list.map((a) => a.trim()).filter(Boolean), fields, body: body.replace(/^\n+/, '').trimEnd() }
}

function headings(body: string): string[] {
  return [...body.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)].map((m) => m[1].trim())
}

const key = (s: string): string => s.normalize('NFC').toLowerCase()

/** What a new file does to a note: both sides, and what the note loses. */
export function noteReplace(oldFile: string, newFile: string): NoteReplace {
  const before = side(oldFile)
  const after = side(newFile)
  const has = (list: string[], v: string): boolean => list.some((x) => key(x) === key(v))
  const newHeads = headings(after.body)
  return {
    before,
    after,
    lost: {
      aliases: before.aliases.filter((a) => !has(after.aliases, a)),
      fields: [...(before.summary && !after.summary ? ['summary'] : []), ...Object.keys(before.fields).filter((k) => !(k in after.fields))],
      sections: headings(before.body).filter((h) => !has(newHeads, h))
    }
  }
}

/** True when the new file takes something out of the note. */
export function losesSomething(r: NoteReplace): boolean {
  return r.lost.aliases.length + r.lost.fields.length + r.lost.sections.length > 0
}
