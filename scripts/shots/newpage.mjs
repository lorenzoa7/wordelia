// A new page opens while the author types: only the word that does not fit goes to the new page,
// and the page grows in on one smooth path. ProseMirror draws the page gap again at each key on the
// new page; the growth must go on from where it is, never start again and never jump.
export default async function ({ page, openBook }) {
  // The machine may ask for reduced motion (CI servers do): this scenario checks the growth itself.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openBook()
  await page.waitForTimeout(800)
  // Record each frame from the moment a new page comes: the height of its gap and the cursor on screen.
  await page.evaluate(() => {
    window.__growth = null
    const caret = () => {
      const s = getSelection()
      const r = s.rangeCount ? s.getRangeAt(0).getClientRects()[0] : null
      return r ? r.top : null
    }
    new MutationObserver((list) => {
      for (const m of list) {
        for (const n of m.addedNodes) {
          if (window.__growth || !(n instanceof HTMLElement) || !n.classList.contains('is-growing')) continue
          const after = []
          for (let x = n.nextSibling; x; x = x.nextSibling) after.push(x.textContent)
          const g = (window.__growth = { after: after.join(''), full: Number(n.dataset.height), frames: [] })
          const t0 = performance.now()
          const tick = () => {
            const el = document.querySelector(`.manuscript .pm-page-gap[data-page="${n.dataset.page}"]`)
            g.frames.push({ h: el ? el.getBoundingClientRect().height : -1, caret: caret(), growing: el?.classList.contains('is-growing') })
            if (performance.now() - t0 < 900) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      }
    }).observe(document.querySelector('.manuscript'), { childList: true, subtree: true })
  })
  // Words at the end of the chapter, like a person types them, until a new page comes inside the paragraph.
  const last = page.locator('.manuscript').first().locator('p').last()
  await last.click()
  await page.keyboard.press('Control+End')
  const gaps = () => page.evaluate(() => document.querySelector('.manuscript').querySelectorAll('.pm-page-gap').length)
  const start = await gaps()
  const words = 'O velho faz o café e olha o mar pela janela enquanto a chuva cai no telhado. '.split(' ').filter(Boolean)
  for (let i = 0; i < 400 && (await gaps()) === start; i++) await page.keyboard.type(`${words[i % words.length]} `, { delay: 40 })
  if ((await gaps()) === start) throw new Error('No new page came')
  // More letters while the page grows: each key draws the gap again.
  await page.keyboard.type('mais palavras aqui', { delay: 40 })
  await page.waitForTimeout(1000)
  const g = await page.evaluate(() => window.__growth)
  if (!g) throw new Error('The new page did not grow')
  const hs = g.frames.map((f) => f.h).filter((h) => h >= 0)
  const jumps = hs.slice(1).map((h, i) => h - hs[i])
  const caretUp = Math.max(0, ...g.frames.slice(1).map((f, i) => (g.frames[i].caret ?? 0) - (f.caret ?? 0)))
  console.log(JSON.stringify({ after: g.after, full: Math.round(g.full), frames: hs.length, first: Math.round(hs[0]), last: Math.round(hs[hs.length - 1]), biggestStep: Math.round(Math.max(...jumps)), caretUp: Math.round(caretUp) }))
  const fail = (what) => {
    throw new Error(`New page: ${what}`)
  }
  // Only the word that did not fit goes to the new page (the words before it stay on their line).
  if (/\S\s+\S/.test(g.after.trim())) fail(`more than one word went to the new page: "${g.after}"`)
  // The growth never goes back (a new start) and it ends at the full height.
  if (jumps.some((d) => d < -1)) fail(`the gap got smaller while it grew: ${hs.map(Math.round).join(' ')}`)
  if (Math.abs(hs[hs.length - 1] - g.full) > 1.5) fail(`the gap ends at ${hs[hs.length - 1]} px, not ${g.full}`)
  // On this machine (not on CI servers: no GPU, slow frames): many frames, no jump, and the cursor does not climb back.
  if (!process.env.CI) {
    if (hs.length < 10) fail(`only ${hs.length} frames`)
    if (Math.max(...jumps) > g.full * 0.3) fail(`a step of ${Math.round(Math.max(...jumps))} px in one frame: ${hs.map(Math.round).join(' ')}`)
    if (caretUp > 4) fail(`the cursor went up ${Math.round(caretUp)} px while the page grew`)
  }
}
