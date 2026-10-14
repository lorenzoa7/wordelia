export default async function ({ page, shot, openBook }) {
  await openBook()
  await shot('write')
  // Select a sentence and open the selection menu.
  const p = page.locator('.manuscript p').first()
  await p.click()
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.up('Shift')
  await page.waitForTimeout(400)
  await shot('selection-menu')
  // Run Polish (mock AI) and wait for the review.
  await page.keyboard.press('Control+j')
  await page.waitForSelector('.review-accept', { timeout: 15000 })
  await page.waitForTimeout(500)
  await shot('inline-review')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  // Chat with a proposal.
  await page.locator('.composer-input').fill('Can you improve the opening paragraph?')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.proposal', { timeout: 15000 })
  await page.waitForTimeout(1200)
  await shot('chat-proposal')
  // Plan view
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  await shot('plan-overview')
  await page.locator('.entry-card').filter({ has: page.locator('.entry-card-name', { hasText: /^Elias$/ }) }).click()
  await page.waitForTimeout(700)
  await shot('plan-entry')
}
