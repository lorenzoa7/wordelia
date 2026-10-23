// The comments in the reply of an editor's read. Pure code.
//
// A `<note>` of the reply is a comment when it is complete and its `<find>` is a passage of the chapter
// (and of the selection, when the read has one). A note with no such passage has no comment: the letter
// of the reply keeps its words.

import { markdownToPlainBlocks, newId } from '@shared/book'
import type { EditorComment } from '@shared/comments'
import { findText } from '@shared/proposals/apply'
import type { Segment } from '@shared/proposals/parse'

export interface CommentsContext {
  threadId: string
  messageId: string
  chapterId: string
  /** The plain text of the chapter (`markdownToPlainBlocks`) */
  chapterPlain: string
  /** The plain text of the selection of a read of a selection. Empty text is no selection. */
  selection?: string
  /** The most comments for this read */
  limit: number
  /** The time of the comments (ISO) */
  now: string
}

/**
 * The texts to look for. The AI writes "--" where the chapter has "—" and the other way round, and
 * `findText` does not see these as the same.
 */
function needles(find: string): string[] {
  const out = [find]
  const long = find.replace(/-{2}/g, '—')
  if (long !== find) out.push(long)
  const short = find.replace(/[—―–]/g, '--')
  if (short !== find) out.push(short)
  return out
}

/** Where `find` is in `haystack`: the first match. A passage that is in the text two times still has a place. */
function locate(haystack: string, find: string): { start: number; end: number } | null {
  for (const needle of needles(find)) {
    const m = findText(haystack, needle)
    if (m) return m
  }
  return null
}

/**
 * The comments of the complete notes, in the order of their ranks, at most `limit`. The `passage` is the
 * plain text of the chapter that the note is about. The key of a comment is the index of its segment.
 */
export function commentsFromSegments(segments: Segment[], ctx: CommentsContext): EditorComment[] {
  const selection = ctx.selection?.trim() ? ctx.selection : undefined
  const found: EditorComment[] = []
  for (const s of segments) {
    if (s.kind !== 'note' || !s.complete || !s.text.trim()) continue
    // The AI quotes Markdown ("*Andorinha*"); the chapter is plain text here.
    const wanted = markdownToPlainBlocks(s.find)
    const inChapter = locate(ctx.chapterPlain, wanted)
    if (!inChapter) continue
    let passage = ctx.chapterPlain.slice(inChapter.start, inChapter.end)
    if (selection) {
      const inSelection = locate(selection, wanted)
      if (!inSelection) continue
      passage = selection.slice(inSelection.start, inSelection.end)
    }
    found.push({
      id: newId('cm'),
      chapterId: ctx.chapterId,
      lens: s.lens,
      rank: s.rank,
      text: s.text,
      passage,
      sources: s.sources,
      state: 'open',
      threadId: ctx.threadId,
      messageId: ctx.messageId,
      key: String(s.index),
      createdAt: ctx.now,
      updatedAt: ctx.now
    })
  }
  return found.sort((a, b) => a.rank - b.rank).slice(0, ctx.limit)
}

/** Inline code and Markdown links of a letter: their text stays as it is. */
const KEEP = /(`[^`\n]*`|\[[^\]\n]*\]\([^)\n]*\))/

/**
 * The links of the letter of a read to its comments. In the letter, each problem has "(→ N)", where N is
 * the rank of its comment in the reply. Each "→ N" at the end of parentheses becomes a Markdown link to
 * "#comment-N"; the chat shows it as a link to that comment. The link holds the closing parenthesis, and
 * the opening one when it holds only the arrow ("(→ 2)"; then the link is "#comment-N", else
 * "#comment-N-in"), so the chip never goes to another line than its parentheses. A bare arrow
 * ("scene 2 → 3"), inline code and other links stay as they are.
 */
export function linkCommentRefs(text: string): string {
  return text
    .split(KEEP)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/(\()?([ \t]*)→[ \t]*(\d+)[ \t]*\)/g, (_m, open: string | undefined, space: string, n: string) =>
            open ? `[(→ ${n})](#comment-${n})` : `${space}[→ ${n})](#comment-${n}-in)`
          )
    )
    .join('')
}

/**
 * The comment of a link that `linkCommentRefs` made: its rank, and if the link holds the opening parenthesis
 * too. Null for another link.
 */
export function commentRef(href: string | undefined): { rank: number; opens: boolean } | null {
  const m = href ? /^#comment-(\d+)(-in)?$/.exec(href) : null
  return m ? { rank: Number(m[1]), opens: !m[2] } : null
}
