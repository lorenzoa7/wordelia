# Editor's read ("Leitura de editor") — design

Date: 2026-10-21. The author approved the design of two mockups (`test-results/mockups/4a-leitura-unificada-margem.png` and `4b-leitura-unificada-lista.png`; not in git). In chat, the author said: they want the read **while they write**, one chapter at a time, **also in the middle of a chapter**. The calls marked **(my call)** are mine; the author can change them.

## Words

- A finding of a read is a **comment** ("comentário" in pt-BR, "comentario" in es). A **note** stays a planning entry. The margin header is "Comentários do editor". **(my call: the glossary has one word for one thing)**
- The lenses: **Estrutura** (Structure), **Leitor** (Reader), **Estilo** (Style: the sentence-level lens; "Linha" is the story line), **Continuidade** (Continuity), **Revisão** (Proofread). **(my call)**
- Add these words to GLOSSARY.md and to the terms table of the i18n README.

## Intent

The author polishes paragraph after paragraph with the AI, but no one reads a whole chapter as an editor does: is the structure right, where does a first reader get lost, which sentences are weak, and does the text agree with the notes and the story line? A developmental edit by a person costs about US$ 2,700 for a book of 90,000 words. Writers accept the AI as a reader and a checker; most of them reject an AI that writes the book.

The editor's read is a reader, not a writer. The AI reads a chapter and leaves comments in the margin, each linked to a passage, plus a short letter. It never changes the text. All the comments of the book go into one revision list.

## Goals

1. **Read a chapter, or a part of it.** The default is the open chapter. When text is selected, the read comments only on the selection, and the rest of the book is context. **(my call)**
2. **A chapter in progress.** A switch "Capítulo em andamento" tells the AI that the chapter is not finished: no notes about a missing end, and Structure comments on the direction so far. The switch is on by default for the last chapter of the book, off for the others. **(my call)**
3. **Lenses ("olhares").** "Todos os olhares" (the default), or one lens:
   - **Estrutura (Structure):** the purpose of the chapter and its scenes, conflict, stakes, pacing, open questions, setups and payoffs, the start and the end.
   - **Leitor (Reader):** where a first reader is lost, bored or curious; who, where and when is clear; the emotional beats.
   - **Estilo (Style):** sentences: rhythm, repetition, clichés, filter words, and the writing rules of the book. Only notes; Polish does the rewrite.
   - **Continuidade (Continuity):** conflicts with the planning notes (facts, looks, also the portraits, rules of the world), with the story line (who knows what and when, the order of events, also planned chapters: "she only learns this in ch. 5"), and with the earlier chapters.
   - **Revisão (Proofread):** typos, punctuation, the dialogue dash, a name written in two ways. It is in mockup 4b. **(my call)**
4. **The result.** A short letter in the chat ("O que funciona": at most 3 items; "O que eu olharia primeiro": the problems in order of importance, each with its lens and a link to its note) and notes in the margin. At most 7 notes for "Todos os olhares", at most 5 for one lens. **(my call)**
5. **Notes in the margin.** One card design for all lenses: a number, the lens tag, the note (one or two sentences), buttons, "Feito". A Continuity card also shows the two quotes in conflict (this chapter, and the note, the story line card or the earlier chapter) and its source. The passage in the text has a number marker in the page margin; Continuity uses a wavy amber underline, the other lenses a soft wash. A thin line joins the selected card to its passage.
6. **The revision list.** One list for the whole book, in the Write view (mockup 4b). Filters by lens and by state. Notes grouped by chapter, in book order. Each row: the state, the note, a quote of the passage, the lens, and the actions on hover. A "Nova leitura" button.
7. **The comments follow the text.** The author keeps writing after a read. A comment stays on its passage when the text around it changes, and also when the author changes the words of the passage: the comment then holds the new words (the app maps the range through the edits of the editor and writes the new passage text to the file). A chapter without a live editor, or a change from outside the app, finds the passage again by its text. Only when the passage is deleted or cannot be found does the comment say "O trecho mudou"; it stays open in the list. After the author accepts the Polish of a comment ("Polir trecho"), a toast asks "Marcar o comentário como feito?". **(my call)**
8. **A second read knows the first.** The AI gets the earlier notes of the chapter with their states and reasons. It does not repeat a note that is done, ignored or intentional. It can say which open notes the new text fixed; the app then offers "Marcar como feitas" (it never closes a note by itself). **(my call)**

## Where the author starts a read

- **A button in the Write toolbar** (the glasses icon of the mockups), "Leitura de editor". It opens a small popover: what to read (this chapter / the selection, when there is one), the lens ("Todos os olhares" or one), the "Capítulo em andamento" switch, and "Ler". **(my call)**
- **The chat.** The author can ask in words in any thread ("Leia o capítulo 7 como editor de estrutura"). The AI does not read there: it answers with a small card "Fazer a leitura de editor do cap. 7 · Estrutura" (a `<read chapter="…" lens="…"/>` tag), and one click starts the read in the thread of that chapter. So comments always come from a read thread, and ordinary chat messages do not carry the comments of the book. **(my call)**
- **The revision list:** "Nova leitura" opens the same popover.

## How a read runs

- A read is a chat message. The app sends a short, visible request in a thread named "Leitura · <chapter title>" (one thread for each chapter, used again for the next reads of that chapter). The author sees the reply stream in the chat, can stop it, sees its tokens and cost, and can talk about it in the same thread. **(my call)**
- The model is the chat model of that thread (Settings → AI, "Chat").
- The context is the context of a chat message: the manuscript (with summaries for a long book), the planning index and the notes that matter (all notes that the chapter mentions), the story line, the portraits, the writing rules, the digests of the other threads. Plus the earlier comments of that chapter only (with their ids, states and reasons).
- The reply has the letter as prose and the notes as tags, for example:

```
<note lens="continuity" rank="1">
<find>Sabia que tinha vindo do continente</find>
<text>Marta sabe cedo demais: pela Linha, ela só descobre isso no cap. 5.</text>
<source file="planning/Plot/Linha da história.md">Marta acha a passagem no casaco e descobre que o visitante veio do continente.</source>
</note>
<resolved ids="n12 n15"/>
```

  `<find>` is the passage, word for word, as in the chapter (like `<find>` in edit proposals). A note appears in the margin as soon as its tag is complete. A note whose passage is not in the chapter (or not in the selection) is dropped, and the letter keeps its words. **(my call)**
- A read that stops in the middle keeps the notes that were complete.

## The comments: storage and states

- A book file, `ai/comments.json`, next to the threads. It is plain JSON, it syncs with the book folder, and the watcher reloads a change from outside. **(my call)**
- A comment has: an id, the chapter, the lens, the rank, the text, the passage (find text), the sources (file and quote), the thread and message of the read, the state (`open`, `done`, `ignored`, `intentional`), the reason (for intentional), and the dates.
- Every change of state has Undo in a toast.
- The notes of a deleted chapter go to the trash with the chapter, and come back with its Undo. **(my call)**

## The note actions

- **Ir ao trecho** (in the list): opens the chapter at the passage.
- **Discutir no chat:** opens the thread of the read with the note as a quote in the composer. The author writes the question.
- **Polir trecho:** runs the main action (Polish) on the passage, with the note as an extra instruction, in the normal review (Enter accepts, Esc rejects).
- **Atualizar a nota** (Continuity): sends a message in the thread of the read that asks for a change of the planning note or of the story line to agree with the text. The normal proposal card follows; nothing changes without the author.
- **É intencional** (Continuity): an optional short reason ("Elias mente para Marta"). The next reads get it.
- **Ignorar** (the other lenses) and **Feito** (all).

## The margin

- **Room for the cards (the author's choice).** With the chat (400 px) and the chapter list (256 px) open, a window of 1440 px leaves about 784 px of desk, and an A5 page is about 559 px, so the cards do not fit beside a centered page. When the author starts a read, the app makes room once: the page moves to the left of the desk, and the chapter list closes when that is still not enough (as in mockup 4a). This happens only at the author's click, never while the author types and never when a comment streams in. "Ocultar" puts the page and the chapter list back.
- The cards are to the right of the page, on the desk, in the order of their passages. A card is next to its passage, or lower when a card above takes the place.
- The header "Notas do editor · N" has the lens filter and "Ocultar". "Ocultar" hides the cards and the marks, for writing without notes; the choice is kept for each book. **(my call)**
- The margin shows only the open notes. The list shows all.
- In a narrow window with no room on the desk, the number markers stay, and a click on a marker opens its card as a popover. **(my call)**
- Colors come from tokens: add one token for each lens.

## Non-goals (this version)

- A read of the whole book in one request. The author can read the chapters one by one.
- Reads that run by themselves in the background.
- Scores, grades, word statistics.
- Import and export of DOCX comments.
- Any text that the AI writes into the book.

## Anti-goals

- A note never changes the text. Only the author's actions do (Polish with its review, or a proposal that the author accepts).
- Nothing red, nothing that pops up while the author types. The margin can hide.
- No generic notes: few, ranked, each tied to a passage and to the facts of this book.

## Left to the builder

The component structure, the prompt words, the anchor algorithm (it can use the code of chat proposals in the text), the layout of the margin cards, the tests, and the exact limits.
