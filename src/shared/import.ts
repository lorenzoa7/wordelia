// Rules for imported text: chapter headings, scene breaks and blank lines. Pure code.
// The main process uses them for Markdown and plain text; the renderer for DOCX (HTML).

/** Words for numbers in chapter headings: "Capítulo Um", "Chapter Twenty-One", "Capítulo Primeiro". */
const NUMBER_WORDS = [
  // English
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty',
  'ninety', 'hundred', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  // Portuguese
  'um', 'uma', 'dois', 'duas', 'três', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze',
  'catorze', 'quatorze', 'quinze', 'dezesseis', 'dezasseis', 'dezessete', 'dezassete', 'dezoito', 'dezenove', 'dezanove', 'vinte',
  'trinta', 'quarenta', 'cinquenta', 'cinqüenta', 'sessenta', 'setenta', 'oitenta', 'noventa', 'cem', 'cento', 'primeiro',
  'segundo', 'terceiro', 'quarto', 'quinto', 'sexto', 'sétimo', 'setimo', 'oitavo', 'nono', 'décimo', 'decimo', 'único', 'unico',
  // Spanish
  'uno', 'dos', 'cuatro', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis',
  'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintiuna', 'veintidós', 'veintidos', 'veintitrés',
  'veintitres', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta',
  'cuarenta', 'cincuenta', 'sesenta', 'ochenta', 'cien', 'ciento', 'primero', 'tercero', 'cuarto', 'séptimo', 'septimo', 'octavo',
  'noveno', 'único'
]

const WORD = `(?:${[...new Set(NUMBER_WORDS)].sort((a, b) => b.length - a.length).join('|')})`
/** A number: digits, a roman numeral or number words ("Vinte e Um", "Twenty-One"). */
const NUM = `(?:\\d+|[ivxlcdm]+|${WORD}(?:(?:\\s+(?:e|y|and)\\s+|[\\s-])${WORD})*)`
const LABEL = '(?:cap[ií]tulo|chapter|chapitre|kapitel|capitolo|cap\\.|parte|part|livro|book|libro)'
const END = '(?=$|[\\s.:—–-])'
const LABEL_NUMBER = new RegExp(`^${LABEL}\\s+${NUM}${END}`, 'i')
/** Headings without a number */
const NAMED = /^(pr[óo]logo|prologue|ep[íi]logo|epilogue|interl[úu]dio|interludio|interlude)(?=$|[\s.:—–-])/i

/**
 * True when one line of text is a chapter heading: "Capítulo Um", "CHAPTER 12", "Capítulo 3: O Farol",
 * "Chapter Two — The Storm", "Prólogo". A line of prose that starts with the same word is not one:
 * after the number, only a separator (. : — –) or a title in capitals can follow.
 */
export function isChapterHeading(line: string): boolean {
  const s = line.trim()
  if (!s || s.length > 80) return false
  const m = LABEL_NUMBER.exec(s) ?? NAMED.exec(s)
  if (!m) return false
  const rest = s.slice(m[0].length)
  if (/[,;]$/.test(rest)) return false
  return /^\s*$/.test(rest) || /^\s*[.:—–-]/.test(rest) || /^\s+["“«'‘(\d\p{Lu}]/u.test(rest)
}

/** "Capítulo Um: A Tempestade" -> "A Tempestade". Empty when the heading has only the label and the number. */
export function stripChapterLabel(text: string): string {
  return text.replace(new RegExp(`^${LABEL}\\s+${NUM}${END}[\\s.:—–-]*`, 'i'), '').trim()
}

/** Symbols that make a scene break when a paragraph has only them: "* * *", "***", "#", "⁂", "~". */
const MARKS = '*∗✱✲✳✻⁂#~•·◆◇♦❖✦❦❧§'
const MARK_RE = new RegExp(`^[${MARKS}]{1,7}$`)
/** Lines of three or more: "---", "———", "___", "===" */
const LINE_RE = /^[-—–_=+]{3,9}$/

/** True when a paragraph is a scene break marker, for example "* * *", "***", "#", "⁂" or a centered "*". */
export function isSceneBreakMarker(text: string): boolean {
  const s = text.replace(/[\s  -​ ]+/g, '')
  if (!s) return false
  return MARK_RE.test(s) || LINE_RE.test(s)
}

/** What blank lines between paragraphs mean in an imported document. */
export type BlankLines = 'breaks' | 'spacing'

/** The blocks of an imported chapter, as the scene break rules see them. */
export type BlockKind = 'text' | 'empty' | 'marker' | 'other'

export interface BlankLineStats {
  /** Two text paragraphs one after the other (blank lines between them do not count) */
  pairs: number
  /** Pairs with one or more blank lines between them */
  gaps: number
  /** Paragraphs that are scene break markers */
  markers: number
}

export function blankLineStats(chapters: BlockKind[][]): BlankLineStats {
  const s: BlankLineStats = { pairs: 0, gaps: 0, markers: 0 }
  for (const kinds of chapters) {
    let prev: BlockKind | null = null
    let blank = false
    for (const k of kinds) {
      if (k === 'empty') {
        blank = true
        continue
      }
      if (k === 'marker') s.markers++
      if (k === 'text' && prev === 'text') {
        s.pairs++
        if (blank) s.gaps++
      }
      prev = k
      blank = false
    }
  }
  return s
}

/**
 * Decide from the document what its blank lines are. A document with scene break markers uses them for
 * its breaks, so its blank lines are spacing. Blank lines between many paragraphs (more than one pair in
 * four) are spacing too, as in a Google Docs file with an empty line after each paragraph. Rare blank
 * lines are scene breaks.
 */
export function chooseBlankLines(s: BlankLineStats): BlankLines {
  if (!s.gaps || s.markers > 0) return 'spacing'
  return s.gaps / Math.max(1, s.pairs) > 0.25 ? 'spacing' : 'breaks'
}

/**
 * The blocks to keep, in order, with the scene breaks between them. A marker is a scene break; blank
 * lines are one too when `mode` is 'breaks'. Breaks next to each other become one, and a chapter never
 * starts or ends with a break.
 */
export function sceneBreakPlan(kinds: BlockKind[], mode: BlankLines): Array<number | 'break'> {
  const out: Array<number | 'break'> = []
  let pending = false
  kinds.forEach((k, i) => {
    if (k === 'empty' || k === 'marker') {
      if (out.length && (k === 'marker' || mode === 'breaks')) pending = true
      return
    }
    if (pending) out.push('break')
    pending = false
    out.push(i)
  })
  return out
}

/** The number of scene breaks in Wordelia Markdown. */
export function countSceneBreaks(markdown: string): number {
  return markdown.split('\n').filter((l) => l.trim() === '* * *').length
}
