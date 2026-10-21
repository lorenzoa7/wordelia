import { describe, expect, it } from 'vitest'
import { diffStats, hasChanges, styledDiff, wordDiff, type StyledText } from './diff'

/** A styled text from a Markdown-like string: *x* is italic. */
function styled(src: string): StyledText {
  let text = ''
  const marks: string[] = []
  let italic = false
  for (const ch of src) {
    if (ch === '*') {
      italic = !italic
      continue
    }
    text += ch
    marks.push(italic ? 'italic' : '')
  }
  return { text, marks }
}

describe('diffStats', () => {
  it('counts the words of a change', () => {
    expect(diffStats(wordDiff('The old man said nothing.', 'The old man murmured nothing at all.'))).toEqual({ added: 3, removed: 1 })
  })

  it('counts a change of punctuation only, not +0 −0', () => {
    expect(diffStats(wordDiff('He came, and sat.', 'He came — and sat.'))).toEqual({ added: 1, removed: 1 })
  })

  it('counts a joined paragraph and a removed scene break', () => {
    expect(diffStats(wordDiff('One.\n\nTwo.', 'One. Two.'))).toEqual({ added: 0, removed: 1 })
    expect(diffStats(wordDiff('One.\n\n* * *\n\nTwo.', 'One.\n\nTwo.')).removed).toBe(1)
  })
})

describe('styledDiff', () => {
  it('is the word diff when the formatting is the same', () => {
    const ops = styledDiff(styled('The *Swallow* came back.'), styled('The *Swallow* came home.'))
    expect(ops.map((o) => [o.type, o.text])).toEqual([
      ['equal', 'The Swallow came '],
      ['delete', 'back'],
      ['insert', 'home'],
      ['equal', '.']
    ])
    expect(hasChanges(ops)).toBe(true)
  })

  it('shows a word that loses its italics as a change', () => {
    const ops = styledDiff(styled('saw that the *Swallow* was missing'), styled('saw that the Swallow was missing'))
    expect(ops.map((o) => [o.type, o.text])).toEqual([
      ['equal', 'saw that the '],
      ['delete', 'Swallow'],
      ['insert', 'Swallow'],
      ['equal', ' was missing']
    ])
    expect(diffStats(ops)).toEqual({ added: 1, removed: 1 })
  })

  it('gives the inserted text the formatting of the new text', () => {
    const ops = styledDiff(styled('A boat.'), styled('A *blue* boat.'))
    const ins = ops.find((o) => o.type === 'insert')!
    expect(ins.text).toBe('blue ')
    expect(ins.marks).toEqual(['italic', 'italic', 'italic', 'italic', ''])
  })

  it('joins two formatting changes that only a space separates', () => {
    const ops = styledDiff(styled('*the Swallow* left'), styled('the Swallow left'))
    expect(ops.map((o) => [o.type, o.text])).toEqual([
      ['delete', 'the Swallow'],
      ['insert', 'the Swallow'],
      ['equal', ' left']
    ])
  })

  it('finds no change in the same styled text', () => {
    expect(hasChanges(styledDiff(styled('One *two*.\n\nThree.'), styled('One *two*.\n\nThree.')))).toBe(false)
  })
})
