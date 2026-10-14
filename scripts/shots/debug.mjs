export default async function ({ page, openBook }) {
  await openBook()
  page.on('console', (m) => console.log('[log]', m.text()))
  const info = await page.evaluate(async () => {
    const w = window.__wordelia
    const ed = w.editor()
    ed.commands.setTextSelection({ from: 60, to: 200 })
    const origDispatch = ed.view.dispatch.bind(ed.view)
    const metas = []
    ed.view.dispatch = (tr) => {
      metas.push(Object.keys(tr.meta || {}).join(',') + ' steps=' + tr.steps.length)
      return origDispatch(tr)
    }
    const p = w.runAction('polish')
    await new Promise((r) => setTimeout(r, 100))
    const pending = !!document.querySelector('.ai-pending')
    await p
    return { metas, pending }
  })
  console.log(JSON.stringify(info))
}
