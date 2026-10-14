// Find the font files of one family in the app's style sheets, for the print window.

import type { FontFaceSpec } from '@shared/ipc'

/** Font faces of a family (latin subsets only: other subsets make the PDF big). Empty for system fonts. */
export function fontFaces(family: string): FontFaceSpec[] {
  const out: FontFaceSpec[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList
    try {
      list = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(list)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const fam = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim()
      if (fam !== family) continue
      const range = rule.style.getPropertyValue('unicode-range')
      if (range && !/U\+0+-0*FF\b|U\+0100-02/i.test(range)) continue
      const m = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(rule.style.getPropertyValue('src'))
      if (!m) continue
      out.push({
        family,
        style: rule.style.getPropertyValue('font-style') || 'normal',
        weight: rule.style.getPropertyValue('font-weight') || '400',
        unicodeRange: range,
        url: new URL(m[1], sheet.href ?? document.baseURI).toString()
      })
    }
  }
  return out
}
