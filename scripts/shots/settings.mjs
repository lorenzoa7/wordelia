// Settings: each tab, the provider details, the model picker and the icon picker.
// Each tab keeps space under its last control at the end of its scroll (the writing rules too, also when they are long).
export default async function ({ page, shot, openBook }) {
  const tab = async (name) => {
    await page.getByRole('tab', { name, exact: true }).click()
    await page.waitForTimeout(450)
  }
  // Space between the end of the content of the open tab and the bottom edge of the scroll area, at the end of the scroll.
  const bottomSpace = () =>
    page.evaluate(() => {
      const panes = document.querySelector('.settings-panes')
      panes.scrollTo({ top: panes.scrollHeight })
      const pane = panes.querySelector('.settings-pane:not([hidden])')
      let bottom = 0
      for (const el of pane.querySelectorAll('*')) {
        const r = el.getBoundingClientRect()
        if (r.height > 0 && getComputedStyle(el).visibility !== 'hidden') bottom = Math.max(bottom, r.bottom)
      }
      return Math.round(panes.getBoundingClientRect().bottom - bottom)
    })
  const spaces = {}
  await openBook()
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(700)
  await shot('general')
  spaces.general = await bottomSpace()
  await page.waitForTimeout(300)
  await shot('general-keyboard')
  await tab('AI')
  await page.waitForTimeout(300)
  await shot('ai')
  await page.locator('.provider-more').first().click()
  await page.waitForTimeout(300)
  await shot('ai-details')
  spaces.ai = await bottomSpace()
  await page.waitForTimeout(300)
  await shot('ai-routes')
  await tab('Actions')
  await shot('actions')
  // Four built-in actions: Polish (Ctrl+J), Tighten, Fix grammar only, Show, don't tell. No Expand.
  const actions = await page.locator('.action-item').allInnerTexts()
  console.log(JSON.stringify({ actions }))
  if (actions.length !== 4) throw new Error(`The actions tab shows ${actions.length} actions, not 4`)
  if (actions.some((a) => /Expand/.test(a))) throw new Error('Expand is still a built-in action')
  if (!/Polish[\s\S]*Ctrl\+J/.test(actions[0])) throw new Error('Polish is not first, with Ctrl+J')
  spaces.actions = await bottomSpace()
  await page.locator('.model-pick').click()
  await page.waitForTimeout(350)
  await shot('actions-model')
  await page.keyboard.press('Escape')
  await page.locator('.icon-pick').click()
  await page.waitForTimeout(350)
  await shot('actions-icon')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  if (!(await page.locator('.settings-dialog').isVisible())) throw new Error('Esc in a picker closed the settings')
  await tab('This book')
  await shot('book')
  // The page size of the book: the pages on screen and the export use it.
  await page.locator('.page-size').scrollIntoViewIfNeeded()
  await page.locator('.page-size').click()
  await page.waitForTimeout(300)
  await shot('book-page-size')
  await page.getByRole('option', { name: /Letter/ }).click()
  await page.waitForTimeout(300)
  const pageSize = await page.evaluate(() => window.__wordelia.book.getState().manifest.export.pageSize)
  if (pageSize !== 'Letter') throw new Error(`The page size was not saved: ${pageSize}`)
  spaces.book = await bottomSpace()
  await page.waitForTimeout(300)
  await shot('book-typing')
  await tab('Writing rules')
  await page.waitForTimeout(300)
  await shot('rules')
  spaces.rules = await bottomSpace()
  // Long writing rules: the sheet grows, and the end of the scroll keeps the same space under it.
  await page.evaluate(() => {
    const lines = ['# Writing rules', '']
    for (let i = 1; i <= 60; i++) lines.push(`- Rule ${i}: short, concrete sentences; few adverbs; dialogue lines start with a dash.`)
    window.__wordelia.book.getState().setWritingRules(lines.join('\n'))
  })
  await tab('General')
  await tab('Writing rules')
  await page.waitForTimeout(300)
  spaces.rulesLong = await bottomSpace()
  await page.waitForTimeout(300)
  await shot('rules-long-end')
  console.log(JSON.stringify({ bottomSpace: spaces }))
  for (const [name, px] of Object.entries(spaces)) {
    if (px < 16) throw new Error(`The ${name} tab has ${px}px under its content at the end of the scroll`)
  }
  // Closed and opened again without a tab: General, not the last tab.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(500)
  const active = await page.locator('.settings-tab[data-state="active"]').innerText()
  console.log(JSON.stringify({ reopenedOn: active.trim() }))
  if (active.trim() !== 'General') throw new Error(`Settings opened on "${active.trim()}", not General`)
}
