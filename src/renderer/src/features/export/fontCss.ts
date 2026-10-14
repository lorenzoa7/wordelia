// Embed the bundled fonts of one family as data URLs, for the print window.

const cache = new Map<string, string>()

async function toDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

/** @font-face rules for a family, with latin and latin-ext files inlined. Empty for system fonts. */
export async function embeddedFontCss(family: string): Promise<string> {
  if (cache.has(family)) return cache.get(family)!
  const rules: CSSFontFaceRule[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList
    try {
      list = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSFontFaceRule) {
        const fam = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim()
        if (fam === family) rules.push(rule)
      }
    }
  }
  const out: string[] = []
  for (const rule of rules) {
    const src = rule.style.getPropertyValue('src')
    // Only latin subsets: other subsets make the PDF big and books rarely need them.
    const range = rule.style.getPropertyValue('unicode-range')
    if (range && !/U\+0000-00FF|U\+0100-02/i.test(range)) continue
    const m = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(src)
    if (!m) continue
    try {
      const data = await toDataUrl(new URL(m[1], document.baseURI).toString())
      out.push(
        `@font-face { font-family: '${family}'; font-style: ${rule.style.getPropertyValue('font-style') || 'normal'}; font-weight: ${rule.style.getPropertyValue('font-weight') || '400'}; src: url(${data}) format('woff2');${range ? ` unicode-range: ${range};` : ''} }`
      )
    } catch {
      /* skip a font file that does not load */
    }
  }
  const css = out.join('\n')
  cache.set(family, css)
  return css
}
