// Typographic quotes and ellipsis for text that the AI writes.
// The AI often writes straight quotes ("...") even when the book uses curly ones.

export interface QuoteStyle {
  doubleOpen: string
  doubleClose: string
  singleOpen: string
  singleClose: string
}

export function quotesFor(language: string): QuoteStyle {
  const l = language.toLowerCase()
  if (l.startsWith('de')) return { doubleOpen: '„', doubleClose: '“', singleOpen: '‚', singleClose: '‘' }
  if (l.startsWith('fr')) return { doubleOpen: '« ', doubleClose: ' »', singleOpen: '‹', singleClose: '›' }
  if (l === 'pt-pt' || l.startsWith('es') || l.startsWith('it')) return { doubleOpen: '«', doubleClose: '»', singleOpen: '“', singleClose: '”' }
  return { doubleOpen: '“', doubleClose: '”', singleOpen: '‘', singleClose: '’' }
}

/**
 * Does a quote open after this text (the characters before the quote)? A quote opens at the start,
 * after a space or an opening bracket, and after a dash that starts a line or follows a space
 * ("— “Yes”"). After a dash at the end of a word it closes: "really—”".
 */
export function quoteOpensAfter(before: string): boolean {
  const prev = before.slice(-1)
  if (prev === '' || /[\s([{]/.test(prev)) return true
  if (/[—―–-]/.test(prev)) {
    const prev2 = before.slice(-2, -1)
    return prev2 === '' || /\s/.test(prev2)
  }
  return false
}

/**
 * The quote for a straight single quote, from the text before it and the character after it (empty
 * while the author types). After a letter or a digit it is an apostrophe: it's, d'água, 1990's. An
 * apostrophe also starts a short form before a digit: '90s.
 */
export function singleQuoteFor(before: string, next: string, style: QuoteStyle): string {
  if (/[\p{L}\p{N}]/u.test(before.slice(-1))) return '’'
  if (quoteOpensAfter(before)) return /\p{N}/u.test(next) ? '’' : style.singleOpen
  return style.singleClose
}

/**
 * "rock 'n' roll": when the quote after "‘n" ends the word, the two quotes are apostrophes. Returns
 * the text before the quote with the first apostrophe, or null when this is not the case.
 */
export function apostropheN(before: string, next: string, style: QuoteStyle): string | null {
  const open = style.singleOpen
  if (!before.endsWith(`${open}n`) || /\p{L}/u.test(next)) return null
  const head = before.slice(0, -open.length - 1)
  return quoteOpensAfter(head) ? `${head}’n` : null
}

/** Markdown that must keep straight quotes: attribute blocks and HTML tags. */
const PROTECTED = /(\{[^{}\n]*\}|<[^<>\n]+>)/

export interface TypesetOptions {
  quotes: boolean
  ellipsis: boolean
  /** "--" becomes this dash (the dialogue dash of the book). No dash: "--" stays. */
  dash?: string
}

/**
 * Typeset one run of plain text. `before` is the text before the run in the same paragraph (its last
 * characters are enough): a quote at the start of the run opens or closes from it.
 */
export function typesetRun(text: string, before: string, style: QuoteStyle, opts: TypesetOptions): string {
  let out = ''
  for (let k = 0; k < text.length; k++) {
    const ch = text[k]
    const next = text[k + 1] ?? ''
    const prev = (before + out).slice(-3)
    let put = ch
    if (opts.quotes && ch === '"') put = quoteOpensAfter(prev) ? style.doubleOpen : style.doubleClose
    else if (opts.quotes && ch === "'") {
      const n = out.length >= 2 ? apostropheN(out.slice(-3), next, style) : null
      if (n !== null) {
        out = out.slice(0, -Math.min(3, out.length)) + n
        put = '’'
      } else put = singleQuoteFor(prev, next, style)
    } else if (opts.ellipsis && ch === '.' && text.slice(k, k + 3) === '...') {
      put = '…'
      k += 2
    } else if (opts.dash && ch === '-' && next === '-') {
      put = opts.dash
      k += 1
    }
    out += put
  }
  return out
}

/**
 * Turn straight quotes into the quotes of the book, and "..." into "…".
 * Attribute blocks such as {font="Literata"} and HTML tags keep their quotes.
 */
export function typesetText(markdown: string, style: QuoteStyle, opts: TypesetOptions): string {
  if (!opts.quotes && !opts.ellipsis && !opts.dash) return markdown
  const parts = markdown.split(PROTECTED)
  /** The last characters of the text so far, without the HTML tags */
  let tail = ''
  return parts
    .map((part, i) => {
      if (i % 2 === 1) {
        // An HTML tag is invisible in the text: the quote after <span> opens like one at its place.
        if (!part.startsWith('<')) tail = part.slice(-2)
        return part
      }
      const out = typesetRun(part, tail, style, opts)
      tail = (tail + out).slice(-3)
      return out
    })
    .join('')
}
