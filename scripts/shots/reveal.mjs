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
}
