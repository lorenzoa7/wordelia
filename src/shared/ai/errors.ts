// Why an AI request failed, from the error text of the provider. The renderer shows a plain
// message for each kind (friendlyError in src/renderer/src/lib/ai.ts) and keeps the text for "Details".

import type { AiErrorKind } from '../types'

export interface ClassifiedError {
  kind: AiErrorKind
  /** When the usage limit ends (kind 'rate-limit'): an ISO time, or the words of the provider */
  resets?: string
}

/**
 * The kind of an error text. `api`: the text comes from an API with a key of the writer (Anthropic
 * API, OpenAI API). There, a login error means a bad key. For a program (Claude Code, Codex), it
 * means that the writer must log in.
 */
export function classifyError(text: string, opts: { api?: boolean } = {}): ClassifiedError {
  const t = text.toLowerCase()
  if (/credit balance|insufficient[_ ]quota|exceeded your current quota|billing_|\b402\b|payment required/.test(t)) return { kind: 'no-credit' }
  if (/token has expired|token (?:is )?expired|expired token|login (?:has )?expired|could not be refreshed|refresh token|sign in again|log in again/.test(t))
    return { kind: opts.api ? 'bad-key' : 'login-expired' }
  if (/invalid (?:x-)?api.?key|incorrect api key|invalid_api_key|api key (?:is )?(?:not valid|invalid|revoked|disabled)/.test(t))
    return { kind: opts.api ? 'bad-key' : 'not-logged-in' }
  if (/not logged in|please run \/login|unauthori[sz]ed|\b401\b|authentication|not authenticated|login required/.test(t))
    return { kind: opts.api ? 'bad-key' : 'not-logged-in' }
  if (opts.api && /permission_error|\b403\b|forbidden/.test(t)) return { kind: 'bad-key' }
  // The usage limit of a plan. A rate limit of an API is a short wait, not the end of a plan.
  if (/usage limit|session limit|weekly limit|\d+-hour limit|hit your (?:usage )?limit|out of (?:extra )?usage/.test(t)) return withReset(text)
  if (/rate.?limit|too many requests|\b429\b|overloaded|\b5(?:00|02|03|29)\b|server error|service unavailable|temporarily unavailable|at capacity|high demand/.test(t))
    return { kind: 'overloaded' }
  if (/quota|limit reached/.test(t)) return withReset(text)
  if (/enotfound|econnreset|econnrefused|etimedout|eai_again|network|fetch failed|socket hang up|connection error|stream disconnected|getaddrinfo|could not resolve|unable to connect|offline/.test(t))
    return { kind: 'network' }
  return { kind: 'other' }
}

function withReset(text: string): ClassifiedError {
  const resets = resetTime(text)
  return resets ? { kind: 'rate-limit', resets } : { kind: 'rate-limit' }
}

const UNIT_MS: Array<[RegExp, number]> = [
  [/^d(?:ays?)?$/, 24 * 60 * 60 * 1000],
  [/^h(?:ours?|rs?)?$/, 60 * 60 * 1000],
  [/^m(?:inutes?|ins?)?$/, 60 * 1000],
  [/^s(?:econds?|ecs?)?$/, 1000]
]

/**
 * When a usage limit ends, from the text of the provider: a Unix time ("…|1760000000") or a time from
 * now ("try again in 2 hours 5 minutes") gives an ISO time; "resets 3pm" or "try again at 3:05 PM"
 * gives the words of the provider ("3pm").
 */
export function resetTime(text: string, now = Date.now()): string | undefined {
  const unix = /\|(\d{10})\b/.exec(text)
  if (unix) return new Date(Number(unix[1]) * 1000).toISOString()
  const inTime = /try again in ((?:\d+(?:\.\d+)?\s*[a-z]+[\s,]*(?:and\s+)?)+)/i.exec(text)
  if (inTime) {
    let ms = 0
    for (const [, n, unit] of inTime[1].matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/gi)) {
      const u = UNIT_MS.find(([re]) => re.test(unit.toLowerCase()))
      if (u) ms += Number(n) * u[1]
    }
    if (ms > 0) return new Date(now + Math.round(ms / 1000) * 1000).toISOString()
  }
  const words = /(?:resets?(?: at| on)?|try again at)\s+([^.\n·∙|]+?)\s*(?:[.·∙|]|$)/i.exec(text)
  const at = words?.[1].trim()
  return at && /\d/.test(at) ? at : undefined
}

/**
 * The error text, short, for "Details". An API error with JSON ("401 {"type":"error","error":{…}}")
 * becomes "401 authentication_error: invalid x-api-key".
 */
export function errorDetail(text: string): string {
  const m = /^(\d{3})\s+(\{[\s\S]*\})\s*$/.exec(text.trim())
  if (!m) return text.trim()
  try {
    const j = JSON.parse(m[2]) as { error?: { type?: string; message?: string; code?: string } }
    const e = j.error
    if (!e?.message) return text.trim()
    return `${m[1]} ${[e.type ?? e.code, e.message].filter(Boolean).join(': ')}`
  } catch {
    return text.trim()
  }
}
