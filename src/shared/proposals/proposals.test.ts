import { describe, expect, it } from 'vitest'
import { applyHunk, findText } from './apply'
import { parseProposals, proposalSummary } from './parse'
import { wordDiff } from '../text/diff'

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
    expect(findText('2 \\* 3 = 6', '2 * 3 = 6')).toEqual({ start: 0, end: 10, mode: 'normalized' })
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
