// Settings → Actions: the main action cannot be deleted, an action needs a name, edits that wait to
// be saved are saved when Esc closes the settings, the actions can change order, and the model of an
// action says "Same as Actions" or that its provider is not on this computer.
export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Actions tab: ${what}`)
  }
  const actions = () => page.evaluate(() => window.__wordelia.app.getState().settings.actions.map((a) => ({ id: a.id, name: a.name, instructions: a.instructions })))
  const open = async () => {
    await page.keyboard.press('Control+,')
    await page.waitForSelector('.settings-dialog')
    await page.getByRole('tab', { name: 'Actions', exact: true }).click()
    await page.waitForSelector('.action-form')
  }
  const choose = (name) => page.locator('.action-item', { hasText: name }).first().click()
  const nameField = () => page.getByRole('textbox', { name: 'Action name' })

  await openBook()
  await open()

  // The main action: Delete is off, and its tooltip says why.
  const mainDelete = await page.locator('.action-form .action-delete').isDisabled()
  const why = await page.locator('.action-delete-off').getAttribute('aria-label')
  const sameAs = await page.locator('.model-pick').innerText()
  await shot('main-action')
  if (!mainDelete) fail('the main action can be deleted')
  if (!/cannot be deleted/.test(why ?? '')) fail(`no reason for the main action: ${why}`)
  if (!/^Same as Actions \(Claude/.test(sameAs.trim())) fail(`the model of the main action shows "${sameAs}"`)

  // An empty name is not saved, and the field goes back to the name.
  await nameField().fill('')
  await page.waitForSelector('.action-name-empty')
  await page.waitForTimeout(800)
  const whileEmpty = (await actions())[0].name
  await shot('empty-name')
  await nameField().blur()
  const restored = await nameField().inputValue()
  if (whileEmpty !== 'Polish') fail(`an empty name was saved: "${whileEmpty}"`)
  if (restored !== 'Polish') fail(`the empty field did not go back to the name: "${restored}"`)

  // Esc right after typing: the name and the instructions are saved.
  await choose('Tighten')
  await nameField().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' hard')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.settings-dialog', { state: 'detached' })
  await open()
  await choose('Tighten')
  await page.getByRole('textbox', { name: 'Instructions' }).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' Keep the dialogue.')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.settings-dialog', { state: 'detached' })
  await page.waitForFunction(() => window.__wordelia.app.getState().settings.actions.find((a) => a.id === 'tighten')?.instructions.endsWith('Keep the dialogue.'), null, { timeout: 3000 }).catch(() => null)
  const saved = (await actions()).find((a) => a.id === 'tighten')
  console.log('saved on Esc:', JSON.stringify(saved))
  if (saved?.name !== 'Tighten hard') fail(`the name was lost on Esc: ${saved?.name}`)
  if (!saved?.instructions.endsWith('Keep the dialogue.')) fail('the instructions were lost on Esc')

  // Order: Move down, then Alt+Up on the item.
  await open()
  await choose('Tighten hard')
  await page.getByRole('button', { name: 'Move down' }).click()
  await page.waitForFunction(() => window.__wordelia.app.getState().settings.actions[2].id === 'tighten', null, { timeout: 3000 }).catch(() => null)
  const down = (await actions()).map((a) => a.id).join(' ')
  const items = (await page.locator('.actions-group').first().locator('.action-item-name').allInnerTexts()).join(' / ')
  await shot('moved-down')
  await page.locator('.action-item', { hasText: 'Tighten hard' }).focus()
  await page.keyboard.press('Alt+ArrowUp')
  await page.waitForFunction(() => window.__wordelia.app.getState().settings.actions[1].id === 'tighten', null, { timeout: 3000 }).catch(() => null)
  const up = (await actions()).map((a) => a.id).join(' ')
  console.log('order:', JSON.stringify({ down, items, up }))
  if (down !== 'polish grammar tighten show') fail(`Move down gave ${down}`)
  if (!items.startsWith('Polish / Fix grammar only / Tighten hard')) fail(`the list shows ${items}`)
  if (up !== 'polish tighten grammar show') fail(`Alt+Up gave ${up}`)

  // A model of a provider that this computer does not have: the action uses the model of Actions.
  await page.evaluate(async () => {
    const app = window.__wordelia.app
    const s = app.getState()
    await s.updateSettings({ actions: s.settings.actions.map((a) => (a.id === 'tighten' ? { ...a, route: { provider: 'codex', model: 'gpt-x' } } : a)) })
    app.setState({ status: { ...app.getState().status, codex: { provider: 'codex', installed: false, loggedIn: false } } })
  })
  await choose('Tighten hard')
  await page.waitForSelector('.action-form .field-hint', { hasText: 'not connected on this computer' })
  const missing = await page.locator('.action-form .field-hint', { hasText: 'not connected on this computer' }).innerText()
  const runs = await page.locator('.model-pick').innerText()
  await shot('model-missing')
  console.log('model:', JSON.stringify({ missing, runs }))
  if (!/^Codex is not connected/.test(missing)) fail(`the hint says "${missing}"`)
  if (!/^Claude/.test(runs.trim())) fail(`the control shows "${runs}"`)
  await page.keyboard.press('Escape')
}
