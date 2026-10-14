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
    /* keep the raw text below */
  }
  return { data: { [RAW_FRONTMATTER]: m[1] }, body }
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
