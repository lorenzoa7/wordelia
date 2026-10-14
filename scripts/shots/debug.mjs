export default async function ({ page }) {
  const r = await page.evaluate(async () => {
    const models = await window.wordelia.invoke('ai:models', 'codex')
    const t0 = Date.now()
    const res = await window.wordelia.invoke('ai:complete', 'dbg1', {
      route: { provider: 'codex', model: '', effort: 'low' },
      purpose: 'background',
      system: 'You are terse.',
      messages: [{ role: 'user', content: 'Reply with the single word OK.' }]
    })
    return { models: models.map((m) => m.id + (m.isDefault ? '*' : '')), ms: Date.now() - t0, res }
  })
  console.log(JSON.stringify(r, null, 1))
}
