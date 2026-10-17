// Icons beside text: is the icon centered on the text? For each icon and text pair on the main
// screens, the scenario reads the pixels of the window (at its real pixel ratio) and compares:
//   - the vertical middle of the drawn icon;
//   - the optical middle of the text: the middle of the capital letters when the text has
//     capitals (caps, "Title" or "Sentence case"), else the middle of the x-height. A caret
//     after the text (a small chevron) centers on the x-height, like the chevrons of a font.
// A positive offset means that the icon sits low. The scenario fails when an icon is more than
// LIMIT CSS pixels from the optical middle.
// Usage: node scripts/shot.mjs icons [--en] [--dark]   (ICON_LIFT=-0.1em tries another lift)
import { resolve } from 'node:path'

/** On a 100 % screen, icons and text round to whole pixels: allow more. */
const limitFor = (scale) => (scale < 1.2 ? 1.4 : 0.75)

/** Runs in the page: where the icon, a capital letter and a small letter of each pair are.
 *  "selector|last" measures the last icon of the item (a caret after the text). */
function locate(query) {
  const [selector, which] = query.split('|')
  // Letters with a flat top and a flat bottom first (no overshoot, no ascender, no descender),
  // then round letters: their overshoot is the same at the top and at the bottom.
  const CAPS = 'HEFTILNMZKXVWUAPRBDOCGSÉÁÍÚÓ'
  const SMALL = 'xnmrzuvwaceosç'
  const out = []
  for (const host of document.querySelectorAll(selector)) {
    const icons = host.querySelectorAll('svg')
    const svg = which === 'last' ? icons[icons.length - 1] : icons[0]
    if (!svg || !host.getClientRects().length) continue
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (/\p{L}/u.test(n.textContent) && n.parentElement.getClientRects().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
    })
    const text = walker.nextNode()
    if (!text) continue
    const cs = getComputedStyle(text.parentElement)
    const upper = cs.textTransform === 'uppercase'
    const shown = upper ? text.textContent.toUpperCase() : text.textContent
    const letters = shown.replace(/[^\p{L}]/gu, '')
    const caps = letters !== letters.toLowerCase()
    const rectOf = (set) => {
      for (const ch of set) {
        const i = shown.indexOf(ch)
        if (i < 0) continue
        const r = document.createRange()
        r.setStart(text, i)
        r.setEnd(text, i + 1)
        const b = r.getBoundingClientRect()
        if (b.width) return { x: b.x, w: b.width, ch }
      }
      return null
    }
    const cap = caps ? rectOf(CAPS) : null
    const small = rectOf(SMALL)
    if (!cap && !small) continue
    const s = svg.getBoundingClientRect()
    out.push({ text: shown.trim().slice(0, 26), font: cs.fontSize, caps, svg: { x: s.x, y: s.y, w: s.width, h: s.height }, cap, small })
  }
  return out
}

/** Runs in the main process: the ink edges of the icon and of the letters, from a screen capture. */
async function ink({ BrowserWindow }, p) {
  const wc = BrowserWindow.getAllWindows()[0].webContents
  const y0 = Math.floor(p.svg.y - 6)
  const y1 = Math.ceil(p.svg.y + p.svg.h + 6)
  const parts = [p.svg, p.cap, p.small].filter(Boolean)
  const x0 = Math.floor(Math.min(...parts.map((r) => r.x)) - 2)
  const x1 = Math.ceil(Math.max(...parts.map((r) => r.x + r.w)) + 2)
  const img = await wc.capturePage({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })
  const { width, height } = img.getSize()
  const scale = width / (x1 - x0)
  const bmp = img.toBitmap()
  const at = (x, y) => (y * width + x) * 4
  // The background: the most common color of the capture
  const counts = new Map()
  for (let k = 0; k < bmp.length; k += 4) {
    const key = `${bmp[k]},${bmp[k + 1]},${bmp[k + 2]}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const bg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
  /** The top and bottom edges of the ink in some columns, in CSS pixels, with partial rows. */
  const edges = (cx, cw) => {
    const from = Math.max(0, Math.floor((cx - x0) * scale) + 1)
    const to = Math.min(width, Math.ceil((cx + cw - x0) * scale) - 1)
    const rows = []
    for (let y = 0; y < height; y++) {
      let m = 0
      for (let x = from; x < to; x++) {
        const k = at(x, y)
        m = Math.max(m, Math.abs(bmp[k] - bg[0]) + Math.abs(bmp[k + 1] - bg[1]) + Math.abs(bmp[k + 2] - bg[2]))
      }
      rows.push(m)
    }
    const full = Math.max(...rows)
    const cov = rows.map((m) => Math.min(1, m / full))
    const top = cov.findIndex((c) => c > 0.12)
    const bottom = cov.length - 1 - [...cov].reverse().findIndex((c) => c > 0.12)
    const topEdge = top + 1 - cov[top]
    const bottomEdge = bottom + cov[bottom]
    return { top: y0 + topEdge / scale, bottom: y0 + bottomEdge / scale }
  }
  return { scale, icon: edges(p.svg.x, p.svg.w), cap: p.cap ? edges(p.cap.x, p.cap.w) : null, small: p.small ? edges(p.small.x, p.small.w) : null }
}

export default async function ({ app, page, openBook }) {
  const shots = resolve('test-results/shots')
  const suffix = `${process.argv.includes('--en') ? '-en' : ''}${process.argv.includes('--dark') ? '-dark' : ''}`
  if (process.env.ICON_LIFT) await page.evaluate((v) => document.documentElement.style.setProperty('--icon-lift', v), process.env.ICON_LIFT)
  // An underline is ink under the letters: hide it while the scenario measures.
  await page.addStyleTag({ content: '.link-btn { text-decoration: none !important; }' })
  // No hover or focus state on the measured items
  const away = () => page.mouse.move(700, 890)
  const rows = []
  const measure = async (...selectors) => {
    for (const sel of selectors) {
      for (const p of await page.evaluate(locate, sel)) {
        const m = await app.evaluate(ink, p)
        const mid = (e) => (e.top + e.bottom) / 2
        const iconMid = mid(m.icon)
        const caret = sel.endsWith('|last')
        const optical = mid((caret ? m.small : m.cap) ?? m.cap ?? m.small)
        rows.push({ where: sel.replace('|last', ' (caret)'), text: p.text, font: p.font, caps: p.caps, offset: +(iconMid - optical).toFixed(2), icon: +(m.icon.bottom - m.icon.top).toFixed(1), scale: m.scale })
      }
    }
  }
  const crop = async (name, locator) => {
    const box = await locator.first().boundingBox()
    if (!box) return
    await page.screenshot({ path: resolve(shots, `icons${suffix}-${name}.png`), clip: { x: box.x - 6, y: box.y - 4, width: Math.min(box.width + 12, 420), height: box.height + 8 } })
  }

  await away()
  await page.waitForTimeout(500)
  await measure('.library-actions .btn')
  await openBook()
  await page.waitForTimeout(700)
  await away()
  await measure('.titlebar-book', '.titlebar-book|last', '.view-tab:not(.is-active)', '.sidebar-add', '.status-btn', '.save-state', '.update-badge', '.provider-badge')
  await crop('titlebar-book', page.locator('.titlebar-book'))
  await crop('view-tab', page.locator('.view-switch'))
  await crop('sidebar-add', page.locator('.sidebar-add'))
  await crop('status', page.locator('.status-right'))

  // Menus
  await page.locator('.titlebar-book').click()
  await page.waitForTimeout(400)
  await away()
  await measure('.menu-item')
  await crop('menu', page.locator('.menu'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // Plan. The sync button is left out: its icon centers on two lines of text.
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  await away()
  await measure('.view-tab:not(.is-active)', '.plan-item-top', '.plan-item-main')
  await crop('plan-sidebar', page.locator('.plan-nav'))

  // Settings
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(600)
  await away()
  await measure('.settings-tab', '.theme-label', '.select|last')
  await crop('settings-tabs', page.locator('.settings-tabs'))
  await crop('settings-theme', page.locator('.theme-picker'))
  await page.locator('.settings-tab').nth(1).click()
  await page.waitForTimeout(400)
  await page.locator('.provider-more').first().click()
  await page.waitForTimeout(300)
  await away()
  await measure('.provider-more', '.provider-foot .link-btn', '.provider-foot .btn')
  await crop('settings-provider', page.locator('.provider-foot'))
  await page.locator('.settings-tab').nth(2).click()
  await page.waitForTimeout(400)
  await away()
  await measure('.action-item:not(.is-active)', '.action-form-foot .btn', '.actions-list-foot .btn')
  await crop('settings-actions', page.locator('.actions-list'))
  await page.keyboard.press('Escape')

  const LIMIT = limitFor(rows[0]?.scale ?? 1)
  const bad = rows.filter((r) => Math.abs(r.offset) > LIMIT)
  for (const r of rows) {
    console.log(`${Math.abs(r.offset) > LIMIT ? '!!' : '  '} ${r.offset.toFixed(2).padStart(6)}  ${r.caps ? 'cap' : 'x  '}  ${r.font.padEnd(7)} icon ${String(r.icon).padStart(4)}px  ${r.where}  “${r.text}”`)
  }
  const avg = rows.reduce((s, r) => s + r.offset, 0) / rows.length
  console.log(JSON.stringify({ scale: rows[0]?.scale, pairs: rows.length, average: +avg.toFixed(2), bad: bad.length }))
  if (bad.length) throw new Error(`${bad.length} icons are more than ${LIMIT} px from the middle of their text`)
}
