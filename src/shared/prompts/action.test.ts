import { describe, expect, it } from 'vitest'
import { buildActionSystem, buildActionUser, extractRewrite, replyWithoutRewrite, tidyRewrite } from './action'

describe('a reply without rewrite tags', () => {
  const comment = 'This passage already reads well. I would keep it as it is.'

  it('has no rewrite, so it never becomes text of the book', () => {
    expect(extractRewrite(comment)).toEqual({ text: '', complete: false })
  })

  it('gives the words of the AI to show to the author', () => {
    expect(replyWithoutRewrite(comment)).toBe(comment)
    expect(replyWithoutRewrite('<rewrite>\nNew.\n</rewrite>')).toBe('')
  })
})

describe('the action prompt', () => {
  const manifest = { title: 'O Farol', author: 'A', language: 'pt-BR', typography: { dialogueDash: '—', dialogueStyle: 'dash' } } as unknown as Parameters<typeof buildActionSystem>[0]['book']['manifest']
  const sys = buildActionSystem({
    book: { manifest, writingRules: '# Writing rules\n\n## Voice\n- (Example: third person, past tense.)', entries: [] },
    action: { id: 'polish', name: 'Polish', icon: 'Sparkle', builtIn: true, route: null, contextChars: 100, instructions: 'Polish.' },
    before: '',
    selection: 'Um.\n\n* * *\n\nDois.',
    after: '',
    chapterTitle: 'Um'
  })

  it('asks to keep the paragraph and scene breaks, and to write no comments', () => {
    expect(sys).toContain('keep each paragraph break')
    expect(sys).toContain('Keep each scene break')
    expect(sys).toContain('no comments')
  })

  it('does not send the example lines of the rules template', () => {
    expect(sys).not.toContain('third person, past tense')
    expect(sys).toContain('has not written rules yet')
  })

  it('a note goes to the AI before the instructions', () => {
    const input = {
      book: { manifest, writingRules: '', entries: [] },
      action: { id: 'polish', name: 'Polish', icon: 'Sparkle', builtIn: true, route: null, contextChars: 100, instructions: 'Polish.' },
      before: '',
      selection: 'Elias acendeu a lâmpada do farol.',
      after: '',
      chapterTitle: 'Um'
    }
    const user = buildActionUser({ ...input, note: 'Three sentences in a row open the same way.' })
    const at = user.indexOf('<editor_comment>\nThree sentences in a row open the same way.\n</editor_comment>')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(at).toBeLessThan(user.indexOf('<instructions>'))
    expect(user).toContain('Fix what this comment says; keep the rest')
    // Without a note, the prompt has no comment.
    expect(buildActionUser(input)).not.toContain('editor_comment')
  })
})

describe('tidyRewrite', () => {
  it('keeps two lines of two speakers as two paragraphs', () => {
    expect(tidyRewrite('“Did you feel that?” Marta asked.\n“I did,” he murmured.', 'x\n\ny')).toBe('“Did you feel that?” Marta asked.\n\n“I did,” he murmured.')
  })

  it('keeps blank lines, hard line breaks and attribute lines', () => {
    expect(tidyRewrite('One.\n\nTwo.', 'x')).toBe('One.\n\nTwo.')
    expect(tidyRewrite('A line\\\nthe next line', 'x')).toBe('A line\\\nthe next line')
    expect(tidyRewrite('Central.\n{align=center}', 'x')).toBe('Central.\n{align=center}')
    expect(tidyRewrite('One.\n\n\n\nTwo.', 'x')).toBe('One.\n\nTwo.')
  })

  it('puts a scene break that the AI wrote inside a line back on its own line', () => {
    const selection = 'Above their heads.\n\n* * *\n\nAt eleven that night.'
    expect(tidyRewrite('Above their heads. * * * At eleven that night.', selection)).toBe('Above their heads.\n\n* * *\n\nAt eleven that night.')
    expect(tidyRewrite('Above their heads.\n* * *\nAt eleven.', selection)).toBe('Above their heads.\n\n* * *\n\nAt eleven.')
  })

  it('leaves "* * *" in a line alone when the selection has no scene break', () => {
    expect(tidyRewrite('He wrote * * * on the wall.', 'He wrote stars on the wall.')).toBe('He wrote * * * on the wall.')
  })
})
