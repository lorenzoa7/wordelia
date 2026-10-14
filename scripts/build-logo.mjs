// Builds the Wordelia wordmark and app icon from Courier Prime glyph outlines.
// Output: resources/brand/*.svg, build/icon.png, build/icon.ico
import opentype from 'opentype.js'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const INK = '#26221D'
const PAPER = '#FBF8F2'
const RIBBON = '#A83A2B'

const fontBold = opentype.parse(
  (await readFile('node_modules/@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff')).buffer
)
const fontRegular = opentype.parse(
  (await readFile('node_modules/@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff')).buffer
)
let font = fontBold

function textPath(text, size) {
  const path = font.getPath(text, 0, 0, size)
  const box = path.getBoundingBox()
  return { d: path.toPathData(2), box, advance: font.getAdvanceWidth(text, size) }
}

function caret(x, size) {
  // Caret: a slim bar from below the baseline to cap height.
  const w = Math.round(size * 0.075)
  const top = -size * 0.62
  const bottom = size * 0.1
  return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w}" height="${(bottom - top).toFixed(1)}" rx="${(w / 3).toFixed(1)}" fill="${RIBBON}"/>`
}

function wordmark(color) {
  font = fontRegular
  const size = 100
  const t = textPath('wordelia', size)
  const caretX = t.advance + size * 0.04
  const width = caretX + size * 0.075 + 4
  const top = -size * 0.72
  const height = size * 0.9
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 ${top.toFixed(1)} ${(width + 8).toFixed(1)} ${height.toFixed(1)}" fill="none">
  <path d="${t.d}" fill="${color}"/>
  ${caret(caretX, size)}
</svg>
`
}

function icon() {
  font = fontBold
  const S = 1024
  const size = 600
  const w = textPath('w', size)
  const glyphW = w.advance
  const caretW = size * 0.075
  const gap = size * 0.03
  const total = glyphW + gap + caretW
  const x0 = (S - total) / 2
  const baseline = S / 2 + size * 0.26
  const caretX = x0 + glyphW + gap
  const wPath = font.getPath('w', x0, baseline, size).toPathData(2)
  const cTop = baseline - size * 0.6
  const cBottom = baseline + size * 0.1
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FDFBF6"/>
      <stop offset="1" stop-color="#F1EADC"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="944" height="944" rx="212" fill="url(#paper)"/>
  <rect x="40.5" y="40.5" width="943" height="943" rx="211.5" fill="none" stroke="#D9CFBD" stroke-width="3"/>
  <path d="${wPath}" fill="${INK}"/>
  <rect x="${caretX.toFixed(1)}" y="${cTop.toFixed(1)}" width="${caretW.toFixed(1)}" height="${(cBottom - cTop).toFixed(1)}" rx="${(caretW / 3).toFixed(1)}" fill="${RIBBON}"/>
</svg>
`
}

await mkdir('resources/brand', { recursive: true })
await mkdir('build', { recursive: true })
await writeFile('resources/brand/wordmark.svg', wordmark(INK))
await writeFile('resources/brand/wordmark-light.svg', wordmark('#E9E2D4'))
const iconSvg = icon()
await writeFile('resources/brand/icon.svg', iconSvg)

const render = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng()
await writeFile('build/icon.png', render(iconSvg, 1024))
await writeFile('resources/icon.png', render(iconSvg, 512))
const sizes = [16, 24, 32, 48, 64, 128, 256]
await writeFile('build/icon.ico', await pngToIco(sizes.map((s) => render(iconSvg, s))))
await writeFile('test-results/wordmark-preview.png', render(wordmark(INK).replace('fill="none"', `style="background:${PAPER}"`), 1200))
console.log('brand assets written')
