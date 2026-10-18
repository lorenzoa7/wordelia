export default async function ({ page, shot, openBook, book }) {
  const fail = (what) => {
    throw new Error(`History scenario: ${what}`)
  }
  await openBook()
  await page.waitForTimeout(600)
  await page.locator('.manuscript p').first().click()
  // The start of the chapter (Home goes only to the start of the visual line).
  await page.evaluate(() => window.__wordelia.editor().commands.focus('start'))
  await page.keyboard.type(book.includes('Lighthouse') ? 'That night, ' : 'Naquela noite, ')
  await page.waitForTimeout(600)
  // Switching chapters saves a version.
  await page.locator('.chapter-item').nth(1).click()
  await page.waitForTimeout(600)
  await page.locator('.chapter-item').nth(0).click()
  await page.waitForTimeout(800)
  await page.locator('.status-btn').click()
  await page.waitForSelector('.history-item', { timeout: 10000 })
  await page.locator('.history-item').last().click()
  await page.waitForTimeout(700)
  await shot('dialog')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // A long chapter with one change near its end: the compare view goes to the first change by itself, smoothly.
  const marker = await page.evaluate(() => {
    const s = window.__wordelia.book.getState()
    const ch = s.chapters[0]
    const long = Array.from({ length: 8 }, () => ch.body.trim()).join('\n\n')
    s.restoreChapter(ch.id, long)
    return { id: ch.id, words: long.split(/\s+/).length }
  })
  await page.waitForTimeout(500)
  // Leave the chapter and come back: a version of the long text.
  await page.locator('.chapter-item').nth(1).click()
  await page.waitForTimeout(600)
  await page.locator('.chapter-item').nth(0).click()
  await page.waitForTimeout(800)
  const changed = book.includes('Lighthouse') ? 'NEWWORD' : 'PALAVRANOVA'
  await page.evaluate(
    ({ id, changed }) => {
      const s = window.__wordelia.book.getState()
      const body = s.chapters.find((c) => c.id === id).body
      // A word in the last paragraph changes.
      const at = body.lastIndexOf('\n\n') + 2
      const end = body.indexOf(' ', at + 10)
      s.restoreChapter(id, `${body.slice(0, end)} ${changed}${body.slice(end)}`)
    },
    { id: marker.id, changed }
  )
  await page.waitForTimeout(600)
  // Record the scroll position of the compare view in each frame after the dialog opens.
  await page.evaluate(() => {
    const w = (window.__historyScroll = [])
    const tick = (now) => {
      const box = document.querySelector('.history-text')
      if (box && box.querySelector('ins, del')) w.push([now, Math.round(box.scrollTop)])
      if (!w.length || now - w[0][0] < 1500) requestAnimationFrame(tick)
      else w.done = true
    }
    requestAnimationFrame(tick)
  })
  await page.locator('.status-btn').click()
  await page.waitForSelector('.history-text ins, .history-text del', { timeout: 10000 })
  await page.waitForFunction(() => window.__historyScroll.done, null, { timeout: 10000 })
  const r = await page.evaluate(() => {
    const box = document.querySelector('.history-text')
    const mark = box.querySelector('ins, del')
    const b = box.getBoundingClientRect()
    const m = mark.getBoundingClientRect()
    return { top: box.scrollTop, max: box.scrollHeight - box.clientHeight, markTop: m.top - b.top, markBottom: m.bottom - b.top, height: box.clientHeight, text: mark.textContent, samples: window.__historyScroll }
  })
  const tops = r.samples.map((s) => s[1])
  const steps = new Set(tops).size
  // When the view reached the change: a short glide, not the slow smooth scroll of the browser (about 2 s).
  const doneMs = Math.round(r.samples[tops.indexOf(tops.at(-1))][0] - r.samples[0][0])
  console.log('compare view:', JSON.stringify({ ...r, samples: undefined, steps, doneMs, first: tops.slice(0, 12), words: marker.words }))
  if (doneMs > 800) fail(`the glide to the first change took ${doneMs} ms`)
  if (r.max < 200) fail('the compare view is too short to scroll')
  if (r.top < 100) fail(`the compare view did not scroll to the first change (scrollTop ${r.top})`)
  if (r.markTop < 0 || r.markBottom > r.height) fail('the first change is not in view')
  if (!r.text.includes(changed)) fail(`the first change is "${r.text}"`)
  // Smooth: the view passes through positions between the top and the change.
  if (steps < 3) fail(`the compare view jumped to the change (${steps} positions)`)
  await shot('first-change')

  // Another version: the view goes to its first change too.
  await page.locator('.history-item').last().click()
  await page.waitForTimeout(1200)
  const other = await page.evaluate(() => {
    const box = document.querySelector('.history-text')
    const mark = box.querySelector('ins, del')
    const top = mark ? mark.getBoundingClientRect().top - box.getBoundingClientRect().top : null
    return { top, height: box.clientHeight }
  })
  console.log('oldest version:', JSON.stringify(other))
  if (other.top == null || other.top < 0 || other.top > other.height) fail('the first change of another version is not in view')
  await shot('first-change-other')

  // The buttons stay still while the author goes from version to version: no flash, no move. Each change
  // of an attribute in the footer counts, also one that lasts less than a frame (the Restore button was
  // off while each version loaded). The compare view keeps its place too.
  await page.evaluate(() => {
    const foot = document.querySelector('.dialog-foot')
    const rec = (window.__historyFoot = { mutations: [], frames: [] })
    const observer = new MutationObserver((list) => {
      for (const m of list) rec.mutations.push(`${m.type} ${m.attributeName ?? ''} ${m.target.nodeName}`)
    })
    observer.observe(foot, { attributes: true, childList: true, subtree: true, characterData: true })
    rec.stop = () => observer.disconnect()
    const sample = () => {
      const buttons = [...foot.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect()
        const cs = getComputedStyle(b)
        return [b.textContent, b.disabled, cs.opacity, cs.backgroundColor, cs.color, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join('|')
      })
      const text = document.querySelector('.history-text').getBoundingClientRect()
      return [...buttons, `compare view ${Math.round(text.y)} ${Math.round(text.height)}`].join(' ; ')
    }
    const tick = () => {
      rec.frames.push(sample())
      if (!rec.done) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const versions = await page.locator('.history-item').count()
  // Each version, then the first one again (the dialog keeps the versions that it read).
  for (const i of [...Array(versions).keys(), 0]) {
    await page.locator('.history-item').nth(i).click()
    await page.waitForFunction(
      (n) => document.querySelectorAll('.history-item')[n].getAttribute('aria-current') === 'true' && document.querySelector('.history-preview[aria-busy="false"]'),
      i
    )
    await page.waitForTimeout(150)
  }
  const foot = await page.evaluate(() => {
    const r = window.__historyFoot
    r.done = true
    r.stop()
    return { mutations: r.mutations, states: [...new Set(r.frames)], frames: r.frames.length }
  })
  console.log('footer:', JSON.stringify({ versions, ...foot }))
  if (versions < 3) fail(`only ${versions} versions to go through`)
  if (foot.mutations.length) fail(`the buttons changed while the versions loaded: ${foot.mutations.join(', ')}`)
  if (foot.states.length !== 1) fail(`the buttons or the compare view moved or flashed: ${foot.states.join(' / ')}`)
  await shot('versions-buttons-still')
}
