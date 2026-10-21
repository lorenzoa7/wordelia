// Import a DOCX, a TXT, a Markdown file, a folder of notes and an empty file. The files are made here.
// - DOCX in the Google Docs style (a blank paragraph after each paragraph, "* * *" between scenes): the blank
//   lines are spacing and the markers are scene breaks. The writer can see and change the choice.
// - TXT with "Capítulo Um / Capítulo Dois" and Markdown with "# Book title" and "## Capítulo N" split into chapters.
// - A chapter without a title in the file is named in the language of the book.
// - An empty file cannot be imported. The chapter list has numbers, and the AI choice shows in a 980 × 640 window.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph } from 'docx'

export default async function ({ app, page, shot, work }) {
  const fail = (msg) => {
    throw new Error(`Import scenario: ${msg}`)
  }
  const dir = join(work, 'files')
  await mkdir(dir, { recursive: true })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(980, 640))
  await page.waitForFunction(() => innerWidth < 1000)

  const open = async (path) => {
    await page.evaluate((p) => window.__wordelia.importFile(p), path)
    await page.waitForSelector('.import-summary', { timeout: 15000 })
  }
  const cancel = async () => {
    await page.locator('.dialog-foot .btn-ghost').click()
    await page.waitForSelector('.import-summary', { state: 'detached' })
  }
  const titles = () => page.locator('.import-ch-title').allInnerTexts()
  const summary = () => page.locator('.import-summary').innerText()

  // An empty file: nothing to import.
  const empty = join(dir, 'vazio.txt')
  await writeFile(empty, '\n\n')
  await open(empty)
  if (!(await page.locator('.import-empty').count())) fail('an empty file does not say that it has no text')
  if (!(await page.locator('.dialog-foot .btn-primary').isDisabled())) fail('the Import button is on for an empty file')
  await shot('empty')
  await cancel()

  // Plain text with chapter headings in words.
  const txt = join(dir, 'farol.txt')
  await writeFile(
    txt,
    'O Farol de Santa Ilha\n\nCapítulo Um\n\nElias acendeu a lâmpada do farol às seis em ponto, como fazia havia vinte e dois anos.\n* * *\nNão havia barco nenhum no mar.\n\nCapítulo Dois\n\nMarta chegou com a maré da manhã, e não disse o nome dela a ninguém.\n- Quem é você? - perguntou Elias.\n'
  )
  await open(txt)
  const txtTitles = await titles()
  console.log(JSON.stringify({ txt: txtTitles, summary: await summary() }))
  if (txtTitles.join('|') !== 'Capítulo Um|Capítulo Dois') fail(`the TXT gives ${txtTitles.join(' / ')}`)
  if ((await page.locator('.import-ch-num').allInnerTexts()).join() !== '1,2') fail('the chapters have no numbers')
  await cancel()

  // Markdown: "# Book title", then "## Capítulo N". The first chapter has only a number: it gets a name in the book language.
  const md = join(dir, 'farol.md')
  await writeFile(md, '# O Farol de Santa Ilha\n\n## 1\n\nElias acendeu a lâmpada do farol, e não havia barco nenhum no mar.\n\n#\n\nA noite caiu sobre a ilha.\n\n## Capítulo 2: O Visitante\n\nMarta chegou com a maré da manhã. Ela não disse o nome dela.\n')
  await open(md)
  const language = async (name, first) => {
    await page.locator('.import-fields .select').first().click()
    await page.locator('.select-content .menu-item', { hasText: name }).click()
    await page.waitForFunction((f) => document.querySelector('.import-ch-title.is-fallback')?.textContent === f, first)
  }
  // The name follows the language of the book.
  await language('Português (Brasil)', 'Capítulo Um')
  const mdTitles = await titles()
  const bookTitle = await page.locator('.import-fields input').first().inputValue()
  console.log(JSON.stringify({ md: mdTitles, bookTitle, summary: await summary() }))
  if (bookTitle !== 'O Farol de Santa Ilha') fail(`the Markdown book title is "${bookTitle}"`)
  if (mdTitles.join('|') !== 'Capítulo Um|O Visitante') fail(`the Markdown gives ${mdTitles.join(' / ')}`)
  await language('English (US)', 'Chapter One')
  await cancel()

  // A folder of notes: one chapter for each file.
  const notes = join(dir, 'Notas')
  await mkdir(notes)
  await writeFile(join(notes, '1 Começo.md'), '# O começo\n\nElias acendeu o farol.\n')
  await writeFile(join(notes, '2 Meio.md'), 'Marta chegou.\n')
  await open(notes)
  const folderTitles = await titles()
  if (folderTitles.join('|') !== 'O começo|2 Meio') fail(`the folder gives ${folderTitles.join(' / ')}`)
  await cancel()

  // DOCX in the Google Docs style.
  const p = (text) => new Paragraph(text)
  const blank = () => new Paragraph('')
  const marker = () => new Paragraph({ text: '* * *', alignment: AlignmentType.CENTER })
  const scene = (lines) => lines.flatMap((l) => [p(l), blank()])
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'O Farol de Santa Ilha', heading: HeadingLevel.TITLE }),
          p('Ana Exemplo'),
          new Paragraph({ text: 'Capítulo 1: A Tempestade', heading: HeadingLevel.HEADING_1 }),
          ...scene(['Elias acendeu a lâmpada do farol às seis em ponto.', 'Lá fora, o mar estava agitado.', 'Ele contou os barcos do porto, um por um.']),
          marker(),
          blank(),
          ...scene(['A tempestade chegou depois da meia-noite.', 'O vento entrava pelas frestas da janela.']),
          new Paragraph({ text: 'Capítulo 2: O Visitante', heading: HeadingLevel.HEADING_1 }),
          ...scene(['Marta chegou com a maré da manhã.', 'Ela não disse o nome dela a ninguém.', 'Elias ofereceu café.']),
          marker(),
          ...scene(['Na outra noite, a luz do farol apagou sozinha.', 'Ninguém subiu a escada.'])
        ]
      }
    ]
  })
  const docx = join(dir, 'O Farol.docx')
  await writeFile(docx, await Packer.toBuffer(doc))
  await open(docx)
  await page.waitForTimeout(300)
  const before = await summary()
  const choice = await page.locator('.import-blank-lines').innerText()
  console.log(JSON.stringify({ docx: await titles(), summary: before, blankLines: choice }))
  if (!/2 chapters/.test(before) || !/2 scene breaks/.test(before)) fail(`the DOCX preview says "${before}"`)
  if (choice !== 'Just spacing') fail(`the blank lines are "${choice}"`)
  // The AI choice is in view without a scroll, and it names the AI.
  const ai = await page.evaluate(() => {
    const body = document.querySelector('.dialog-body').getBoundingClientRect()
    const sw = document.querySelector('.dialog-body .switch').getBoundingClientRect()
    return { visible: sw.bottom <= body.bottom && sw.top >= body.top, note: document.querySelector('.import-note').textContent }
  })
  if (!ai.visible) fail('the AI choice is below the fold at 980 × 640')
  if (!ai.note.includes('Claude Code')) fail(`the AI note does not name the AI: ${ai.note}`)
  await shot('docx')
  // The writer reads the blank lines as scene breaks: the count changes; then back.
  await page.locator('.import-blank-lines').click()
  await page.locator('.select-content .menu-item', { hasText: 'Scene breaks' }).click()
  await page.waitForFunction((b) => document.querySelector('.import-summary').textContent !== b, before)
  const breaks = await summary()
  console.log(JSON.stringify({ asBreaks: breaks }))
  if (!/\d+ scene breaks/.test(breaks) || breaks === before) fail(`blank lines as scene breaks: "${breaks}"`)
  await shot('docx-blank-lines-breaks')
  await page.locator('.import-blank-lines').click()
  await page.locator('.select-content .menu-item', { hasText: 'Just spacing' }).click()
  await page.waitForFunction((b) => document.querySelector('.import-summary').textContent === b, before)
  // No planning sync in this test.
  await page.locator('.dialog-body .switch').click()
  await page.locator('.dialog-foot .btn-primary').click()
  await page.waitForSelector('.manuscript', { timeout: 15000 })
  const bodies = await page.evaluate(() => window.__wordelia.book.getState().chapters.map((c) => ({ title: c.title, body: c.body })))
  console.log(JSON.stringify(bodies.map((b) => ({ title: b.title, breaks: b.body.split('\n').filter((l) => l === '* * *').length }))))
  if (bodies.map((b) => b.title).join('|') !== 'A Tempestade|O Visitante') fail(`the chapters are ${bodies.map((b) => b.title).join(' / ')}`)
  for (const b of bodies) {
    if (b.body.includes('\\*')) fail(`a marker stayed as text in "${b.title}"`)
    if (b.body.split('\n').filter((l) => l === '* * *').length !== 1) fail(`"${b.title}" does not have one scene break`)
  }
  await page.waitForTimeout(400)
  await shot('imported')
}
