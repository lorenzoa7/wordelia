// Book fonts. All are Google Fonts, so Google Docs knows them after a DOCX import.
// System fonts are listed too, for manuscripts.

export interface BookFont {
  family: string
  label: string
  kind: 'serif' | 'sans' | 'mono'
  bundled: boolean
  note?: string
}

export const BOOK_FONTS: BookFont[] = [
  { family: 'Literata', label: 'Literata', kind: 'serif', bundled: true, note: 'Made for long reading on screens' },
  { family: 'EB Garamond', label: 'EB Garamond', kind: 'serif', bundled: true, note: 'Classic book face' },
  { family: 'Crimson Pro', label: 'Crimson Pro', kind: 'serif', bundled: true },
  { family: 'Libre Baskerville', label: 'Libre Baskerville', kind: 'serif', bundled: true },
  { family: 'Baskervville', label: 'Baskervville', kind: 'serif', bundled: true },
  { family: 'Lora', label: 'Lora', kind: 'serif', bundled: true },
  { family: 'Merriweather', label: 'Merriweather', kind: 'serif', bundled: true },
  { family: 'Source Serif 4', label: 'Source Serif 4', kind: 'serif', bundled: true },
  { family: 'Cormorant Garamond', label: 'Cormorant Garamond', kind: 'serif', bundled: true },
  { family: 'Courier Prime', label: 'Courier Prime', kind: 'mono', bundled: true, note: 'Typewriter' },
  { family: 'Times New Roman', label: 'Times New Roman', kind: 'serif', bundled: false, note: 'Standard manuscript' },
  { family: 'Georgia', label: 'Georgia', kind: 'serif', bundled: false },
  { family: 'Arial', label: 'Arial', kind: 'sans', bundled: false }
]

export const FONT_SIZES = [9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36]

export function fontStack(family: string): string {
  const f = BOOK_FONTS.find((x) => x.family === family)
  const fallback = f?.kind === 'mono' ? 'ui-monospace, monospace' : f?.kind === 'sans' ? 'system-ui, sans-serif' : 'Georgia, serif'
  return `'${family}', ${fallback}`
}
