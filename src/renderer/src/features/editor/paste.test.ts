import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { Slice } from '@tiptap/pm/model'
import { schemaExtensions } from './extensions'
import { cleanPastedSlice, pasteStyleFor } from './paste'

const schema = getSchema(schemaExtensions())
const style = pasteStyleFor('en', { smartQuotes: true, smartEllipsis: true, dialogueDash: '—' })

const p = (...content: Array<string | 'br'>) =>
  schema.nodes.paragraph.create(
    null,
    content.filter(Boolean).map((c) => (c === 'br' ? schema.nodes.hardBreak.create() : schema.text(c)))
  )

function cleaned(nodes: ReturnType<typeof p>[], openStart = 1, openEnd = 1): { blocks: string[]; openStart: number; openEnd: number } {
  const slice = cleanPastedSlice(new Slice(schema.nodes.doc.create(null, nodes).content, openStart, openEnd), schema, style)
  const blocks: string[] = []
  slice.content.forEach((n) => blocks.push(n.type.name === 'paragraph' ? n.textContent : `[${n.type.name}]`))
  return { blocks, openStart: slice.openStart, openEnd: slice.openEnd }
}

describe('cleanPastedSlice', () => {
  it('gives the text the quotes, the dash and the ellipsis of the book', () => {
    expect(cleaned([p('"Wait" -- she said... "really--"')]).blocks).toEqual(['“Wait” — she said… “really—”'])
  })
  it('makes a scene break of a line with three asterisks', () => {
    expect(cleaned([p('One.'), p('***'), p('Two.'), p('* * *'), p('Three.')]).blocks).toEqual(['One.', '[sceneBreak]', 'Two.', '[sceneBreak]', 'Three.'])
  })
  it('leaves out empty lines, also a line with only a line break', () => {
    expect(cleaned([p('One.'), p(''), p('br'), p(' '), p('Two.')]).blocks).toEqual(['One.', 'Two.'])
  })
  it('keeps the open sides only when the first and last paragraphs stay', () => {
    expect(cleaned([p('One.'), p('Two.')])).toMatchObject({ openStart: 1, openEnd: 1 })
    expect(cleaned([p(''), p('One.'), p('***')])).toMatchObject({ openStart: 0, openEnd: 0 })
  })
  it('typesets text pasted inside a paragraph', () => {
    const slice = cleanPastedSlice(new Slice(p('a "word"').content, 0, 0), schema, style)
    expect(slice.content.textBetween(0, slice.content.size)).toBe('a “word”')
  })
})
