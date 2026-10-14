// Paste Google Docs HTML: bold and italic stay, fonts and colors go.
export default async function ({ page, openBook }) {
  await openBook()
  await page.locator('.manuscript p').last().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  const html = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.5;text-align: justify;"><span style="font-size:12pt;font-family:\'Times New Roman\';color:#000000;">Texto colado </span><span style="font-size:12pt;font-family:\'Times New Roman\';font-style:italic;">em itálico</span><span style="font-size:12pt;font-family:\'Times New Roman\';font-weight:700;"> e negrito</span></p></b>'
  await page.evaluate((h) => {
    const dt = new DataTransfer()
    dt.setData('text/html', h)
    dt.setData('text/plain', 'Texto colado em itálico e negrito')
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    document.querySelector('.manuscript').dispatchEvent(ev)
  }, html)
  await page.waitForTimeout(800)
  const md = await page.evaluate(() => {
    const ed = window.__wordelia.editor()
    return JSON.stringify(ed.getJSON().content.slice(-1))
  })
  console.log(md)
  if (/Times|"fontSize":"\d|"fontFamily":"\w/.test(md)) throw new Error('Fonts were pasted')
  if (!md.includes('italic') || !md.includes('bold')) throw new Error('Marks were lost')
}
