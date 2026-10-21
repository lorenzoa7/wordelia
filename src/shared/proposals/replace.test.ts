import { describe, expect, it } from 'vitest'
import { losesSomething, noteReplace } from './replace'

const ELIAS = `---
id: en_sample01
aliases: [Elias, the keeper]
summary: Keeper of the Saint Isle lighthouse for twenty-two years. Quiet and methodical.
---
## Role
The protagonist. He keeps the lighthouse and knows every boat in the harbor.
## Personality
- Methodical: he always lights the lamp at six.
- Speaks little; watches a lot.
`

describe('a new text for a note that exists', () => {
  it('tells the other names, fields and sections that the note loses', () => {
    const next = `---\nsummary: Keeper of the lighthouse. He does not trust the visitor.\n---\n## Role\nThe protagonist. He keeps the lighthouse.\n`
    const r = noteReplace(ELIAS, next)
    expect(r.lost.aliases).toEqual(['Elias', 'the keeper'])
    expect(r.lost.sections).toEqual(['Personality'])
    expect(r.lost.fields).toEqual([])
    expect(r.before.summary).toContain('twenty-two years')
    expect(r.after.summary).toContain('does not trust')
    expect(losesSomething(r)).toBe(true)
  })

  it('loses nothing when the new text keeps the names and the sections', () => {
    const next = ELIAS.replace('Speaks little; watches a lot.', 'Speaks little; watches a lot. He does not trust the visitor.')
    const r = noteReplace(ELIAS, next)
    expect(losesSomething(r)).toBe(false)
    expect(r.after.body).toContain('does not trust')
  })

  it('tells a field of the front matter that goes, and keeps the id out', () => {
    const r = noteReplace('---\nid: x1\nimage: _assets/elias.webp\nsummary: A keeper.\n---\nText\n', '---\nsummary: A keeper.\n---\nText\n')
    expect(r.lost.fields).toEqual(['image'])
    expect(r.before.fields).toEqual({ image: '_assets/elias.webp' })
  })
})
