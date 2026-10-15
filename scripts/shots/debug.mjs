// One small real completion. Run with --real-ai.
// WORDELIA_DEBUG_PROVIDER (default claude-code), WORDELIA_DEBUG_MODEL, WORDELIA_DEBUG_BIN (another copy of the CLI).
export default async function ({ page }) {
  const provider = process.env.WORDELIA_DEBUG_PROVIDER || 'claude-code'
  const bin = process.env.WORDELIA_DEBUG_BIN
  const model = process.env.WORDELIA_DEBUG_MODEL || (provider === 'claude-code' ? 'haiku' : '')
  if (bin) {
    // Try another copy of the CLI without changing the user's settings file.
    await page.evaluate(
      ({ provider, bin }) => {
        const app = window.__wordelia.app.getState()
        const providers = app.settings.providers
        return app.updateSettings({ providers: { ...providers, [provider]: { ...providers[provider], binPath: bin } } })
      },
      { provider, bin }
    )
  }
  const r = await page.evaluate(async ({ provider, model }) => {
    const status = await window.wordelia.invoke('ai:status', provider)
    const models = await window.wordelia.invoke('ai:models', provider)
    const t0 = Date.now()
    const res = await window.wordelia.invoke('ai:complete', 'dbg1', {
      route: { provider, model, effort: 'low' },
      purpose: 'background',
      system: 'You are terse.',
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }]
    })
    return { status, models: models.map((m) => m.id + (m.isDefault ? '*' : '')), ms: Date.now() - t0, res }
  }, { provider, model })
  console.log(JSON.stringify(r, null, 1))
}
