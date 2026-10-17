// Paste Markdown text into the writing rules and print what the file gets.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
  await openBook()
  await page.locator('.titlebar-book').click()
  await page.locator('[role="menuitem"]', { hasText: 'Writing rules' }).click()
  await page.waitForTimeout(600)
  const editor = page.locator('.note-editor .ProseMirror, .rules-editor .ProseMirror, .ProseMirror').last()
  await editor.click()
  await page.keyboard.press('Control+a')
  const md = '# Regras\n\n## Princípios\n- Preserve o sentido.\n- Na dúvida, mantenha.\n\n## Prosa\n1. Use palavras concretas.\n2. Corte o óbvio.\n'
  await editor.evaluate((el, text) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', text)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, md)
  await page.waitForTimeout(1500)
  await shot('pasted')
  console.log(await readFile(join(book, 'ai', 'writing-rules.md'), 'utf8'))
}
