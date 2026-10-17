// A tour of the main screens for a design review: title bar, sidebars, Plan pages, dialogs.
// Usage: node scripts/shot.mjs design [--en] [--dark]
import { resolve } from 'node:path'

export default async function ({ page, shot, openBook }) {
  const suffix = `${process.argv.includes('--en') ? '-en' : ''}${process.argv.includes('--dark') ? '-dark' : ''}`
  const zoom = async (name, clip) => {
    const file = resolve('test-results/shots', `design${suffix}-zoom-${name}.png`)
    await page.screenshot({ path: file, clip })
    console.log('saved', file)
  }
  await openBook()
  await page.waitForTimeout(600)
  await shot('write')
  await zoom('titlebar-left', { x: 0, y: 0, width: 520, height: 44 })
  await zoom('titlebar-right', { x: 920, y: 0, width: 520, height: 44 })
  await zoom('sidebar', { x: 0, y: 44, width: 300, height: 420 })
  await zoom('statusbar', { x: 240, y: 860, width: 820, height: 40 })

  // Book menu
  await page.locator('.titlebar-book').click()
  await page.waitForTimeout(400)
  await shot('book-menu')
  await page.keyboard.press('Escape')

  // Chapter menu
  const item = page.locator('.chapter-item').nth(1)
  await item.hover()
  await page.waitForTimeout(200)
  await zoom('chapter-hover', { x: 0, y: 44, width: 300, height: 200 })
  await item.locator('.chapter-item-menu button').click()
  await page.waitForTimeout(400)
  await shot('chapter-menu')
  await page.keyboard.press('Escape')

  // Plan
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(800)
  await shot('plan-overview')
  await page.locator('.plan-item-main').first().click()
  await page.waitForTimeout(700)
  await shot('plan-category')
  await page.locator('.entry-card:not(.entry-card-new)').first().click()
  await page.waitForTimeout(800)
  await shot('plan-entry')

  // Dialogs
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(500)
  await page.keyboard.press('Control+Shift+E')
  await page.waitForTimeout(800)
  await shot('export')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.locator('.status-btn').click()
  await page.waitForTimeout(1000)
  await shot('history')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // Library with the book
  await page.locator('.titlebar-logo').click()
  await page.waitForTimeout(1200)
  await shot('library')
  await page.locator('.library-actions .btn-ribbon').click()
  await page.waitForTimeout(700)
  await shot('new-book')
}
