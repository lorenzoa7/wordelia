// Clean HTML pasted from Google Docs or Word: keep bold, italic, underline and alignment;
// drop fonts, sizes, colors and spacing, which belong to the book typography.

const KEEP = new Set(['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align'])

export function cleanPastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('[style]'))) {
    const kept: string[] = []
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style.item(i)
      if (KEEP.has(prop)) kept.push(`${prop}: ${el.style.getPropertyValue(prop)}`)
    }
    if (kept.length) el.setAttribute('style', kept.join('; '))
    else el.removeAttribute('style')
  }
  for (const el of Array.from(doc.body.querySelectorAll('font'))) {
    el.replaceWith(...Array.from(el.childNodes))
  }
  return doc.body.innerHTML
}
