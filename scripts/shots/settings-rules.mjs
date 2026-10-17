// The writing rules in Settings: the link in the Actions tab opens them, and the editor saves
// them to ai/writing-rules.md of the book.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async function ({ page, shot, openBook, book }) {
  await openBook()
  await page.keyboard.press('Control+,')
  await page.waitForTimeout(600)
  await page.getByRole('tab', { name: 'Actions', exact: true }).click()
  await page.waitForTimeout(400)
  await page.locator('.action-form .link-btn', { hasText: 'writing rules' }).click()
  await page.waitForTimeout(600)
  const active = (await page.locator('.settings-tab[data-state="active"]').innerText()).trim()
  await shot('rules')
  const editor = page.locator('.rules-editor .ProseMirror')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Never use the word suddenly.')
  await page.waitForTimeout(400)
  await shot('typed')
  // Closing the dialog saves the text that is still in the editor.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1500)
  const file = await readFile(join(book, 'ai', 'writing-rules.md'), 'utf8')
  console.log(JSON.stringify({ active, saved: file.includes('Never use the word suddenly.') }))
  if (active !== 'Writing rules') throw new Error(`The link opened "${active}"`)
  if (!file.includes('Never use the word suddenly.')) throw new Error('The writing rules were not saved')
}
