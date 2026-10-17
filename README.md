<p align="center">
  <img src="resources/brand/wordmark-card.svg" alt="Wordelia" width="340">
</p>

<p align="center"><em>A quiet desk for your book, with an editor at your side.</em></p>

Wordelia is a desktop app for novelists. You write on a simple page. An AI editor works at your side. You approve every change.

![Inline review of an AI rewrite](docs/images/inline-review.png)

## Download

Get the Windows installer from [Releases](https://github.com/lorenzoa7/wordelia/releases). The installer has no code signature yet. Windows SmartScreen shows a warning: select **More info**, then **Run anyway**.

You install Wordelia one time. After that, Wordelia updates itself: it downloads new versions in the background and installs them when you restart.

## What it does

### ✍️ Write
- Write your chapters on a page with book typography.
- Type `--` to get a dash.
- Wordelia saves as you type and keeps versions of each chapter.

### ✨ Polish with one key
- Select text and press `Ctrl+J`.
- The AI rewrites the text with your writing rules.
- You see the change on the page. Press `Enter` to accept it or `Esc` to reject it.
- Make your own actions. Each action can use a different model.

### 💬 Chat with your editor
- The chat reads your chapters, your planning and your other threads.
- It proposes changes as diffs. You accept or reject each change.

### 🗺️ Plan the story
- Keep entries for characters, places, the world and the plot.
- Press **Update notes from the chapters**. The AI proposes new facts from your chapters. You accept or reject each change.

### More
- A book is a folder of Markdown files on your computer.
- Import DOCX. Export PDF, DOCX, Markdown or text.
- Use your Claude or ChatGPT plan, or an API key. Choose a model and an effort for each task.
- The app is in English, Portuguese (Brazil) and Spanish.

| Chat with proposals | Planning |
|---|---|
| ![Chat](docs/images/chat-proposal.png) | ![Planning](docs/images/plan-entry.png) |

| Export | Lamplight (dark) theme |
|---|---|
| ![Export](docs/images/export.png) | ![Dark](docs/images/dark.png) |

| Version history | A page of the exported PDF |
|---|---|
| ![History](docs/images/history.png) | ![PDF page](docs/images/pdf-page.png) |

## Connect an AI

Wordelia is free. It uses an AI that you already have:

| Provider | What you need |
|---|---|
| **Claude Code** | A Claude Pro or Max plan. Install [Claude Code](https://claude.com/claude-code), then run `claude auth login` in a terminal. |
| **Codex** | A ChatGPT plan. Install the [Codex CLI](https://developers.openai.com/codex), then run `codex login` in a terminal. |
| **Anthropic API** | An API key from console.anthropic.com. |
| **OpenAI API** | An API key from platform.openai.com. |

Wordelia runs your own `claude` or `codex` program. It never reads or stores your login. API keys are encrypted with the key store of the operating system.

Open **Settings → AI** to choose a model for each task: chat, actions, planning sync and background work. Wordelia gets the model lists from the providers, so new models appear without an app update.

## A book is a folder

```
My Book/
  wordelia.json        title, author, chapter order, typography, export settings
  manuscript/          one Markdown file for each chapter
  planning/            Characters/, Places/, World/, Plot/, Notes/
  ai/                  writing rules, chat threads, sync state
```

The files are plain Markdown. Obsidian and git can read them.

## Develop

You need Node.js 22.12 or later (the project uses Node 24, see `.node-version`).

```bash
npm install
```

```bash
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the app with hot reload. |
| `npm test` | Run the unit tests (Vitest). |
| `npm run typecheck` | Check the types of all processes. |
| `npm run shot -- book` | Build, start the app with a scripted AI, and save screenshots to `test-results/shots/`. |
| `npm run e2e` | Build and run all end-to-end scenarios (scripted AI, temporary data folders). |
| `npm run dist` | Make the Windows installer in `release/` on your computer (this folder is not in git). |

### Release a version

1. Change `version` in `package.json` and add a section to `CHANGELOG.md`.
2. Commit, then push a tag: `git tag v0.2.0` and `git push origin v0.2.0`.
3. The **Release** workflow (`.github/workflows/release.yml`) runs the tests, builds the installer, and publishes it to GitHub Releases with the notes from `CHANGELOG.md`.

Read `CLAUDE.md` and `docs/` before you change the code: `docs/SPEC.md` (product), `docs/ARCHITECTURE.md` (design), `docs/ROADMAP.md` (status) and `GLOSSARY.md` (terms).
