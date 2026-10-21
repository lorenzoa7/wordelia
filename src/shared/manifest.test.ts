import { describe, expect, it } from 'vitest'
import { newManifest } from './book'
import { hasConflictMarkers, keepMissingChapters, parseManifestText, resolveConflict, salvageManifest } from './manifest'

const manifest = (): string => {
  const m = newManifest({ title: 'O Farol de Santa Ilha', author: 'Ana Exemplo', language: 'pt-BR' })
  m.id = 'bk_sample01'
  m.chapters = [
    { id: 'ch_a', file: 'A Tempestade.md' },
    { id: 'ch_b', file: 'O Visitante.md' }
  ]
  m.typography.fontSize = 13
  return JSON.stringify(m, null, 2) + '\n'
}

describe('a manifest that does not parse', () => {
  it('a byte order mark is not damage', () => {
    expect(parseManifestText('﻿' + manifest())?.title).toBe('O Farol de Santa Ilha')
  })

  it('git conflict markers: each side is a whole manifest', () => {
    const ours = manifest()
    const theirs = ours.replace('"O Farol de Santa Ilha"', '"O Farol"')
    const lines = (s: string): string[] => s.split('\n')
    // A conflict on the title line only, as git writes it.
    const a = lines(ours)
    const b = lines(theirs)
    const i = a.findIndex((l) => l.includes('"title"'))
    const text = [...a.slice(0, i), '<<<<<<< HEAD', a[i], '=======', b[i], '>>>>>>> other-computer', ...a.slice(i + 1)].join('\n')
    expect(parseManifestText(text)).toBeNull()
    expect(hasConflictMarkers(text)).toBe(true)
    expect(parseManifestText(resolveConflict(text, 'ours'))?.title).toBe('O Farol de Santa Ilha')
    expect(parseManifestText(resolveConflict(text, 'theirs'))?.title).toBe('O Farol')
  })

  it('git conflict markers with Windows line ends, also a lone carriage return before a marker', () => {
    const lines = manifest().split('\n')
    const i = lines.findIndex((l) => l.includes('"title"'))
    const crlf = [...lines.slice(0, i), '<<<<<<< HEAD', lines[i], '=======', '  "title": "O Farol",', '>>>>>>> other-computer', ...lines.slice(i + 1)].join('\r\n')
    expect(parseManifestText(resolveConflict(crlf, 'ours'))?.title).toBe('O Farol de Santa Ilha')
    // A marker after a lone "\r" is at the start of a line for hasConflictMarkers: the repair must agree.
    const lone = crlf.replace('\r\n<<<<<<< HEAD', '\r<<<<<<< HEAD')
    expect(hasConflictMarkers(lone)).toBe(true)
    expect(parseManifestText(resolveConflict(lone, 'theirs'))?.title).toBe('O Farol')
  })

  it('a file that stops in the middle (a sync client did not finish): the id, the language and the chapter order come back', () => {
    const full = manifest()
    const half = full.slice(0, full.indexOf('"export"') + 30)
    expect(parseManifestText(half)).toBeNull()
    const s = salvageManifest(half)!
    expect(s.id).toBe('bk_sample01')
    expect(s.language).toBe('pt-BR')
    expect(s.author).toBe('Ana Exemplo')
    expect(s.chapters).toEqual([
      { id: 'ch_a', file: 'A Tempestade.md' },
      { id: 'ch_b', file: 'O Visitante.md' }
    ])
    expect((s.typography as { fontSize: number }).fontSize).toBe(13)
    expect(s.export).toBeUndefined()
  })

  it('nothing to read', () => {
    expect(salvageManifest('')).toBeNull()
    expect(salvageManifest('garbage')).toBeNull()
  })
})

describe('chapters whose files are missing for now', () => {
  const refs = (...ids: string[]): Array<{ id: string; file: string }> => ids.map((id) => ({ id, file: `${id}.md` }))

  it('keep their place when the other chapters change', () => {
    const prev = refs('a', 'b', 'c')
    // "a" is missing; the author adds "d" at the end.
    expect(keepMissingChapters(refs('b', 'c', 'd'), prev, new Set(['a'])).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd'])
    // "b" is missing; the author moves "c" to the top.
    expect(keepMissingChapters(refs('c', 'a'), prev, new Set(['b'])).map((r) => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('a missing chapter after a deleted one goes after the chapter before that', () => {
    expect(keepMissingChapters(refs('a'), refs('a', 'b', 'c'), new Set(['c'])).map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('no missing chapters: no change', () => {
    const next = refs('a', 'b')
    expect(keepMissingChapters(next, refs('b', 'a'), new Set())).toBe(next)
  })
})
