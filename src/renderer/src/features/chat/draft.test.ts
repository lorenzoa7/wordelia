import { describe, expect, it } from 'vitest'
import type { Mention } from '@shared/types'
import { appendMention, docFromParts, docFromText, readDraft, splitMentions, withoutMention } from './draft'

const marta: Mention = { kind: 'entry', id: 'e2', label: 'Marta' }
const isle: Mention = { kind: 'entry', id: 'e3', label: 'Saint Isle' }
const storm: Mention = { kind: 'chapter', id: 'c1', label: 'The Storm' }

describe('composer draft', () => {
  it('reads the text with each mention as @Label, in its place', () => {
    const doc = docFromParts(['What do you think of ', marta, ' on ', isle, '?'])
    expect(readDraft(doc)).toEqual({ text: 'What do you think of @Marta on @Saint Isle?', mentions: [marta, isle] })
  })

  it('keeps line breaks, and lists a mention once', () => {
    const doc = docFromParts(['Line one\nLine two ', marta, ' and ', marta])
    expect(doc.content).toHaveLength(1)
    expect(doc.content[0].content?.filter((n) => n.type === 'hardBreak')).toHaveLength(1)
    const { text, mentions } = readDraft(doc)
    expect(text).toBe('Line one\nLine two @Marta and @Marta')
    expect(mentions).toEqual([marta])
  })

  it('joins paragraphs with a line break', () => {
    const doc = { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'A' }] }, { type: 'paragraph' as const }] }
    expect(readDraft(doc).text).toBe('A\n')
  })

  it('adds a mention at the end, with spaces around it', () => {
    expect(readDraft(appendMention(docFromText('Look at'), storm)).text).toBe('Look at @The Storm ')
    expect(readDraft(appendMention(docFromText('Look at '), storm)).text).toBe('Look at @The Storm ')
    expect(readDraft(appendMention(null, storm))).toEqual({ text: '@The Storm ', mentions: [storm] })
  })

  it('removes a mention', () => {
    const doc = withoutMention(docFromParts(['A ', marta, ' B ', storm]), 'e2')
    expect(readDraft(doc)).toEqual({ text: 'A  B @The Storm', mentions: [storm] })
  })

  it('finds the mentions of a sent message in its text', () => {
    const { parts, rest } = splitMentions('Is @Saint Isle too quiet for @Marta?', [marta, isle, storm])
    expect(parts).toEqual(['Is ', isle, ' too quiet for ', marta, '?'])
    expect(rest).toEqual([storm])
  })

  it('takes the longest label first, and leaves an @ without a mention as text', () => {
    const martaLopes: Mention = { kind: 'entry', id: 'e9', label: 'Marta Lopes' }
    const { parts } = splitMentions('@Marta Lopes and @Marta, mail me @ home', [marta, martaLopes])
    expect(parts).toEqual([martaLopes, ' and ', marta, ', mail me @ home'])
  })

  it('shows old messages, with mentions apart from the text, as before', () => {
    expect(splitMentions('What about her?', [marta])).toEqual({ parts: ['What about her?'], rest: [marta] })
  })

  it('round-trips a message to the edit box', () => {
    const sent = readDraft(docFromParts(['Compare ', storm, ' with ', marta, '.']))
    const again = readDraft(docFromParts(splitMentions(sent.text, sent.mentions).parts))
    expect(again).toEqual(sent)
  })
})
