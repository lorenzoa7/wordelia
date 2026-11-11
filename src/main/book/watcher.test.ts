import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashText } from '@shared/book'
import { contentNow, isOwnChange, noteOwnWrite } from './watcher'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wordelia-watch-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('contentNow', () => {
  it('a file that is there gives its text', async () => {
    const file = join(dir, 'Santa Ilha.md')
    await writeFile(file, 'A ilha.')
    expect(await contentNow(file, false)).toEqual({ content: 'A ilha.' })
  })

  it('a "deleted" event of a file that is there again gives its text, not a deletion', async () => {
    // The Undo of a delete puts the file back before the late event of the delete comes: the note stays.
    const file = join(dir, 'Santa Ilha.md')
    await writeFile(file, 'A ilha.')
    expect(await contentNow(file, true)).toEqual({ content: 'A ilha.' })
  })

  it('a "deleted" event of a file that is not there gives a deletion', async () => {
    expect(await contentNow(join(dir, 'Silva.md'), true)).toEqual({ content: null })
  })

  it('a change of a file that is not there any more gives nothing: its deletion comes as its own event', async () => {
    expect(await contentNow(join(dir, 'Silva.md'), false)).toBeNull()
  })
})

describe('isOwnChange', () => {
  it('a late event of an earlier change of the app is its own change too', () => {
    // A note gets a new name and its old name again, fast: the app writes "Ilha de Santa Clara.md", then
    // deletes it. The event of the write comes after the delete: it is not a change of another program.
    const file = join('C:', 'book', 'planning', 'Places', 'Ilha de Santa Clara.md')
    noteOwnWrite(file, 'A ilha.', 1000)
    noteOwnWrite(file, null, 1200)
    expect(isOwnChange(file, hashText('A ilha.'), 1400)).toBe(true)
    expect(isOwnChange(file, 'deleted', 1500)).toBe(true)
  })

  it('a text that the app did not write is a change of another program', () => {
    const file = join('C:', 'book', 'planning', 'Places', 'Silva.md')
    noteOwnWrite(file, 'Um médico.', 1000)
    expect(isOwnChange(file, hashText('Outro texto.'), 1100)).toBe(false)
  })

  it('an own change counts only for a while: much later, the same text is a change from outside', () => {
    const file = join('C:', 'book', 'planning', 'Places', 'Porto.md')
    noteOwnWrite(file, 'O porto.', 1000)
    expect(isOwnChange(file, hashText('O porto.'), 1000 + 60_000)).toBe(false)
  })
})
