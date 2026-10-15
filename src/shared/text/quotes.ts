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

/** A quote opens after these characters (or at the start). */
const OPENS_AFTER = /[\s([{—―–-]/
/** Markdown that must keep straight quotes: attribute blocks and HTML tags. */
const PROTECTED = /(\{[^{}\n]*\}|<[^<>\n]+>)/

/**
 * Turn straight quotes into the quotes of the book, and "..." into "…".
 * Attribute blocks such as {font="Literata"} and HTML tags keep their quotes.
 */
export function typesetText(markdown: string, style: QuoteStyle, opts: { quotes: boolean; ellipsis: boolean }): string {
  if (!opts.quotes && !opts.ellipsis) return markdown
  const parts = markdown.split(PROTECTED)
  let prev = ''
  return parts
    .map((part, i) => {
      if (i % 2 === 1) {
        // An HTML tag is invisible in the text: the quote after <span> opens like one at its place.
        if (!part.startsWith('<')) prev = part.slice(-1)
        return part
      }
      let out = ''
      for (let k = 0; k < part.length; k++) {
        const ch = part[k]
        const next = part[k + 1] ?? ''
        const opens = prev === '' || OPENS_AFTER.test(prev)
        let put = ch
        if (opts.quotes && ch === '"') put = opens ? style.doubleOpen : style.doubleClose
        else if (opts.quotes && ch === "'") {
          // An apostrophe between letters (d'água, it's) is always ’.
          if (/\p{L}/u.test(prev) && /\p{L}/u.test(next)) put = '’'
          else put = opens ? style.singleOpen : style.singleClose
        } else if (opts.ellipsis && ch === '.' && part.slice(k, k + 3) === '...') {
          put = '…'
          k += 2
        }
        out += put
        prev = put.slice(-1)
      }
      return out
    })
    .join('')
}
