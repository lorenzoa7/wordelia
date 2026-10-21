// A chat proposal for a planning note shows in the note as a diff, with Accept and Reject.
// A note with a list shows its diff too, a new reply opens its note, a proposed portrait waits in the
// place of the portrait, and a click on the portrait shows the whole image.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
  const fail = (what) => {
    throw new Error(`Note diff scenario: ${what}`)
  }
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
  if (!after.body || after.state !== 'accepted' || after.left !== 0 || !after.shown) fail('Accept in the note did not apply the change')

  // ---- A note with a list, and a portrait ----
  // An image of the chat, in the book.
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 600
    c.height = 900
    const g = c.getContext('2d')
    g.fillStyle = 'hsl(30 30% 70%)'
    g.fillRect(0, 0, 600, 900)
    g.fillStyle = 'hsl(30 35% 35%)'
    g.beginPath()
    g.arc(300, 340, 130, 0, Math.PI * 2)
    g.fill()
    g.fillRect(120, 600, 360, 300)
    return c.toDataURL('image/png').split(',')[1]
  })
  await mkdir(join(book, 'planning', '_assets', 'chat'), { recursive: true })
  await writeFile(join(book, 'planning', '_assets', 'chat', 'nd-marta.png'), Buffer.from(png, 'base64'))

  // Marta has notes in a list. The author is in the manuscript, in a new conversation.
  const marta = await page.evaluate(() => {
    const book = window.__wordelia.book.getState()
    const e = book.entries.find((x) => x.name === 'Marta')
    book.updateEntry(e.id, { body: '- Nasceu em Santa Ilha.\n- Usa um chapéu de couro.\n- Leva uma lanterna.\n' })
    book.selectChapter(book.chapters[0].id)
    const now = new Date().toISOString()
    book.saveThread({ id: 'th_list', title: 'List test', brief: '', digest: '', digestedCount: 0, createdAt: now, updatedAt: now, pinned: false, route: null,
      messages: [{ id: 'lu', role: 'user', content: 'Esta é a Marta.', createdAt: now }] })
    window.__inline.useChat.getState().setActiveThread('th_list')
    return { id: e.id, file: e.file }
  })
  await page.waitForTimeout(300)
  // The reply comes: a portrait and two changes to the list.
  await page.evaluate((m) => {
    const book = window.__wordelia.book.getState()
    const th = book.threads.find((t) => t.id === 'th_list')
    const now = new Date().toISOString()
    const content = [
      'Esta proposta usa a imagem como retrato:',
      `<portrait file="planning/${m.file}">_assets/chat/nd-marta.png</portrait>`,
      `<edit file="planning/${m.file}">`,
      '<find>- Nasceu em Santa Ilha.</find>',
      '<replace>- Nome completo: Marta Vieira.\n- Nasceu em Santa Ilha.</replace>',
      '<find>- Usa um chapéu de couro.\n- Leva uma lanterna.</find>',
      '<replace>- Usa um chapéu de couro gasto.\n- Leva uma lanterna de ferro.\n- Tem um lenço vermelho.</replace>',
      '</edit>'
    ].join('\n')
    book.saveThread({ ...th, updatedAt: now, messages: [...th.messages, { id: 'la', role: 'assistant', content, createdAt: now }] })
  }, marta)

  // The reply opens the note of Marta by itself.
  await page.waitForFunction((id) => window.__wordelia.book.getState().activeEntryId === id, marta.id, { timeout: 5000 }).catch(() => fail('the new reply did not open the note'))
  await page.waitForFunction(() => document.querySelectorAll('.entry-body .pm-prop-actions').length === 2, null, { timeout: 5000 }).catch(async () =>
    fail(`the list changes do not show in the note (${await page.locator('.entry-body .pm-prop-actions').count()} of 2)`)
  )
  await page.waitForSelector('.entry-portrait.is-proposed img', { timeout: 5000 }).catch(() => fail('the proposed portrait does not show in the note'))
  const diff = await page.evaluate(() => ({
    ins: [...document.querySelectorAll('.entry-body .ai-ins')].map((x) => x.textContent).join(' | '),
    del: document.querySelectorAll('.entry-body .ai-del').length
  }))
  console.log('list diff:', JSON.stringify(diff))
  if (!diff.ins.includes('Marta Vieira') || !diff.ins.includes('lenço vermelho')) fail(`the new words do not show: ${diff.ins}`)
  // The page comes in with a short motion: wait for it.
  await page.waitForTimeout(500)
  await shot('note-list-diff')

  // A click on the proposed portrait shows the whole image.
  await page.locator('.entry-portrait-img').click()
  await page.waitForSelector('.image-dialog .image-dialog-img', { timeout: 5000 }).catch(() => fail('the portrait does not open in the viewer'))
  const whole = await page.evaluate(() => {
    const img = document.querySelector('.image-dialog .image-dialog-img')
    return { w: img.naturalWidth, h: img.naturalHeight, shownH: img.getBoundingClientRect().height, shownW: img.getBoundingClientRect().width }
  })
  console.log('viewer:', JSON.stringify(whole))
  // Not square: the image keeps its shape.
  if (whole.h !== 900 || Math.abs(whole.shownW / whole.shownH - 600 / 900) > 0.02) fail('the viewer does not show the whole image')
  await shot('portrait-viewer')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.image-dialog', { state: 'detached', timeout: 5000 })

  // Use the portrait, and accept the first change of the list.
  await page.locator('.entry-portrait-decide .pm-prop-btn.is-accept').click()
  await page.waitForSelector('.entry-portrait.is-proposed', { state: 'detached', timeout: 5000 }).catch(() => fail('the proposed portrait stays after Use'))
  await page.locator('.entry-body .pm-prop-btn.is-accept').first().click()
  await page.waitForFunction(() => document.querySelectorAll('.entry-body .pm-prop-actions').length === 1, null, { timeout: 5000 })
  const used = await page.evaluate((m) => {
    const book = window.__wordelia.book.getState()
    const e = book.entries.find((x) => x.id === m.id)
    return { image: e.image, body: e.body, hunks: book.threads.find((t) => t.id === 'th_list').messages[1].hunks }
  }, marta)
  console.log('after Use:', JSON.stringify(used))
  if (used.image !== '_assets/chat/nd-marta.png') fail('Use did not set the portrait')
  if (!used.body.includes('Marta Vieira') || used.hunks?.['0:0'] !== 'accepted' || used.hunks?.['1:0'] !== 'accepted') fail('the list change was not applied')

  // The portrait of the note: a click shows it whole, and "Change" is a button of its own.
  const change = await page.locator('.entry-portrait-hint').getAttribute('aria-label')
  if (!change) fail('the portrait has no button to change the image')
  await page.locator('.entry-portrait-img').click()
  await page.waitForSelector('.image-dialog .image-dialog-img', { timeout: 5000 }).catch(() => fail('the portrait of the note does not open in the viewer'))
  await page.keyboard.press('Escape')
  await page.waitForSelector('.image-dialog', { state: 'detached', timeout: 5000 })
  await page.locator('.entry-portrait').hover()
  await page.waitForTimeout(200)
  await shot('portrait-hover')
}
