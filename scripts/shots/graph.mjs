// The planning map: "Cards | Map" on the overview, the graph of the sample book, back links,
// a richer book (search, hover, filters, chapters, drag, zoom) and the empty states.
// Run with --en (and --dark). I18N_LANG=pt-BR (or es) shows the map in another interface language. The richer book is made here, in the work folder, with generic names.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CHARACTERS = [
  ['Ada Vance', ['Ada'], 'Harbor pilot. She knows every current of the bay.'],
  ['Bruno Hale', ['Bruno'], 'Fisherman. Owes money to the Guild.'],
  ['Clara Moss', ['Clara'], 'Keeps the Archive. Reads old letters at night.'],
  ['Dario Fenn', ['Dario'], 'Smuggler with a kind face.'],
  ['Elena Brook', ['Elena'], 'Mayor of the town. Wants the Festival to be perfect.'],
  ['Felix Stone', ['Felix'], 'Young clerk of the Guild.'],
  ['Greta Lane', ['Greta'], 'Owner of the Willow Inn.'],
  ['Hugo Marsh', ['Hugo'], 'Retired captain of the missing ship.'],
  ['Iris Vale', ['Iris'], 'A stranger who arrives after the Flood.'],
  ['Jonas Reed', ['Jonas'], 'Bell ringer of the North Tower.'],
  ['Kira Wolfe', ['Kira'], 'Judge at the Trial.'],
  ['Leo Hart', ['Leo'], 'Child who finds the Letter.'],
  ['Mila Frost', ['Mila'], 'Healer. Grows herbs behind Cedar Hall.'],
  ['Nico Bell', ['Nico'], 'Merchant of the Grey Market.'],
  ['Pavel Dune', [], 'A name on an old list. Nobody remembers him.']
]
const PLACES = [
  ['Old Harbor', ['the harbor'], 'Boats, ropes and the smell of salt.'],
  ['North Tower', ['the tower'], 'The bell rings at six.'],
  ['Grey Market', ['the market'], 'Stalls under canvas.'],
  ['Salt Road', [], 'The only road out of town.'],
  ['Willow Inn', ['the inn'], 'Warm soup and old gossip.'],
  ['Iron Bridge', [], 'It shakes when carts cross it.'],
  ['The Archive', ['Archive'], 'Shelves of town records.'],
  ['Cedar Hall', [], 'Where the town meets.']
]
const WORLD = [
  ['The Guild', ['Guild'], 'The traders of the town.'],
  ['Tide Calendar', [], 'The town counts days by the tides.'],
  ['Lantern Oath', [], 'A promise made with a lit lantern.'],
  ['Silver Coin', [], 'A coin with a hole in the middle.']
]
const PLOT = [
  ['The Missing Ship', ['the ship'], 'A ship left and never came back.'],
  ['The Trial', [], 'Somebody must answer for the ship.'],
  ['The Flood', [], 'The river rises in the third week.'],
  ['The Letter', [], 'A letter with a broken seal.'],
  ['The Festival', ['Festival'], 'Lanterns on the water.']
]
const NOTES = [
  ['Open questions', [], 'Things to decide.'],
  ['Themes', [], 'Debt, memory, the sea.']
]

// Who mentions whom (by name, alias or [[link]]). Entries that are not here have no links.
const MENTIONS = {
  'Ada Vance': 'Ada works in the harbor with Bruno. She saw the ship leave. [[Hugo Marsh]] taught her. She often eats at the inn with Greta.',
  'Bruno Hale': 'Bruno owes the Guild. He sells fish at the market to Nico. Dario offers him work.',
  'Clara Moss': 'Clara found [[The Letter]] in the Archive. She tells Leo about the Lantern Oath.',
  'Dario Fenn': 'Dario uses the Salt Road at night and hides boxes under the Iron Bridge. He knows what happened to the ship.',
  'Elena Brook': 'Elena runs Cedar Hall and plans the Festival. She fears the Trial. Kira is her old friend.',
  'Felix Stone': 'Felix keeps the books of the Guild. He counts the debt of Bruno.',
  'Greta Lane': 'Greta runs the Willow Inn. Iris stays there after the Flood.',
  'Hugo Marsh': 'Hugo was the captain of The Missing Ship. Ada visits him. He stands before Kira at The Trial.',
  'Iris Vale': 'Iris came on the Salt Road after The Flood. She asks Clara about the Archive.',
  'Jonas Reed': 'Jonas rings the bell of the tower. From the tower he saw the ship and Dario.',
  'Kira Wolfe': 'Kira leads The Trial in Cedar Hall.',
  'Leo Hart': 'Leo found The Letter near the Iron Bridge and gave it to Clara.',
  'Mila Frost': 'Mila heals Hugo. She grows herbs behind Cedar Hall.',
  'Nico Bell': 'Nico trades at the Grey Market and pays the Guild.',
  'Old Harbor': 'The ship left from here. Ada and Bruno work here.',
  'The Guild': 'Felix keeps its books. Bruno and Nico owe it money. The Guild uses the Tide Calendar.',
  'The Missing Ship': 'Hugo was the captain. Dario knows the truth. It leads to The Trial.',
  'The Trial': 'Kira judges Hugo. Elena watches.',
  'The Flood': 'The flood closes the Salt Road and brings Iris.',
  'The Letter': 'Written by Hugo. Found by Leo. Kept by Clara. It speaks of the Lantern Oath.',
  'The Festival': 'Elena plans it on the water of the harbor, under the Tide Calendar.',
  'Open questions': 'Does Dario tell the truth at The Trial? What is in [[The Letter]]?'
}

function entryFile(id, aliases, summary, body) {
  const a = aliases.length ? `[${aliases.join(', ')}]` : '[]'
  return `---\nid: ${id}\naliases: ${a}\nsummary: ${summary}\n---\n${body}\n`
}

async function makeRichBook(work, fixture) {
  const dir = join(work, 'books', 'The Map Demo')
  const manifest = JSON.parse(await readFile(join(fixture, 'wordelia.json'), 'utf8'))
  manifest.id = 'bk_map_demo'
  manifest.title = 'The Map Demo'
  const chapters = [
    ['ch_map01', 'The Harbor', 'Ada walked along the harbor. Bruno waved from his boat. Far away, the tower rang six.'],
    ['ch_map02', 'The Letter', 'Leo ran across the Iron Bridge with the letter. Clara read it twice. It named Hugo Marsh.'],
    ['ch_map03', 'High Water', 'The Flood came at night. Greta opened the inn to everybody. A stranger, Iris, knocked at the door.']
  ]
  manifest.chapters = chapters.map(([id, title]) => ({ id, file: `${title}.md` }))
  await mkdir(join(dir, 'manuscript'), { recursive: true })
  for (const [id, title, text] of chapters) await writeFile(join(dir, 'manuscript', `${title}.md`), `---\nid: ${id}\ntitle: ${title}\n---\n${text}\n`)
  await writeFile(join(dir, 'wordelia.json'), JSON.stringify(manifest, null, 2))
  let n = 0
  const groups = [
    ['Characters', CHARACTERS],
    ['Places', PLACES],
    ['World', WORLD],
    ['Plot', PLOT],
    ['Notes', NOTES]
  ]
  for (const [folder, list] of groups) {
    await mkdir(join(dir, 'planning', folder), { recursive: true })
    for (const [name, aliases, summary] of list) {
      const id = `en_map${String(++n).padStart(2, '0')}`
      await writeFile(join(dir, 'planning', folder, `${name}.md`), entryFile(id, aliases, summary, `## Notes\n${MENTIONS[name] ?? 'Nothing yet.'}`))
    }
  }
  return dir
}

// MAP_PERF=1: a book with 300 entries; prints the frame times of the map while it settles.
async function perf({ page, shot, book, work }) {
  const dir = await makeRichBook(work, book)
  const words = 'Some words about the story and the people in it. '.repeat(12)
  for (let i = 0; i < 300; i++) {
    const folder = ['Characters', 'Places', 'World', 'Plot', 'Notes'][i % 5]
    const links = [(i * 7 + 3) % 300, (i * 13 + 5) % 300, i % 9 === 0 ? (i + 1) % 300 : -1].filter((j) => j >= 0 && j !== i)
    const body = `${words}${links.map((j) => `Person Number ${j}`).join(', ')}.`
    await writeFile(join(dir, 'planning', folder, `Person Number ${i}.md`), entryFile(`en_perf${i}`, [], `Entry ${i}.`, body))
  }
  await page.evaluate((p) => window.__wordelia.openBook(p), dir)
  await page.waitForTimeout(900)
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(500)
  const t0 = Date.now()
  await page.locator('.plan-switch-btn').nth(1).click()
  await page.locator('.map-node').first().waitFor()
  const open = Date.now() - t0
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = []
        const start = performance.now()
        const step = (t) => {
          times.push(t)
          if (t - start < 3000) requestAnimationFrame(step)
          else resolve(times.slice(1).map((x, i) => x - times[i]))
        }
        requestAnimationFrame(step)
      })
  )
  frames.sort((a, b) => a - b)
  const avg = frames.reduce((s, x) => s + x, 0) / frames.length
  console.log(`perf: ${await page.locator('.map-node').count()} nodes, ${await page.locator('.map-edge').count()} edges; open ${open} ms; frames ${frames.length}, average ${avg.toFixed(1)} ms, p95 ${frames[Math.floor(frames.length * 0.95)].toFixed(1)} ms, max ${frames[frames.length - 1].toFixed(1)} ms`)
  await shot('perf')
  await page.locator('.map-node.is-major').first().locator('.map-dot').hover()
  await page.waitForTimeout(400)
  await shot('perf-hover')
}

export default async function ({ page, shot, openBook, book, work }) {
  if (process.env.MAP_PERF) return perf({ page, shot, book, work })
  const fail = (msg) => {
    throw new Error(msg)
  }
  const state = () =>
    page.evaluate(() => {
      const s = window.__wordelia.book.getState()
      return { category: s.activeCategory, entry: s.activeEntryId, view: s.view }
    })
  // The map stands still: its layout and its view stopped moving.
  const settle = async () => {
    await page.waitForTimeout(150)
    await page.waitForSelector('.map-stage[data-rest]', { timeout: 8000 })
  }
  // The second button of the switch; its text is the word for the map in the interface language
  const mapButton = () => page.locator('.plan-switch-btn').nth(1)
  if (process.env.I18N_LANG) {
    await page.evaluate((l) => window.__wordelia.app.getState().updateSettings({ language: l }), process.env.I18N_LANG)
  }

  // 1. The sample book: the switch on the overview opens the map.
  await openBook()
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(700)
  if ((await page.locator('.plan-hero .plan-switch').count()) !== 1) fail('No Cards | Map switch on the overview')
  await mapButton().click()
  await settle()
  if ((await state()).category !== ':map') fail('The Map button did not open the map')
  const mapWord = (await mapButton().textContent()) ?? 'Map'
  const sampleNodes = await page.locator('.map-node').count()
  const sampleEdges = await page.locator('.map-edge').count()
  if (sampleNodes !== 3 || sampleEdges !== 2) fail(`Sample map: ${sampleNodes} nodes, ${sampleEdges} edges (want 3 and 2)`)
  if (!process.env.I18N_LANG && !(await page.locator('.map-stats').textContent())?.includes('3 entries · 2 links')) fail('Wrong map stats')
  await shot('sample')

  // Alt+← goes back to the cards; the switch opens the map again.
  await page.locator('.map-title h1').click()
  await page.keyboard.press('Alt+ArrowLeft')
  await page.waitForTimeout(500)
  if ((await state()).category !== null) fail('Alt+Left on the map did not go to the overview')
  await shot('overview-switch')
  await mapButton().click()
  await page.waitForTimeout(800)

  // A click on a node opens its entry; the back link goes to the map.
  await page.locator('.map-node[data-label="Marta"]').locator('.map-dot').click()
  await page.waitForTimeout(700)
  const opened = await state()
  if (!opened.entry) fail('A click on a node did not open the entry')
  const back = page.locator('.entry-crumbs .plan-back')
  if (!(await back.textContent())?.includes(mapWord)) fail('The back link of an entry opened from the map does not say Map')
  await shot('entry-from-map')
  await back.click()
  await page.waitForTimeout(800)
  if ((await state()).category !== ':map') fail('The back link did not go to the map')
  // From an entry opened in the sidebar, the back link goes to its category as before.
  await page.locator('.map-node[data-label="Elias"]').locator('.map-dot').click()
  await page.waitForTimeout(500)
  await page.locator('.plan-entry', { hasText: 'Marta' }).click()
  await page.waitForTimeout(500)
  if ((await page.locator('.entry-crumbs .plan-back').textContent())?.includes(mapWord)) fail('An entry from the sidebar has a back link to the map')
  await page.keyboard.press('Alt+ArrowLeft')
  await page.waitForTimeout(400)
  if ((await state()).category !== 'Characters') fail('Alt+Left from a sidebar entry did not go to its category')

  // 2. A richer book.
  const rich = await makeRichBook(work, book)
  await page.evaluate(() => window.__wordelia.book.getState().close())
  // Give the library screen time to show, as a person would.
  await page.waitForTimeout(800)
  await page.evaluate((p) => window.__wordelia.openBook(p), rich)
  await page.waitForTimeout(900)
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(500)

  // No layout shift: the switch, its two buttons and the title keep their place and size on the cards
  // and on the map. The cards of this book scroll; the map does not. With the chat open and closed,
  // and with the sidebar closed.
  const geometry = () =>
    page.evaluate(() => {
      const box = (el) => {
        const b = el.getBoundingClientRect()
        return [b.left, b.top, b.width, b.height]
      }
      const title = document.querySelector('.plan-hero-top h1, .map-title h1').getBoundingClientRect()
      return {
        switch: box(document.querySelector('.plan-switch')),
        buttons: [...document.querySelectorAll('.plan-switch-btn')].map(box),
        title: [title.left, title.top, title.height]
      }
    })
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 0.5)
  const fmt = (a) => a.map((v) => v.toFixed(1)).join(', ')
  for (const [name, ui] of [
    ['chat open', {}],
    ['chat closed', { chatOpen: false }],
    ['sidebar closed', { sidebarOpen: false }]
  ]) {
    await page.evaluate((u) => window.__wordelia.app.getState().setUi(u), ui)
    await page.locator('.plan-switch-btn').nth(0).click()
    await page.waitForTimeout(500)
    const cards = await geometry()
    await mapButton().click()
    await page.waitForTimeout(500)
    const onMap = await geometry()
    console.log(`switch (${name}): cards [${fmt(cards.switch)}], map [${fmt(onMap.switch)}]; buttons ${cards.buttons.map((b) => b[2].toFixed(1)).join(' + ')} px; title [${fmt(cards.title)}] / [${fmt(onMap.title)}]`)
    if (!same(cards.switch, onMap.switch)) fail(`The switch moves (${name}): [${fmt(cards.switch)}] → [${fmt(onMap.switch)}]`)
    cards.buttons.forEach((b, i) => {
      if (!same(b, onMap.buttons[i])) fail(`Switch button ${i + 1} moves (${name})`)
    })
    if (Math.abs(cards.buttons[0][2] - cards.buttons[1][2]) > 0.5) fail(`The switch buttons have different widths (${name})`)
    if (!same(cards.title, onMap.title)) fail(`The title moves (${name}): [${fmt(cards.title)}] → [${fmt(onMap.title)}]`)
  }
  await page.evaluate(() => window.__wordelia.app.getState().setUi({ chatOpen: true, sidebarOpen: true }))
  await page.waitForTimeout(400)

  await mapButton().click()
  await settle()
  const richNodes = await page.locator('.map-node').count()
  if (richNodes !== 34) fail(`Rich map: ${richNodes} nodes (want 34)`)
  // Entries without links sit on a ring, outside the linked nodes.
  await shot('rich')

  // Hover: the node and its neighbors stay, the rest goes pale.
  const hugo = page.locator('.map-node[data-label="Hugo Marsh"]').locator('.map-dot')
  await hugo.hover()
  await page.waitForTimeout(500)
  if (!(await page.locator('.map-svg.has-focus').count())) fail('Hover did not highlight')
  const near = await page.locator('.map-node.is-near').count()
  if (near < 4) fail(`Hover: only ${near} nodes near Hugo Marsh`)
  if (!(await page.locator('.map-card.is-open').textContent())?.includes('Hugo Marsh')) fail('No hover card')
  await shot('hover')
  await page.mouse.move(5, 5)

  // Search: the matches stay, Enter opens the best match.
  await page.locator('.map-search input').fill('the')
  await page.waitForTimeout(500)
  const matches = await page.locator('.map-node.is-match').count()
  if (matches < 5) fail(`Search "the": ${matches} matches`)
  await shot('search')
  await page.locator('.map-search input').fill('marsh')
  await page.locator('.map-search input').press('Enter')
  await page.waitForTimeout(600)
  const hugoId = await page.evaluate(() => window.__wordelia.book.getState().entries.find((e) => e.name === 'Hugo Marsh')?.id)
  if ((await state()).entry !== hugoId) fail('Enter in the search did not open the match')
  await page.keyboard.press('Alt+ArrowLeft')
  await page.waitForTimeout(800)
  if ((await state()).category !== ':map') fail('Alt+Left did not go back to the map')
  await page.locator('.map-search input').press('Escape')
  await page.waitForTimeout(300)
  if ((await page.locator('.map-search input').inputValue()) !== '') fail('Esc did not clear the search')

  // Filters: hide Places; then show the chapters.
  await page.locator('.map-chip').nth(1).click()
  await settle()
  const withoutPlaces = await page.locator('.map-node').count()
  if (withoutPlaces !== richNodes - 8) fail(`Without Places: ${withoutPlaces} nodes`)
  await shot('filter')
  await page.locator('.map-chip').nth(1).click()
  await page.locator('.map-chip-chapters').click()
  await settle()
  const chapterNodes = await page.locator('.map-node.is-chapter').count()
  if (chapterNodes !== 3) fail(`Chapters on the map: ${chapterNodes}`)
  await shot('chapters')
  await page.locator('.map-chip-chapters').click()
  await settle()

  // Drag a node; zoom with the wheel; fit to the screen.
  const ada = page.locator('.map-node[data-label="Ada Vance"]')
  const before = await ada.getAttribute('transform')
  const box = await ada.locator('.map-dot').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 90, box.y + 60, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  if ((await ada.getAttribute('transform')) === before) fail('Drag did not move the node')
  if ((await state()).entry) fail('A drag opened the entry')
  const world = page.locator('.map-world')
  const zoom0 = await world.getAttribute('transform')
  const sheet = await page.locator('.map-sheet').boundingBox()
  await page.mouse.move(sheet.x + sheet.width / 2, sheet.y + sheet.height / 2)
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(300)
  if ((await world.getAttribute('transform')) === zoom0) fail('The wheel did not zoom')
  // Pan by dragging the background.
  const zoom1 = await world.getAttribute('transform')
  await page.mouse.move(sheet.x + 30, sheet.y + 30)
  await page.mouse.down()
  await page.mouse.move(sheet.x + 130, sheet.y + 90, { steps: 6 })
  await page.mouse.up()
  if ((await world.getAttribute('transform')) === zoom1) fail('Dragging the background did not pan')
  await shot('zoomed')
  await page.locator('.map-zoom button').nth(2).click()
  await page.waitForTimeout(600)
  await shot('fit')

  // Reduced motion: a new layout is at rest at once.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(100)
  await page.locator('.map-chip').nth(1).click()
  await page.waitForTimeout(120)
  const still = await ada.getAttribute('transform')
  await page.waitForTimeout(400)
  if ((await ada.getAttribute('transform')) !== still) fail('With reduced motion the map still moves')
  await page.locator('.map-chip').nth(1).click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // 3. Empty states: a book without entries, then entries without links.
  const blank = join(work, 'books', 'Blank Map')
  await mkdir(join(blank, 'manuscript'), { recursive: true })
  const m = JSON.parse(await readFile(join(book, 'wordelia.json'), 'utf8'))
  await writeFile(join(blank, 'wordelia.json'), JSON.stringify({ ...m, id: 'bk_blank_map', title: 'Blank Map', chapters: [] }, null, 2))
  await page.evaluate(() => window.__wordelia.book.getState().close())
  // Give the library screen time to show, as a person would.
  await page.waitForTimeout(800)
  await page.evaluate((p) => window.__wordelia.openBook(p), blank)
  await page.waitForTimeout(800)
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(400)
  await mapButton().click()
  await page.waitForTimeout(600)
  if (!(await page.locator('.map-empty h2').count())) fail('No empty state for a book without entries')
  await shot('empty')
  await page.evaluate(async () => {
    const s = window.__wordelia.book.getState()
    for (const name of ['Ada', 'Bruno', 'Clara']) await s.createEntry('Characters', name)
    s.selectCategory(':map')
  })
  await page.waitForTimeout(1200)
  if ((await page.locator('.map-node').count()) !== 3) fail('Entries without links are not on the map')
  if (!(await page.locator('.map-hint').count())) fail('No hint for a map without links')
  await shot('no-links')
  console.log('graph ok')
}
