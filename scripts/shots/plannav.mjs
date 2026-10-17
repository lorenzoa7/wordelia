// Plan pages: a back link on every page below the overview, Alt+← goes back too.
// I18N_LANG=pt-BR (or es) shows the pages in another interface language.
export default async function ({ page, shot, openBook }) {
  if (process.env.I18N_LANG) {
    await page.evaluate((l) => window.__wordelia.app.getState().updateSettings({ language: l }), process.env.I18N_LANG)
  }
  await openBook()
  const where = () =>
    page.evaluate(() => {
      const s = window.__wordelia.book.getState()
      return { category: s.activeCategory, entry: s.activeEntryId }
    })
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  if (await page.locator('.plan-back').count()) throw new Error('The overview must not have a back link')
  // From the overview, a section title opens its category.
  await page.locator('.plan-section-link').first().click()
  await page.waitForTimeout(600)
  await shot('category')
  const cat = await where()
  if (!cat.category) throw new Error('No category page')
  // A card opens the entry; its page has "← Characters".
  await page.locator('.entry-card:not(.entry-card-new)').first().click()
  await page.waitForTimeout(700)
  await shot('entry')
  await page.locator('.entry-crumbs .plan-back').hover()
  await page.waitForTimeout(900)
  await shot('entry-back-hover')
  // Alt+← goes to the category, the back link to the overview.
  await page.locator('.plan-desk').click({ position: { x: 20, y: 400 } })
  await page.keyboard.press('Alt+ArrowLeft')
  await page.waitForTimeout(500)
  const up = await where()
  if (up.entry || up.category !== cat.category) throw new Error(`Alt+Left did not go to the category: ${JSON.stringify(up)}`)
  await page.locator('.plan-hero .plan-back').click()
  await page.waitForTimeout(500)
  const top = await where()
  if (top.category || top.entry) throw new Error('The back link did not go to the overview')
  // The Writing rules are no longer a Plan page.
  if (await page.locator('.plan-item', { hasText: /Writing rules|Regras de escrita|Reglas de escritura/ }).count()) throw new Error('Writing rules still in the Plan sidebar')
  await shot('overview')
  console.log('plan navigation ok')
}
