// Paste Google Docs HTML: bold and italic stay; fonts, colors, a justified alignment and images go.
// Paste plain text: it gets the quotes, the dash and the ellipsis of the book; "***" becomes a scene
// break; empty lines go.
export default async function ({ page, openBook }) {
  await openBook()
  const paste = (data) =>
    page.evaluate((d) => {
      const dt = new DataTransfer()
      for (const [type, value] of Object.entries(d)) dt.setData(type, value)
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
      // The editor with the cursor.
      document.activeElement.closest('.manuscript').dispatchEvent(ev)
    }, data)
  await page.locator('.manuscript').first().locator('p').last().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  const html =
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.5;text-align: justify;"><span style="font-size:12pt;font-family:\'Times New Roman\';color:#000000;">Texto colado </span><span style="font-size:12pt;font-family:\'Times New Roman\';font-style:italic;">em itálico</span><span style="font-size:12pt;font-family:\'Times New Roman\';font-weight:700;"> e negrito</span></p><br><p dir="ltr" style="text-align: justify;"><span style="font-size:12pt;">***</span></p><p dir="ltr" style="text-align: justify;"><img src="https://example.com/x.png" width="200" height="100"></p><p dir="ltr" style="text-align: justify;"><span style="font-size:12pt;">Depois da quebra.</span></p></b>'
  await paste({ 'text/html': html, 'text/plain': 'Texto colado em itálico e negrito\n\n***\n\nDepois da quebra.' })
  await page.waitForTimeout(800)
  const docs = await page.evaluate(() => JSON.stringify(window.__wordelia.editor().getJSON().content.slice(-4)))
  console.log(docs)
  if (/Times|"fontSize":"\d|"fontFamily":"\w/.test(docs)) throw new Error('Fonts were pasted')
  if (!docs.includes('italic') || !docs.includes('bold')) throw new Error('Marks were lost')
  if (/"textAlign":"justify"/.test(docs)) throw new Error('A fixed alignment was pasted')
  if (/"type":"image"/.test(docs)) throw new Error('An image was pasted')
  if (!docs.includes('"type":"sceneBreak"')) throw new Error('"***" did not become a scene break')
  if (/"type":"paragraph"(,"attrs":\{[^}]*\})?\}/.test(docs)) throw new Error('An empty line was pasted')

  // Plain text, as from a text editor.
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await paste({ 'text/plain': '"Quem?" -- perguntou ela... \'Nada\'.\n\n\n* * *\n\nOutra cena.' })
  await page.waitForTimeout(600)
  const plain = await page.evaluate(() => {
    const blocks = window.__wordelia.editor().getJSON().content.slice(-3)
    return blocks.map((b) => (b.type === 'paragraph' ? (b.content ?? []).map((n) => n.text ?? '').join('') : `[${b.type}]`))
  })
  console.log(JSON.stringify(plain))
  if (plain[0] !== '“Quem?” — perguntou ela… ‘Nada’.' || plain[1] !== '[sceneBreak]' || plain[2] !== 'Outra cena.') throw new Error('Plain text did not get the book typography')
}
