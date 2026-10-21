import { describe, expect, it } from 'vitest'
import { applyHunk, findText } from './apply'
import { hasProposals, isFileSegment, parseProposals, proposalSummary, replyProse } from './parse'
import { hasIncomplete, pendingKeys } from './state'
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

describe("the tags of an editor's read", () => {
  const note = (lens: string, rank: number, find: string, text: string, sources = ''): string =>
    `<note lens="${lens}" rank="${rank}">\n<find>${find}</find>\n<text>${text}</text>\n${sources}</note>`
  const source = (file: string, quote: string): string => `<source file="${file}">${quote}</source>\n`

  it('parses a complete note with two sources', () => {
    const reply = `The chapter works.\n\n${note('continuity', 1, 'Marta knew he came from the mainland.', 'Marta learns this only in chapter 5.', source('planning/Plot/Story line.md', 'Marta finds the ticket.') + source('manuscript/A Tempestade.md', 'The ticket was in the coat.'))}\n\nThat is all.`
    const s = parseProposals(reply)
    expect(s.map((x) => x.kind)).toEqual(['text', 'note', 'text'])
    expect(s[1]).toEqual({
      kind: 'note',
      lens: 'continuity',
      rank: 1,
      find: 'Marta knew he came from the mainland.',
      text: 'Marta learns this only in chapter 5.',
      sources: [
        { file: 'planning/Plot/Story line.md', quote: 'Marta finds the ticket.' },
        { file: 'manuscript/A Tempestade.md', quote: 'The ticket was in the coat.' }
      ],
      complete: true,
      index: 0
    })
  })

  it('parses the body tags of a note in any order, with no source', () => {
    const s = parseProposals('<note lens="style" rank="3"><text>Too many adverbs.</text><find>quietly, slowly, softly</find></note>')
    expect(s).toEqual([{ kind: 'note', lens: 'style', rank: 3, find: 'quietly, slowly, softly', text: 'Too many adverbs.', sources: [], complete: true, index: 0 }])
  })

  it('a note that is still being typed is hidden from the text and is not complete', () => {
    const cut = `Here is my read.\n\n<note lens="reader" rank="2">\n<find>Elias lit the lamp.</find>\n<text>The reader loses the thread he`
    const s = parseProposals(cut)
    expect(s.map((x) => x.kind)).toEqual(['text', 'note'])
    expect(s[0].kind === 'text' && s[0].text).not.toContain('<note')
    expect(s[1]).toMatchObject({ kind: 'note', lens: 'reader', rank: 2, find: 'Elias lit the lamp.', text: 'The reader loses the thread he', complete: false })
    expect(replyProse(cut)).toBe('Here is my read.')
    // A tag that is still being typed is hidden too.
    for (const partial of ['<n', '<note', '<note lens="reader"', '<note lens="reader" rank="2"']) {
      expect(parseProposals(`Letter. ${partial}`)).toEqual([{ kind: 'text', text: 'Letter. ' }])
    }
  })

  it('does not show the end of a closing tag that is still being typed', () => {
    const s = parseProposals('<note lens="style" rank="1"><find>a b</find><text>Too long.</te')
    expect(s[0]).toMatchObject({ kind: 'note', find: 'a b', text: 'Too long.', complete: false })
  })

  it('no part of a reply that streams shows a piece of a tag in the text', () => {
    const full = 'Letter.\n<note lens="style" rank="1"><find>a b</find><text>Cut.</text><source file="x.md">q</source></note>\n<read chapter="a.md" lens="all"/>\n<resolved ids="c1 c2"/>\nEnd.'
    for (let n = 0; n <= full.length; n++) {
      const prose = parseProposals(full.slice(0, n))
        .filter((x) => x.kind === 'text')
        .map((x) => x.kind === 'text' && x.text)
        .join('')
      expect(prose, full.slice(0, n)).not.toMatch(/<(?:\/?[a-z]*)?$|<(?:note|read|resolved)|<\/(?:note|source)/)
    }
  })

  it('parses <read chapter="manuscript/A Tempestade.md" lens="structure"/> and <resolved ids="c3 c7"/>', () => {
    const s = parseProposals('Shall I read it?\n<read chapter="manuscript/A Tempestade.md" lens="structure"/>\n<resolved ids="c3 c7"/>')
    expect(s.map((x) => x.kind)).toEqual(['text', 'read', 'text', 'resolved'])
    expect(s[1]).toEqual({ kind: 'read', chapter: 'manuscript/A Tempestade.md', lens: 'structure', complete: true, index: 0 })
    expect(s[3]).toEqual({ kind: 'resolved', ids: ['c3', 'c7'], complete: true, index: 1 })
    expect(parseProposals('<read chapter="manuscript/O Visitante.md" lens="all" />')[0]).toMatchObject({ kind: 'read', lens: 'all' })
  })

  it('hides a read or resolved tag that is still being typed', () => {
    for (const partial of ['<r', '<re', '<read', '<read chapter="manuscript/A Tempestade.md" lens="stru', '<read chapter="a.md" lens="style"/', '<resolved ids="c3', '<resolved']) {
      expect(parseProposals(`Letter. ${partial}`)).toEqual([{ kind: 'text', text: 'Letter. ' }])
    }
    // Words that only start like a tag stay.
    expect(parseProposals('Letter. <b')).toEqual([{ kind: 'text', text: 'Letter. <b' }])
  })

  it('a note with an unknown lens is dropped', () => {
    const reply = `Letter.\n${note('mystery', 1, 'one', 'two')}\nEnd.\n<edit file="manuscript/A Tempestade.md"><find>a</find><replace>b</replace></edit>`
    const s = parseProposals(reply)
    expect(s.map((x) => x.kind)).toEqual(['text', 'edit'])
    expect(s[0].kind === 'text' && s[0].text).toBe('Letter.\n\nEnd.\n')
    // The dropped note has no index: the edit is the first proposal.
    expect(s[1]).toMatchObject({ kind: 'edit', index: 0 })
    // Also while it streams, and when the lens is missing.
    expect(parseProposals('Letter. <note lens="mystery" rank="1"><find>one</find><te')).toEqual([{ kind: 'text', text: 'Letter. ' }])
    expect(parseProposals('Letter. <note rank="1"><find>one</find><text>two</text></note>')).toEqual([{ kind: 'text', text: 'Letter. ' }])
  })

  it('drops a read with no chapter and a resolved with no ids; a read with an unknown lens offers all', () => {
    expect(parseProposals('<read lens="style"/><resolved ids=""/>')).toEqual([])
    expect(parseProposals('<read chapter="manuscript/A Tempestade.md" lens="mystery"/>')[0]).toMatchObject({ kind: 'read', lens: 'all' })
  })

  it('counts every segment in the index, so the proposals after a comment keep their order', () => {
    const reply = `${note('structure', 1, 'x', 'y')}\n<resolved ids="c1"/>\n<edit file="manuscript/A Tempestade.md"><find>a</find><replace>b</replace></edit>`
    const s = parseProposals(reply)
    expect(s.filter((x) => x.kind !== 'text').map((x) => [x.kind, 'index' in x && x.index])).toEqual([
      ['note', 0],
      ['resolved', 1],
      ['edit', 2]
    ])
  })

  it('tells file segments from comment segments', () => {
    const s = parseProposals(`${note('style', 1, 'x', 'y')}<edit file="a.md"><find>a</find><replace>b</replace></edit><read chapter="a.md" lens="all"/>`)
    expect(s.map((x) => isFileSegment(x))).toEqual([false, true, false])
  })

  it('hasProposals is true for files only', () => {
    expect(hasProposals(`Letter.\n${note('style', 1, 'x', 'y')}\n<read chapter="a.md" lens="all"/>\n<resolved ids="c1"/>`)).toBe(false)
    expect(hasProposals(`Letter.\n${note('style', 1, 'x', 'y')}\n<edit file="a.md"><find>a</find><replace>b</replace></edit>`)).toBe(true)
  })

  it('the prose of a reply has no tags of a read', () => {
    const reply = `The chapter works.\n\n${note('style', 1, 'x', 'y')}\n\n<resolved ids="c1"/>\n\nTalk soon.`
    expect(replyProse(reply)).toBe('The chapter works.\n\nTalk soon.')
  })

  it('proposalSummary keeps notes out of hunks', () => {
    const reply = `Letter.\n${note('continuity', 1, 'Marta knew he came from the mainland.', 'Marta learns this only in chapter 5.')}\n<read chapter="manuscript/A Tempestade.md" lens="structure"/>\n<resolved ids="c3 c7"/>\n<edit file="manuscript/A Tempestade.md"><find>a</find><replace>b</replace></edit>`
    const withStates = proposalSummary(reply, { '3:0': 'accepted' })
    expect(withStates).toContain('[Comment 1 (continuity) on: "Marta knew he came from the mainland."')
    expect(withStates).toContain("[Offered an editor's read of manuscript/A Tempestade.md]")
    expect(withStates).toContain('[Said that comments c3 c7 look fixed]')
    expect(withStates).toContain('[Proposed change to manuscript/A Tempestade.md, accepted by the author: "a" → "b"]')
    expect(proposalSummary(reply)).toContain('[Comment 1 (continuity) on: ')
    expect(proposalSummary(reply)).toContain('[Proposed 1 change(s) to manuscript/A Tempestade.md]')
  })

  it('proposalSummary shortens the passage of a note', () => {
    const long = 'word '.repeat(60).trim()
    const out = proposalSummary(note('style', 2, long, 'Cut it.'), {})
    expect(out).toMatch(/^\[Comment 2 \(style\) on: "word word .*…"\]$/)
  })

  it('pendingKeys ignores notes', () => {
    const reply = `${note('structure', 1, 'x', 'y')}\n<read chapter="a.md" lens="all"/>\n<resolved ids="c1"/>\n<edit file="a.md"><find>a</find><replace>b</replace></edit>`
    expect(pendingKeys(parseProposals(reply))).toEqual(['3:0'])
    expect(pendingKeys(parseProposals(note('structure', 1, 'x', 'y') + '<resolved ids="c1"/>'))).toEqual([])
  })

  it('an incomplete note does not make a reply incomplete', () => {
    expect(hasIncomplete(parseProposals('Letter. <note lens="style" rank="1"><find>x</find><text>y'))).toBe(false)
    expect(hasIncomplete(parseProposals('<read chapter="a.md" lens="all"/><resolved ids="c1"/>'))).toBe(false)
    expect(hasIncomplete(parseProposals('<edit file="a.md"><find>a</find><replace>b'))).toBe(true)
  })
})
