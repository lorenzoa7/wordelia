import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export interface FrontmatterDoc {
  data: Record<string, unknown>
  body: string
}

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/** Split YAML frontmatter from a Markdown file. Bad YAML gives empty data. */
export function readFrontmatter(src: string): FrontmatterDoc {
  const text = src.replace(/^﻿/, '')
  const m = FM_RE.exec(text)
  if (!m) return { data: {}, body: text }
  let data: Record<string, unknown> = {}
  try {
    const parsed = parseYaml(m[1])
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
  } catch {
    data = {}
  }
  return { data, body: text.slice(m[0].length) }
}

/** Join frontmatter data and a body. Keys with undefined values are left out. */
export function writeFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data)) if (v !== undefined) clean[k] = v
  const yaml = Object.keys(clean).length ? stringifyYaml(clean, { lineWidth: 0 }).trimEnd() : ''
  const head = yaml ? `---\n${yaml}\n---\n` : ''
  return head + body.replace(/^\n+/, '')
}
