// Chat proposals in the text: a pending change shows in its chapter without a click, "Show in text"
// scrolls to it from where the user is, and Accept or Reject in the text decide it.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(800)
  const FIND = 'O homem do bote azul dormiu por dois dias.'
  const REPLACE = 'O homem do bote azul dormiu dois dias inteiros.'
  const FIND2 = 'Elias tirou o chapéu molhado'
  const REPLACE2 = 'Elias tirou o chapéu encharcado'
  const ids = await page.evaluate(
    ({ FIND, REPLACE, FIND2, REPLACE2 }) => {
      const book = window.__wordelia.book.getState()
      const ch = book.chapters[1]
      const now = new Date().toISOString()
      const content = `Two small changes.\n\n<edit file="manuscript/${ch.file}">\n<find>${FIND}</find>\n<replace>${REPLACE}</replace>\n<find>${FIND2}</find>\n<replace>${REPLACE2}</replace>\n</edit>`
      const thread = { id: 'th_reveal', title: 'Reveal test', brief: '', digest: '', digestedCount: 0, createdAt: now, updatedAt: now, pinned: false, route: null,
        messages: [
          { id: 'm_user', role: 'user', content: 'Tighten chapter two.', createdAt: now },
          { id: 'm_ai', role: 'assistant', content, createdAt: now }
        ] }
      book.saveThread(thread)
      window.__inline.useChat.getState().setActiveThread('th_reveal')
      return { chapterId: ch.id }
    },
    { FIND, REPLACE, FIND2, REPLACE2 }
  )
  await page.waitForTimeout(900)
  const shown = await page.evaluate((id) => {
    const sheet = document.querySelector(`.page[data-chapter="${id}"]`)
    return { props: sheet?.querySelectorAll('.pm-prop-actions').length ?? 0, list: window.__inline.useInlineProposals.getState().list.length }
  }, ids.chapterId)
  console.log('shown without a click:', JSON.stringify(shown))
  if (shown.props !== 2) throw new Error('The pending proposals do not show in the text')

  // From another page (Plan), a click on the name of the proposal opens the chapter at the change.
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(500)
  await page.locator('.proposal .proposal-file').first().click()
  const inView = await page
    .waitForFunction(
      () => {
        const desk = document.querySelector('.desk')
        const mark = document.querySelector('.pm-prop[data-prop="th_reveal:m_ai:0:0"]')
        if (!desk || !mark) return false
        const d = desk.getBoundingClientRect()
        const r = mark.getBoundingClientRect()
        return r.top >= d.top && r.bottom <= d.bottom
      },
      null,
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false)
  const view = await page.evaluate(() => window.__wordelia.book.getState().view)
  console.log('from Plan:', JSON.stringify({ view, inView }))
  if (view !== 'write' || !inView) throw new Error('A click on the proposal from Plan did not open the change')

  // "Show in text" from the top of the book: the scroll only goes down, never to the chapter top first.
  await page.evaluate(() => document.querySelector('.desk').scrollTo({ top: 0 }))
  await page.waitForTimeout(300)
  const path = await page.evaluate(
    async ({ chapterId, FIND }) => {
      const desk = document.querySelector('.desk')
      const tops = []
      const on = () => tops.push(Math.round(desk.scrollTop))
      desk.addEventListener('scroll', on)
      window.__inline.revealProposal(chapterId, FIND, 'th_reveal:m_ai:0:0')
      await new Promise((r) => setTimeout(r, 300))
      window.__inline.revealProposal(chapterId, FIND, 'th_reveal:m_ai:0:0')
      await new Promise((r) => setTimeout(r, 1200))
      desk.removeEventListener('scroll', on)
      return tops
    },
    { chapterId: ids.chapterId, FIND }
  )
  const backwards = path.some((v, i) => i > 0 && v < path[i - 1] - 2)
  console.log('scroll path:', path.length, 'steps, from', path[0], 'to', path[path.length - 1], backwards ? '(went back)' : '(only down)')
  if (backwards) throw new Error('"Show in text" scrolled back before it reached the change')
  await shot('shown')
  const states = await page.evaluate(() => window.__wordelia.book.getState().threads.find((t) => t.id === 'th_reveal').messages[1].hunks ?? {})
  console.log('states after two reveals:', JSON.stringify(states))
  if (Object.keys(states).length) throw new Error('A reveal decided the proposal')

  // Accept the first change in the text, reject the second.
  await page.locator('.pm-prop-btn.is-accept').first().click()
  await page.waitForTimeout(500)
  await page.locator('.pm-prop-btn.is-reject').first().click()
  await page.waitForTimeout(500)
  const after = await page.evaluate((id) => {
    const t = window.__wordelia.book.getState().threads.find((x) => x.id === 'th_reveal')
    const body = window.__wordelia.book.getState().chapters.find((c) => c.id === id).body
    return { hunks: t.messages[1].hunks, accepted: body.includes('dois dias inteiros'), rejectedKept: body.includes('chapéu molhado'), left: document.querySelectorAll('.pm-prop-actions').length }
  }, ids.chapterId)
  console.log('after decisions:', JSON.stringify(after))
  if (after.hunks?.['0:0'] !== 'accepted' || after.hunks?.['0:1'] !== 'rejected' || !after.accepted || !after.rejectedKept || after.left !== 0) {
    throw new Error('Accept or Reject in the text did not work')
  }
  await shot('decided')

  // Ctrl+Z with the focus outside the text: the accepted change goes back, and the proposal shows again.
  await page.evaluate(() => document.activeElement?.blur())
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(700)
  const undone = await page.evaluate((id) => {
    const t = window.__wordelia.book.getState().threads.find((x) => x.id === 'th_reveal')
    const sheet = document.querySelector(`.page[data-chapter="${id}"]`)
    return { state: t.messages[1].hunks['0:0'], shown: sheet.querySelectorAll('.pm-prop-actions').length, text: sheet.querySelector('.manuscript').innerText.includes('por dois dias') }
  }, ids.chapterId)
  console.log('after Ctrl+Z:', JSON.stringify(undone))
  if (undone.state !== 'pending' || undone.shown !== 1 || !undone.text) throw new Error('Ctrl+Z did not bring the proposal back')
  await shot('undone')
  await page.keyboard.press('Control+y')
  await page.waitForTimeout(700)
  const redone = await page.evaluate(() => window.__wordelia.book.getState().threads.find((x) => x.id === 'th_reveal').messages[1].hunks['0:0'])
  console.log('after Ctrl+Y:', redone)
  if (redone !== 'accepted') throw new Error('Ctrl+Y did not apply the change again')

  // A new reply with a proposal in the same thread: the text scrolls to it by itself, when the author
  // does not type. Ctrl+Y put the focus in the text: the author leaves it, and the last key is old.
  await page.evaluate(() => document.activeElement?.blur())
  await page.waitForFunction(() => !window.__inline.authorIsBusy(), null, { timeout: 8000 })
  await page.evaluate(() => document.querySelector('.desk').scrollTo({ top: 0 }))
  await page.waitForTimeout(400)
  await page.evaluate((id) => {
    const book = window.__wordelia.book.getState()
    const ch = book.chapters.find((c) => c.id === id)
    const t = book.threads.find((x) => x.id === 'th_reveal')
    const now = new Date().toISOString()
    const content = `One more.

<edit file="manuscript/${ch.file}">
<find>um anel de prata</find>
<replace>um anel de prata antiga</replace>
</edit>`
    book.saveThread({ ...t, updatedAt: now, messages: [...t.messages, { id: 'm_u2', role: 'user', content: 'More?', createdAt: now }, { id: 'm_ai2', role: 'assistant', content, createdAt: now }] })
  }, ids.chapterId)
  // Poll: on a busy machine the scroll and the short highlight can come late.
  const auto = await page.evaluate(async () => {
    let focus = false
    let top = 0
    for (let i = 0; i < 50 && !(focus && top >= 200); i++) {
      await new Promise((r) => setTimeout(r, 100))
      focus = focus || !!document.querySelector('.pm-prop.is-focus')
      top = Math.round(document.querySelector('.desk').scrollTop)
    }
    return { top, focus }
  })
  console.log('new proposal:', JSON.stringify(auto))
  if (auto.top < 200 || !auto.focus) throw new Error('A new proposal did not show in the text by itself')
  await shot('auto-reveal')
}
