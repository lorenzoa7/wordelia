// One small real completion. Run with --real-ai. Pick the provider with WORDELIA_DEBUG_PROVIDER (default claude-code).
export default async function ({ page }) {
  const provider = process.env.WORDELIA_DEBUG_PROVIDER || 'claude-code'
  const r = await page.evaluate(async (provider) => {
    const status = await window.wordelia.invoke('ai:status', provider)
    const models = await window.wordelia.invoke('ai:models', provider)
    const t0 = Date.now()
    const res = await window.wordelia.invoke('ai:complete', 'dbg1', {
      route: { provider, model: provider === 'claude-code' ? 'haiku' : '', effort: 'low' },
      purpose: 'background',
      system: 'You are terse.',
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }]
    })
    return { status, models: models.map((m) => m.id + (m.isDefault ? '*' : '')), ms: Date.now() - t0, res }
  }, provider)
  console.log(JSON.stringify(r, null, 1))
}
