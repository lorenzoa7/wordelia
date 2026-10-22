import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState, type Plugin } from '@tiptap/pm/state'
import { history, redo, undo } from '@tiptap/pm/history'
import { parseMarkdown } from '@shared/markdown/parse'
import type { EditorComment } from '@shared/comments'
import { schemaExtensions } from '@/features/editor/extensions'
import { RELOAD_META } from '@/features/editor/keep'
import { textWithMap } from '@/features/editor/review'
import { anchorComments, changesToWrite, commentMarksKey, commentMarksPlugin, inChapterOrder, passageAt, passageChanges, type Range } from './marks'

const schema = getSchema(schemaExtensions())
const NOW = '2026-10-21T10:00:00.000Z'

const CHAPTER = ['Elias acendeu o farol antes da tempestade.', 'O vento entrava pelas frestas da janela.', 'Marta subiu a escada com o café.'].join('\n\n')

function comment(over: Partial<EditorComment> = {}): EditorComment {
  return {
    id: 'cm_marta001',
    chapterId: 'ch_one',
    lens: 'continuity',
    rank: 1,
    text: 'Marta already knows about the boat.',
    passage: 'Marta subiu a escada',
    sources: [],
    state: 'open',
    threadId: 'th_read',
    messageId: 'msg_read',
    key: '0',
    createdAt: NOW,
    updatedAt: NOW,
    ...over
  }
}

function stateOf(md: string, plugins: Plugin[] = []): EditorState {
  return EditorState.create({ schema, doc: schema.nodeFromJSON(parseMarkdown(md)), plugins: [...plugins, commentMarksPlugin(() => 'ch_one')] })
}

/** A state whose marks know the passages of the comments, as the view gives them after a build */
function anchored(md: string, comments: EditorComment[], plugins: Plugin[] = []): EditorState {
  const st = stateOf(md, plugins)
  const ranges = anchorComments(st.doc, comments, new Map())
  const meta = { ...commentMarksKey.getState(st)!, ranges }
  return st.apply(st.tr.setMeta(commentMarksKey, meta))
}

const rangesOf = (st: EditorState): Map<string, Range> => commentMarksKey.getState(st)!.ranges
const textAt = (st: EditorState, r: Range): string => textWithMap(st.doc, r.from, r.to).text

/** The document position of the n-th match (from 0) of a text */
function posOf(st: EditorState, text: string, n = 0): number {
  const { text: plain, map } = textWithMap(st.doc, 0, st.doc.content.size)
  let i = -1
  for (let k = 0; k <= n; k++) {
    i = plain.indexOf(text, i + 1)
    if (i < 0) throw new Error(`not found: ${text}`)
  }
  return map[i]
}

describe('the passages of comments in the text', () => {
  it('anchors a passage by text and keeps it after an edit before it', () => {
    const c = comment()
    const st = anchored(CHAPTER, [c])
    const before = rangesOf(st).get(c.id)!
    expect(textAt(st, before)).toBe('Marta subiu a escada')

    const next = st.apply(st.tr.insertText('Naquela noite, ', posOf(st, 'Elias')))
    const after = rangesOf(next).get(c.id)!
    expect(after.from).toBe(before.from + 'Naquela noite, '.length)
    expect(textAt(next, after)).toBe('Marta subiu a escada')
    expect(passageChanges(next.doc, [c], rangesOf(next)).size).toBe(0)
  })

  it('an edit inside the passage updates the passage text', () => {
    const c = comment()
    const st = anchored(CHAPTER, [c])
    const next = st.apply(st.tr.insertText(' devagar', posOf(st, 'subiu') + 'subiu'.length))
    expect(passageChanges(next.doc, [c], rangesOf(next))).toEqual(new Map([[c.id, 'Marta subiu devagar a escada']]))
  })

  it('deleting the passage marks it lost', () => {
    const c = comment()
    const st = anchored(CHAPTER, [c])
    const r = rangesOf(st).get(c.id)!
    const next = st.apply(st.tr.delete(r.from, r.to))
    expect(passageChanges(next.doc, [c], rangesOf(next))).toEqual(new Map([[c.id, null]]))
    // A passage that is not in the text is lost too.
    const gone = comment({ id: 'cm_gone0001', passage: 'O farol apagou' })
    expect(passageChanges(st.doc, [gone], anchorComments(st.doc, [gone], new Map()))).toEqual(new Map([[gone.id, null]]))
  })

  it('an ambiguous passage anchors to the first match', () => {
    const md = ['Elias disse que sim.', 'Marta olhou o mar.', 'Elias disse que sim.'].join('\n\n')
    const c = comment({ passage: 'Elias disse que sim' })
    const st = stateOf(md)
    const first = anchorComments(st.doc, [c], new Map()).get(c.id)!
    expect(first.from).toBe(posOf(st, 'Elias disse', 0))
    expect(textAt(st, first)).toBe('Elias disse que sim')
    // A comment that has its place keeps it: the second match stays the second match.
    const second = { from: posOf(st, 'Elias disse', 1), to: posOf(st, 'Elias disse', 1) + 'Elias disse que sim'.length }
    expect(anchorComments(st.doc, [c], new Map([[c.id, second]])).get(c.id)).toEqual(second)
  })

  it('text typed at the edges of a passage stays out of it', () => {
    const c = comment()
    const st = anchored(CHAPTER, [c])
    const r = rangesOf(st).get(c.id)!
    const next = st.apply(st.tr.insertText('E ', r.from).insertText(' de pedra', r.to + 2))
    expect(textAt(next, rangesOf(next).get(c.id)!)).toBe('Marta subiu a escada')
    expect(passageChanges(next.doc, [c], rangesOf(next)).size).toBe(0)
  })

  it('a text from outside the editor finds all the passages again by their text', () => {
    const c = comment()
    const st = anchored(CHAPTER, [c])
    expect(commentMarksKey.getState(st)!.refind).toBe(false)
    // The file changed outside the app: the whole text is new, so a mapped range would be gone.
    const outside = schema.nodeFromJSON(parseMarkdown(`Um novo começo.\n\n${CHAPTER}`))
    const tr = st.tr.replaceWith(0, st.doc.content.size, outside.content).setMeta(RELOAD_META, true)
    const next = st.apply(tr)
    expect(commentMarksKey.getState(next)!.refind).toBe(true)
    const again = anchorComments(next.doc, [c], new Map())
    expect(textAt(next, again.get(c.id)!)).toBe('Marta subiu a escada')
  })

  it('a replace of a larger part that keeps the words of the passage keeps the passage', () => {
    // A Polish of the whole paragraph, accepted as one replace: the passage is in the new text.
    const c = comment()
    const st = anchored(CHAPTER, [c])
    const para = posOf(st, 'Marta subiu')
    const end = para + 'Marta subiu a escada com o café.'.length
    const next = st.apply(st.tr.replaceWith(para, end, schema.text('Devagar, Marta subiu a escada com a xícara quente.')))
    const r = rangesOf(next).get(c.id)!
    expect(textAt(next, r)).toBe('Marta subiu a escada')
    expect(passageChanges(next.doc, [c], rangesOf(next)).size).toBe(0)
    // A Polish that rewrites the words of the passage: it is gone.
    const rewritten = st.apply(st.tr.replaceWith(para, end, schema.text('Marta foi para cima com o café.')))
    expect(passageChanges(rewritten.doc, [c], rangesOf(rewritten))).toEqual(new Map([[c.id, null]]))
  })

  it('a deleted passage whose words come back at its place is found there again', () => {
    const c = comment({ passage: 'Elias acendeu o farol' })
    let st = anchored(`${CHAPTER}\n\nNo fim, Elias acendeu o farol.`, [c], [history()])
    const r = rangesOf(st).get(c.id)!
    st = st.apply(st.tr.delete(r.from, r.to))
    const gone = rangesOf(st).get(c.id)!
    expect(gone.from).toBe(gone.to)
    // The same words later in the chapter are not the passage.
    expect(passageAt(st.doc, gone.from, c.passage)).toBeNull()
    // Ctrl+Z: the words are back at the place where they went.
    undo(st, (tr) => (st = st.apply(tr)))
    const point = rangesOf(st).get(c.id)!
    const back = passageAt(st.doc, point.from, c.passage)!
    expect(back.from).toBe(r.from)
    expect(textAt(st, back)).toBe('Elias acendeu o farol')
    // Redo deletes them again.
    redo(st, (tr) => (st = st.apply(tr)))
    expect(passageAt(st.doc, rangesOf(st).get(c.id)!.from, c.passage)).toBeNull()
  })

  it('a read of a selection anchors to the first match after the start of the selection', () => {
    const md = ['Elias disse que sim.', 'Marta olhou o mar.', 'Elias disse que sim.'].join('\n\n')
    const c = comment({ passage: 'Elias disse que sim' })
    const st = stateOf(md)
    const scope = (): string => 'Marta olhou o mar.\n\nElias disse que sim.'
    const r = anchorComments(st.doc, [c], new Map(), scope).get(c.id)!
    expect(r.from).toBe(posOf(st, 'Elias disse', 1))
    // A selection that is not in the text any more: the first match of the chapter.
    expect(anchorComments(st.doc, [c], new Map(), () => 'O farol apagou.').get(c.id)!.from).toBe(posOf(st, 'Elias disse', 0))
  })

  it('a text from outside that removes a passage writes nothing; a deletion of the author makes it lost', () => {
    const c = comment()
    const st = anchored(CHAPTER, [c])
    const touchedOf = (s: EditorState): ReadonlySet<string> => commentMarksKey.getState(s)!.touched
    const without = schema.nodeFromJSON(parseMarkdown(CHAPTER.replace('Marta subiu a escada com o café.', 'O café esfriou na mesa.')))
    const outside = st.apply(st.tr.replaceWith(0, st.doc.content.size, without.content).setMeta(RELOAD_META, true))
    expect(changesToWrite(outside, [c], touchedOf(outside)).size).toBe(0)
    // The editor shows it as lost: its passage has no place in the new text.
    expect(anchorComments(outside.doc, [c], new Map()).has(c.id)).toBe(false)
    // Typing somewhere else after it writes nothing either.
    const typed = outside.apply(outside.tr.insertText('Ontem, ', posOf(outside, 'Elias')))
    expect(changesToWrite(typed, [c], touchedOf(typed)).size).toBe(0)
    // The author deletes the passage in this editor: the comment is lost.
    const r = rangesOf(st).get(c.id)!
    const deleted = st.apply(st.tr.delete(r.from, r.to))
    expect(changesToWrite(deleted, [c], touchedOf(deleted))).toEqual(new Map([[c.id, null]]))
  })

  it('only an edit that touches a passage writes it', () => {
    const c = comment()
    const st = anchored(CHAPTER, [c])
    const before = st.apply(st.tr.insertText('Ontem, ', posOf(st, 'Elias')))
    expect(commentMarksKey.getState(before)!.touched.size).toBe(0)
    const inside = before.apply(before.tr.insertText(' devagar', posOf(before, 'subiu') + 'subiu'.length))
    expect(changesToWrite(inside, [c], commentMarksKey.getState(inside)!.touched)).toEqual(new Map([[c.id, 'Marta subiu devagar a escada']]))
  })

  it('numbers the comments in the order of their passages, not of their ranks', () => {
    const style = comment({ id: 'cm_style001', lens: 'style', rank: 3, passage: 'Elias acendeu o farol' })
    const structure = comment({ id: 'cm_struct01', lens: 'structure', rank: 1, passage: 'O vento entrava' })
    const marta = comment({ rank: 2 })
    const lost = comment({ id: 'cm_lost0001', rank: 4, passage: 'O farol apagou' })
    const st = stateOf(CHAPTER)
    const all = [marta, structure, lost, style]
    const order = inChapterOrder(all, anchorComments(st.doc, all, new Map()))
    expect(order.map((c) => c.id)).toEqual(['cm_style001', 'cm_struct01', 'cm_marta001'])
  })
})
