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
npm run build        # production build to out/
npm run dist         # Windows installer to release/
```

## Rules

- `src/shared/` must stay pure: no Node, DOM or Electron imports.
- The renderer never uses Node. Add an IPC channel in `src/shared/ipc.ts`, a handler in `src/main/ipc.ts` and a method in `src/preload/index.ts`.
- Colors, spacing, fonts and motion come from tokens in `src/renderer/src/styles/tokens.css`. Do not hard-code them in components.
- The AI never changes text without user approval. All AI changes go through proposals or the inline diff.
- Prose in docs: ASD-STE100 Simplified Technical English. Short sentences, active voice.
- Update `docs/ROADMAP.md` after each task, then commit. Use small commits with clear messages.
