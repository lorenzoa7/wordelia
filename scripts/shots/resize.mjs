export default async function ({ page, shot, openBook }) {
  await openBook()
  const box = await page.locator('.chat-resizer').boundingBox()
  await page.mouse.move(box.x + 3, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x - 150, box.y + 300, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const w = await page.locator('.book-chat').evaluate((el) => el.getBoundingClientRect().width)
  console.log('chat width', Math.round(w))
  if (w < 500) throw new Error('Resize did not work')
  await shot('wide-chat')
}
