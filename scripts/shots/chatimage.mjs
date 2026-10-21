// Images in the chat: add an image with the button and with a paste, take one out, send it. The AI
// gets the image (the scripted AI says how many images the main process read from the book), and it
// proposes the image as the portrait of the note that the message names. "Use as portrait" sets it;
// a rewind of the conversation puts the portrait from before back.
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
  const fail = (what) => {
    throw new Error(`Chat image scenario: ${what}`)
  }
  await openBook()
  await page.waitForTimeout(500)

  // A picture in a PNG file, drawn in the page: a portrait, taller than wide.
  const png = (w, h, hue) =>
    page.evaluate(
      ([w, h, hue]) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d')
        g.fillStyle = `hsl(${hue} 30% 70%)`
        g.fillRect(0, 0, w, h)
        g.fillStyle = `hsl(${hue} 35% 35%)`
        g.beginPath()
        g.arc(w / 2, h * 0.38, w * 0.22, 0, Math.PI * 2)
        g.fill()
        g.fillRect(w * 0.2, h * 0.65, w * 0.6, h * 0.35)
        return c.toDataURL('image/png').split(',')[1]
      },
      [w, h, hue]
    )
  const chips = () => page.locator('.composer-images .image-chip:not(.is-busy)').count()

  // 1. The button: a large image becomes small (the long side at most 1568 px).
  await page.locator('.composer input[type=file]').setInputFiles({ name: 'marta.png', mimeType: 'image/png', buffer: Buffer.from(await png(1800, 2400, 20), 'base64') })
  await page.waitForFunction(() => document.querySelector('.composer-images .image-chip img')?.complete, null, { timeout: 10000 })
  const first = await page.evaluate(() => {
    const img = document.querySelector('.composer-images .image-chip img')
    return { width: img.naturalWidth, height: img.naturalHeight }
  })
  if (Math.max(first.width, first.height) !== 1568) fail(`the image was not made small: ${first.width}×${first.height}`)

  // 2. A paste of an image.
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'colada.png', { type: 'image/png' }))
    const input = document.querySelector('.composer-input')
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, await png(300, 300, 200))
  await page.waitForFunction(() => document.querySelectorAll('.composer-images .image-chip img').length === 2, null, { timeout: 10000 })
  await shot('composer-images')

  // 3. Take the pasted image out.
  await page.locator('.composer-images .image-chip').nth(1).locator('button').click()
  if ((await chips()) !== 1) fail('the image did not go out of the message')

  // The image that went out was never sent: its file goes to the trash of the book.
  let trashed = []
  for (let i = 0; i < 50 && !trashed.length; i++) {
    await new Promise((r) => setTimeout(r, 100))
    trashed = (await readdir(join(book, '.wordelia', 'trash')).catch(() => [])).filter((f) => f.endsWith('.webp'))
  }
  if (trashed.length !== 1) fail('the image that went out of the message is not in the trash of the book')

  // The image is a file of the book, made small.
  const files = await readdir(join(book, 'planning', '_assets', 'chat'))
  if (files.length !== 1) fail(`the chat folder has ${files.length} images, not 1`)
  console.log(JSON.stringify({ files: files.length, first }))
  if (files.length < 1 || !files.every((f) => f.endsWith('.webp'))) fail(`the images are not in the book: ${files.join(', ')}`)

  // 4. Send it. The AI reads it, and proposes it as the portrait of Marta.
  await page.locator('.composer-input').fill('Esta é a Marta. Descreva ela.')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  await page.waitForSelector('.proposal.is-portrait img', { timeout: 10000 })
  const reply = await page.locator('.msg-ai').last().innerText()
  const sent = await page.locator('.msg-user .msg-images img').count()
  console.log(JSON.stringify({ reply: reply.slice(0, 60), sent }))
  if (!/Vejo 1 imagem/.test(reply)) fail(`the AI did not get the image: "${reply.slice(0, 80)}"`)
  if (sent !== 1) fail('the sent message does not show its image')
  await shot('portrait-proposal')

  // The reply opens the note of Marta by itself: the proposed portrait waits in the place of the portrait.
  const opened = await page.evaluate(() => {
    const b = window.__wordelia.book.getState()
    return { view: b.view, entry: b.entries.find((e) => e.id === b.activeEntryId)?.name ?? null }
  })
  console.log(JSON.stringify({ opened }))
  if (opened.view !== 'plan' || opened.entry !== 'Marta') fail(`the reply did not open the note of Marta: ${JSON.stringify(opened)}`)
  await page.waitForSelector('.entry-portrait.is-proposed img', { timeout: 5000 }).catch(() => fail('the note does not show the proposed portrait'))

  // 5. Use it as the portrait.
  const marta = () => page.evaluate(() => window.__wordelia.book.getState().entries.find((e) => e.name === 'Marta')?.image ?? null)
  const before = await marta()
  await page.locator('.proposal.is-portrait .proposal-btn.is-accept').click()
  await page.waitForTimeout(400)
  const set = await marta()
  console.log(JSON.stringify({ before, set }))
  if (!set?.startsWith('_assets/chat/')) fail(`Marta did not get the portrait: ${set}`)

  // The note of Marta shows the portrait as hers now; the cards of the Plan view show it too.
  await page.waitForSelector('.entry-portrait.is-proposed', { state: 'detached', timeout: 5000 }).catch(() => fail('the portrait stays a proposal after Use'))
  const inNote = await page.evaluate(() => document.querySelector('.entry-portrait img')?.getAttribute('src')?.startsWith('wordelia-asset://') ?? false)
  if (!inNote) fail('the note does not show the portrait')
  await page.evaluate(() => window.__wordelia.book.getState().selectCategory(null))
  await page.waitForTimeout(800)
  const shown = await page.evaluate(() => [...document.querySelectorAll('img')].some((i) => i.closest('[class*="card"]') && i.getAttribute('src')?.startsWith('wordelia-asset://')))
  if (!shown) fail('the Plan view does not show the portrait')
  await shot('plan-portrait')
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(600)

  // The portraits of the notes go with the next message: a sheet with all of them, and Marta larger.
  await page.locator('.composer-input').fill('Olhe os retratos das notas. Como é a Marta?')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.composer-send:not(.is-stop)', { timeout: 30000 })
  await page.waitForFunction(() => [...document.querySelectorAll('.msg-ai')].pop()?.innerText.includes('das notas'), null, { timeout: 10000 }).catch(() => {})
  const seenNotes = await page.locator('.msg-ai').last().innerText()
  console.log(JSON.stringify({ seenNotes: seenNotes.slice(0, 260) }))
  if (!/Vejo 2 imagem\(ns\) das notas/.test(seenNotes) || !/Portraits of the planning entries/.test(seenNotes) || !/entry "Marta"/.test(seenNotes))
    fail(`the AI did not get the portraits of the notes: "${seenNotes.slice(0, 200)}"`)

  // 6. A rewind of the conversation puts the portrait from before back.
  await page.locator('.msg-user-wrap').first().locator('.msg-rewind-btn').click()
  await page.waitForSelector('.rewind-changes', { timeout: 5000 })
  await page.locator('.dialog-foot .btn-ribbon').click()
  await page.waitForTimeout(600)
  const back = await marta()
  console.log(JSON.stringify({ back }))
  if (back !== before) fail(`the rewind did not put the portrait back: ${back}`)
}
