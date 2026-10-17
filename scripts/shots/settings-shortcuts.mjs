// The shortcut recorder of the actions: Esc, refused keys, a new shortcut, a removed one,
// and the new shortcut in the editor.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(600)
  await page.getByRole('tab', { name: 'Actions', exact: true }).click()
  await page.waitForTimeout(400)
  const box = page.locator('.shortcut-box')
  await box.click()
  await page.waitForTimeout(250)
  await shot('recording')
  // Esc stops the recording. It does not close the settings.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  if (!(await page.locator('.settings-dialog').isVisible())) throw new Error('Esc closed the settings')

  await box.click()
  await page.keyboard.press('Control+b')
  await page.waitForTimeout(250)
  const takenByApp = await page.locator('.shortcut-error').innerText()
  await shot('taken-by-app')
  await page.keyboard.press('Alt+2')
  await page.waitForTimeout(250)
  const takenByAction = await page.locator('.shortcut-error').innerText()
  await shot('taken-by-action')
  await page.keyboard.press('Shift+K')
  await page.waitForTimeout(250)
  const needsModifier = await page.locator('.shortcut-error').innerText()
  await page.keyboard.press('Control+Shift+K')
  await page.waitForTimeout(500)
  await shot('saved')
  const saved = await page.evaluate(() => window.__wordelia.app.getState().settings.actions.find((a) => a.id === 'polish').shortcut)

  // Remove the shortcut of another action.
  await page.locator('.action-item').nth(1).click()
  await page.waitForTimeout(300)
  await page.locator('.shortcut-clear').click()
  await page.waitForTimeout(400)
  await shot('cleared')
  const cleared = await page.evaluate(() => window.__wordelia.app.getState().settings.actions[1].shortcut ?? null)

  // The new shortcut runs the action on the paragraph of the cursor.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  await page.locator('.manuscript p').first().click()
  await page.keyboard.press('Control+Shift+K')
  await page.waitForSelector('.review-accept', { timeout: 15000 })
  await page.waitForTimeout(300)
  await shot('runs')
  await page.keyboard.press('Escape')

  console.log(JSON.stringify({ takenByApp, takenByAction, needsModifier, saved, cleared }))
  if (!/Ctrl\+B.*Bold/.test(takenByApp)) throw new Error('Ctrl+B was not refused')
  if (!/Alt\+2.*Tighten/.test(takenByAction)) throw new Error('Alt+2 was not refused')
  if (!/Ctrl or Alt/.test(needsModifier)) throw new Error('Shift+K was not refused')
  if (saved !== 'Ctrl+Shift+K') throw new Error(`The shortcut was not saved: ${saved}`)
  if (cleared !== null) throw new Error('The shortcut was not removed')
}
