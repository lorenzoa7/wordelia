// The comments of an editor's read: the model and the file `ai/comments.json`. Pure code.
//
// A read is a chat message. Its reply holds a short letter and up to a few comments. Each comment is
// about one passage of a chapter. The comments are data about the text: the AI never changes the text.

/** The five ways to read a chapter. */
export type Lens = 'structure' | 'reader' | 'style' | 'continuity' | 'proofread'

/** The lenses, in the order that the UI shows them. */
export const LENSES: Lens[] = ['structure', 'reader', 'style', 'continuity', 'proofread']

/** What the writer picks for a read: one lens, or all of them. */
export type LensChoice = Lens | 'all'

export type CommentState = 'open' | 'done' | 'ignored' | 'intentional'

/** A text that supports a comment: a quote from a file of the book. */
export interface CommentSource {
  file: string
  quote: string
}

export interface EditorComment {
  id: string
  chapterId: string
  lens: Lens
  rank: number
  text: string
  /** The plain text of the passage now. It changes when the writer edits the passage. */
  passage: string
  sources: CommentSource[]
  state: CommentState
  /** Why the writer marked the comment as intentional. */
  reason?: string
  /** The passage is gone ("O trecho mudou"). The comment stays in the list. */
  lost?: boolean
  threadId: string
  messageId: string
  /** The place of the comment in its reply: `${segment index}`. */
  key: string
  createdAt: string
  updatedAt: string
}

/** The most comments in one read, for all lenses. */
export const READ_LIMIT_ALL = 7
/** The most comments in one read, for one lens. */
export const READ_LIMIT_ONE = 5

const STATES: CommentState[] = ['open', 'done', 'ignored', 'intentional']

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function isLens(v: unknown): v is Lens {
  return typeof v === 'string' && (LENSES as string[]).includes(v)
}

function isState(v: unknown): v is CommentState {
  return typeof v === 'string' && (STATES as string[]).includes(v)
}

function parseSource(raw: unknown): CommentSource | null {
  if (!isObject(raw) || typeof raw.file !== 'string' || typeof raw.quote !== 'string') return null
  return { file: raw.file, quote: raw.quote }
}

/** One comment from the file, or `null` when an item has a wrong or a missing field. */
function parseComment(raw: unknown): EditorComment | null {
  if (!isObject(raw)) return null
  const { id, chapterId, lens, rank, text, passage, sources, state, reason, lost, threadId, messageId, key, createdAt, updatedAt } = raw
  if (typeof id !== 'string' || !id || typeof chapterId !== 'string' || !chapterId) return null
  if (!isLens(lens) || !isState(state)) return null
  if (typeof rank !== 'number' || !Number.isFinite(rank)) return null
  if (typeof text !== 'string' || typeof passage !== 'string') return null
  if (typeof threadId !== 'string' || typeof messageId !== 'string' || typeof key !== 'string') return null
  if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null
  const list = Array.isArray(sources) ? sources : []
  return {
    id,
    chapterId,
    lens,
    rank,
    text,
    passage,
    sources: list.map(parseSource).filter((s): s is CommentSource => s !== null),
    state,
    ...(typeof reason === 'string' ? { reason } : {}),
    ...(typeof lost === 'boolean' ? { lost } : {}),
    threadId,
    messageId,
    key,
    createdAt,
    updatedAt
  }
}

/** The comments without the ones that repeat an id: the first comment of an id stays. */
export function uniqueById(list: EditorComment[]): EditorComment[] {
  const seen = new Set<string>()
  return list.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}

/** What the text of `ai/comments.json` holds. */
export interface CommentsFile {
  comments: EditorComment[]
  /** The `version` of the file. A file with no version, and a missing file, are version 1. */
  version: number
  /** False when the text is not a comments file: a partial write of a sync client, or JSON of another shape. */
  valid: boolean
}

/**
 * The comments file in its text. The reader is tolerant: an item that is not a comment is dropped, the
 * first of two comments with one id stays, and a byte order mark at the start (Notepad writes one) is
 * not part of the JSON. A missing file (`null`) is a valid file with no comments.
 */
export function readCommentsFile(text: string | null): CommentsFile {
  if (text == null) return { comments: [], version: 1, valid: true }
  let raw: unknown
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return { comments: [], version: 1, valid: false }
  }
  if (!isObject(raw) || !Array.isArray(raw.comments)) return { comments: [], version: 1, valid: false }
  const version = typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1
  return { comments: uniqueById(raw.comments.map(parseComment).filter((c): c is EditorComment => c !== null)), version, valid: true }
}

/**
 * The comments in the text of `ai/comments.json`. A missing file, text that is not JSON and JSON of
 * another shape give an empty list.
 */
export function parseCommentsFile(text: string | null): EditorComment[] {
  return readCommentsFile(text).comments
}

/** The text of `ai/comments.json`: version 1, 2-space JSON, a line end at the end. */
export function serializeComments(list: EditorComment[]): string {
  return JSON.stringify({ version: 1, comments: list }, null, 2) + '\n'
}

/** The comments that wait for the writer: open, and with a passage that is still in the text. */
export function openCount(list: EditorComment[], chapterId?: string): number {
  return list.filter((c) => c.state === 'open' && !c.lost && (chapterId === undefined || c.chapterId === chapterId)).length
}
