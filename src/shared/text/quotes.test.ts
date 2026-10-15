import { describe, expect, it } from 'vitest'
import { quotesFor, typesetText } from './quotes'

const pt = quotesFor('pt-BR')
const on = { quotes: true, ellipsis: true }

describe('typesetText', () => {
  it('turns straight double quotes into curly quotes', () => {
    expect(typesetText('com o insulto: "Aproveita pra lavar esse pé preto, seu imundo". Dali', pt, on)).toBe(
      'com o insulto: “Aproveita pra lavar esse pé preto, seu imundo”. Dali'
    )
  })
  it('opens a quote after a dash and at the start of a line', () => {
    expect(typesetText('"Sim."\n\n— "Não", disse.', pt, on)).toBe('“Sim.”\n\n— “Não”, disse.')
  })
  it('keeps apostrophes between letters', () => {
    expect(typesetText("copo d'água e 'talvez'", pt, on)).toBe('copo d’água e ‘talvez’')
  })
  it('uses the quotes of the book language', () => {
    expect(typesetText('"Oui"', quotesFor('fr'), on)).toBe('« Oui »')
  })
  it('does not touch attribute blocks and HTML tags', () => {
    expect(typesetText('[ver]{font="Literata"} e "isto"', pt, on)).toBe('[ver]{font="Literata"} e “isto”')
    expect(typesetText('<span class="x">"a"</span>', pt, on)).toBe('<span class="x">“a”</span>')
  })
  it('turns three dots into an ellipsis', () => {
    expect(typesetText('E então...', pt, on)).toBe('E então…')
    expect(typesetText('E então...', pt, { quotes: true, ellipsis: false })).toBe('E então...')
  })
  it('changes nothing when both options are off', () => {
    expect(typesetText('"a"...', pt, { quotes: false, ellipsis: false })).toBe('"a"...')
  })
})
