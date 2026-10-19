// A new page comes in while the author types: only the word that does not fit goes to the new page.
// The page before it keeps its full size the whole time (every page has the size of the book page),
// and the new sheet comes out of the desk: a veil over it fades out, and the desk scrolls with it.
// ProseMirror draws the page gap again at each key on the new page; the arrival must go on from
// where it is, never start again and never jump.
export default async function ({ page, openBook }) {
  // The machine may ask for reduced motion (CI servers do): this scenario checks the motion itself.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openBook()
  await page.waitForTimeout(800)
  // Record each frame from the moment a new page comes: its gap, its veil and the scroll of the desk.
  await page.evaluate(() => {
    window.__arrival = null
    const desk = document.querySelector('.desk')
    new MutationObserver((list) => {
      for (const m of list) {
        for (const n of m.addedNodes) {
          if (window.__arrival || !(n instanceof HTMLElement) || !n.querySelector?.('.pm-page-veil')) continue
          const after = []
          for (let x = n.nextSibling; x; x = x.nextSibling) after.push(x.textContent)
          const a = (window.__arrival = { after: after.join(''), full: n.getBoundingClientRect().height, frames: [] })
          const t0 = performance.now()
          const tick = () => {
            const el = document.querySelector(`.manuscript .pm-page-gap[data-page="${n.dataset.page}"]`)
            const veil = el?.querySelector('.pm-page-veil')
            a.frames.push({ h: el ? el.getBoundingClientRect().height : -1, veil: veil ? Number(getComputedStyle(veil).opacity) : 0, scroll: desk.scrollTop })
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
  // More letters while the page comes in: each key draws the gap again.
  await page.keyboard.type('mais palavras aqui', { delay: 40 })
  await page.waitForTimeout(1000)
  const a = await page.evaluate(() => window.__arrival)
  if (!a) throw new Error('The new page did not come in')
  const frames = a.frames.filter((f) => f.h >= 0)
  const veils = frames.map((f) => f.veil)
  const scrolls = frames.map((f) => f.scroll)
  const scrollSteps = scrolls.slice(1).map((s, i) => s - scrolls[i])
  const scrolled = scrolls[scrolls.length - 1] - scrolls[0]
  console.log(JSON.stringify({ after: a.after, full: Math.round(a.full), frames: frames.length, veil: veils.slice(0, 6).map((v) => +v.toFixed(2)), heights: [...new Set(frames.map((f) => Math.round(f.h)))], scrolled: Math.round(scrolled), biggestScrollStep: Math.round(Math.max(0, ...scrollSteps)) }))
  const fail = (what) => {
    throw new Error(`New page: ${what}`)
  }
  // Only the word that did not fit goes to the new page (the words before it stay on their line).
  if (/\S\s+\S/.test(a.after.trim())) fail(`more than one word went to the new page: "${a.after}"`)
  // The page never changes its size: the gap has its full height in every frame.
  if (frames.some((f) => Math.abs(f.h - a.full) > 1)) fail(`the gap changed its height while the page came in: ${[...new Set(frames.map((f) => Math.round(f.h)))].join(' ')}`)
  // The veil only fades out (the arrival never starts again), and it is gone at the end.
  if (veils.slice(1).some((v, i) => v > veils[i] + 0.01)) fail(`the veil came back: ${veils.map((v) => v.toFixed(2)).join(' ')}`)
  if (veils[veils.length - 1] > 0.01) fail('the veil is still there at the end')
  // The desk never scrolls back.
  if (scrollSteps.some((d) => d < -1)) fail(`the desk scrolled back: ${scrolls.map(Math.round).join(' ')}`)
  // On this machine (not on CI servers: no GPU, slow frames): many frames, a soft fade and a soft scroll.
  if (!process.env.CI) {
    if (frames.length < 10) fail(`only ${frames.length} frames`)
    if (veils[0] < 0.5) fail(`the veil starts at ${veils[0]}: the new page shows at once`)
    if (scrolled > 0 && Math.max(...scrollSteps) > Math.max(30, scrolled * 0.3)) fail(`the desk jumped ${Math.max(...scrollSteps)} px in one frame`)
  }
}
