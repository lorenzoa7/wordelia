// Import Markdown notes (for example from Obsidian) into the planning. Pure code: the renderer
// picks the files and writes the notes (src/renderer/src/features/plan/importNotes.ts).

import { entryFromFile } from '../book'
import { isStoryLine } from '../storyline'
import type { Entry } from '../types'
import { freeName, nameKey } from './notes'

/** File types that an embed can show and a note cannot: the embed goes. */
const FILE_EMBED = /\.(png|jpe?g|gif|webp|avif|bmp|svg|pdf|mp3|wav|ogg|m4a|mp4|webm|mov|canvas|base)$/i

/**
 * Text that makes no sense outside the vault. An embed of a note (![[Marta]]) becomes a link to it
 * ([[Marta]]). An embed of a file (![[map.png]]) goes, with the space before it, so "See ![[map.png]]."
 * becomes "See." and not "See ."
 */
export function cleanObsidian(body: string): string {
  return body
    .replace(/(^|[ \t]*)!\[\[([^\]\n]*)\]\]([ \t]*)/gm, (_m, before: string, target: string, after: string) => {
      const file = target.split(/[|#]/)[0].trim()
      if (!FILE_EMBED.test(file)) return `${before}[[${target}]]${after}`
      // Between two words, one space stays. At the start of a line or before a sign, none.
      return before && after ? ' ' : ''
    })
    .replace(/\^\[\[[^\]]*\]\]/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface PickedNote {
  /** The file name without its extension */
  name: string
  text: string
}

export interface ImportItem {
  name: string
  /** The name that the note had, when a note of the book already has it */
  renamedFrom?: string
  body: string
  extra: Partial<Entry>
}

/**
 * The notes to make from picked files. A name that a note of the book (or an earlier file of the
 * same import) already has gets " 2", " 3"..., and the item says so. The front matter stays (for
 * example `tags`), except an image (its file is not in the book) and the type of a story line.
 */
export function planImport(notes: PickedNote[], category: string, takenNames: Iterable<string>): ImportItem[] {
  const taken = [...takenNames]
  const out: ImportItem[] = []
  for (const note of notes) {
    const parsed = entryFromFile(`${category}/${note.name}.md`, note.text, 'tmp')
    const name = freeName(parsed.name, taken)
    taken.push(name)
    const meta = { ...parsed.meta }
    if (isStoryLine(parsed)) delete meta.type
    out.push({
      name,
      ...(nameKey(name) !== nameKey(parsed.name) ? { renamedFrom: parsed.name } : {}),
      body: cleanObsidian(parsed.body) + '\n',
      extra: { aliases: parsed.aliases, summary: parsed.summary, meta }
    })
  }
  return out
}
