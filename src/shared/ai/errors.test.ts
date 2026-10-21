import { describe, expect, it } from 'vitest'
import { classifyError, errorDetail, resetTime } from './errors'

const cli = (text: string): string => classifyError(text).kind
const api = (text: string): string => classifyError(text, { api: true }).kind

describe('classifyError', () => {
  it('knows an expired login', () => {
    expect(cli('OAuth token has expired. Please obtain a new token or refresh your existing token.')).toBe('login-expired')
    expect(cli('Your access token could not be refreshed because your refresh token has expired. Please log out and sign in again.')).toBe('login-expired')
  })

  it('knows a missing login of a program, and a bad key of an API', () => {
    expect(cli('Invalid API key · Please run /login')).toBe('not-logged-in')
    expect(cli('Not logged in · Please run /login')).toBe('not-logged-in')
    expect(cli('unexpected status 401 Unauthorized: Missing bearer')).toBe('not-logged-in')
    expect(api('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')).toBe('bad-key')
    expect(api('Incorrect API key provided: sk-abc. You can find your API key at https://platform.openai.com/account/api-keys.')).toBe('bad-key')
  })

  it('knows that there is no credit', () => {
    expect(api('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}')).toBe('no-credit')
    expect(api('429 You exceeded your current quota, please check your plan and billing details.')).toBe('no-credit')
    expect(cli('Credit balance is too low')).toBe('no-credit')
  })

  it('keeps a busy server apart from the usage limit of a plan', () => {
    expect(cli('API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}')).toBe('overloaded')
    expect(api('429 Rate limit reached for gpt-5 in organization org-x on tokens per min (TPM). Please try again in 1.5s.')).toBe('overloaded')
    expect(api('500 Internal server error')).toBe('overloaded')
    expect(cli('Claude AI usage limit reached|1760000000')).toBe('rate-limit')
    expect(cli("You've hit your limit · resets 3pm (America/Sao_Paulo)")).toBe('rate-limit')
    expect(cli("You've hit your usage limit. Upgrade to Pro or try again in 2 hours 5 minutes.")).toBe('rate-limit')
    expect(cli('5-hour limit reached ∙ resets 3pm')).toBe('rate-limit')
  })

  it('knows a missing connection', () => {
    expect(cli('API Error: Connection error.')).toBe('network')
    expect(api('getaddrinfo ENOTFOUND api.anthropic.com')).toBe('network')
    expect(cli('stream disconnected before completion: error sending request')).toBe('network')
  })

  it('says "other" for the rest', () => {
    expect(cli('claude exited with code 1')).toBe('other')
    expect(cli('')).toBe('other')
  })

  it('keeps the reset time of a usage limit', () => {
    expect(classifyError("You've hit your limit · resets 3pm (Europe/London)").resets).toBe('3pm (Europe/London)')
    expect(classifyError('Claude AI usage limit reached|1760000000').resets).toBe(new Date(1760000000 * 1000).toISOString())
    expect(classifyError('API Error: 529 Overloaded').resets).toBeUndefined()
  })
})

describe('resetTime', () => {
  const now = Date.parse('2026-10-21T12:00:00Z')

  it('reads the words of the provider', () => {
    expect(resetTime('5-hour limit reached ∙ resets 3pm', now)).toBe('3pm')
    expect(resetTime('Weekly limit reached ∙ resets Oct 24, 9am', now)).toBe('Oct 24, 9am')
    expect(resetTime('Usage limit reached. Try again at 3:05 PM.', now)).toBe('3:05 PM')
  })

  it('turns a time from now into a moment', () => {
    expect(resetTime('try again in 2 hours 5 minutes.', now)).toBe('2026-10-21T14:05:00.000Z')
    expect(resetTime('Try again in 1 day and 3 hours', now)).toBe('2026-10-22T15:00:00.000Z')
  })

  it('reads a Unix time', () => {
    expect(resetTime('Claude AI usage limit reached|1760000000', now)).toBe(new Date(1760000000 * 1000).toISOString())
  })

  it('gives nothing when the text has no time', () => {
    expect(resetTime('Usage limit reached. Try again later.', now)).toBeUndefined()
  })
})

describe('errorDetail', () => {
  it('makes the JSON of an API error short', () => {
    expect(errorDetail('401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":"req_1"}')).toBe(
      '401 authentication_error: invalid x-api-key'
    )
  })

  it('keeps other text', () => {
    expect(errorDetail('claude exited with code 1')).toBe('claude exited with code 1')
  })
})
