// A chat proposal for a planning note shows in the note as a diff, with Accept and Reject.
export default async function ({ page, shot, openBook }) {
  await openBook()
  await page.waitForTimeout(600)
  const setup = await page.evaluate(() => {
    const book = window.__wordelia.book.getState()
    const entry = book.entries.find((e) => e.body.trim().length > 40)
    const line = entry.body.split('\n').find((l) => l.trim().length > 30 && !l.startsWith('#'))
    const find = line.trim().split(' ').slice(0, 5).join(' ')
    const now = new Date().toISOString()
    const content = `A small change.\n\n<edit file="planning/${entry.file}">\n<find>${find}</find>\n<replace>${find} (mudado)</replace>\n</edit>`
    book.saveThread({ id: 'th_note', title: 'Note test', brief: '', digest: '', digestedCount: 0, createdAt: now, updatedAt: now, pinned: false, route: null,
      messages: [{ id: 'mu', role: 'user', content: 'Change the note.', createdAt: now }, { id: 'ma', role: 'assistant', content, createdAt: now }] })
    window.__inline.useChat.getState().setActiveThread('th_note')
    book.selectEntry(entry.id)
    return { id: entry.id, find }
  })
  await page.waitForSelector('.entry-body .pm-prop-actions', { timeout: 5000 })
  await shot('note-diff')
  await page.locator('.entry-body .pm-prop-btn.is-accept').click()
  await page.waitForTimeout(700)
  const after = await page.evaluate((s) => {
    const book = window.__wordelia.book.getState()
    return {
      body: book.entries.find((e) => e.id === s.id).body.includes(`${s.find} (mudado)`),
      state: book.threads.find((t) => t.id === 'th_note').messages[1].hunks?.['0:0'],
      left: document.querySelectorAll('.entry-body .pm-prop-actions').length,
      shown: document.querySelector('.entry-body .note-text')?.textContent.includes('(mudado)')
    }
  }, setup)
  console.log('after Accept:', JSON.stringify(after))
  if (!after.body || after.state !== 'accepted' || after.left !== 0 || !after.shown) throw new Error('Accept in the note did not apply the change')
}
