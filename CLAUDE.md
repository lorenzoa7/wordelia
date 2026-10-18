# Wordelia — guide for AI agents

Wordelia is an Electron desktop writing app for novelists, with an AI editor inside. All code, docs and UI text are in English.

## Start here

1. Read `docs/ROADMAP.md`. The "Current focus" block tells you the milestone and the next task.
2. Read `GLOSSARY.md`. Use its terms in code and UI.
3. Read `docs/ARCHITECTURE.md` before you change structure.
4. Read `docs/SPEC.md` for product intent.
5. Decisions are in `docs/decisions/`. Add one when you make a choice that is hard to reverse.

## Commands

```bash
npm run dev          # start the app with hot reload
npm run typecheck    # TypeScript, all processes
npm test             # Vitest unit tests
npm run shot         # build, start the app with Playwright, save screenshots to test-results/
npm run e2e -- --changed   # build, then only the end-to-end scenarios for the files you changed
npm run e2e -- pages zoom  # build, then only these scenarios
npm run e2e          # build, then all end-to-end scenarios, 4 at a time (about 2 minutes)
node scripts/shot.mjs <scenario> --visible   # one scenario with the window on screen
npm run build        # production build to out/
npm run dist         # Windows installer to release/ (local only, not in git)
```

## Tests

- End-to-end scenarios run with a hidden window (transparent, no focus) and with CSS animations off. Use `--visible` to watch one, and `--motion` for a scenario that checks motion.
- While you work: `npm run typecheck`, `npm test` and `npm run e2e -- --changed`. Add or update the scenario of the feature, and look at its screenshots.
- Run the full `npm run e2e` one time: after all work is merged, before a release. Agents that work at the same time do not run the full suite; the coordinator runs it after the merge.
- A scenario that fails at first and passes alone is reported as unstable. Make it stable (wait for a condition, not a fixed time) instead of ignoring it.
- CI (`.github/workflows/ci.yml`) runs the types, the unit tests and all scenarios on each push to main and on each pull request. A release tag builds the installer only when these checks pass.

## Releases

Installers go to GitHub Releases, never into git. To release: change `version` in `package.json`, add a section to `CHANGELOG.md`, commit, and push a tag `vX.Y.Z`. The workflow `.github/workflows/release.yml` builds and publishes the installer.

## Rules

- `src/shared/` must stay pure: no Node, DOM or Electron imports.
- The renderer never uses Node. Add an IPC channel in `src/shared/ipc.ts`, a handler in `src/main/ipc.ts` and a method in `src/preload/index.ts`.
- Every text that the user can see goes through `src/shared/i18n` (`useT()` / `getT()` in the renderer, `mainT()` in main). Add it in English, Portuguese (Brazil) and Spanish. Read `src/shared/i18n/README.md`.
- Colors, spacing, fonts and motion come from tokens in `src/renderer/src/styles/tokens.css`. Do not hard-code them in components.
- The AI never changes text without user approval. All AI changes go through proposals or the inline diff.
- Prose in docs: ASD-STE100 Simplified Technical English. Short sentences, active voice.
- Update `docs/ROADMAP.md` after each task, then commit. Use small commits with clear messages.
