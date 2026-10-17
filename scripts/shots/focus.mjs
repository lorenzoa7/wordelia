// Keyboard focus: Tab through the title bar and the sidebar, and save a picture of each ring.
import { resolve } from 'node:path'

export default async function ({ page, openBook }) {
  const dark = process.argv.includes('--dark') ? '-dark' : ''
  await openBook()
  await page.locator('.status-bar').click()
  // From the page, Shift+Tab goes back into the sidebar and the title bar.
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(600)
  await page.locator('.plan-hero h1').click()
  for (let i = 1; i <= 14; i++) {
    await page.keyboard.press('Shift+Tab')
    await page.waitForTimeout(120)
    const box = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, name: `${el.tagName.toLowerCase()}.${String(el.className || '').split(' ')[0]}` }
    })
    if (!box) continue
    const clip = { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 10), width: Math.min(1440 - Math.max(0, box.x - 12), box.w + 24), height: box.h + 20 }
    const file = resolve('test-results/shots', `focus${dark}-${String(i).padStart(2, '0')}-${box.name.replace(/[^a-z.-]/g, '')}.png`)
    await page.screenshot({ path: file, clip })
    console.log('saved', file)
  }
}
