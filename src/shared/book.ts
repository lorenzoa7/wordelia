// Book format: defaults, file conversion, names and ids. Pure code.

import type { BookManifest, CategoryDef, Chapter, Entry, ExportSettings, Typography } from './types'
import { readFrontmatter, writeFrontmatter } from './markdown/frontmatter'

export const MANIFEST_FILE = 'wordelia.json'
export const MANUSCRIPT_DIR = 'manuscript'
export const PLANNING_DIR = 'planning'
export const AI_DIR = 'ai'
export const THREADS_DIR = 'ai/threads'
export const WRITING_RULES_FILE = 'ai/writing-rules.md'
export const SYNC_STATE_FILE = 'ai/sync-state.json'
/** The actions of this book (Settings → Actions → This book). The app settings keep the actions for all books. */
export const ACTIONS_FILE = 'ai/actions.json'
export const ASSETS_DIR = 'planning/_assets'
/** Images that the writer adds to chat messages */
export const CHAT_IMAGES_DIR = `${ASSETS_DIR}/chat`

const ALPHABET = '0123456789abcdefghijkmnopqrstuvwxyz'

/** A short random id with a prefix, for example `ch_k3j9x2ab`. */
export function newId(prefix: string): string {
  let s = ''
  const bytes = new Uint8Array(8)
  globalThis.crypto.getRandomValues(bytes)
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]
  return `${prefix}_${s}`
}

export const DEFAULT_TYPOGRAPHY: Typography = {
  fontFamily: 'Literata',
  fontSize: 12,
  lineHeight: 1.6,
  paragraphSpacing: 0,
  firstLineIndent: 1.5,
  align: 'justify',
  indentFirstParagraph: false,
  dialogueDash: '—',
  dialogueStyle: 'dash',
  smartQuotes: true,
  smartEllipsis: true,
  sceneBreak: 'asterisks'
}

export const DEFAULT_EXPORT: ExportSettings = {
  preset: 'book',
  pageSize: 'A5',
  margins: { top: 20, bottom: 20, inner: 18, outer: 14 },
  typography: { fontFamily: 'Literata', fontSize: 11, lineHeight: 1.45, firstLineIndent: 1.5, align: 'justify' },
  chapterHeading: 'number-title',
  chapterStartsOnNewPage: true,
  chapterDropFromTop: 30,
  sceneBreak: 'asterisks',
  titlePage: true,
  pageNumbers: true,
  runningHeader: false
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: 'characters', name: 'Characters', folder: 'Characters', icon: 'UserCircle' },
  { id: 'places', name: 'Places', folder: 'Places', icon: 'MapPin' },
  { id: 'world', name: 'World', folder: 'World', icon: 'GlobeHemisphereWest' },
  { id: 'plot', name: 'Plot', folder: 'Plot', icon: 'Path' },
  { id: 'notes', name: 'Notes', folder: 'Notes', icon: 'Notebook' }
]

export function newManifest(opts: { title: string; author: string; language: string }): BookManifest {
  const now = new Date().toISOString()
  return {
    format: 1,
    id: newId('bk'),
    title: opts.title,
    subtitle: '',
    author: opts.author,
    language: opts.language,
    genre: '',
    createdAt: now,
    updatedAt: now,
    chapters: [],
    planning: { categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })) },
    typography: { ...DEFAULT_TYPOGRAPHY, dialogueStyle: dialogueStyleFor(opts.language) },
    export: structuredClone(DEFAULT_EXPORT)
  }
}

/** Fill missing manifest fields with defaults, so old or hand-made files still open. */
/** The usual dialogue style of a language: quotation marks in English, German and Dutch, a dash elsewhere. */
export function dialogueStyleFor(language: string): 'dash' | 'quotes' {
  return /^(en|de|nl)(-|$)/i.test(language) ? 'quotes' : 'dash'
}

export function normalizeManifest(raw: Partial<BookManifest> & Record<string, unknown>): BookManifest {
  const base = newManifest({ title: 'Untitled', author: '', language: 'en' })
  return {
    ...base,
    ...raw,
    format: 1,
    chapters: Array.isArray(raw.chapters) ? raw.chapters.filter((c) => c && c.id && c.file) : [],
    planning: {
      categories:
        raw.planning?.categories && raw.planning.categories.length ? raw.planning.categories : base.planning.categories
    },
    typography: { ...DEFAULT_TYPOGRAPHY, dialogueStyle: dialogueStyleFor(String(raw.language ?? 'en')), ...(raw.typography ?? {}) },
    export: {
      ...DEFAULT_EXPORT,
      ...(raw.export ?? {}),
      margins: { ...DEFAULT_EXPORT.margins, ...(raw.export?.margins ?? {}) },
      typography: { ...DEFAULT_EXPORT.typography, ...(raw.export?.typography ?? {}) }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Files                                                                */
/* ------------------------------------------------------------------ */

/** Make a safe, readable file name (with spaces) from a title. */
export function fileNameFromTitle(title: string, ext = '.md'): string {
  const clean = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)
  const reserved = /^(con|prn|aux|nul|com\d|lpt\d)$/i
  const base = !clean || reserved.test(clean) ? 'Untitled' : clean
  return base + ext
}

/** Return a name that is not in `taken`, by adding " 2", " 3"... */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set([...taken].map((t) => t.toLowerCase()))
  if (!set.has(name.toLowerCase())) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 2; ; i++) {
    const candidate = `${stem} ${i}${ext}`
    if (!set.has(candidate.toLowerCase())) return candidate
  }
}

/** Files from Windows editors can have CRLF line ends. The app works with LF only. */
function lf(src: string): string {
  return src.replace(/\r\n?/g, '\n')
}

export function chapterFromFile(file: string, src: string, fallbackId: string): Chapter {
  const { data, body } = readFrontmatter(lf(src))
  const { id, title, ...meta } = data
  return {
    id: typeof id === 'string' && id ? id : fallbackId,
    file,
    title: typeof title === 'string' && title ? title : file.replace(/\.md$/i, ''),
    body: body.replace(/^\n+/, ''),
    meta
  }
}

export function chapterToFile(ch: Chapter): string {
  return writeFrontmatter({ id: ch.id, title: ch.title, ...ch.meta }, ch.body)
}

export function entryFromFile(file: string, src: string, fallbackId: string): Entry {
  const { data, body } = readFrontmatter(lf(src))
  const { id, aliases, summary, image, ...meta } = data
  const slash = file.lastIndexOf('/')
  const category = slash > 0 ? file.slice(0, slash) : ''
  const name = file.slice(slash + 1).replace(/\.md$/i, '')
  return {
    id: typeof id === 'string' && id ? id : fallbackId,
    category,
    file,
    name,
    aliases: Array.isArray(aliases) ? aliases.map(String) : typeof aliases === 'string' ? [aliases] : [],
    summary: typeof summary === 'string' ? summary : '',
    image: typeof image === 'string' && image ? image : null,
    body: body.replace(/^\n+/, ''),
    meta
  }
}

export function entryToFile(e: Entry): string {
  return writeFrontmatter(
    {
      id: e.id,
      aliases: e.aliases.length ? e.aliases : undefined,
      summary: e.summary || undefined,
      image: e.image ?? undefined,
      ...e.meta
    },
    e.body
  )
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                         */
/* ------------------------------------------------------------------ */

/** Remove Markdown syntax and give readable plain text. */
export function markdownToPlain(md: string): string {
  return md
    .replace(/^---[\s\S]*?\n---\n/, '')
    .replace(/^\s*\{(?:align|indent)=[^}]*\}\s*$/gm, '')
    .replace(/\[([^\]]*)\]\{[^}]*\}/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?u>/g, '')
    .replace(/&nbsp;/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .replace(/\\([\\*_`[\]<>~{}&#+=|.-])/g, '$1')
    .replace(/^\* \* \*$/gm, '')
    .replace(/^<!--\s*page\s*break\s*-->$/gim, '')
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu

export function countWords(text: string): number {
  return text.match(WORD_RE)?.length ?? 0
}

export function countMarkdownWords(md: string): number {
  return countWords(markdownToPlain(md))
}

/** Fast, stable 53-bit string hash (cyrb53), as hex. */
export function hashText(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

/** Format a word count for small labels: 980, 1.2k, 19.5k */
export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${Math.round(n / 100) / 10}k`.replace(/\.0k$/, 'k')
}

export const SCENE_BREAK_GLYPH: Record<string, string> = {
  asterisks: '*  *  *',
  asterism: '⁂',
  fleuron: '❦',
  hash: '#',
  blank: ''
}
