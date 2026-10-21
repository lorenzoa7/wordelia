// The official web pages of the providers: how to install and update each program (for the system
// of the writer), where to get an API key, and where to add credit. Settings → AI and the welcome
// screen use the same pages.

import type { ProviderId } from '../types'

/** The install page of a program. It also tells how to update it. `platform`: process.platform. */
export function installPage(provider: ProviderId, platform: string): string | undefined {
  if (provider === 'claude-code') {
    return platform === 'win32' ? 'https://code.claude.com/docs/en/setup#install-on-native-windows' : 'https://code.claude.com/docs/en/setup#install-claude-code'
  }
  if (provider === 'codex') return 'https://developers.openai.com/codex/cli'
  return undefined
}

/** Where the writer makes an API key */
export const KEY_PAGE: Partial<Record<ProviderId, string>> = {
  anthropic: 'https://platform.claude.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys'
}

/** Where the writer adds credit to an API account */
export const BILLING_PAGE: Partial<Record<ProviderId, string>> = {
  anthropic: 'https://platform.claude.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing/overview'
}
