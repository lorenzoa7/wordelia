import { describe, expect, it } from 'vitest'
import { buildActionSystem, buildActionUser, extractRewrite, replyWithoutRewrite, tidyRewrite, voiceOfBook, voiceSample } from './action'

describe('a reply without rewrite tags', () => {
  const comment = 'This passage already reads well. I would keep it as it is.'

  it('has no rewrite, so it never becomes text of the book', () => {
    expect(extractRewrite(comment)).toEqual({ text: '', complete: false })
  })

  it('gives the words of the AI to show to the author', () => {
    expect(replyWithoutRewrite(comment)).toBe(comment)
    expect(replyWithoutRewrite('<rewrite>\nNew.\n</rewrite>')).toBe('')
  })

  it('leaves out the narration line, which is for the AI only', () => {
    expect(replyWithoutRewrite(`<narration>past tense, third person</narration>\n${comment}`)).toBe(comment)
    expect(extractRewrite('<narration>past tense, third person</narration>\n<rewrite>\nNew.\n</rewrite>')).toEqual({ text: 'New.', complete: true })
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

  it('the tense and the point of view come from the writing rules, also when the draft and its context use another tense', () => {
    // A draft in the present tense ("Elias acende a lâmpada"), in a chapter of the same draft, in a book whose rules say
    // "the narration is in the past tense": the context must not win over the rules.
    expect(sys).toMatch(/tense and the point of view that the writing rules/)
    expect(sys).toMatch(/also when the text around it is in that other tense/)
    expect(sys).not.toMatch(/consistent with it \(names, facts, tense, voice\)/)
  })

  it('asks the AI to name the tense and the point of view before the rewrite', () => {
    expect(sys).toMatch(/Before the <rewrite> tags, write one line in <narration><\/narration> tags/)
  })

  it('shows how the book narrates: the end of an earlier chapter, for its tense and voice', () => {
    const withVoice = buildActionSystem({
      book: { manifest, writingRules: '', entries: [] },
      action: { id: 'bruto', name: 'Bruto', icon: 'Sparkle', builtIn: false, route: null, contextChars: 100, instructions: 'Lapide.' },
      before: 'Elias abre a porta.',
      selection: 'Marta olha o mar.',
      after: '',
      chapterTitle: 'O Visitante',
      voice: 'Elias acendeu a lâmpada do farol às seis em ponto.'
    })
    expect(withVoice).toContain('<book_voice>\nElias acendeu a lâmpada do farol às seis em ponto.\n</book_voice>')
    expect(withVoice).toMatch(/Do not copy it/)
    expect(sys).not.toContain('<book_voice>')
  })

  it('the last words of the request, after the context, ask for the tense of the writing rules', () => {
    const user = buildActionUser({
      book: { manifest, writingRules: '', entries: [] },
      action: { id: 'bruto', name: 'Bruto', icon: 'Sparkle', builtIn: false, route: null, contextChars: 100, instructions: 'Lapide.' },
      before: 'Elias abre a porta.',
      selection: 'Marta olha o mar.',
      after: 'Elias sai.',
      chapterTitle: 'O Visitante'
    })
    const tail = user.slice(user.indexOf('</after>'))
    expect(tail).toMatch(/tense and the point of view that the writing rules/)
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

describe('voiceSample', () => {
  it('is the last paragraphs of a chapter, whole, up to the size', () => {
    const body = ['Primeiro parágrafo, longo demais para caber aqui no fim.', 'Elias desceu a escada.', '* * *', 'Marta fechou a porta.'].join('\n\n')
    expect(voiceSample(body, 50)).toBe('Elias desceu a escada.\n\nMarta fechou a porta.')
  })

  it('is empty for an empty chapter', () => {
    expect(voiceSample('', 500)).toBe('')
  })
})

describe('voiceOfBook', () => {
  const chapters = [
    { id: 'a', body: 'Elias acendeu a lâmpada.' },
    { id: 'b', body: '' },
    { id: 'c', body: 'Marta abre a janela.' },
    { id: 'd', body: 'Elias desceu a escada.' }
  ]

  it('comes from the nearest chapter before this one that has text', () => {
    expect(voiceOfBook(chapters, 'c')).toBe('Elias acendeu a lâmpada.')
  })

  it('comes from the nearest chapter after this one when no chapter before it has text', () => {
    expect(voiceOfBook(chapters, 'a')).toBe('Marta abre a janela.')
  })

  it('is empty for a book of one chapter', () => {
    expect(voiceOfBook([{ id: 'a', body: 'Elias acendeu a lâmpada.' }], 'a')).toBe('')
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
