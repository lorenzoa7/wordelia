import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface FrontmatterDoc {
  data: Record<string, unknown>
  body: string
}

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Key that holds frontmatter that is not valid YAML (for example duplicate keys from
 * another app). Wordelia writes it back as it was, so nothing is lost.
 */
export const RAW_FRONTMATTER = '__rawFrontmatter'

/** Split YAML frontmatter from a Markdown file. */
export function readFrontmatter(src: string): FrontmatterDoc {
  const text = src.replace(/^﻿/, '')
  const m = FM_RE.exec(text)
  if (!m) return { data: {}, body: text }
  const body = text.slice(m[0].length)
  try {
    const parsed = parseYaml(m[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return { data: parsed as Record<string, unknown>, body }
    if (parsed == null) return { data: {}, body }
  } catch {
    // AI text often breaks YAML with a colon in a value ("summary: Two plots: one..."). Read it line by line.
    const loose = looseFrontmatter(m[1])
    if (loose) return { data: loose, body }
  }
  return { data: { [RAW_FRONTMATTER]: m[1] }, body }
}

function unquote(s: string): string {
  const t = s.trim()
  return /^(["']).*\1$/.test(t) && t.length > 1 ? t.slice(1, -1) : t
}

/**
 * Read simple "key: value" lines and lists when the text is not valid YAML.
 * Returns null when a line does not fit or a key repeats: then the raw text is kept.
 */
function looseFrontmatter(raw: string): Record<string, unknown> | null {
  const data: Record<string, unknown> = {}
  let listKey: string | null = null
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const item = /^\s*-\s+(.*)$/.exec(line)
    if (item && listKey) {
      ;(data[listKey] as unknown[]).push(unquote(item[1]))
      continue
    }
    const kv = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(line)
    if (!kv || kv[1] in data) return null
    listKey = null
    const value = (kv[2] ?? '').trim()
    if (!value) {
      data[kv[1]] = []
      listKey = kv[1]
    } else if (/^\[.*\]$/.test(value)) {
      data[kv[1]] = value.slice(1, -1).split(',').map(unquote).filter(Boolean)
    } else {
      data[kv[1]] = unquote(value)
    }
  }
  for (const [k, v] of Object.entries(data)) if (Array.isArray(v) && v.length === 0 && k !== 'aliases') data[k] = null
  return data
}

/** Join frontmatter data and a body. Keys with undefined values are left out. */
export function writeFrontmatter(data: Record<string, unknown>, body: string): string {
  const raw = data[RAW_FRONTMATTER]
  if (typeof raw === 'string') return `---\n${raw}\n---\n${body.replace(/^\n+/, '')}`
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (v !== undefined) clean[k] = v
  const yaml = Object.keys(clean).length ? stringifyYaml(clean, { lineWidth: 0 }).trimEnd() : ''
  const head = yaml ? `---\n${yaml}\n---\n` : ''
  return head + body.replace(/^\n+/, '')
}
