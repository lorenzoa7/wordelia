# 0002 — AI through the user's own CLIs, or through API keys

Date: 2026-10-14. Status: accepted.

## Context

The app is free. The user wants to use the AI subscription that they already pay for (Claude Pro/Max, or ChatGPT with Codex), without API keys.

## Decision

Wordelia supports four providers:

1. **Claude Code:** the app starts the `claude` CLI that the user installed and logged in. Flags: `-p --output-format stream-json --verbose --include-partial-messages --tools "" --strict-mcp-config --setting-sources "" --disable-slash-commands --no-session-persistence --system-prompt-file <file> --model <alias>`. The prompt goes on stdin.
2. **Codex:** the app starts the `codex` CLI. Main path: `codex app-server` (JSON-RPC on stdio: `model/list`, `thread/start`, `turn/start`, text deltas). Fallback: `codex exec --json` (no deltas).
3. **Anthropic API** with a key of the user.
4. **OpenAI API** with a key of the user.

Rules for the CLI providers:

- The app never reads, stores or sends the login tokens of the CLIs. The CLI does its own login. The user logs in with the CLI (`claude auth login`, `codex login`).
- The app runs the unmodified binary. It resolves the real `.exe` on Windows and spawns it without a shell.
- The app removes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDECODE` and `CLAUDE_CODE_*` from the child environment.

## Policy note

Anthropic does not allow third-party products to offer Claude.ai login or to route requests through subscription credentials on behalf of users. It does allow an end user to sign in to the unmodified Claude Code binary with their own subscription. Wordelia runs on the computer of the user and starts the user's own Claude Code. This fits the carve-out, but the area is gray. Before a public release, ask Anthropic for written confirmation. The API-key providers are always allowed.

Sources: https://code.claude.com/docs/en/legal-and-compliance (section "Authentication and credential use"), https://code.claude.com/docs/en/agent-sdk/overview.

## Consequences

- The Claude Code CLI starts in 1–3 s. This latency is acceptable for actions and chat. A long-lived process with `--input-format stream-json` can reduce it later.
- Model aliases (`opus`, `sonnet`, `haiku`) keep Claude Code current. Codex `model/list` and the `/v1/models` endpoints keep the other providers current.
