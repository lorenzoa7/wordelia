// Settings → AI: connecting a provider gives it the tasks at once; turning a provider off stops its
// use (also in the main process); each status of a provider has its own words.
// The scripted AI says that every provider works, so the scenario turns providers off and on, and
// sets some statuses by hand.
export default async function ({ page, shot, openBook }) {
  const fail = (what) => {
    throw new Error(`Settings AI scenario: ${what}`)
  }
  const providersOfRoutes = () => page.evaluate(() => Object.values(window.__wordelia.app.getState().settings.routes).map((r) => r?.provider ?? null))
  const waitRoutes = (provider) =>
    page.waitForFunction((p) => Object.values(window.__wordelia.app.getState().settings.routes).every((r) => (r?.provider ?? null) === p), provider, { timeout: 8000 })
  const row = (name) => page.locator('.provider-row').filter({ has: page.getByText(name, { exact: true }) })
  const toast = (text) => page.locator('.toast', { hasText: text }).last().waitFor({ timeout: 8000 })
  const details = async (name) => {
    if (!(await row(name).locator('.provider-details').isVisible())) await row(name).getByRole('button', { name: `${name} details` }).click()
  }

  await openBook()
  // 1. Like a writer who skipped the welcome before a program was there: no models, and the programs off.
  await page.evaluate(async () => {
    const app = window.__wordelia.app.getState()
    const providers = { ...app.settings.providers, 'claude-code': { enabled: false }, codex: { enabled: false } }
    await app.updateSettings({ routes: { chat: null, action: null, sync: null, background: null }, providers })
    window.__wordelia.app.setState({ status: {}, models: {} })
  })
  await page.keyboard.press('Control+,')
  await page.getByRole('tab', { name: 'AI', exact: true }).click()
  await page.locator('.settings-empty').waitFor()
  await shot('nothing-connected')

  // 2. "Turn on" for Claude Code: every task gets a model at once (SPEC 4.8).
  await page.getByRole('button', { name: 'Turn on: Claude Code' }).click()
  await waitRoutes('claude-code')
  await toast('Claude Code connected. All tasks use it now.')
  await page.locator('.route-provider', { hasText: 'Claude Code' }).first().waitFor()
  await shot('claude-connected')

  // 3. A second provider does not take the tasks of a provider that works.
  await page.getByRole('button', { name: 'Turn on: Codex' }).click()
  await page.waitForFunction(() => window.__wordelia.app.getState().status.codex?.loggedIn === true)
  if ((await providersOfRoutes()).some((p) => p !== 'claude-code')) fail('turning on Codex moved the tasks of Claude Code')

  // 4. Turn off Claude Code: its tasks go to Codex, and it shows nowhere.
  await details('Claude Code')
  await row('Claude Code').getByRole('switch').click()
  await waitRoutes('codex')
  await toast('Claude Code is off. The tasks use Codex now.')
  if (await page.evaluate(() => Boolean(window.__wordelia.app.getState().models['claude-code']))) fail('the models of Claude Code stay in the pickers')

  // 5. The main process refuses a request to a provider that is off: it is the last gate.
  const refused = await page.evaluate(() =>
    window.wordelia.invoke('ai:complete', 'gate-test', { route: { provider: 'claude-code', model: 'opus' }, purpose: 'chat', system: 'Test', messages: [{ role: 'user', content: 'Hello' }] })
  )
  if (refused.ok || refused.errorKind !== 'off') fail(`a request to a provider that is off ran: ${JSON.stringify(refused)}`)

  // 6. Turn off Codex too: no AI is left, and the app says "Connect an AI".
  await details('Codex')
  await row('Codex').getByRole('switch').click()
  await waitRoutes(null)
  await toast('Codex is off. Connect an AI to use the chat and the actions.')
  await page.locator('.settings-empty').waitFor()
  await shot('all-off')
  await page.keyboard.press('Escape')
  await page.locator('.settings-dialog').waitFor({ state: 'hidden' })
  const before = await page.evaluate(() => window.__wordelia.book.getState().threads.reduce((n, t) => n + t.messages.length, 0))
  await page.locator('.composer-input').fill('Hello?')
  await page.keyboard.press('Enter')
  await toast('Connect an AI first.')
  const after = await page.evaluate(() => window.__wordelia.book.getState().threads.reduce((n, t) => n + t.messages.length, 0))
  if (after > before + 1) fail('the chat replied with every provider off')
  await page.locator('.provider-badge').waitFor({ timeout: 5000 })

  // 7. The statuses, each with its own words. Claude Code works; Codex is not installed and no task uses
  //    it, so it looks optional; one API key was rejected, and the other account has no credit.
  await page.evaluate(async () => {
    const app = window.__wordelia.app.getState()
    const providers = { 'claude-code': { enabled: true }, codex: { enabled: true }, anthropic: { enabled: true }, openai: { enabled: true } }
    await app.updateSettings({ providers })
  })
  await page.keyboard.press('Control+,')
  await page.getByRole('tab', { name: 'AI', exact: true }).click()
  await waitRoutes('claude-code')
  // The checks of the tab are done: the statuses stay as the scenario sets them.
  await page.waitForFunction(() => Object.keys(window.__wordelia.app.getState().status).length === 4)
  await page.evaluate(() => {
    const status = window.__wordelia.app.getState().status
    window.__wordelia.app.setState({
      status: {
        ...status,
        'claude-code': { ...status['claude-code'], version: '2.1.0', latestVersion: '2.3.0', account: 'elias@example.com', path: 'C:\\Users\\elias\\.local\\bin\\claude.exe' },
        codex: { provider: 'codex', installed: false, loggedIn: false, detail: 'Wordelia did not find the codex program on this computer.' },
        anthropic: { provider: 'anthropic', installed: true, loggedIn: false, reason: 'bad-key', detail: '401 authentication_error: invalid x-api-key' },
        openai: { provider: 'openai', installed: true, loggedIn: true, reason: 'no-credit', detail: '429 insufficient_quota: You exceeded your current quota.' }
      }
    })
  })
  const line = async (name) => (await row(name).locator('.provider-line-text').innerText()).trim()
  const lines = { claude: await line('Claude Code'), codex: await line('Codex'), anthropic: await line('Anthropic API'), openai: await line('OpenAI API') }
  console.log(JSON.stringify(lines))
  if (lines.claude !== 'Connected · elias@example.com') fail(`the status line of Claude Code has more than its status: ${lines.claude}`)
  if ((await row('Claude Code').locator('.provider-sub').innerText()) !== 'Version 2.3.0 is out.') fail('the update notice is not under the status line')
  if (lines.codex !== 'Not installed (optional)' || (await row('Codex').evaluate((el) => el.classList.contains('needs-you')))) fail('Codex that no task uses looks like an error')
  if (lines.anthropic !== 'The key did not work') fail(`a rejected key says: ${lines.anthropic}`)
  if (lines.openai !== 'No credit left') fail(`an account without credit says: ${lines.openai}`)
  // Each button names its provider for screen readers.
  for (const name of ['Add key: Anthropic API', 'Add credit: OpenAI API', 'How to install: Codex', 'Update…: Claude Code', 'Codex details']) {
    if (!(await page.getByRole('button', { name, exact: true }).count())) fail(`no button "${name}"`)
  }
  await details('Claude Code')
  await page.locator('.settings-panes').evaluate((el) => el.scrollTo({ top: 0 }))
  await shot('statuses')
  await page.locator('.settings-panes').evaluate((el) => el.scrollTo({ top: 5000 }))
  await shot('statuses-routes')
}
