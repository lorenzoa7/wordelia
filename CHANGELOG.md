# Changelog

Each version has its Windows installer in GitHub Releases. The release workflow copies the section of the version from this file to the release notes.

## 0.1.0 — 2026-10-15

The first version.

### Write
- A page with book typography: first-line indents, justified text, scene breaks. Type `--` to get the dialogue dash.
- Chapters in a sidebar. Find and replace, word counts, a daily word goal, focus mode, typewriter scrolling and optional typewriter sounds.
- Version history of each chapter, with compare and restore.

### AI
- Actions on selected text (Polish, Tighten, Fix grammar only, Show don't tell, Expand, or your own). The change shows on the page as a diff. Press `Enter` to accept or `Esc` to reject.
- A chat that reads the book and the planning, and proposes changes as diff cards. "Accept all" applies all the proposals of a reply.
- Connected threads: each thread keeps a digest, and all threads read the digests of the others.
- A model and an effort for each task and each action.
- Providers: Claude Code and Codex (with your own subscription), the Anthropic API and the OpenAI API (with your own key). Model lists come from the providers. Settings show when a newer Claude Code or Codex is out.

### Plan
- Characters, places, world and plot as notes with images and aliases.
- "Sync with manuscript": the AI reads the chapters that changed and proposes new notes and new facts.
- Import Markdown notes, for example from Obsidian.

### Files
- A book is a folder of Markdown files. Import DOCX, Markdown or text. Export a print-ready PDF, a DOCX with real Word styles, Markdown or text.

### Known limits
- The installer has no code signature. Windows SmartScreen shows a warning: select "More info", then "Run anyway".
- Live tests used Claude Code. Codex and the two APIs have tests with a scripted AI only.
