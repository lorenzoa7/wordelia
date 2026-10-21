import { describe, expect, it } from 'vitest'
import { applyHunk, findText } from './apply'
import { parseProposals, proposalSummary } from './parse'
import { wordDiff } from '../text/diff'
import { markdownToPlainBlocks } from '../book'

describe('parseProposals', () => {
  it('splits text and a complete edit', () => {
    const reply = 'Here is a fix.\n\n<edit file="manuscript/One.md">\n<find>old text</find>\n<replace>new text</replace>\n</edit>\n\nDone.'
    const s = parseProposals(reply)
    expect(s.map((x) => x.kind)).toEqual(['text', 'edit', 'text'])
    const edit = s[1]
    expect(edit.kind === 'edit' && edit.file).toBe('manuscript/One.md')
    expect(edit.kind === 'edit' && edit.hunks).toEqual([{ find: 'old text', replace: 'new text', complete: true }])
  })

  it('parses several hunks in one edit', () => {
    const reply = '<edit file="a.md"><find>a</find><replace>b</replace><find>c</find><replace>d</replace></edit>'
    const s = parseProposals(reply)
    expect(s[0].kind === 'edit' && s[0].hunks.length).toBe(2)
  })

  it('parses a create block and trims the tag newlines', () => {
    const s = parseProposals('<create file="planning/Characters/Teresa.md">\n---\naliases: [Teresa]\n---\nBody\n</create>')
    expect(s[0]).toEqual({
      kind: 'create',
      file: 'planning/Characters/Teresa.md',
      content: '---\naliases: [Teresa]\n---\nBody',
      complete: true,
      index: 0
    })
  })

  it('handles a reply that is still streaming', () => {
    const s = parseProposals('Look:\n<edit file="a.md">\n<find>some te')
    expect(s[0]).toEqual({ kind: 'text', text: 'Look:\n' })
    expect(s[1].kind === 'edit' && s[1].complete).toBe(false)
    expect(s[1].kind === 'edit' && s[1].hunks[0]).toEqual({ find: 'some te', replace: '', complete: false })
  })

  it('hides a tag that is only partly typed', () => {
    expect(parseProposals('Look: <edi')).toEqual([{ kind: 'text', text: 'Look: ' }])
    expect(parseProposals('Look: <create fi')).toEqual([{ kind: 'text', text: 'Look: ' }])
  })

  it('summarizes proposals for history', () => {
    expect(proposalSummary('A <edit file="x.md"><find>a</find><replace>b</replace></edit> B')).toBe(
      'A [Proposed 1 change(s) to x.md] B'
    )
  })

  it('says what the author did with each proposal', () => {
    const text = 'A <edit file="x.md"><find>a</find><replace>b</replace></edit> <create file="planning/P/N.md">x</create>'
    expect(proposalSummary(text, { '0:0': 'accepted' })).toBe(
      'A [Proposed change to x.md, accepted by the author: "a" → "b"] [Proposed new file planning/P/N.md: not decided yet]'
    )
  })
})

describe('applyHunk', () => {
  it('replaces exact text', () => {
    expect(applyHunk('Um dois três.', 'dois', '2')).toEqual({ ok: true, text: 'Um 2 três.' })
  })

  it('matches when quotes, dashes and spaces differ', () => {
    const md = '— Sentiu isso? — perguntou o velho.\n\nOutro “trecho”  aqui.'
    const r = applyHunk(md, '- Sentiu isso? - perguntou o velho.', '— Sentiu? — perguntou ele.')
    expect(r).toEqual({ ok: true, text: '— Sentiu? — perguntou ele.\n\nOutro “trecho”  aqui.' })
    expect(findText(md, 'Outro "trecho" aqui.')).not.toBeNull()
  })

  it('matches across Markdown escapes', () => {
    expect(findText('2 \\* 3 = 6', '2 * 3 = 6')).toEqual({ start: 0, end: 10, mode: 'normalized', count: 1 })
  })

  it('refuses text that appears more than once', () => {
    const r = applyHunk('— disse ele.\n\nMais.\n\n— disse ele.', '— disse ele.', '— murmurou ele.')
    expect(r.ok).toBe(false)
  })

  it('fails when the text is missing', () => {
    expect(applyHunk('abc', 'xyz', '1').ok).toBe(false)
  })

  it('appends when find is empty', () => {
    expect(applyHunk('Fim.\n', '', 'Novo.')).toEqual({ ok: true, text: 'Fim.\n\nNovo.\n' })
  })
})

describe('wordDiff', () => {
  it('finds word changes', () => {
    const ops = wordDiff('O velho disse algo.', 'O velho murmurou algo.')
    expect(ops).toEqual([
      { type: 'equal', text: 'O velho ' },
      { type: 'delete', text: 'disse' },
      { type: 'insert', text: 'murmurou' },
      { type: 'equal', text: ' algo.' }
    ])
  })

  it('joins changes split by a tiny equal run', () => {
    const ops = wordDiff('the big red dog', 'a small blue dog')
    expect(ops.filter((o) => o.type === 'equal').map((o) => o.text)).toEqual([' dog'])
  })
})

describe('portrait proposals', () => {
  const reply = 'This is her.\n\n<portrait file="planning/Characters/Marta.md">_assets/chat/marta.webp</portrait>\n\nDone.'

  it('parses the entry and the image', () => {
    const s = parseProposals(reply)
    expect(s.map((x) => x.kind)).toEqual(['text', 'portrait', 'text'])
    const p = s[1]
    expect(p.kind === 'portrait' && [p.file, p.image, p.complete, p.index]).toEqual(['planning/Characters/Marta.md', '_assets/chat/marta.webp', true, 0])
  })

  it('hides a portrait tag that is still being typed', () => {
    expect(parseProposals('This is her. <portr')).toEqual([{ kind: 'text', text: 'This is her. ' }])
  })

  it('says what the author did with it in the history', () => {
    expect(proposalSummary(reply, { '0:0': 'accepted' })).toContain('[Proposed the image _assets/chat/marta.webp as the portrait of planning/Characters/Marta.md: accepted by the author]')
  })
})

describe('the plain text of a passage, block by block', () => {
  // A note in the editor: each list item is a paragraph of its own, with no "- " in front.
  const note = 'Born in Saint Isle.\n\nWears a hat of leather.\n\nCarries a lamp.'

  it('finds a list passage in the text of the editor', () => {
    const needle = markdownToPlainBlocks('- Wears a hat of leather.\n- Carries a lamp.')
    expect(needle).toBe('Wears a hat of leather.\n\nCarries a lamp.')
    expect(findText(note, needle)?.count).toBe(1)
  })

  it('removes the marks of numbered and nested items', () => {
    expect(markdownToPlainBlocks('1. One\n2) Two\n   - **Three**')).toBe('One\n\nTwo\n\nThree')
  })

  it('drops a scene break and keeps a plain paragraph', () => {
    expect(markdownToPlainBlocks('First line\n\n* * *\n\n- item\nSecond')).toBe('First line\n\nitem\n\nSecond')
    expect(markdownToPlainBlocks('A - B is not an item.')).toBe('A - B is not an item.')
  })
})
