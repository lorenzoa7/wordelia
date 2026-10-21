// The tokens and the cost of the replies of a thread. The providers tell them (`usage` events);
// each reply keeps its own (`ChatMessage.usage`). Pure functions, so the tests can use them.

import type { ChatMessage } from '@shared/types'

export interface UsageSum {
  inputTokens: number
  outputTokens: number
  /** The cost in US dollars, when the provider told it for at least one reply */
  costUsd: number | null
  /** The replies that have a usage */
  replies: number
}

/** The usage of all the replies of a thread. */
export function sumUsage(messages: ChatMessage[]): UsageSum {
  const out: UsageSum = { inputTokens: 0, outputTokens: 0, costUsd: null, replies: 0 }
  for (const m of messages) {
    const u = m.role === 'assistant' ? m.usage : undefined
    if (!u) continue
    out.replies++
    out.inputTokens += u.inputTokens ?? 0
    out.outputTokens += u.outputTokens ?? 0
    if (typeof u.costUsd === 'number') out.costUsd = (out.costUsd ?? 0) + u.costUsd
  }
  return out
}

/** A cost in US dollars, short: "$0.012", "$1.20". */
export function formatCost(usd: number, locale: string): string {
  const digits = usd > 0 && usd < 0.1 ? 3 : 2
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(usd)
}
